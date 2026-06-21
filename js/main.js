import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { createOcean } from './ocean/Ocean.js';
import { createInstancedClouds } from './clouds/InstancedClouds.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WEATHERS, lerpWeather } from './weather.js';
import { Flock, makePaperPlaneMesh } from './flock.js';
import { createLowPolyBird } from './birds/LowPolyBird.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ── Renderer + scene ──────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
canvas.tabIndex = 0;
const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
document.body.addEventListener('click', () => canvas.focus(), { once: true });
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
const maxDevicePixelRatio = IS_MOBILE ? 1.5 : 2;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDevicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !IS_MOBILE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 20000);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.4, 0.85, 0.5
);
bloomPass.enabled = !IS_MOBILE;
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  composer.setPixelRatio(renderer.getPixelRatio());
  bloomPass.resolution.set(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  flock.updateTrailResolution(w, h);
});

// ── Three.js Sky (realistic atmospheric scattering) ───────────────────────────
const sky = new Sky();
sky.scale.setScalar(450000);
scene.add(sky);

// Bake sky into scene.environment for nice reflections (like official ocean example)
const envScene = new THREE.Scene();
const envSky = new Sky();
envSky.scale.setScalar(450000);
envScene.add(envSky);
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
let envRenderTarget = null;

// Milky Way night sky (equirectangular) – 8k, good resolution
const MILKY_WAY_URL = 'https://upload.wikimedia.org/wikipedia/commons/8/85/Solarsystemscope_texture_8k_stars_milky_way.jpg';
let milkyWayTexture = null;
let milkyWayEnvTexture = null;
let milkyWayDome = null;

const loader = new THREE.TextureLoader();
loader.setCrossOrigin('anonymous');
if (!IS_MOBILE) {
  loader.load(MILKY_WAY_URL, (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    milkyWayTexture = tex;
    milkyWayEnvTexture = pmremGenerator.fromEquirectangular(tex);
    const geo = new THREE.SphereGeometry(600, 32, 24);
    geo.scale(-1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    mat.color.setRGB(0.85, 0.88, 1.0);
    milkyWayDome = new THREE.Mesh(geo, mat);
    milkyWayDome.frustumCulled = false;
    milkyWayDome.renderOrder = -1;
    milkyWayDome.visible = false;
    scene.add(milkyWayDome);
  });
}

function updateEnvironment(sunPos, wx) {
  if (envRenderTarget) envRenderTarget.dispose();
  envSky.material.uniforms.sunPosition.value.copy(sunPos);
  envSky.material.uniforms.turbidity.value = wx.turbidity ?? 2;
  envSky.material.uniforms.rayleigh.value = wx.rayleigh ?? 1;
  envSky.material.uniforms.mieCoefficient.value = wx.mieCoefficient ?? 0.005;
  envRenderTarget = pmremGenerator.fromScene(envScene);
  scene.environment = envRenderTarget.texture;
}

// ── Lighting ──────────────────────────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(50, 80, -30);
sun.castShadow = !IS_MOBILE;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 4000;
sun.shadow.camera.left = -400;
sun.shadow.camera.right = 400;
sun.shadow.camera.top = 400;
sun.shadow.camera.bottom = -400;
sun.shadow.bias = -0.0001;
sun.shadow.normalBias = 0.02;
scene.add(sun);

const hemi = new THREE.HemisphereLight(0x88aaff, 0x445533, 0.4);
scene.add(hemi);

// ── Stars (night only) ────────────────────────────────────────────────────────
const starCount = 2500;
const starPos   = new Float32Array(starCount * 3);
const starSizes = new Float32Array(starCount);
for (let i = 0; i < starCount; i++) {
  const theta = Math.random() * Math.PI * 2;
  const phi   = Math.acos(Math.random());
  const r     = 800;
  starPos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
  starPos[i*3+1] = Math.abs(r * Math.cos(phi)) + 50;
  starPos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
  starSizes[i] = 0.8 + Math.random() * 2.0;
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
const starMat  = new THREE.PointsMaterial({
  color: 0xffffff, size: 1.8, sizeAttenuation: false,
  transparent: true, opacity: 0,
  fog: false,
});
const stars    = new THREE.Points(starGeo, starMat);
scene.add(stars);

// ── Sun sprite (glow / halo) ───────────────────────────────────────────────────
function makeSunSprite() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.25)');
  gradient.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 10;
  return sprite;
}

const sunSprite = makeSunSprite();
scene.add(sunSprite);

// ── Clouds: instanced texture planes (VibeSail-style) ───────────────────────────
const CLOUD_BOUNDARY = 4000;
const cloudLayer = createInstancedClouds(scene, {
  numClusters: 700,
  boundary: CLOUD_BOUNDARY,
  windSpeed: 0.08,
  innerHoleRadius: 800, // keep spawn area clear so no cloud right on top of you
});

// High cirrus layer: fewer, higher, fainter
const cirrusLayer = createInstancedClouds(scene, {
  numClusters: 160,
  boundary: 8000,
  windSpeed: 0.02,
  baseHeight: 380,
  heightRange: 120,
});

// ── Ocean: tiled + Gerstner waves ─────────────────────────────────────────────
const waterPlaceholder = new THREE.Mesh(
  new THREE.PlaneGeometry(10000, 10000).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x0e7ab5 })
);
waterPlaceholder.position.y = -4;
scene.add(waterPlaceholder);

