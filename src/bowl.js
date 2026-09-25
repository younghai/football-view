import * as THREE from 'three';
import { TIERS, ROOF, FIELD } from './config.js';

// Stadium shell: raking terraces under the seats, walkways, facades, roof,
// floodlight pylons, scoreboards and pitch-side LED boards.

const CONCRETE = new THREE.MeshStandardMaterial({ color: 0x8d93a1, roughness: 0.92, side: THREE.DoubleSide });
const CONCRETE_DARK = new THREE.MeshStandardMaterial({ color: 0x565d6e, roughness: 0.95, side: THREE.DoubleSide });

function ellipse(rx, rz, th) {
  return [rx * Math.cos(th), rz * Math.sin(th)];
}

// Flat sloped ring between two ellipse boundaries at their own heights.
function ringGeometry(rxIn, rzIn, yIn, rxOut, rzOut, yOut, seg = 160) {
  const pos = [];
  const idx = [];
  const uv = [];
  for (let i = 0; i <= seg; i++) {
    const th = (i / seg) * Math.PI * 2;
    const [xi, zi] = ellipse(rxIn, rzIn, th);
    const [xo, zo] = ellipse(rxOut, rzOut, th);
    pos.push(xi, yIn, zi, xo, yOut, zo);
    uv.push(i / seg, 0, i / seg, 1);
    if (i < seg) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Vertical band following an ellipse, from y0 up to y1.
function wallGeometry(rx, rz, y0, y1, seg = 160) {
  const g = ringGeometry(rx, rz, y0, rx, rz, y1, seg);
  return g;
}

// Stepped terrace surface that hugs just below the seat rows of a tier.
function terraceGeometry(tier, seg = 150) {
  const pos = [];
  const idx = [];
  const uv = [];
  const steps = tier.rows * 3;
  const rIn = tier.rx - 2.2;
  const rOut = tier.rxTop + 2.0;
  for (let i = 0; i <= seg; i++) {
    const th = (i / seg) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    for (let j = 0; j <= steps; j++) {
      const f = j / steps;
      const rx = rIn + (rOut - rIn) * f;
      const rz = tier.rz / tier.rx * rx; // keep tier ellipse ratio
      const rowF = f * tier.rows;
      const ri = Math.min(tier.rows - 1, Math.floor(rowF));
      const y = tier.y + ri * tier.dy + (rowF - ri) * tier.dy - 0.14;
      pos.push(rx * c, y, rz * s);
      uv.push(i / seg, f);
    }
  }
  const rowLen = steps + 1;
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < steps; j++) {
      const a = i * rowLen + j;
      const b = (i + 1) * rowLen + j;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function handrail(rx, rz, y, parent) {
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const th = (i / 120) * Math.PI * 2;
    pts.push(new THREE.Vector3(rx * Math.cos(th), y, rz * Math.sin(th)));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  const rail = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 160, 0.06, 5, true),
    new THREE.MeshStandardMaterial({ color: 0xd7dbe4, roughness: 0.35, metalness: 0.6 }),
  );
  parent.add(rail);
}

function ledBoard(len, parent) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 48;
  const g = cv.getContext('2d');
  g.fillStyle = '#0a0f1e';
  g.fillRect(0, 0, 1024, 48);
  g.font = 'bold 30px system-ui, sans-serif';
  g.fillStyle = '#ffd166';
  const msg = 'HANUL ARENA · SEAT PREVIEW DEMO · ENJOY THE MATCH · ';
  g.fillText(msg + msg, 8, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = Math.max(1, Math.round(len / 55));
  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 0.9,
    color: 0x222222,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 1.15, 0.25), mat);
  mesh.userData.scroll = tex;
  parent.add(mesh);
  return mesh;
}

function scoreboardTexture(state) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 176;
  state.cv = cv;
  state.tex = new THREE.CanvasTexture(cv);
  state.tex.colorSpace = THREE.SRGBColorSpace;
}

