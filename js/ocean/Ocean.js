/**
 * Tiled ocean with Gerstner waves. Tiles follow camera, share one reflection.
 */

import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { createGerstnerWaveSystem } from './GerstnerWaves.js';

const TILE_SIZE = 2000;
const TILE_SEGMENTS = 64;
const GRID_RADIUS = 1;  // 3x3 tiles
const WATER_Y = -4;

export function createOcean(scene, options = {}) {
  const waveSystem = createGerstnerWaveSystem({
    windSpeed: options.windSpeed ?? 8,
    windDirection: options.windDirection ?? -135,
    choppiness: options.choppiness ?? 0.8,
    waveScale: options.waveScale ?? 1,
  });

  const waterGeometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE, TILE_SEGMENTS, TILE_SEGMENTS);
  const waterNormalsUrl = options.waterNormalsUrl ?? 'https://threejs.org/examples/textures/waternormals.jpg';

  const ocean = {
    group: new THREE.Group(),
    water: null,
    tiles: [],
    waveSystem,
    tileSize: TILE_SIZE,
    camera: null,
    waveSpeed: options.waveSpeed ?? 0.5,
  };

  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(waterNormalsUrl, (texture) => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

    const water = new Water(waterGeometry.clone(), {
      textureWidth: 1024,
      textureHeight: 1024,
      waterNormals: texture,
      sunDirection: (options.sunDirection ?? new THREE.Vector3(0.7, 0.7, 0)).clone(),
      sunColor: options.sunColor ?? 0xffffff,
      waterColor: options.waterColor ?? 0x001e0f,
      distortionScale: options.distortionScale ?? 3.5,
      fog: true,
    });

    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_Y;
    ocean.water = water;

    // Inject Gerstner waves into vertex shader
    const waveCode = waveSystem.getVertexCode();
    const waveUniforms = waveSystem.getUniformDeclarations();
    water.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, waveSystem.uniforms);

      // Stronger Fresnel for more pronounced reflection at grazing angles
      shader.fragmentShader = shader.fragmentShader.replace(
        'rf0 = 0.3',
        'rf0 = 0.02'
      ).replace(
        'pow( ( 1.0 - theta ), 5.0 )',
        'pow( ( 1.0 - theta ), 6.0 )'
      );

      shader.vertexShader = `
        uniform mat4 textureMatrix;
        ${waveUniforms}

        varying vec4 mirrorCoord;
        varying vec4 worldPosition;

        #include <common>
        #include <fog_pars_vertex>
        #include <shadowmap_pars_vertex>
        #include <logdepthbuf_pars_vertex>

        ${waveCode}

        void main() {
          vec4 baseWorld = modelMatrix * vec4(position, 1.0);
          vec3 disp = waveDisplacement(baseWorld.xyz);
          vec3 localDisp = vec3(disp.x, -disp.z, -disp.y);
          vec3 displacedLocal = position + localDisp;

          worldPosition = modelMatrix * vec4(displacedLocal, 1.0);
          mirrorCoord = textureMatrix * worldPosition;

          vec4 mvPosition = modelViewMatrix * vec4(displacedLocal, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          #include <beginnormal_vertex>
          #include <defaultnormal_vertex>
          #include <logdepthbuf_vertex>
          #include <fog_vertex>
          #include <shadowmap_vertex>
        }
      `;
    };

    ocean.group.add(water);
    ocean.tiles.push({ offset: [0, 0], mesh: water });

    // Secondary tiles share material (no extra reflection)
    for (let gz = -GRID_RADIUS; gz <= GRID_RADIUS; gz++) {
      for (let gx = -GRID_RADIUS; gx <= GRID_RADIUS; gx++) {
        if (gx === 0 && gz === 0) continue;
        const mesh = new THREE.Mesh(waterGeometry.clone(), water.material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(gx * TILE_SIZE, WATER_Y, gz * TILE_SIZE);
        ocean.group.add(mesh);
        ocean.tiles.push({ offset: [gx, gz], mesh });
      }
    }

    scene.add(ocean.group);
    if (options.onReady) options.onReady();
  });

  ocean.setCamera = (cam) => { ocean.camera = cam; };
  ocean.setCenter = (x, z) => {
    const cx = Math.round(x / TILE_SIZE) * TILE_SIZE;
    const cz = Math.round(z / TILE_SIZE) * TILE_SIZE;
    ocean.group.position.set(cx, 0, cz);
  };
  ocean.update = (dt) => {
    if (ocean.water) {
      ocean.water.material.uniforms.time.value += dt * ocean.waveSpeed;
      waveSystem.update(dt);
    }
    if (ocean.camera) {
      ocean.setCenter(ocean.camera.position.x, ocean.camera.position.z);
    }
  };
  ocean.setSun = (dir, color) => {
    if (ocean.water?.material?.uniforms) {
      ocean.water.material.uniforms.sunDirection.value.copy(dir).normalize();
      ocean.water.material.uniforms.sunColor.value.copy(color);
    }
  };
  ocean.setWaterColor = (color) => {
    if (ocean.water?.material?.uniforms) {
      ocean.water.material.uniforms.waterColor.value.copy(color);
    }
  };

  return ocean;
}