const ocean = createOcean(scene, {
  waterNormalsUrl: 'https://threejs.org/examples/textures/waternormals.jpg',
  waterColor: 0x001e0f,
  distortionScale: 3.5,
  onReady: () => scene.remove(waterPlaceholder),
});

// ── Rain: line streaks (fast, dense, not like trails) ─────────────────────────
const RAIN_COUNT  = IS_MOBILE ? 4000 : 7500; // lighter on mobile
const RAIN_STREAK_LEN = 2;
const rainGeo     = new THREE.BufferGeometry();
const rainPositions = new Float32Array(RAIN_COUNT * 6); // 2 verts per drop (top, bottom)
for (let i = 0; i < RAIN_COUNT; i++) {
  const x = (Math.random() - 0.5) * 120;
  const z = (Math.random() - 0.5) * 120;
  const y = Math.random() * 180 + 60; // spawn well above player
  rainPositions[i*6]     = x; rainPositions[i*6 + 1] = y;                   rainPositions[i*6 + 2] = z;
  rainPositions[i*6 + 3] = x; rainPositions[i*6 + 4] = y - RAIN_STREAK_LEN; rainPositions[i*6 + 5] = z;
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
const rainMat = new THREE.LineBasicMaterial({
  color: 0xaec8dd,
  transparent: true,
  opacity: 0.25,        // lower so it feels like rain, not trails
  linewidth: 1,
  fog: false,
});
const rain = new THREE.LineSegments(rainGeo, rainMat);
rain.visible = false;
rain.frustumCulled = false; // never cull; always render around player
scene.add(rain);

// ── Lightning flash (storm only): scene lights only, no screen overlay ───────────
let lightningNext = 0;
let lightningFlash = 0;
let lightningDecay = 0.4;
let lightningPeak = 1;
let lightningIsDouble = false;
let lightningSecondPending = false;
let lightningSecondTime = 0;
let lightningSecondPeak = 0;
let lightningSecondDecay = 1;
// Directional from above = sky lit by lightning (whole world illuminates)
const lightningDir = new THREE.DirectionalLight(0xe8f0ff, 0);
lightningDir.position.set(0, 1, 0);
scene.add(lightningDir);
// Point light for local fill
const lightningPoint = new THREE.PointLight(0xffffff, 0, 8000);
scene.add(lightningPoint);

// ── Flock ─────────────────────────────────────────────────────────────────────
const flock = new Flock(scene);
flock.setCount(1);  // solo bird on start screen
flock.speed = 12;
flock.pos.y = 12;  // start higher in the sky above the ocean

const USE_PAPER_PLANE = false; // false = load seagull GLB or use procedural birds

// Load Flying seagull from Poly Pizza (https://poly.pizza/m/6Tpj_vcWP3f)
// Download GLB and place at models/seagull.glb, or we fall back to procedural birds
let camDistance = 22; // closer so planes are visible
let targetCamDistance = camDistance;

if (USE_PAPER_PLANE) {
  // Try Poly Pizza paper airplane (models/paperplane.glb) or use procedural
  new GLTFLoader().load('models/paperplane.glb',
    (gltf) => {
      const model = gltf.scene;
      model.scale.setScalar(0.5); // normalize Poly model; flock applies 35-50
      model.rotation.x = -Math.PI / 2; // Poly models often have forward=+Y
      flock.setBirdTemplate(model);
      flock.modelCorrectionQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    },
    undefined,
    () => {
      const paperPlane = makePaperPlaneMesh();
      flock.setBirdTemplate(paperPlane.group);
      flock.modelCorrectionQ = null;
    }
  );
} else {
  // Use procedural low-poly bird
  flock.modelCorrectionQ = null;
}

// ── Wildlife (dolphins, whales, other flocks) ──────────────────────────────────
const wildlifeState = {
  dolphins: [],
  whales: [],
  birdFlocks: [],
  nextDolphin: 0,
  nextWhale: 0,
  nextBirdFlock: 0,
};

function makeDolphinMesh() {
  const group = new THREE.Group();
  const bodyGeo = new THREE.CapsuleGeometry(1.1, 1.8, 4, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6c8fae,
    roughness: 0.6,
    metalness: 0.1,
  });
  const body = new THREE.Mesh(bodyGeo, mat);
  body.castShadow = false;
  body.receiveShadow = false;
  group.add(body);

  const finGeo = new THREE.BoxGeometry(0.6, 0.1, 0.8);
  const fin = new THREE.Mesh(finGeo, mat);
  fin.position.set(0, 0.3, 0);
  fin.rotation.x = Math.PI / 8;
  group.add(fin);

  const tailGeo = new THREE.BoxGeometry(0.8, 0.08, 1.2);
  const tail = new THREE.Mesh(tailGeo, mat);
  tail.position.set(0, -0.2, -1.4);
  group.add(tail);

  group.scale.setScalar(2.2);
  return group;
}

function makeWhaleMesh() {
  const group = new THREE.Group();
  const bodyGeo = new THREE.CapsuleGeometry(3.0, 8.0, 6, 12);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1c2634,
    roughness: 0.9,
    metalness: 0.05,
  });
  const body = new THREE.Mesh(bodyGeo, mat);
  group.add(body);

  const finGeo = new THREE.BoxGeometry(1.4, 0.2, 1.8);
  const fin = new THREE.Mesh(finGeo, mat);
  fin.position.set(0, 0.6, 0);
  fin.rotation.x = Math.PI / 10;
  group.add(fin);

  const tailGeo = new THREE.BoxGeometry(3.0, 0.24, 2.8);
  const tail = new THREE.Mesh(tailGeo, mat);
  tail.position.set(0, -0.5, -4.2);
  group.add(tail);

  group.scale.setScalar(3.0);
  return group;
}

