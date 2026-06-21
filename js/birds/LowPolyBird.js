/**
 * Low-poly seagull-style bird for flocking.
 * Adapted from VibeSail's LowPolyBirdModel (proven in production).
 * Research: Three.js BirdGeometry, flap-gliding (large birds alternate flap/glide),
 * sine-wave wing motion q = q₀ + A·sin(ωt + φ), per-bird phase variation.
 */
import * as THREE from 'three';

const SEAGULL_PALETTE = Object.freeze({
  bodyColor: 0xe9edf2,
  wingColor: 0xc7d0db,
  accentColor: 0x95a2b4,
  beakColor: 0xf1c15d,
});

function buildWingGeometry(wingSpan = 1.12, wingSweep = 1.08) {
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    0.0, 0.0, 0.0,
    0.22 * wingSpan, 0.04, 0.46 * wingSweep,
    2.95 * wingSpan, 0.08, 0.96 * wingSweep,
    2.55 * wingSpan, -0.06, -0.84 * wingSweep,
    0.15 * wingSpan, -0.05, -0.34 * wingSweep,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4]);
  geo.computeVertexNormals();
  return geo;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Creates a low-poly seagull instance for flock use.
 * Returns { group } where group has userData: leftWingPivot, rightWingPivot,
 * flapAngle, flapSpeed, flapAmplitude, wingRest, glidePhase, glideMod (for flap-gliding).
 */
export function createLowPolyBird(options = {}) {
  const {
    scaleMin = 0.95,
    scaleMax = 1.2,
    flapSpeedMin = 3.4,
    flapSpeedMax = 5.2,
    flapAmplitudeDegMin = 10,
    flapAmplitudeDegMax = 18,
    wingRestDegMin = 6,
    wingRestDegMax = 10,
  } = options;

  const bodyScale = { x: 0.7, y: 0.41, z: 1.65 };
  const headScale = { x: 0.95, y: 0.85, z: 1.28 };
  const beakLength = 0.5;
  const tailLength = 0.75;
  const wingRootZ = 0.04;

  const bodyGeo = new THREE.OctahedronGeometry(1, 0);
  bodyGeo.scale(bodyScale.x, bodyScale.y, bodyScale.z);

  const headGeo = new THREE.OctahedronGeometry(0.34, 0);
  headGeo.scale(headScale.x, headScale.y, headScale.z);

  const beakGeo = new THREE.ConeGeometry(0.14, beakLength, 4);
  beakGeo.rotateX(-Math.PI / 2);

  const tailGeo = new THREE.ConeGeometry(0.22, tailLength, 4);
  tailGeo.rotateX(Math.PI / 2);

  const wingGeo = buildWingGeometry(1.12, 1.08);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: SEAGULL_PALETTE.bodyColor,
    flatShading: true,
    roughness: 0.6,
    metalness: 0,
  });
  const wingMat = new THREE.MeshStandardMaterial({
    color: SEAGULL_PALETTE.wingColor,
    flatShading: true,
    side: THREE.DoubleSide,
    roughness: 0.55,
    metalness: 0,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: SEAGULL_PALETTE.accentColor,
    flatShading: true,
    roughness: 0.6,
    metalness: 0,
  });
  const beakMat = new THREE.MeshStandardMaterial({
    color: SEAGULL_PALETTE.beakColor,
    flatShading: true,
    roughness: 0.5,
    metalness: 0,
  });

  const group = new THREE.Group();

  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  const head = new THREE.Mesh(headGeo, accentMat);
  head.position.set(0, 0.13, 1.02);
  group.add(head);

  const beak = new THREE.Mesh(beakGeo, beakMat);
  beak.position.set(0, 0.09, 1.38);
  group.add(beak);

  const tail = new THREE.Mesh(tailGeo, accentMat);
  tail.position.set(0, 0.02, -1.12);
  group.add(tail);

  const leftWingPivot = new THREE.Group();
  leftWingPivot.position.set(-0.2, 0.05, wingRootZ);
  const leftWing = new THREE.Mesh(wingGeo, wingMat);
  leftWing.scale.x = -1;
  leftWingPivot.add(leftWing);
  group.add(leftWingPivot);

  const rightWingPivot = new THREE.Group();
  rightWingPivot.position.set(0.2, 0.05, wingRootZ);
  const rightWing = new THREE.Mesh(wingGeo, wingMat);
  rightWingPivot.add(rightWing);
  group.add(rightWingPivot);

  // Scale applied by flock; keep 1 for now (flock uses 2.8–3.4)
  group.scale.setScalar(1);

  const wingRest = THREE.MathUtils.degToRad(rand(wingRestDegMin, wingRestDegMax));
  leftWingPivot.rotation.z = wingRest;
  rightWingPivot.rotation.z = -wingRest;

  group.userData.leftWingPivot = leftWingPivot;
  group.userData.rightWingPivot = rightWingPivot;
  group.userData.flapAngle = rand(0, Math.PI * 2);
  group.userData.flapSpeed = rand(flapSpeedMin, flapSpeedMax);
  group.userData.flapAmplitude = THREE.MathUtils.degToRad(rand(flapAmplitudeDegMin, flapAmplitudeDegMax));
  group.userData.wingRest = wingRest;
  group.userData.glidePhase = rand(0, Math.PI * 2);
  group.userData.glideModPhase = rand(0, Math.PI * 2); // for flap-gliding: when to glide vs flap

  return { group };
}
