import * as THREE from 'three';
import { createLowPolyBird } from './birds/LowPolyBird.js';

// ── Bird colors (natural gull/dove) ───────────────────────────────────────────
const BODY_COLOR = 0x8b8680;
const WING_COLOR = 0x6e6862;
const WING_TIP_COLOR = 0x2c2824;
const OUTLINE_COLOR = 0x1a1816;

// ── Single bird mesh: two-segment wings for natural flex ───────────────────────
function makeBirdMesh() {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: BODY_COLOR,
    roughness: 0.6,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const wingMat = new THREE.MeshStandardMaterial({
    color: WING_COLOR,
    roughness: 0.55,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const wingTipMat = new THREE.MeshStandardMaterial({
    color: WING_TIP_COLOR,
    roughness: 0.7,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const outlineMat = new THREE.MeshBasicMaterial({
    color: OUTLINE_COLOR,
    side: THREE.BackSide,
    depthTest: true,
    depthWrite: false,
  });

  // Body — smoother capsule (more segments)
  const bodyCyl = new THREE.CylinderGeometry(0.07, 0.055, 0.6, 12);
  bodyCyl.rotateX(Math.PI / 2);
  const body = new THREE.Mesh(bodyCyl, bodyMat);
  body.position.z = -0.12;
  group.add(body);
  addOutline(body, outlineMat, 1.06);

  // Head — rounder
  const headGeo = new THREE.SphereGeometry(0.095, 12, 8);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.z = -0.48;
  head.position.y = 0.02;
  group.add(head);
  addOutline(head, outlineMat, 1.08);

  // Beak
  const beakGeo = new THREE.ConeGeometry(0.018, 0.07, 6);
  beakGeo.rotateX(-Math.PI / 2);
  const beak = new THREE.Mesh(beakGeo, wingTipMat);
  beak.position.z = -0.54;
  beak.position.y = 0.01;
  group.add(beak);

  // Tail — fan shape, more segments
  const tailGeo = new THREE.ConeGeometry(0.09, 0.3, 8);
  tailGeo.rotateX(-Math.PI / 2);
  const tail = new THREE.Mesh(tailGeo, wingMat);
  tail.position.z = 0.45;
  tail.scale.y = 0.4;
  group.add(tail);
  addOutline(tail, outlineMat, 1.1);

  // Two-segment wings: inner (shoulder) + outer (wrist) for natural flex
  const lWing = makeFlexibleWing(wingMat, wingTipMat, -1);
  const rWing = makeFlexibleWing(wingMat, wingTipMat, 1);
  group.add(lWing.group);
  group.add(rWing.group);

  return { group, lWing, rWing };
}

function addOutline(mesh, mat, scale) {
  const outline = new THREE.Mesh(mesh.geometry, mat.clone());
  outline.scale.setScalar(scale);
  mesh.add(outline);
}

// ── Paper plane: classic dart, visible and detailed ─────────────────────────────
function makePaperPlaneMesh() {
  const group = new THREE.Group();
  // scale applied by flock when used as template

  const paperMat = new THREE.MeshStandardMaterial({
    color: 0xfaf8f5,
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const foldMat = new THREE.MeshBasicMaterial({
    color: 0x666666,
    side: THREE.DoubleSide,
  });

  // Classic dart: nose at -Z, wings with dihedral, folded center
  const w = 0.5;
  const nose = new THREE.Vector3(0, 0, -0.55);
  const leftTip = new THREE.Vector3(-w, 0.12, 0.25);
  const rightTip = new THREE.Vector3(w, 0.12, 0.25);
  const tail = new THREE.Vector3(0, 0.08, 0.55);
  const center = new THREE.Vector3(0, 0.04, 0);
  // Left wing (nose -> leftTip -> tail -> center)
  const leftVerts = new Float32Array([
    nose.x, nose.y, nose.z,
    leftTip.x, leftTip.y, leftTip.z,
    tail.x, tail.y, tail.z,
    nose.x, nose.y, nose.z,
    tail.x, tail.y, tail.z,
    center.x, center.y, center.z,
  ]);
  const leftGeo = new THREE.BufferGeometry();
  leftGeo.setAttribute('position', new THREE.BufferAttribute(leftVerts, 3));
  leftGeo.computeVertexNormals();
  group.add(new THREE.Mesh(leftGeo, paperMat));
  // Right wing
  const rightVerts = new Float32Array([
    nose.x, nose.y, nose.z,
    tail.x, tail.y, tail.z,
    rightTip.x, rightTip.y, rightTip.z,
    nose.x, nose.y, nose.z,
    center.x, center.y, center.z,
    tail.x, tail.y, tail.z,
  ]);
  const rightGeo = new THREE.BufferGeometry();
  rightGeo.setAttribute('position', new THREE.BufferAttribute(rightVerts, 3));
  rightGeo.computeVertexNormals();
  group.add(new THREE.Mesh(rightGeo, paperMat));
  // Center fold line (creases)
  const creaseGeo = new THREE.PlaneGeometry(0.015, 1.2);
  creaseGeo.rotateY(-Math.PI / 2);
  const crease = new THREE.Mesh(creaseGeo, foldMat);
  crease.position.z = 0;
  group.add(crease);

  return { group, lWing: { group: null }, rWing: { group: null } };
}

export { makePaperPlaneMesh, makeBirdMesh };

// Two-segment wing: inner arm + outer forearm. Outer bends more on upstroke (fold).
function makeFlexibleWing(innerMat, tipMat, side) {
  const s = side;
  const wingGroup = new THREE.Group();

  // Inner wing (shoulder to elbow) — curved, wider at root
  const innerVerts = new Float32Array([
    0,      0,     0.06,
    s*0.55, 0.03,  0.1,
    s*0.5,  0,    -0.04,
    s*0.55, 0.03,  0.1,
    s*1.0,  0.05,  0.06,
    s*0.85, 0.02, -0.06,
  ]);
  const innerGeo = new THREE.BufferGeometry();
  innerGeo.setAttribute('position', new THREE.BufferAttribute(innerVerts, 3));
  innerGeo.setIndex([0, 1, 2, 3, 4, 5]);
  innerGeo.computeVertexNormals();
  const innerMesh = new THREE.Mesh(innerGeo, innerMat);
  const innerGroup = new THREE.Group();
  innerGroup.add(innerMesh);

  // Outer wing (elbow to tip) — tapers to tip, darker at end
  const outerVerts = new Float32Array([
    0,      0,     0.04,
    s*0.5,  0.04,  0.05,
    s*0.45, 0,    -0.05,
    s*0.5,  0.04,  0.05,
    s*0.95, 0.05,  0.0,
    s*0.75, 0.02, -0.04,
  ]);
  const outerGeo = new THREE.BufferGeometry();
  outerGeo.setAttribute('position', new THREE.BufferAttribute(outerVerts, 3));
  outerGeo.setIndex([0, 1, 2, 3, 4, 5]);
  outerGeo.computeVertexNormals();
  const outerMesh = new THREE.Mesh(outerGeo, tipMat);
  const outerGroup = new THREE.Group();
  outerGroup.add(outerMesh);

  // Position outer wing at elbow (end of inner)
  outerGroup.position.set(s * 0.88, 0.035, 0.01);
  innerGroup.add(outerGroup);
  wingGroup.add(innerGroup);

  return {
    group: wingGroup,
    innerGroup,  // rotate this for main flap
    outerGroup,  // rotate this for wrist fold (more on upstroke)
  };
}

// ── Flock ─────────────────────────────────────────────────────────────────────
const V_POSITIONS = [
  [  0,    0,    0   ],  // leader (you control this one)
  [ -4.0, -0.3,  4.0 ],
  [  4.0, -0.3,  4.0 ],
  [ -8.0, -0.6,  8.0 ],
  [  8.0, -0.6,  8.0 ],
  [-12.0, -0.9, 12.0 ],
  [ 12.0, -0.9, 12.0 ],
  [-16.0, -1.2, 16.0 ],
  [ 16.0, -1.2, 16.0 ],
  [-20.0, -1.5, 20.0 ],
  [ 20.0, -1.5, 20.0 ],
];

const WATER_Y = -4;
const MIN_ALTITUDE_ABOVE_WATER = 3.0;
const FORMATION_CATCH_UP_BASE = 2.0;  // base catch-up rate
const FORMATION_CATCH_UP_SPEED = 0.08;  // scales with speed; lower = less twitch, more lag at high speed
const TRAIL_LENGTH = 400;
const TRAIL_COLOR = 0xaaccdd;  // soft blue-gray, less bloom
const TRAIL_OPACITY = 1;

const TRAIL_SAMPLE_EVERY = 15; // add point every N frames = more rigid

function makeTrailLine(scene) {
  const points = [];
  const geo = new THREE.BufferGeometry();
  const mat = new THREE.LineBasicMaterial({
    color: TRAIL_COLOR,
    linewidth: 2,
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  line.renderOrder = 999;
  scene.add(line);
  return { line, points, frameCount: 0 };
}

export class Flock {
  constructor(scene) {
    this.scene   = scene;
    this.birds   = [];
    this.count   = 7;
    this.formationEnabled = true;

    this.pos     = new THREE.Vector3(0, -1, -30);
    this.vel     = new THREE.Vector3(0, 0, -1);
    this.speed   = 7; // slower so you can see the planes

    this.yaw     = 0;
    this.pitch   = 0;
    this.targetYaw   = 0;
    this.targetPitch = 0;

    this.flapTime = 0;
    this.turbOffset = [];
    this.smoothFlockQ = new THREE.Quaternion();  // smoothed orientation to reduce twitch at high speed
    this.birdTemplate = null;  // optional GLTF group to clone
    this.modelCorrectionQ = null;  // extra rotation for GLTF models (set from main.js)

    this._buildBirds();
  }

  setBirdTemplate(templateGroup) {
    this.birdTemplate = templateGroup;
    this._buildBirds();
  }

  updateTrailResolution(w, h) {
    this.birds.forEach(b => {
      if (b.trail?.line?.material?.resolution) {
        b.trail.line.material.resolution.set(w, h);
      }
    });
  }

  _buildBirds() {
    this.birds.forEach(b => {
      this.scene.remove(b.group);
      if (b.trail) {
        this.scene.remove(b.trail.line);
        b.trail.line.geometry.dispose();
        b.trail.line.material.dispose();
      }
    });
    this.birds = [];
    this.turbOffset = [];

    for (let i = 0; i < Math.min(this.count, V_POSITIONS.length); i++) {
      const bird = this.birdTemplate
        ? this._cloneTemplate()
        : createLowPolyBird();
      const scale = this.birdTemplate
        ? 17 + Math.random() * 8   // template birds (paper plane / GLB)
        : 1.0 + Math.random() * 0.2; // LowPoly birds: half size
      bird.group.scale.setScalar(scale);
      this.scene.add(bird.group);

      const trail = makeTrailLine(this.scene);

      this.birds.push({
        group: bird.group,
        lWing: bird.lWing ?? null,
        rWing: bird.rWing ?? null,
        slotIndex: i,
        trail,
      });
      this.turbOffset.push({
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  _cloneTemplate() {
    const group = this.birdTemplate.clone(true);
    group.traverse((c) => { if (c.isMesh && c.material) c.material = c.material.clone(); });
    return { group, lWing: { group: null }, rWing: { group: null } };
  }

  addBird() {
    if (this.count >= V_POSITIONS.length) return;
    this.count++;
    this._buildBirds();
  }

  setCount(n) {
    this.count = Math.max(1, Math.min(n, V_POSITIONS.length));
    this._buildBirds();
  }

  toggleFormation() {
    this.formationEnabled = !this.formationEnabled;
    return this.formationEnabled;
  }

  update(dt, input, turbulence) {
    dt = Math.min(dt, 0.05);  // clamp to prevent spike-induced twitch
    const YAW_SPEED   = 0.45;
    const PITCH_SPEED = 0.35;
    const MAX_PITCH   = 0.35;

    this.targetYaw   += input.steerX * YAW_SPEED   * dt;
    this.targetPitch -= input.steerY * PITCH_SPEED  * dt;
    this.targetPitch  = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.targetPitch));

    // Auto-lift when too close to water
    const minY = WATER_Y + MIN_ALTITUDE_ABOVE_WATER;
    if (this.pos.y < minY) {
      const lift = (minY - this.pos.y) * 2.5 * dt;
      this.targetPitch = Math.max(this.targetPitch, 0.15);
      this.pos.y += lift * 4;
    }

    // Smoother steering: slower lerp = less twitchy
    this.yaw   += (this.targetYaw   - this.yaw)   * 1.2 * dt;
    this.pitch += (this.targetPitch - this.pitch)  * 1.2 * dt;

    this.yaw += Math.sin(this.flapTime * 0.07) * 0.002;

    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );

    this.vel.lerp(dir, 4 * dt);
    this.vel.normalize();

    this.pos.addScaledVector(this.vel, this.speed * dt);

    // Guard: prevent NaN propagation
    if (!Number.isFinite(this.pos.x) || !Number.isFinite(this.pos.y) || !Number.isFinite(this.pos.z)) {
      this.pos.set(0, -1, -30);
    }
    if (!Number.isFinite(this.vel.x) || !Number.isFinite(this.vel.y) || !Number.isFinite(this.vel.z)) {
      this.vel.set(0, 0, -1);
    }

    this.flapTime += dt;

    // Guard: prevent NaN from zero velocity
    if (this.vel.lengthSq() < 0.0001) this.vel.set(0, 0, -1);

    // Orientation with world-up constraint: planes can never flip upside down
    const forward = this.vel.clone().normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    let levelUp = worldUp.clone().sub(forward.clone().multiplyScalar(forward.dot(worldUp)));
    if (levelUp.lengthSq() < 0.01) levelUp.set(0, 1, 0);
    levelUp.normalize();
    // Bank: tilt around forward, clamped so plane never flips (levelUp.y stays > 0.2)
    const maxBank = 0.25;
    let targetBank = Math.max(-maxBank, Math.min(maxBank, input.steerX * 0.15));
    const bankedUp = levelUp.clone().applyAxisAngle(forward, targetBank);
    if (bankedUp.y < 0.2) targetBank *= 0.5; // reduce bank if it would flip us
    this.bankAngle = (this.bankAngle ?? 0) + (targetBank - (this.bankAngle ?? 0)) * 2 * dt;
    const finalUp = levelUp.clone().applyAxisAngle(forward, this.bankAngle);
    if (finalUp.y < 0.2) this.bankAngle *= 0.7; // hard clamp: never flip
    const bankedUpFinal = levelUp.clone().applyAxisAngle(forward, this.bankAngle);
    // Build rotation: forward = vel, up = bankedUpFinal
    const right = new THREE.Vector3().crossVectors(forward, bankedUpFinal);
    if (right.lengthSq() < 0.01) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const m = new THREE.Matrix4();
    m.set(
      right.x, up.x, -forward.x, 0,
      right.y, up.y, -forward.y, 0,
      right.z, up.z, -forward.z, 0,
      0, 0, 0, 1
    );
    const flockQ = new THREE.Quaternion().setFromRotationMatrix(m);
    if (!this._smoothFlockInited) {
      this.smoothFlockQ.copy(flockQ);
      this._smoothFlockInited = true;
    } else {
      this.smoothFlockQ.slerp(flockQ, Math.min(1, 8 * dt));  // smooth formation rotation
    }

    this.birds.forEach((bird, i) => {
      const baseSlot = V_POSITIONS[bird.slotIndex];
      const turb = this.turbOffset[i];

      const tx = Math.sin(this.flapTime * 1.3 + turb.phase)       * turbulence * turb.x * 0.08;
      const ty = Math.sin(this.flapTime * 1.7 + turb.phase + 1)   * turbulence * turb.y * 0.08;
      const bob = Math.sin(this.flapTime * 2.5 + i * 1.1) * 0.03;

      // Spacebar: when formation is off, hide all followers (only leader stays)
      if (!this.formationEnabled && i > 0) {
        bird.group.visible = false;
        if (bird.trail) {
          bird.trail.points.length = 0;
          bird.trail.line.geometry.dispose();
          bird.trail.line.geometry = new THREE.BufferGeometry();
        }
        return;
      } else {
        bird.group.visible = true;
      }

      let sx = baseSlot[0];
      let sy = baseSlot[1];
      let sz = baseSlot[2];

      const localOffset = new THREE.Vector3(sx + tx, sy + ty + bob, sz);
      localOffset.applyQuaternion(this.smoothFlockQ);

      const targetPos = this.pos.clone().add(localOffset);

      bird.group.position.copy(targetPos);

      const q = bird.group.quaternion;
      q.copy(this.smoothFlockQ);
      if (this.modelCorrectionQ) q.multiply(this.modelCorrectionQ);

      // LowPoly (VibeSail-style): wing pivots + flap-gliding
      const g = bird.group;
      if (g.userData?.leftWingPivot) {
        const lp = g.userData.leftWingPivot;
        const rp = g.userData.rightWingPivot;
        const ud = g.userData;
        ud.flapAngle += dt * ud.flapSpeed;
        // Flap-gliding: large birds alternate flap/glide. Slow wave ~0.3 Hz.
        const glideWave = Math.sin(this.flapTime * 0.6 + (ud.glideModPhase ?? 0));
        const glideMod = Math.max(0.15, 0.5 + 0.5 * glideWave); // 0.15–1.0
        const flap = Math.sin(ud.flapAngle) * ud.flapAmplitude * glideMod;
        const wingSweep = Math.sin(ud.flapAngle * 0.45 + ud.glidePhase) * 0.07;
        const wingBank = ud.wingRest + flap;
        lp.rotation.z = wingBank;
        rp.rotation.z = -wingBank;
        lp.rotation.y = -wingSweep;
        rp.rotation.y = wingSweep;
        const pitchBob = Math.sin(ud.flapAngle * 0.5) * 0.05;
        g.rotation.setFromQuaternion(g.quaternion);
        g.rotation.x += pitchBob;
        g.quaternion.setFromEuler(g.rotation);
      } else if (bird.lWing?.innerGroup) {
        const phase = i * 0.35;
        const flapBase = Math.sin(this.flapTime * 3.2 + phase);
        const flapFine = Math.sin(this.flapTime * 6.5 + phase) * 0.08;
        const mainFlap = flapBase * 0.48 + flapFine;
        const wristFold = flapBase * 0.35 + (flapBase < 0 ? flapBase * 0.4 : 0);
        bird.lWing.innerGroup.rotation.z =  mainFlap;
        bird.lWing.outerGroup.rotation.z =  wristFold;
        bird.rWing.innerGroup.rotation.z = -mainFlap;
        bird.rWing.outerGroup.rotation.z = -wristFold;
      }

      // Trail: sample every N frames (offset in dev mode via flock.trailOffset)
      const trail = bird.trail;
      trail.frameCount = (trail.frameCount || 0) + 1;
      if (trail.frameCount % TRAIL_SAMPLE_EVERY === 0) {
        let p = bird.group.position.clone();
        const offset = this.trailOffset ?? 0;
        if (offset !== 0) {
          const back = new THREE.Vector3(0, 0, 1).applyQuaternion(bird.group.quaternion);
          const s = Math.max(bird.group.scale.x, bird.group.scale.y, bird.group.scale.z);
          p.addScaledVector(back, offset * s);
        }
        if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
          trail.points.push(p);
          if (trail.points.length > TRAIL_LENGTH) trail.points.shift();
        if (trail.points.length >= 2) {
          trail.line.geometry.dispose();
          trail.line.geometry = new THREE.BufferGeometry().setFromPoints(trail.points);
        }
        }
      }
    });
  }

  get leaderPos() {
    return this.pos.clone();
  }

  get direction() {
    return this.vel.clone();
  }
}