function drawScoreboard(state) {
  const g = state.cv.getContext('2d');
  g.fillStyle = '#05070d';
  g.fillRect(0, 0, 512, 176);
  g.strokeStyle = 'rgba(255,209,102,0.5)';
  g.lineWidth = 4;
  g.strokeRect(6, 6, 500, 164);
  g.textAlign = 'center';
  g.fillStyle = '#ffd166';
  g.font = 'bold 26px system-ui, sans-serif';
  g.fillText('HANUL ARENA', 256, 44);
  g.fillStyle = '#ffffff';
  g.font = 'bold 54px system-ui, sans-serif';
  g.fillText(`${state.home} ${state.hs}-${state.as} ${state.away}`, 256, 108);
  g.fillStyle = '#8fa3d9';
  g.font = 'bold 30px ui-monospace, monospace';
  g.fillText(state.clock, 256, 156);
  state.tex.needsUpdate = true;
}

export function buildBowl(parent) {
  const group = new THREE.Group();
  const boards = [];

  // --- ground plate ---
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(280, 64),
    new THREE.MeshStandardMaterial({ color: 0x242b3d, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  group.add(ground);

  // --- terraces, walls, walkways per tier ---
  for (const t of TIERS) {
    const terrace = new THREE.Mesh(terraceGeometry(t), CONCRETE_DARK);
    terrace.receiveShadow = true;
    group.add(terrace);

    // front fascia of the tier
    const front = new THREE.Mesh(
      wallGeometry(t.rx - 2.2, (t.rz / t.rx) * (t.rx - 2.2), t.y - 1.6, t.y + 0.5),
      CONCRETE,
    );
    group.add(front);

    // back wall
    const back = new THREE.Mesh(
      wallGeometry(t.rxTop + 2.0, (t.rz / t.rx) * (t.rxTop + 2.0), t.yTop - 1.4, t.yTop + 1.1),
      CONCRETE,
    );
    group.add(back);
    handrail(t.rxTop + 1.9, (t.rz / t.rx) * (t.rxTop + 1.9), t.yTop + 1.55, group);
  }

  // walkways bridging the gaps between tiers
  const gaps = [];
  for (let i = 0; i < TIERS.length - 1; i++) {
    const a = TIERS[i];
    const b = TIERS[i + 1];
    gaps.push({ rIn: a.rxTop + 2.0, ratio: a.rz / a.rx, rOut: b.rx - 2.2, y: a.yTop + 0.9 });
  }
  for (const gp of gaps) {
    const walk = new THREE.Mesh(
      ringGeometry(gp.rIn, gp.ratio * gp.rIn, gp.y, gp.rOut, gp.ratio * gp.rOut, gp.y),
      CONCRETE,
    );
    walk.receiveShadow = true;
    group.add(walk);
    handrail(gp.rOut - 0.1, gp.ratio * (gp.rOut - 0.1), gp.y + 1.0, group);
  }

  // --- roof: outer canopy + dark underside + fascia ---
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xc9cede,
    roughness: 0.5,
    metalness: 0.25,
    side: THREE.DoubleSide,
  });
  const roof = new THREE.Mesh(
    ringGeometry(ROOF.inRx, ROOF.inRz, ROOF.inY, ROOF.outRx, ROOF.outRz, ROOF.outY, 170),
    roofMat,
  );
  // floodlit stadium: the canopy must not shadow the pitch
  roof.castShadow = false;
  group.add(roof);

  const underside = new THREE.Mesh(
    ringGeometry(ROOF.inRx, ROOF.inRz, ROOF.inY - 0.35, ROOF.outRx, ROOF.outRz, ROOF.outY - 0.35, 170),
    new THREE.MeshStandardMaterial({ color: 0x39415a, roughness: 0.9, side: THREE.BackSide }),
  );
  group.add(underside);

  const fascia = new THREE.Mesh(
    wallGeometry(ROOF.outRx, ROOF.outRz, ROOF.outY - 1.4, ROOF.outY + 0.2, 170),
    new THREE.MeshStandardMaterial({ color: 0x3b4460, roughness: 0.6, metalness: 0.3 }),
  );
  group.add(fascia);

  // outer facade down to the ground
  const facade = new THREE.Mesh(
    wallGeometry(ROOF.outRx + 0.6, ROOF.outRz + 0.6, 0.2, ROOF.outY - 1.2, 170),
    new THREE.MeshStandardMaterial({ color: 0x2c3350, roughness: 0.85 }),
  );
  facade.material.polygonOffset = true;
  facade.material.polygonOffsetFactor = -1;
  group.add(facade);

  // glowing ring under the roof lip
  const glowRing = new THREE.Mesh(
    ringGeometry(ROOF.inRx, ROOF.inRz, ROOF.inY - 0.4, ROOF.inRx - 3.5, ROOF.inRz - 2.8, ROOF.inY - 0.4, 170),
    new THREE.MeshStandardMaterial({
      color: 0x101528,
      emissive: 0xffd166,
      emissiveIntensity: 0.55,
      side: THREE.DoubleSide,
    }),
  );
  group.add(glowRing);

  // roof support columns
  const colMat = new THREE.MeshStandardMaterial({ color: 0x9aa2b5, roughness: 0.5, metalness: 0.4 });
  for (let i = 0; i < 18; i++) {
    const th = (i / 18) * Math.PI * 2 + 0.09;
    const [x, z] = ellipse(ROOF.outRx - 1.2, ROOF.outRz - 1.2, th);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, ROOF.outY - 1, 10), colMat);
    col.position.set(x, (ROOF.outY - 1) / 2, z);
    col.castShadow = true;
    group.add(col);
  }

  // --- floodlight pylons (visual only, real light lives in scene.js) ---
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x11182c,
    emissive: 0xfff4d6,
    emissiveIntensity: 2.4,
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pylon = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 58, 10), colMat);
      pole.position.y = 29;
      const head = new THREE.Mesh(new THREE.BoxGeometry(11, 6, 1.2), headMat);
      head.position.y = 60;
      head.lookAt(0, 4, 0);
      head.position.set(0, 60, 0);
      pylon.add(pole, head);
      pylon.position.set(sx * (ROOF.outRx + 9), 0, sz * (ROOF.outRz + 9));
      group.add(pylon);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: makeGlowTexture(),
          color: 0xfff3cf,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      glow.scale.set(34, 34, 1);
      glow.position.set(sx * (ROOF.outRx + 9), 60, sz * (ROOF.outRz + 9));
      group.add(glow);
    }
  }

  // --- scoreboards above both goals ---
  const sbState = {
    home: 'HAN',
    away: 'NAK',
    hs: 0,
    as: 0,
    minute: 37,
    second: 12,
    cv: null,
    tex: null,
  };
  scoreboardTexture(sbState);
  drawScoreboard(sbState);
  for (const s of [-1, 1]) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 10.4, 27),
      new THREE.MeshStandardMaterial({ color: 0x141a2e, roughness: 0.7 }),
    );
    frame.position.set(s * (TIERS[2].rxTop + 7.5), 44.5, 0);
    frame.castShadow = true;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(25.6, 9.2),
      new THREE.MeshBasicMaterial({ map: sbState.tex }),
    );
    face.position.set(s * (TIERS[2].rxTop + 6.85), 44.5, 0);
    face.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(frame, face);
  }

  // --- LED perimeter boards around the pitch ---
  const sideL = ledBoard(102, group);
  sideL.position.set(0, 0.62, FIELD.W / 2 + 3.4);
  const sideR = ledBoard(102, group);
  sideR.position.set(0, 0.62, -(FIELD.W / 2 + 3.4));
  const endA = ledBoard(70, group);
  endA.rotation.y = Math.PI / 2;
  endA.position.set(FIELD.L / 2 + 4.6, 0.62, 0);
  const endB = ledBoard(70, group);
  endB.rotation.y = Math.PI / 2;
  endB.position.set(-(FIELD.L / 2 + 4.6), 0.62, 0);
  boards.push(sideL, sideR, endA, endB);

  parent.add(group);
  return {
    group,
    boards,
    tickScoreboard(dt) {
      let goal = false;
      sbState.second += Math.floor(dt * 3); // fast-forwarded clock for the demo
      if (sbState.second >= 60) {
        sbState.second = 0;
        sbState.minute = (sbState.minute + 1) % 90;
        if (Math.random() < 0.12) {
          Math.random() < 0.5 ? sbState.hs++ : sbState.as++;
          goal = true;
        }
      }
      const clock = `${String(sbState.minute).padStart(2, '0')}:${String(sbState.second).padStart(2, '0')}`;
      // redraw the 512×176 canvas + texture upload only when the displayed
      // second changes (~3×/s) instead of every rendered frame (~60×/s)
      if (clock !== sbState.clock) {
        sbState.clock = clock;
        drawScoreboard(sbState);
      }
      return goal;
    },
  };
}

let glowTex = null;
function makeGlowTexture() {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,244,214,1)');
  grad.addColorStop(0.35, 'rgba(255,236,180,0.35)');
  grad.addColorStop(1, 'rgba(255,236,180,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}