function makeBirdFlockMesh() {
  const group = new THREE.Group();
  const birds = [];
  const count = 7;
  const spacing = 3.0; // wider spacing so birds aren't cramped

  // Per-flock visual variety: slight color / scale / flap differences
  const variant = Math.floor(Math.random() * 3); // 0 = default, 1 = darker, 2 = warmer

  for (let i = 0; i < count; i++) {
    const birdObj = createLowPolyBird({
      flapSpeedMin: 3.0 + Math.random() * 0.5,
      flapSpeedMax: 5.0 + Math.random() * 0.8,
      flapAmplitudeDegMin: 9 + Math.random() * 3,
      flapAmplitudeDegMax: 16 + Math.random() * 4,
    });
    const bird = birdObj.group;
    const row = Math.floor(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    const offsetX = row * spacing * side;
    bird.position.set(offsetX, 0, -row * spacing * 1.4);
    bird.rotation.y = Math.PI;

    // Per-bird small scale variation so flock doesn't look cloned
    const s = 0.95 + Math.random() * 0.25;
    bird.scale.setScalar(1.1 * s);

    // Subtle tint differences per flock variant
    bird.traverse((obj) => {
      if (!obj.isMesh || !obj.material || !obj.material.color) return;
      const c = obj.material.color;
      const hsl = { h: 0, s: 0, l: 0 };
      c.getHSL(hsl);
      if (variant === 1) {
        // Slightly darker / stormy
        hsl.l *= 0.8;
        hsl.s *= 0.85;
      } else if (variant === 2) {
        // Warmer tint (sunset-ish)
        hsl.h = (hsl.h + 0.03) % 1.0;
        hsl.l *= 1.05;
      }
      c.setHSL(hsl.h, hsl.s, hsl.l);
    });
    birds.push(bird);
    group.add(bird);
  }
  group.scale.setScalar(1.6);
  group.userData.birds = birds;
  return group;
}

function spawnDolphins(leader, dir, isStorm, isNight, isMobile) {
  if (isStorm || isNight) return;
  const maxD = isMobile ? 2 : 3;
  if (wildlifeState.dolphins.length >= maxD) return;
  const now = performance.now() / 1000;
  if (now < wildlifeState.nextDolphin) return;

  // TEMP: super frequent for testing – dolphins every 4–8s
  wildlifeState.nextDolphin = now + 4 + Math.random() * 4;

  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const count = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    const g = makeDolphinMesh();
    const ahead = 30 + Math.random() * 20;
    const sideOffset = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8);
    const base = leader.clone()
      .addScaledVector(dir, ahead)
      .addScaledVector(side, sideOffset);
    const waterY = -2.5;
    base.y = waterY;
    g.position.copy(base);
    g.userData = {
      t: 0,
      duration: 2.8 + Math.random() * 0.6,
      base,
      dir: dir.clone(),
      side: sideOffset,
    };
    scene.add(g);
    wildlifeState.dolphins.push(g);
  }
}

function spawnWhale(leader, dir, isStorm, isMobile) {
  if (isStorm) return;
  const maxW = isMobile ? 1 : 2;
  if (wildlifeState.whales.length >= maxW) return;
  const now = performance.now() / 1000;
  if (now < wildlifeState.nextWhale) return;
  // TEMP: super frequent for testing – whales every 15–30s
  wildlifeState.nextWhale = now + 15 + Math.random() * 15;

  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const g = makeWhaleMesh();
  const dist = 220 + Math.random() * 120;
  const sideOffset = (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 70);
  const base = leader.clone()
    .addScaledVector(dir, dist)
    .addScaledVector(side, sideOffset);
  base.y = -3.0;
  g.position.copy(base);
  g.userData = {
    t: 0,
    duration: 5.5 + Math.random() * 2.0,
    base,
  };
  scene.add(g);
  wildlifeState.whales.push(g);
}

function spawnBirdFlock(leader, dir, isStorm, isMobile) {
  if (isStorm) return;
  const maxF = isMobile ? 1 : 2;
  if (wildlifeState.birdFlocks.length >= maxF) return;
  const now = performance.now() / 1000;
  if (now < wildlifeState.nextBirdFlock) return;
  // Normal cadence: passing flocks every ~35–100s
  wildlifeState.nextBirdFlock = now + 35 + Math.random() * 65;

  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const g = makeBirdFlockMesh();
  const dist = 80 + Math.random() * 60;
  const sideOffset = (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 40);
  const base = leader.clone()
    .addScaledVector(dir, dist)
    .addScaledVector(side, sideOffset);
  base.y = leader.y + (Math.random() * 20 - 10);
  g.position.copy(base);
  const vel = new THREE.Vector3().copy(side).multiplyScalar(sideOffset > 0 ? -1 : 1).multiplyScalar(12 + Math.random() * 6);
  g.userData = Object.assign(g.userData || {}, {
    vel,
    life: 0,
  });
  scene.add(g);
  wildlifeState.birdFlocks.push(g);
}

