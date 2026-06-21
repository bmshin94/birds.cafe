/**
 * Procedural islands to fly around. Simple terrain meshes in world space.
 */

import * as THREE from 'three';

function makeIslandMesh(radius, heightVariation = 0.8) {
  const segments = 32;
  const geo = new THREE.CircleGeometry(radius, segments);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const dist = Math.sqrt(x * x + y * y) / radius;
    const t = 1 - dist;
    const bump = Math.sin(t * Math.PI * 2) * 0.15 + Math.sin(t * Math.PI * 4) * 0.08;
    const h = (t * t * heightVariation + bump) * radius * 0.4;
    pos.setZ(i, h);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x2d5a27,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

export function createIslands(scene, options = {}) {
  const count = options.count ?? 12;
  const spread = options.spread ?? 3500;
  const minRadius = options.minRadius ?? 80;
  const maxRadius = options.maxRadius ?? 220;

  const group = new THREE.Group();
  const islands = [];

  for (let i = 0; i < count; i++) {
    const radius = minRadius + Math.random() * (maxRadius - minRadius);
    const mesh = makeIslandMesh(radius, 0.6 + Math.random() * 0.5);
    const x = (Math.random() - 0.5) * 2 * spread;
    const z = (Math.random() - 0.5) * 2 * spread;
    mesh.position.set(x, -4, z);
    group.add(mesh);
    islands.push({ mesh, radius, x, z });
  }

  scene.add(group);

  return {
    group,
    islands,
    setTint(color) {
      islands.forEach(({ mesh }) => {
        mesh.material.color.copy(color);
      });
    },
  };
}
