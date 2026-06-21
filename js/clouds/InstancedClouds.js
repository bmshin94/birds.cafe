/**
 * Instanced cloud layer using texture-mapped planes.
 * Single draw call, wind drift, distance fade.
 */

import * as THREE from 'three';

function makeCloudTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

const timeUniform = { value: 0 };

export function createInstancedClouds(scene, options = {}) {
  const numClusters = options.numClusters ?? 40;
  const boundary = options.boundary ?? 4000;
  const windSpeed = options.windSpeed ?? 0.08;
  const baseHeight = options.baseHeight ?? 60;
  const heightRange = options.heightRange ?? 200;
  const innerHoleRadius = options.innerHoleRadius ?? 0;

  const geo = new THREE.PlaneGeometry(1, 1);
  const tex = makeCloudTexture();
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });

  const instanceData = [];
  const clusterPositions = [];

  function buildInstances() {
    instanceData.length = 0;
    clusterPositions.length = 0;

    const rings = 5;
    const clustersPerRing = Math.max(4, Math.floor(numClusters / rings));

    for (let r = 0; r < rings; r++) {
      const t = r / (rings - 1);
      const radius = boundary * (0.002 + t * 0.998);
      const height = baseHeight + t * heightRange;

      for (let i = 0; i < clustersPerRing; i++) {
        const angle = (i / clustersPerRing) * Math.PI * 2 + Math.random() * 0.5;
        const rVar = radius * (0.85 + Math.random() * 0.3);
        const pos = new THREE.Vector3(
          Math.cos(angle) * rVar,
          height + Math.random() * 60,
          Math.sin(angle) * rVar
        );
        pos.x += (Math.random() - 0.5) * radius * 0.15;
        pos.z += (Math.random() - 0.5) * radius * 0.15;

        if (innerHoleRadius > 0 && pos.length() < innerHoleRadius) {
          continue;
        }

        const scale = (0.7 + Math.random() * 0.6) * (1 + t * 0.5);
        const clusterIdx = clusterPositions.length;
        clusterPositions.push({ pos: pos.clone(), scale });

        const planesPerCluster = 2 + Math.floor(Math.random() * 2);
        for (let p = 0; p < planesPerCluster; p++) {
          const layerAngle = (p / planesPerCluster) * Math.PI * 2;
          const layerScale = scale * 120 * (0.8 + Math.random() * 0.4);
          const offset = new THREE.Vector3(
            Math.cos(layerAngle) * 15,
            (Math.random() - 0.5) * 8,
            Math.sin(layerAngle) * 15
          );
          const m = new THREE.Matrix4();
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, layerAngle, 0));
          const s = new THREE.Vector3(layerScale, layerScale * 0.55, 1);
          m.compose(pos.clone().add(offset), q, s);

          instanceData.push({
            matrix: m.clone(),
            offset: offset.clone(),
            oscPhase: Math.random() * Math.PI * 2,
            oscSpeed: 0.4 + Math.random() * 0.6,
            clusterIdx,
            quat: q.clone(),
            scale: s.clone(),
          });
        }
      }
    }
  }

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = `
      uniform float uTime;
      attribute float aOscPhase;
      attribute float aOscSpeed;
      attribute vec3 aScale;
      varying vec3 vWorldPos;
      ${shader.vertexShader}
    `;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      vec4 instCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vec3 toCam = normalize(cameraPosition - instCenter.xyz);
      vec3 up = vec3(0.0, 1.0, 0.0);
      vec3 right = normalize(cross(toCam, up));
      if (length(right) < 0.001) right = vec3(1.0, 0.0, 0.0);
      up = cross(right, toCam);
      float osc = aOscPhase + aOscSpeed * uTime;
      float co = cos(0.02 * sin(osc));
      float si = sin(0.02 * sin(osc));
      vec2 wobble = mat2(co, -si, si, co) * position.xy;
      vec3 billboardPos = right * wobble.x * aScale.x + up * wobble.y * aScale.y;
      vWorldPos = instCenter.xyz + billboardPos;
      vec3 transformed = vec3(0.0);
      `
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      vec4 mvPosition = viewMatrix * vec4(vWorldPos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      `
    );
    shader.fragmentShader = `
      varying vec3 vWorldPos;
      ${shader.fragmentShader}
    `;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `
      #include <fog_fragment>
      float d = length(cameraPosition - vWorldPos);
      float fade = 1.0;
      if (d > 3000.0) fade = 0.4 + 0.6 * (1.0 - min((d - 3000.0) / 5000.0, 1.0));
      gl_FragColor.a *= fade;
      `
    );
  };

  buildInstances();
  const count = instanceData.length;

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;

  const oscPhaseArr = new Float32Array(count);
  const oscSpeedArr = new Float32Array(count);
  const scaleArr = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const d = instanceData[i];
    mesh.setMatrixAt(i, d.matrix);
    oscPhaseArr[i] = d.oscPhase;
    oscSpeedArr[i] = d.oscSpeed;
    scaleArr[i * 3] = d.scale.x;
    scaleArr[i * 3 + 1] = d.scale.y;
    scaleArr[i * 3 + 2] = d.scale.z;
  }
  mesh.geometry.setAttribute('aOscPhase', new THREE.InstancedBufferAttribute(oscPhaseArr, 1));
  mesh.geometry.setAttribute('aOscSpeed', new THREE.InstancedBufferAttribute(oscSpeedArr, 1));
  mesh.geometry.setAttribute('aScale', new THREE.InstancedBufferAttribute(scaleArr, 3));
  mesh.instanceMatrix.needsUpdate = true;

  scene.add(mesh);

  const api = {
    mesh,
    clusterPositions,
    windSpeed,
    boundary,
    instanceData,
    setCenter(x, z) {
      mesh.position.set(x, 0, z);
    },
    setTint(color) {
      mat.color.copy(color);
    },
    setOpacity(v) {
      mat.opacity = v;
    },
    update(dt, windDir) {
      timeUniform.value += dt;
      if (!windDir) return;
      for (const c of clusterPositions) {
        c.pos.x += windDir.x * windSpeed * dt * 60;
        c.pos.z += windDir.z * windSpeed * dt * 60;
        if (Math.abs(c.pos.x) > boundary) {
          c.pos.x = -Math.sign(c.pos.x) * (boundary - 100);
        }
        if (Math.abs(c.pos.z) > boundary) {
          c.pos.z = -Math.sign(c.pos.z) * (boundary - 100);
        }
      }
      for (let i = 0; i < instanceData.length; i++) {
        const d = instanceData[i];
        const c = clusterPositions[d.clusterIdx];
        const pos = c.pos.clone().add(d.offset);
        d.matrix.compose(pos, d.quat, d.scale);
        mesh.setMatrixAt(i, d.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };

  return api;
}