// ── Game state: start screen ───────────────────────────────────────────────────
let gameStarted = false;
const startScreen = document.getElementById('start-screen');
const hud = document.getElementById('hud');
hud.style.opacity = '0';
hud.style.pointerEvents = 'none';

function startGame() {
  if (gameStarted) return;
  gameStarted = true;
  startScreen.classList.add('hidden');
  hud.style.opacity = '1';
  hud.style.pointerEvents = '';
  flock.setCount(7);
  flock.speed = 11; // start with a bit more forward speed
  smoothLeaderInited = false;  // re-init smooth follow for new formation
  startAmbientAudio();
}

startScreen.addEventListener('click', startGame);

function toggleFormation() {
  if (!gameStarted) return;
  const on = flock.toggleFormation();
  targetCamDistance = on ? 32 : 11;
}

// ── Ambient audio (HTMLAudio loops & SFX, works on mobile) ─────────────────────
const SOUND_URLS = {
  ocean:    'https://www.orangefreesounds.com/wp-content/uploads/2016/08/Waves-sound-effect.mp3',
  wind:     'https://www.orangefreesounds.com/wp-content/uploads/2014/11/Wind-sound.mp3',
  // Dreamy ambient loop as main music bed (day & night)
  dayPad:   'https://www.orangefreesounds.com/wp-content/uploads/2017/05/Dreamy-ambient-background-music-loop.mp3',
  nightPad: 'https://www.orangefreesounds.com/wp-content/uploads/2017/05/Dreamy-ambient-background-music-loop.mp3',
  birdChirp: 'https://www.orangefreesounds.com/wp-content/uploads/2022/06/Bird-chirping-sound-effect.mp3',
  wingFlap:  'https://www.orangefreesounds.com/wp-content/uploads/2016/02/Flapping-wings-sound-effect-free-mp3-download.mp3',
  dolphin:   'https://www.orangefreesounds.com/wp-content/uploads/2014/11/Dolphin-sound.mp3',
  lightning: 'https://www.orangefreesounds.com/wp-content/uploads/2023/01/Thunder-clap-sound-effect-no-rain.mp3',
  rain:      'https://www.orangefreesounds.com/wp-content/uploads/2024/09/Loop-rain-sound.mp3',
};

const sounds = {
  ocean: null,
  wind: null,
  dayPad: null,
  nightPad: null,
  rain: null,
};

const audioTimers = {
  lastBird: 0,
  nextBirdDelay: 6 + Math.random() * 10,
  lastWing: 0,
  lastDolphin: 0,
  lastLightning: 0,
};

let musicEnabled = true;

function startAmbientAudio() {
  if (sounds.ocean) return;
  try {
    const makeLoop = (url, vol) => {
      const a = new Audio(url);
      a.loop = true;
      a.volume = vol;
      a.play().catch(() => {});
      return a;
    };
    sounds.ocean   = makeLoop(SOUND_URLS.ocean, 0.55);
    sounds.wind    = makeLoop(SOUND_URLS.wind,  0.0);
    sounds.dayPad  = makeLoop(SOUND_URLS.dayPad,   0.0);
    sounds.nightPad= makeLoop(SOUND_URLS.nightPad, 0.0);
    sounds.rain    = makeLoop(SOUND_URLS.rain,   0.0);
  } catch (_) {}
}

function playOneShot(url, volume) {
  try {
    const a = new Audio(url);
    a.volume = volume;
    a.play().catch(() => {});
  } catch (_) {}
}

// ── Weather state ─────────────────────────────────────────────────────────────
let currentWeatherKey = 'day';
let targetWeatherKey  = 'day';
let weatherT          = 1.0;
let wx                = WEATHERS.day;

function setWeather(key) {
  if (key === targetWeatherKey) return;
  currentWeatherKey = targetWeatherKey;
  targetWeatherKey  = key;
  weatherT          = 0;
}

document.querySelectorAll('.wx-btn[data-weather]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.wx-btn[data-weather]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setWeather(btn.dataset.weather);
  });
});

const musicToggleBtn = document.getElementById('music-toggle');
if (musicToggleBtn) {
  musicToggleBtn.addEventListener('click', () => {
    musicEnabled = !musicEnabled;
    musicToggleBtn.classList.toggle('active', musicEnabled);
    musicToggleBtn.textContent = musicEnabled ? 'Music: On' : 'Music: Off';
  });
}

// Mobile on-screen controls (buttons)
function bindMobileButton(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  const onDown = (e) => {
    e.preventDefault();
    mobileInput[key] = true;
  };
  const onUp = (e) => {
    e.preventDefault();
    mobileInput[key] = false;
  };
  ['pointerdown', 'mousedown', 'touchstart'].forEach(ev => el.addEventListener(ev, onDown));
  ['pointerup', 'pointerleave', 'mouseup', 'touchend', 'touchcancel'].forEach(ev => el.addEventListener(ev, onUp));
}

function bindMobileTap(id, handler) {
  const el = document.getElementById(id);
  if (!el) return;
  const onTap = (e) => {
    e.preventDefault();
    handler();
  };
  ['click', 'touchstart'].forEach(ev => el.addEventListener(ev, onTap));
}

