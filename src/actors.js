import * as THREE from 'three';
import { FIXTURE } from './config.js';

// Pitch life (wandering players + ball) and the seated crowd.
// Crowd bobbing happens in the vertex shader so 30k instances stay cheap.

export function buildActors(scene) {
  const group = new THREE.Group();
  const animators = [];

  // --- players ---
  const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.62, 4, 10);
  const headGeo = new THREE.SphereGeometry(0.13, 10, 8);
  const teams = [
    { color: new THREE.Color(FIXTURE.home.colors[0]), n: 11, half: -1 },
    { color: new THREE.Color(FIXTURE.away.colors[0]), n: 11, half: 1 },
  ];
  const players = [];
  let pi = 0;
  for (const team of teams) {
    const mat = new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.7 });
    for (let i = 0; i < team.n; i++) {
      const p = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, mat);
      body.position.y = 0.55;
      body.castShadow = true;
      const head = new THREE.Mesh(
        headGeo,
        new THREE.MeshStandardMaterial({ color: 0xe8b28c, roughness: 0.8 }),
      );
      head.position.y = 1.14;
      p.add(body, head);

      // rough 4-3-3-ish scatter, mirrored per half
      const col = i % 3;
      const rowIdx = Math.floor(i / 3);
      const bx = team.half * (12 + rowIdx * 11 + (i % 2) * 4);
      const bz = (col - 1) * 18 + (rowIdx % 2) * 9 - 4;
      p.position.set(bx, 0, bz);
      p.userData.base = new THREE.Vector3(bx, 0, bz);
      p.userData.phase = Math.random() * Math.PI * 2;
      p.userData.speed = 0.25 + Math.random() * 0.4;
      p.userData.dir = 1;
      players.push(p);
      group.add(p);
      pi++;
    }
  }

  // referee
  const refMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
  const ref = new THREE.Group();
  const refBody = new THREE.Mesh(bodyGeo, refMat);
  refBody.position.y = 0.55;
  refBody.castShadow = true;
  ref.add(refBody);
  ref.position.set(0, 0, 14);
  group.add(ref);

  // --- ball ---
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.5 }),
  );
  ball.castShadow = true;
  ball.position.set(0, 0.32, 0);
  group.add(ball);

  scene.add(group);

  animators.push((t, dt) => {
    // players drift around their formation slot
    for (const p of players) {
      const u = p.userData;
      const wx = Math.sin(t * u.speed + u.phase) * 4.2;
      const wz = Math.cos(t * u.speed * 0.8 + u.phase * 1.7) * 4.2;
      const nx = u.base.x + wx;
      const nz = u.base.z + wz;
      p.position.x = nx;
      p.position.z = nz;
      p.position.y = Math.abs(Math.sin(t * 5 + u.phase)) * 0.05;
      // face travel direction (cheap derivative)
      const vx = Math.cos(t * u.speed + u.phase) * u.speed * 4.2;
      const vz = -Math.sin(t * u.speed * 0.8 + u.phase * 1.7) * u.speed * 0.8 * 4.2;
      if (vx * vx + vz * vz > 0.001) p.rotation.y = Math.atan2(vx, vz);
    }
    ref.position.x = Math.sin(t * 0.3) * 10;
    ref.position.z = 16 + Math.cos(t * 0.23) * 8;
  });

  // ball gets knocked between random nearby players
  const ballState = { target: new THREE.Vector3(0, 0.32, 0), from: new THREE.Vector3(), k: 1, dur: 1 };
  animators.push((t, dt) => {
    ballState.k += dt / ballState.dur;
    if (ballState.k >= 1) {
      ballState.from.copy(ball.position);
      const carrier = players[Math.floor(Math.random() * players.length)];
      ballState.target.set(carrier.position.x, 0.32, carrier.position.z);
      ballState.k = 0;
      ballState.dur = 1.6 + Math.random() * 1.6;
    }
    const e = ballState.k < 0.5 ? 2 * ballState.k * ballState.k : 1 - Math.pow(-2 * ballState.k + 2, 2) / 2;
    ball.position.lerpVectors(ballState.from, ballState.target, e);
    ball.position.y = 0.32 + Math.sin(e * Math.PI) * 1.4;
    ball.rotation.x += dt * 9;
  });

  return { group, animators };
}

// --- crowd ---

