import * as THREE from 'three';
import { FIELD } from './config.js';

// Playing surface: mown-stripe canvas texture with regulation markings,
// plus goals with simple nets and corner flags.

function pitchTexture() {
  const W = 2048;
  const H = Math.round((2048 * FIELD.W) / FIELD.L);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');

  const stripes = 14;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? '#2c7a35' : '#256b2d';
    g.fillRect((i * W) / stripes, 0, W / stripes + 1, H);
  }
  // subtle mow sheen
  for (let i = 0; i < stripes; i += 2) {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0.06)');
    g.fillStyle = grad;
    g.fillRect((i * W) / stripes, 0, W / stripes + 1, H);
  }

  const mx = FIELD.L / 2;
  const mz = FIELD.W / 2;
  const X = (x) => ((x + mx) / FIELD.L) * W;
  const Z = (z) => ((z + mz) / FIELD.W) * H;
  const lineW = 6;

  g.strokeStyle = 'rgba(250,250,250,0.92)';
  g.lineWidth = lineW;
  g.strokeRect(X(-mx + 0.2), Z(-mz + 0.2), X(mx - 0.2) - X(-mx + 0.2), Z(mz - 0.2) - Z(-mz + 0.2));

  g.beginPath();
  g.moveTo(X(0), Z(-mz));
  g.lineTo(X(0), Z(mz));
  g.stroke();

  g.beginPath();
  g.arc(X(0), Z(0), (9.15 / FIELD.L) * W, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(X(0), Z(0), lineW + 2, 0, Math.PI * 2);
  g.fillStyle = 'rgba(250,250,250,0.92)';
  g.fill();

  for (const s of [-1, 1]) {
    const gx = s * mx;
    // penalty area 16.5 x 40.32, goal area 5.5 x 18.32
    g.strokeRect(X(gx), Z(-20.16), X(gx - s * 16.5) - X(gx), Z(20.16) - Z(-20.16));
    g.strokeRect(X(gx), Z(-9.16), X(gx - s * 5.5) - X(gx), Z(9.16) - Z(-9.16));
    // penalty spot + arc
    const px = gx - s * 11;
    g.beginPath();
    g.arc(X(px), Z(0), lineW + 2, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(X(px), Z(0), (9.15 / FIELD.L) * W, s > 0 ? Math.PI * 0.63 : -Math.PI * 0.37, s > 0 ? Math.PI * 1.37 : Math.PI * 0.37);
    g.stroke();
    // corner arcs
    for (const t of [-1, 1]) {
      g.beginPath();
      g.arc(X(gx), Z(t * mz), (1 / FIELD.L) * W, 0, Math.PI * 2);
      g.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function netMaterial() {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 62, 62);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

export function buildPitch(parent) {
  const group = new THREE.Group();

  // surrounding apron
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD.L + 18, FIELD.W + 16),
    new THREE.MeshStandardMaterial({ color: 0x1d5427, roughness: 0.95 }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.02;
  apron.receiveShadow = true;
  group.add(apron);

  const turf = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD.L, FIELD.W),
    new THREE.MeshStandardMaterial({ map: pitchTexture(), roughness: 0.9 }),
  );
  turf.rotation.x = -Math.PI / 2;
  turf.receiveShadow = true;
  group.add(turf);

  // goals
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4 });
  const net = netMaterial();
  for (const s of [-1, 1]) {
    const goal = new THREE.Group();
    const geom = new THREE.CylinderGeometry(0.07, 0.07, 2.44, 8);
    for (const t of [-1, 1]) {
      const post = new THREE.Mesh(geom, postMat);
      post.position.set(0, 1.22, t * 3.66);
      goal.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7.46, 8), postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.y = 2.44;
    goal.add(bar);

    const back = new THREE.Mesh(new THREE.PlaneGeometry(7.32, 2.2), net);
    back.position.set(s * -1.7, 1.1, 0);
    back.rotation.y = Math.PI / 2;
    goal.add(back);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 7.32), net);
    top.rotation.x = Math.PI / 2;
    top.rotation.z = Math.PI / 2;
    top.position.set(s * -0.85, 2.3, 0);
    goal.add(top);
    for (const t of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.2), net);
      side.position.set(s * -0.85, 1.1, t * 3.66);
      goal.add(side);
    }

    goal.position.x = s * (FIELD.L / 2 + 0.15);
    group.add(goal);
  }

  // corner flags
  const flagMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), poleMat);
      pole.position.set(sx * (FIELD.L / 2), 0.8, sz * (FIELD.W / 2));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.38), flagMat);
      flag.position.set(sx * (FIELD.L / 2) - sx * 0.3, 1.4, sz * (FIELD.W / 2));
      group.add(pole, flag);
    }
  }

  parent.add(group);
  return group;
}