function initMobileTilt() {
  if (!IS_MOBILE) return;
  if (typeof window === 'undefined') return;
  const handle = (event) => {
    const beta = event.beta;
    const gamma = event.gamma;
    let tilt = null;
    // In landscape, front/back tilt (beta) often feels like left/right to the player.
    if (window.innerWidth > window.innerHeight && typeof beta === 'number') {
      tilt = beta;
    } else if (typeof gamma === 'number') {
      tilt = gamma;
    }
    if (typeof tilt !== 'number') return;
    // Larger deadzone so it snaps back to center more eagerly
    const deadzone = 10;
    if (Math.abs(tilt) < deadzone) {
      mobileTilt.steerX = 0;
    } else {
      const clamped = Math.max(-25, Math.min(25, tilt));
      // More sensitive outside deadzone
      mobileTilt.steerX = (clamped / 25) * 0.9;
    }
    mobileTilt.enabled = true;
  };
  try {
    if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function') {
      window.DeviceOrientationEvent.requestPermission()
        .then((res) => {
          if (res === 'granted') {
            window.addEventListener('deviceorientation', handle, true);
          }
        })
        .catch(() => {});
    } else if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handle, true);
    }
  } catch (_) {}
}

function toggleFullscreen() {
  const doc = document;
  const elem = doc.fullscreenElement || doc.webkitFullscreenElement || doc.documentElement;
  try {
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      if (doc.exitFullscreen) doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    } else {
      const target = document.documentElement;
      if (target.requestFullscreen) target.requestFullscreen();
      else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
    }
  } catch (_) {}
}

if (IS_MOBILE) {
  bindMobileButton('btn-steer-left',  'steerLeft');
  bindMobileButton('btn-steer-right', 'steerRight');
  bindMobileButton('btn-steer-up',    'steerUp');
  bindMobileButton('btn-steer-down',  'steerDown');
  bindMobileButton('btn-speed-up',    'speedUp');
  bindMobileButton('btn-speed-down',  'speedDown');
  bindMobileTap('btn-formation', toggleFormation);
  bindMobileTap('btn-fullscreen', toggleFullscreen);
}

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = new Set();
window.addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'Space' && gameStarted) {
    e.preventDefault();
    toggleFormation();
  }
});
window.addEventListener('keyup',   e => keys.delete(e.code));

// Mobile touch / tilt input state
const mobileInput = {
  steerLeft: false,
  steerRight: false,
  steerUp: false,
  steerDown: false,
  speedUp: false,
  speedDown: false,
};

const mobileTilt = {
  enabled: false,
  steerX: 0,
};

function getInput() {
  let steerX = 0, steerY = 0;
  if (!gameStarted) {
    // Menu: gentle auto-drift
    steerX = Math.sin(performance.now() * 0.0004) * 0.15;
    return { steerX, steerY };
  }
  if (keys.has('ArrowLeft')  || keys.has('KeyA')) steerX = -1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) steerX =  1;
  if (keys.has('ArrowUp')    || keys.has('KeyW')) steerY =  1;
  if (keys.has('ArrowDown')  || keys.has('KeyS')) steerY = -1;
  // Mobile overlay buttons
  if (IS_MOBILE) {
    if (mobileInput.steerLeft)  steerX -= 1;
    if (mobileInput.steerRight) steerX += 1;
    if (mobileInput.steerUp)    steerY += 1;
    if (mobileInput.steerDown)  steerY -= 1;
    if (mobileInput.speedUp)    flock.speed = Math.min(flock.speed + 0.15, 40);
    if (mobileInput.speedDown)  flock.speed = Math.max(flock.speed - 0.15, 4);
  } else {
    if (keys.has('Equal') || keys.has('NumpadAdd'))      flock.speed = Math.min(flock.speed + 0.1, 40);
    if (keys.has('Minus') || keys.has('NumpadSubtract')) flock.speed = Math.max(flock.speed - 0.1, 4);
  }
  return { steerX, steerY };
}

// ── Camera follow ─────────────────────────────────────────────────────────────
const camOffset   = new THREE.Vector3();
const camTarget   = new THREE.Vector3();
const camPos      = new THREE.Vector3();
const smoothLeader = new THREE.Vector3();
const smoothDir   = new THREE.Vector3();
let smoothLeaderInited = false;

// ── Game loop ─────────────────────────────────────────────────────────────────
let last = 0;

