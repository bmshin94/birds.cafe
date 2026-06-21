/**
 * Gerstner wave system for ocean vertex displacement.
 * 8 waves with varied wavelength/direction for realistic swell.
 */

import * as THREE from 'three';

const TAU = Math.PI * 2;

function makeWaves(config = {}) {
  const windSpeed = config.windSpeed ?? 8;
  const windDirDeg = config.windDirection ?? -135;
  const choppiness = config.choppiness ?? 0.8;
  const waveScale = config.waveScale ?? 1;

  const peakWavelength = Math.max(20, windSpeed * windSpeed * 0.8);
  const windRad = (windDirDeg * Math.PI) / 180;

  const defs = [
    { freq: 1.0, dirOff: 0, weight: 1.0 },
    { freq: 1.4, dirOff: 30, weight: 0.6 },
    { freq: 0.7, dirOff: -25, weight: 0.7 },
    { freq: 2.0, dirOff: 55, weight: 0.4 },
    { freq: 0.25, dirOff: 90, weight: 1.2 },
    { freq: 0.5, dirOff: -70, weight: 0.9 },
    { freq: 3.0, dirOff: 45, weight: 0.2 },
    { freq: 2.5, dirOff: -55, weight: 0.25 },
  ];

  return defs.map((d, i) => {
    const dirRad = windRad + (d.dirOff * Math.PI) / 180;
    const dirX = Math.sin(dirRad);
    const dirZ = Math.cos(dirRad);
    const steepness = d.weight * 0.09 * waveScale;
    return {
      dirX, dirZ,
      wavelength: peakWavelength / d.freq,
      steepness,
      phase: (i * 1.7) % TAU,
    };
  });
}

export function createGerstnerWaveSystem(config = {}) {
  const waves = makeWaves(config);
  const choppiness = config.choppiness ?? 0.8;

  const uniforms = {
    waveTime: { value: 0 },
    waveChoppiness: { value: choppiness },
  };
  waves.forEach((w, i) => {
    uniforms[`wDir${i}`] = { value: new THREE.Vector2(w.dirX, w.dirZ) };
    uniforms[`wSteep${i}`] = { value: w.steepness };
    uniforms[`wLen${i}`] = { value: w.wavelength };
    uniforms[`wPhase${i}`] = { value: w.phase };
  });

  function getUniformDeclarations() {
    let s = 'uniform float waveTime;\nuniform float waveChoppiness;\n';
    for (let i = 0; i < waves.length; i++) {
      s += `uniform vec2 wDir${i}; uniform float wSteep${i}; uniform float wLen${i}; uniform float wPhase${i};\n`;
    }
    return s;
  }

  function getVertexCode() {
    let sum = '';
    for (let i = 0; i < waves.length; i++) {
      sum += `
        float k${i} = 6.28318 / wLen${i};
        float c${i} = sqrt(9.8 / k${i});
        float f${i} = k${i} * (wDir${i}.x * wx + wDir${i}.y * wz - c${i} * waveTime) + wPhase${i};
        float a${i} = wSteep${i} / k${i};
        disp.x += wDir${i}.x * (a${i} * waveChoppiness * cos(f${i}));
        disp.z += wDir${i}.y * (a${i} * waveChoppiness * cos(f${i}));
        disp.y += a${i} * sin(f${i});
      `;
    }
    return `
      vec3 waveDisplacement(vec3 worldPos) {
        float wx = worldPos.x, wz = worldPos.z;
        vec3 disp = vec3(0.0);
        ${sum}
        return disp;
      }
    `;
  }

  return {
    uniforms,
    getUniformDeclarations,
    getVertexCode,
    update(dt) {
      uniforms.waveTime.value += dt * 0.5;
    },
  };
}
