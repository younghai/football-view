import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Renderer, camera, lights, sky. Everything else plugs into the returned kit.

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x141c33, 320, 700);

  // --- image-based lighting (subtle; IBL only supplements the analytic lights) ---
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    pmrem.dispose();
    if (typeof scene.environmentIntensity !== 'undefined') {
      scene.environmentIntensity = 0.22;
    }
  } catch (err) {
    console.warn('[scene] IBL environment unavailable, continuing without it:', err);
  }

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    1600,
  );
  camera.position.set(150, 120, 160);

  // --- sky dome with a dusk gradient + faint stars ---
  const skyGeo = new THREE.SphereGeometry(900, 32, 18);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x0a1030) },
      mid: { value: new THREE.Color(0x1c2a55) },
      horizon: { value: new THREE.Color(0x3b4a77) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vPos;
      uniform vec3 top; uniform vec3 mid; uniform vec3 horizon;
      void main() {
        float h = clamp(normalize(vPos).y, -0.1, 1.0);
        vec3 c = h > 0.28
          ? mix(mid, top, smoothstep(0.28, 0.9, h))
          : mix(horizon, mid, smoothstep(-0.05, 0.28, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  const starGeo = new THREE.BufferGeometry();
  {
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(0.25 + Math.random() * 0.7);
      const r = 860;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  scene.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xcfd8ff, size: 2.2, sizeAttenuation: false, fog: false }),
    ),
  );

  // --- lights: floodlit evening look ---
  const hemi = new THREE.HemisphereLight(0x8fa3d9, 0x1c3a26, 0.85);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff2d8, 1.6);
  key.position.set(-140, 190, 90);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -150;
  key.shadow.camera.right = 150;
  key.shadow.camera.top = 150;
  key.shadow.camera.bottom = -150;
  key.shadow.camera.near = 40;
  key.shadow.camera.far = 520;
  key.shadow.bias = -0.00035;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xbcd0ff, 0.5);
  fill.position.set(150, 120, -120);
  scene.add(fill);

  // --- time-of-day presets ---
  // 'night' reproduces the original look exactly.
  const TIME_OF_DAY = {
    night: {
      hemi: { sky: 0x8fa3d9, ground: 0x1c3a26, intensity: 0.85 },
      key: { color: 0xfff2d8, intensity: 1.6 },
      fill: { color: 0xbcd0ff, intensity: 0.5 },
      sky: { top: 0x0a1030, mid: 0x1c2a55, horizon: 0x3b4a77 },
      fog: { color: 0x141c33 },
      exposure: 1.08,
    },
    dusk: {
      hemi: { sky: 0x8f7bb8, ground: 0x3a2418, intensity: 0.45 },
      key: { color: 0xff9a52, intensity: 1.45 },
      fill: { color: 0xd0a8ff, intensity: 0.35 },
      sky: { top: 0x140c30, mid: 0x5c3060, horizon: 0xd96a4a },
      fog: { color: 0x3a2244 },
      exposure: 1.05,
    },
    day: {
      hemi: { sky: 0xbcd4ff, ground: 0x3a5a3a, intensity: 1.0 },
      key: { color: 0xffffff, intensity: 2.3 },
      fill: { color: 0xd8e8ff, intensity: 0.7 },
      sky: { top: 0x3a78c8, mid: 0x7aa8dd, horizon: 0xcfe0f0 },
      fog: { color: 0xa8c4e0 },
      exposure: 1.0,
    },
  };

  let timeOfDay = 'night';

  function applyTimeOfDay(name) {
    const p = TIME_OF_DAY[name];
    if (!p) return;
    timeOfDay = name;
    hemi.color.setHex(p.hemi.sky);
    hemi.groundColor.setHex(p.hemi.ground);
    hemi.intensity = p.hemi.intensity;
    key.color.setHex(p.key.color);
    key.intensity = p.key.intensity;
    fill.color.setHex(p.fill.color);
    fill.intensity = p.fill.intensity;
    skyMat.uniforms.top.value.setHex(p.sky.top);
    skyMat.uniforms.mid.value.setHex(p.sky.mid);
    skyMat.uniforms.horizon.value.setHex(p.sky.horizon);
    scene.fog.color.setHex(p.fog.color);
    renderer.toneMappingExposure = p.exposure;
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    renderer,
    scene,
    camera,
    setTimeOfDay(name) {
      if (TIME_OF_DAY[name]) applyTimeOfDay(name);
      return timeOfDay;
    },
    getTimeOfDay() {
      return timeOfDay;
    },
  };
}
