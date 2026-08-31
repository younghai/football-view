import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// EffectComposer pipeline (bloom + output) with an adaptive quality monitor.
// The renderer already uses ACESFilmicToneMapping; with EffectComposer the
// renderer's tone mapping is bypassed for intermediate passes and OutputPass
// (the final pass) applies tone mapping + sRGB conversion exactly once.

const TIER_ORDER = ['low', 'medium', 'high'];

const TIER_SETTINGS = {
  high: { bloomStrength: 0.55, bloomEnabled: true, pixelRatio: Math.min(window.devicePixelRatio, 2) },
  medium: { bloomStrength: 0.35, bloomEnabled: true, pixelRatio: 1 },
  low: { bloomStrength: 0.0, bloomEnabled: false, pixelRatio: 0.75 },
};

export function createPostFX(renderer, scene, camera) {
  let composer = null;
  let renderPass = null;
  let bloomPass = null;
  let outputPass = null;

  let tier = 'high';
  let userBloomEnabled = null; // null = follow tier defaults
  const tierCallbacks = new Set();

  // Adaptive-quality state
  const FRAME_WINDOW = 120;
  const frameTimes = [];
  let lastTierChange = performance.now();
  let downWindowStart = null;
  let upWindowStart = null;

  try {
    composer = new EffectComposer(renderer);
    renderPass = new RenderPass(scene, camera);
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      TIER_SETTINGS.high.bloomStrength, // strength
      0.4, // radius
      0.85, // threshold
    );
    outputPass = new OutputPass();
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);
  } catch (err) {
    console.warn('[postfx] composer init failed, falling back to plain render:', err);
    composer = null;
    renderPass = null;
    bloomPass = null;
    outputPass = null;
  }

  function applyTier(name, { force = false } = {}) {
    const now = performance.now();
    if (!force) {
      if (name === tier) return;
      if (now - lastTierChange < 5000) return;
    }
    tier = name;
    lastTierChange = now;
    downWindowStart = null;
    upWindowStart = null;
    const s = TIER_SETTINGS[name];
    if (bloomPass) {
      bloomPass.strength = userBloomEnabled !== null && s.bloomEnabled
        ? 0.35 // user-disabled bloom on a tier that would use bloom → keep cost low
        : s.bloomStrength;
      bloomPass.enabled = (userBloomEnabled === null ? s.bloomEnabled : userBloomEnabled && s.bloomEnabled);
    }
    renderer.setPixelRatio(s.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    console.info('[postfx] tier:', name);
    for (const cb of tierCallbacks) {
      try {
        cb(name);
      } catch (e) {
        console.warn('[postfx] tier callback failed:', e);
      }
    }
  }

  function updateAdaptiveQuality(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    frameTimes.push(dt);
    if (frameTimes.length > FRAME_WINDOW) frameTimes.shift();
    if (frameTimes.length < FRAME_WINDOW) return;

    const avgDt = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const fps = 1 / avgDt;
    const now = performance.now();

    // Sustained low fps → step down (after >3 s of poor performance)
    if (fps < 42) {
      if (downWindowStart === null) downWindowStart = now;
      if (now - downWindowStart > 3000) {
        const idx = TIER_ORDER.indexOf(tier);
        if (idx > 0) applyTier(TIER_ORDER[idx - 1]);
        else downWindowStart = null;
      }
    } else {
      downWindowStart = null;
    }

    // Sustained high fps → step up (only after >10 s headroom)
    if (fps > 57) {
      if (upWindowStart === null) upWindowStart = now;
      if (now - upWindowStart > 10000) {
        const idx = TIER_ORDER.indexOf(tier);
        if (idx < TIER_ORDER.length - 1) applyTier(TIER_ORDER[idx + 1]);
        else upWindowStart = null;
      }
    } else {
      upWindowStart = null;
    }
  }

  return {
    render(dt) {
      updateAdaptiveQuality(dt);
      if (composer) {
        composer.render(dt);
      } else {
        renderer.render(scene, camera);
      }
    },

    setSize(width, height) {
      if (composer) composer.setSize(width, height);
      if (bloomPass) bloomPass.setSize(width, height);
    },

    setBloomEnabled(enabled) {
      userBloomEnabled = !!enabled;
      if (bloomPass) {
        const s = TIER_SETTINGS[tier];
        bloomPass.enabled = userBloomEnabled && s.bloomEnabled;
      }
    },

    getTier() {
      return tier;
    },

    onTierChange(cb) {
      if (typeof cb === 'function') tierCallbacks.add(cb);
      return () => tierCallbacks.delete(cb);
    },

    dispose() {
      tierCallbacks.clear();
      if (composer) {
        composer.passes.slice().forEach((p) => {
          if (typeof p.dispose === 'function') p.dispose();
        });
        if (composer.renderTarget1) composer.renderTarget1.dispose();
        if (composer.renderTarget2) composer.renderTarget2.dispose();
      }
      composer = null;
      renderPass = null;
      bloomPass = null;
      outputPass = null;
    },
  };
}