function animate(time) {
  requestAnimationFrame(animate);
  const dt = Math.min((time - last) / 1000, 0.05);
  last = time;

  // Weather transition
  if (weatherT < 1) {
    weatherT = Math.min(1, weatherT + dt * 0.45);
    wx = lerpWeather(WEATHERS[currentWeatherKey], WEATHERS[targetWeatherKey], weatherT);
  }

  const leader = flock.leaderPos;
  const dir = flock.direction;
  if (!smoothLeaderInited) {
    smoothLeader.copy(leader);
    smoothDir.copy(dir);
    smoothLeaderInited = true;
  } else {
    smoothLeader.lerp(leader, Math.min(1, 12 * dt));
    smoothDir.lerp(dir, Math.min(1, 10 * dt));
  }

  // Apply weather to scene
  scene.fog = new THREE.Fog(wx.fogColor, wx.fogNear, wx.fogFar);
  const baseExposure = wx.exposure ?? 1;
  // Lightning flash boosts exposure so whole world feels struck (set after lightning update)
  renderer.toneMappingExposure = baseExposure;
  bloomPass.strength = wx.bloomStrength ?? 0.4;
  bloomPass.threshold = wx.bloomThreshold ?? 0.5;

  // Night: dark sky + procedural stars only (no fog on stars so they stay bright)
  const isNight = targetWeatherKey === 'night';
  const isStorm = targetWeatherKey === 'storm';
  if (isNight && !isStorm) {
    scene.background = wx.skyBot;
    sky.visible = false;
    stars.visible = true;
    if (milkyWayDome) milkyWayDome.visible = false;
  } else if (isStorm) {
    scene.background = wx.skyBot;
    sky.visible = false;
    stars.visible = false;
    if (milkyWayDome) milkyWayDome.visible = false;
  } else {
    scene.background = null;
    sky.visible = true;
    stars.visible = true;
    if (milkyWayDome) milkyWayDome.visible = false;
  }

  // Birds catch moonlight at night – glow in bloom
  flock.birds.forEach((b) => {
    b.group.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        const m = obj.material;
        if (m.emissive !== undefined) {
          if (isNight) {
            m.emissive.setHex(0x5577aa);
            m.emissiveIntensity = 0.55;
          } else {
            m.emissive.setHex(0x000000);
            m.emissiveIntensity = 0;
          }
        }
      }
    });
  });

  ambient.intensity = wx.ambientInt;
  sun.intensity = wx.sunInt;
  sun.color.copy(wx.sunColor);
  sun.position.copy(smoothLeader).addScaledVector(wx.sunDir, 200);
  hemi.color.copy(wx.skyBot);
  hemi.groundColor.copy(wx.oceanColor);
  hemi.intensity = 0.35;

  // Three.js Sky: position around camera, sun direction for atmospheric scattering
  sky.position.copy(smoothLeader);
  const sunPos = smoothLeader.clone().addScaledVector(wx.sunDir, 450000);
  sky.material.uniforms.sunPosition.value.copy(sunPos);
  sky.material.uniforms.turbidity.value = wx.turbidity ?? 2;
  sky.material.uniforms.rayleigh.value = wx.rayleigh ?? 1;
  sky.material.uniforms.mieCoefficient.value = wx.mieCoefficient ?? 0.005;

  // Sun sprite: position a bit closer than sky and tint from weather
  const spriteDist = 260;
  sunSprite.visible = (wx.sunGlowSize ?? 0) > 0.01;
  if (sunSprite.visible) {
    sunSprite.position.copy(smoothLeader).addScaledVector(wx.sunDir, spriteDist);
    const glowColor = wx.sunGlow ?? wx.sunColor ?? new THREE.Color(0xffffff);
    sunSprite.material.color.copy(glowColor);
    const baseSize = 80;
    const size = baseSize * (wx.sunGlowSize ?? 0.5);
    sunSprite.scale.set(size, size, size);
    sunSprite.material.opacity = 0.85;
  }

  // Bake sky to scene.environment periodically for reflections (desktop only; costly)
  if (!IS_MOBILE) {
    if (!animate.envBakeTime) animate.envBakeTime = 0;
    animate.envBakeTime += dt;
    if (animate.envBakeTime > 2.0 || (weatherT >= 0.99 && animate.envBakeTime > 0.5)) {
      animate.envBakeTime = 0;
      updateEnvironment(sunPos, wx);
    }
  }

  // ── Wildlife update (passing bird flocks only) ───────────────────────────────
  if (!animate.wildlifeInit) {
    animate.wildlifeInit = true;
    const t0 = performance.now() / 1000;
    // First flock after ~20–50s so it feels occasional
    wildlifeState.nextBirdFlock = t0 + 20 + Math.random() * 30;
  }
  spawnBirdFlock(smoothLeader, smoothDir, isStorm, IS_MOBILE);

  // Update passing bird flocks
  const flocks = wildlifeState.birdFlocks;
  for (let i = flocks.length - 1; i >= 0; i--) {
    const g = flocks[i];
    const ud = g.userData;
    ud.life += dt;
    g.position.addScaledVector(ud.vel, dt);
    if (ud.life > 15 || g.position.distanceToSquared(smoothLeader) > 60000) {
      scene.remove(g);
      flocks.splice(i, 1);
      continue;
    }
    g.rotation.y = Math.atan2(ud.vel.x, ud.vel.z);

    // Animate wings for low-poly birds in this flock
    if (!animate.wildlifeFlapTime) animate.wildlifeFlapTime = 0;
    animate.wildlifeFlapTime += dt;
    const flapTime = animate.wildlifeFlapTime;
    const birds = g.userData.birds || [];
    for (let j = 0; j < birds.length; j++) {
      const b = birds[j];
      const data = b.userData || {};
      const lp = data.leftWingPivot;
      const rp = data.rightWingPivot;
      if (!lp || !rp) continue;
      // Use global wildlife flap time so wings clearly move even if userData is minimal
      const phase = j * 0.4 + (data.glidePhase || 0);
      const glideWave = Math.sin(flapTime * 0.5 + (data.glideModPhase ?? 0));
      const glideMod = Math.max(0.2, 0.6 + 0.4 * glideWave);
      const flap = Math.sin(flapTime * 3.0 + phase) * 0.6 * glideMod;
      const wingSweep = Math.sin(flapTime * 2.1 + phase) * 0.12;
      const wingRest = data.wingRest ?? 0;
      const wingBank = wingRest + flap;
      lp.rotation.z = wingBank;
      rp.rotation.z = -wingBank;
      lp.rotation.y = -wingSweep;
      rp.rotation.y = wingSweep;
    }
  }

  // ── Ambient audio updates (weather, speed, altitude, SFX) ───────────────────
  if (sounds.ocean && sounds.wind && sounds.dayPad && sounds.nightPad && sounds.rain) {
    const tSpeed = THREE.MathUtils.clamp((flock.speed - 4) / (40 - 4), 0, 1);
    const tAlt = THREE.MathUtils.clamp((smoothLeader.y + 10) / 80, 0, 1);
    const isDay = targetWeatherKey === 'day';
    const isNightOnly = targetWeatherKey === 'night';

    // Ocean louder when lower / stormier, quieter high up at night
    let oceanVol = isStorm ? 0.75 : isDay ? 0.6 : 0.4;
    oceanVol += (1 - tAlt) * 0.2; // closer to water => more ocean
    oceanVol = THREE.MathUtils.clamp(oceanVol, 0.0, 1.0);

    // Wind / storm noise mostly in storm and with speed (softer overall)
    let windVol = isStorm ? 0.08 + tSpeed * 0.12 : tSpeed * 0.05;
    if (isNightOnly) windVol *= 0.7;
    windVol = THREE.MathUtils.clamp(windVol, 0.0, 1.0);

    // Pads: gentle musical bed differing by day / night / storm
    let dayPadVol;
    if (isStorm) {
      // Clearly audible even in storm, but a bit softer than clear day
      dayPadVol = 0.25 + tSpeed * 0.1;
    } else if (isDay) {
      dayPadVol = 0.3 + tSpeed * 0.1;
    } else {
      dayPadVol = 0.05;
    }
    let nightPadVol = isNightOnly ? 0.35 : 0.0;
    dayPadVol   = THREE.MathUtils.clamp(dayPadVol, 0.0, 0.6);
    nightPadVol = THREE.MathUtils.clamp(nightPadVol, 0.0, 0.7);

    if (!musicEnabled) {
      dayPadVol = 0;
      nightPadVol = 0;
    }

    // Rain SFX – only when weather has rain (storm)
    let rainVol = wx.rain ? 0.35 + tSpeed * 0.15 : 0.0;
    rainVol = THREE.MathUtils.clamp(rainVol, 0.0, 0.8);

    sounds.ocean.volume = oceanVol;
    sounds.wind.volume = windVol;
    sounds.dayPad.volume = dayPadVol;
    sounds.nightPad.volume = nightPadVol;
    sounds.rain.volume = rainVol;

    // Bird call SFX – occasional distant chirps
    const nowS = performance.now() / 1000;
    if (!isStorm && nowS - audioTimers.lastBird > audioTimers.nextBirdDelay) {
      audioTimers.lastBird = nowS;
      audioTimers.nextBirdDelay = 8 + Math.random() * 14;
      playOneShot(SOUND_URLS.birdChirp, isNightOnly ? 0.18 : 0.22);
    }

    // Dolphin SFX – very rare, only in calm ocean, near surface
    if (!isStorm && !isNightOnly && Math.abs(smoothLeader.y) < 10) {
      if (nowS - audioTimers.lastDolphin > 45 && Math.random() < 0.03) {
        audioTimers.lastDolphin = nowS;
        playOneShot(SOUND_URLS.dolphin, 0.25);
      }
    }
  }

  // Stars fade (night only; no stars in storm) – smooth ramp so no sudden pop
  const skyBrightness = wx.skyTop.r + wx.skyTop.g + wx.skyTop.b;
  const starTarget = isStorm ? 0 : Math.max(0, Math.min(1, (0.5 - skyBrightness) / 0.35));
  starMat.opacity += (starTarget - starMat.opacity) * 2 * dt;
  if (starTarget > 0) starMat.opacity = Math.max(starMat.opacity, starTarget * 0.4);
  stars.position.copy(smoothLeader);

  // Cloud tint, opacity & wind drift (world-space so you can fly through them)
  const baseCloudTint = isStorm
    ? wx.cloudTint.clone() // keep storm clouds properly gray
    : isNight
      ? wx.cloudTint.clone().lerp(new THREE.Color(0x000000), 0.3) // darker at night
      : wx.cloudTint.clone().lerp(new THREE.Color(0xffffff), 0.5);
  cloudLayer.setTint(baseCloudTint);
  const cloudOpacity = wx.cloudOpacity;
  cloudLayer.setOpacity(cloudOpacity);
  cloudLayer.mesh.scale.setScalar(isStorm ? 1.85 : 1);
  const windDir = new THREE.Vector3(1, 0, 0.2).normalize().multiplyScalar(wx.windStrength);
  cloudLayer.update(dt, windDir);

  // High cirrus layer: tie tint to upper sky color, very faint
  const cirrusTint = isStorm
    ? wx.cloudTint.clone().lerp(new THREE.Color(0x000000), 0.2) // darker gray in storm
    : isNight
      ? wx.skyTop.clone().lerp(new THREE.Color(0x000000), 0.4)   // dim at night
      : wx.skyTop.clone().lerp(new THREE.Color(0xffffff), 0.6);
  cirrusLayer.setTint(cirrusTint);
  const cirrusOpacity = cloudOpacity * (isStorm ? 0.1 : isNight ? 0.12 : 0.22);
  cirrusLayer.setOpacity(cirrusOpacity);
  const highWindDir = windDir.clone().multiplyScalar(0.4);
  cirrusLayer.update(dt, highWindDir);

  // Flock update
  const input = getInput();
  // Wing rustle on sharp turns
  if (sounds.ocean && sounds.wind) {
    const nowTurn = performance.now() / 1000;
    const turnMag = Math.max(Math.abs(input.steerX), Math.abs(input.steerY));
    if (turnMag > 0.7 && nowTurn - audioTimers.lastWing > 1.3) {
      audioTimers.lastWing = nowTurn;
      playOneShot(SOUND_URLS.wingFlap, 0.3);
    }
  }
  flock.update(dt, input, wx.turbulence);

  // ── Ocean: follow flock & sync with weather ─────────────
  ocean.setCenter(smoothLeader.x, smoothLeader.z);
  ocean.waveSpeed = targetWeatherKey === 'storm' ? 1.4 : 0.5;
  ocean.update(dt);
  ocean.setSun(wx.sunDir, wx.sunColor);
  ocean.setWaterColor(wx.oceanColor);
  if (waterPlaceholder.parent) {
    waterPlaceholder.position.x = smoothLeader.x;
    waterPlaceholder.position.z = smoothLeader.z;
    waterPlaceholder.material.color.copy(wx.oceanColor);
  }

  // ── Lightning (storm only): random, sometimes double, scene light ─────────────
  lightningDir.visible = isStorm;
  lightningPoint.visible = isStorm;
  if (isStorm) {
    const now = performance.now() / 1000;
    if (now >= lightningNext) {
      // Start a new lightning sequence
      lightningIsDouble = Math.random() < 0.35;
      lightningPeak = 0.4 + Math.random() * 0.8; // 0.4–1.2
      lightningFlash = lightningPeak;
      // Next sequence: min 5s, max 8s
      const gap = 5 + Math.random() * 3; // 5–8s between sequences
      lightningNext = now + gap;
      // Duration 1.5–3s => decay ~0.33–0.66
      lightningDecay = 0.33 + Math.random() * (0.66 - 0.33);
      // Thunder sound effect, much louder, debounce to avoid spam
      if (now - audioTimers.lastLightning > 3) {
        audioTimers.lastLightning = now;
        playOneShot(SOUND_URLS.lightning, 1.0);
      }
      // Optional second flash: quick, then longer
      if (lightningIsDouble) {
        lightningSecondPending = true;
        lightningSecondTime = now + 0.12 + Math.random() * 0.25; // short pause
        lightningSecondPeak = 0.7 + Math.random() * 0.6; // often brighter
        lightningSecondDecay = 0.33 + Math.random() * (0.66 - 0.33);
      } else {
        lightningSecondPending = false;
      }
    }
    // Trigger second flash if scheduled and first has mostly faded
    const now2 = performance.now() / 1000;
    if (lightningSecondPending && now2 >= lightningSecondTime && lightningFlash <= 0.2) {
      lightningFlash = lightningSecondPeak;
      lightningDecay = lightningSecondDecay;
      lightningSecondPending = false;
    }
    // Decay based on per-strike rate
    lightningFlash = Math.max(0, lightningFlash - dt * lightningDecay);
    const flickerDir = 0.8 + Math.random() * 0.4;
    const flickerPt  = 0.7 + Math.random() * 0.6;
    // Insanely powerful: directional from sky + point fill, with flicker (4x stronger)
    lightningDir.intensity = lightningFlash * 32 * flickerDir;
    lightningDir.position.copy(smoothLeader).add(new THREE.Vector3(0, 500, 0));
    lightningDir.target.position.copy(smoothLeader);
    lightningPoint.intensity = lightningFlash * 2400 * flickerPt;
    lightningPoint.position.copy(smoothLeader).add(new THREE.Vector3(0, 400, 0));
  } else {
    lightningFlash = 0;
    lightningDir.intensity = 0;
    lightningPoint.intensity = 0;
    lightningSecondPending = false;
  }
  // Massive exposure boost so world feels struck
  if (lightningFlash > 0) {
    renderer.toneMappingExposure = baseExposure * (1 + lightningFlash * 10);
  }

  // ── Rain animation ───────────────────────────────────
  rain.visible = !!wx.rain;

  if (rain.visible) {
    const posAttr = rainGeo.getAttribute('position');
    const arr = posAttr.array;
    const rainSpeed = targetWeatherKey === 'storm' ? 120 : 80;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const i6 = i * 6;
      let yTop = arr[i6 + 1];
      yTop -= rainSpeed * dt;
      if (yTop < -20) {
        yTop = 200 + Math.random() * 80; // recycle far above player
      }
      arr[i6 + 1] = yTop;
      arr[i6 + 4] = yTop - RAIN_STREAK_LEN;
    }
    posAttr.needsUpdate = true;
    rain.position.set(smoothLeader.x, 0, smoothLeader.z);
  }

  // ── Camera: chase cam directly behind flock ────────────────
  camDistance += (targetCamDistance - camDistance) * Math.min(1, 3 * dt);
  camOffset.copy(smoothDir).multiplyScalar(-camDistance).add(new THREE.Vector3(0, 5, 0));
  camPos.copy(smoothLeader).add(camOffset);

  camera.position.lerp(camPos, 4.5 * dt);

  camTarget.copy(smoothLeader).addScaledVector(smoothDir, 3);
  camera.lookAt(camTarget);

  composer.render(dt);
}

requestAnimationFrame(animate);