// Crowd-person silhouette variants drawn into a 2x2 canvas atlas at runtime.
// 0: plain, 1: arms up, 2: scarf, 3: jacket. Light fills so instanceColor tints multiply cleanly.
function buildCrowdAtlas() {
  const TS = 128;
  const cv = document.createElement('canvas');
  cv.width = TS * 2;
  cv.height = TS * 2;
  const ctx = cv.getContext('2d');

  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  };

  const drawPerson = (tx, ty, variant) => {
    const ox = tx * TS;
    const oy = ty * TS;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.fillStyle = '#f5f5f5';

    if (variant === 1) {
      // arms up: raised forearms as thin rounded rects beside the head
      ctx.fillStyle = '#ededed';
      rr(34, 8, 14, 44, 7);
      rr(80, 8, 14, 44, 7);
      ctx.fillStyle = '#f5f5f5';
      ctx.beginPath(); // hands
      ctx.arc(41, 10, 8, 0, Math.PI * 2);
      ctx.arc(87, 10, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // torso (hips to shoulders)
    ctx.fillStyle = variant === 3 ? '#e2e2e2' : '#f0f0f0';
    rr(32, 58, 64, 66, 14);
    // shoulders
    ctx.beginPath();
    ctx.ellipse(64, 64, 34, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    if (variant === 2) {
      // scarf
      ctx.fillStyle = '#dcdcdc';
      rr(44, 56, 40, 14, 6);
      rr(56, 66, 14, 20, 5);
    }

    // head
    ctx.fillStyle = '#f7f7f7';
    ctx.beginPath();
    ctx.arc(64, 38, 17, 0, Math.PI * 2);
    ctx.fill();
    // subtle top-light on head so flatness reads less
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(59, 33, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  drawPerson(0, 0, 0); // plain
  drawPerson(1, 0, 1); // arms up
  drawPerson(0, 1, 2); // scarf
  drawPerson(1, 1, 3); // jacket

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

export function buildCrowd(parent, seats) {
  const taken = seats.filter((s) => s.taken);

  // Billboard plane, origin at the seat so people "sit" on it.
  // Local y runs 0..0.58; shader places the bottom 0.34 above the seat origin (just above the pan).
  const geo = new THREE.PlaneGeometry(0.42, 0.58);
  geo.translate(0, 0.29, 0);

  const n = taken.length;
  const tiles = new Float32Array(n);
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const col = new THREE.Color();
  const crowd = new THREE.InstancedMesh(geo, undefined, n);

  const atlas = buildCrowdAtlas();
  const mat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.9, metalness: 0.0 });
  crowd.material = mat;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uExcite = { value: 0 };
    shader.uniforms.uWaveAngle = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uExcite;
        uniform float uWaveAngle;
        attribute float aTile;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float ph = iPos.x * 12.9 + iPos.z * 7.7;
          float ang = atan(iPos.z, iPos.x);
          float d = ang - uWaveAngle;
          d = mod(d + 3.14159265, 6.28318531) - 3.14159265;
          float front = exp(-d * d * 18.0) * uExcite;
          // stand up: stretch about the bottom of the plane and rise slightly
          transformed.y = 0.34 + transformed.y * (1.0 + front * 0.35) + front * 0.28;
          // idle bob, faster and larger while the wave front passes
          float bobAmp = 0.04 + front * 0.06;
          transformed.y += sin(uTime * (2.4 + front * 6.0) + ph) * bobAmp;
          transformed.y += sin(uTime * 0.7 + ph * 0.35) * 0.03;
        #endif`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        #ifdef USE_INSTANCING
          float tileX = mod(aTile, 2.0);
          float tileY = floor(aTile / 2.0);
          vMapUv = (vMapUv + vec2(tileX, tileY)) * 0.5;
        #endif`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          // billboard: instance translation, then add the plane corner in view space
          mvPosition = viewMatrix * vec4(iPos, 1.0);
          mvPosition.xy += transformed.xy;
        #else
          mvPosition = modelViewMatrix * mvPosition;
        #endif
        gl_Position = projectionMatrix * mvPosition;`,
      );
    mat.userData.shader = shader;
  };

  for (let i = 0; i < n; i++) {
    const s = taken[i];
    pos.set(s.x, s.y, s.z);
    m.makeTranslation(pos.x, pos.y, pos.z);
    crowd.setMatrixAt(i, m);
    tiles[i] = Math.floor(Math.random() * 4);
    col.setHSL(Math.random(), 0.45, 0.42 + Math.random() * 0.25);
    crowd.setColorAt(i, col);
  }
  geo.setAttribute('aTile', new THREE.InstancedBufferAttribute(tiles, 1));
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  parent.add(crowd);

  // Goal-celebration wave state. All advancement happens in update(t) via uniforms.
  const wave = { t0: -1e9, startAngle: 0, pending: false };
  const WAVE_DUR = 4.0; // one lap around the bowl
  const FADE_DUR = 2.0; // uExcite fully back to 0 by t0 + 6

  return {
    celebrate() {
      wave.pending = true; // latched on next update(t) so the timebase matches the app clock
      wave.startAngle = Math.random() * Math.PI * 2;
    },
    update(t) {
      const sh = mat.userData.shader;
      if (!sh) return;
      if (wave.pending) {
        wave.t0 = t;
        wave.pending = false;
      }
      sh.uniforms.uTime.value = t;
      const age = t - wave.t0;
      if (age >= 0 && age < WAVE_DUR) {
        sh.uniforms.uWaveAngle.value = wave.startAngle + (age / WAVE_DUR) * Math.PI * 2;
        sh.uniforms.uExcite.value = 1;
      } else if (age >= WAVE_DUR && age < WAVE_DUR + FADE_DUR) {
        sh.uniforms.uExcite.value = 1 - (age - WAVE_DUR) / FADE_DUR;
      } else {
        sh.uniforms.uExcite.value = 0;
      }
    },
  };
}
