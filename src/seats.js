import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TIERS, PALETTES, SEAT_SPACING, TAKEN_RATIO, mulberry32 } from './config.js';
import { computePrice, computeScore } from './seat-logic.js';

// Pure price/score math lives in seat-logic.js (no three dependency) so tests
// can run in plain node; re-exported here for convenience.
export { computePrice, computeScore };

// Seat data model + instanced rendering for the whole bowl (~35k seats).
// Seats face the pitch; price and view score are derived from position.

const rand = mulberry32(20260831);

export function buildSeats(parent) {
  const seats = [];
  const meshes = [];

  const panGeo = new THREE.BoxGeometry(0.5, 0.08, 0.42);
  panGeo.translate(0, 0.26, 0.02);
  const backGeo = new THREE.BoxGeometry(0.5, 0.42, 0.07);
  backGeo.translate(0, 0.48, -0.19);
  const legGeo = new THREE.BoxGeometry(0.44, 0.24, 0.36);
  legGeo.translate(0, 0.12, 0.02);
  const seatGeo = mergeGeometries([legGeo, panGeo, backGeo]);

  const seatMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });

  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpP = new THREE.Vector3();
  const tmpS = new THREE.Vector3(1, 1, 1);
  const UP = new THREE.Vector3(0, 1, 0);

  for (const tier of TIERS) {
    // section colours
    const palette = PALETTES[tier.key === 'lower' ? 'classic' : tier.key === 'club' ? 'club' : 'sky'];
    const sectionColors = [];
    for (let s = 0; s < tier.sections; s++) {
      sectionColors.push(new THREE.Color(palette[s % palette.length]));
      if (tier.key === 'upper') {
        // slow drift across the palette so the top bowl fades hue-wise
        const t = s / tier.sections;
        const c = new THREE.Color().setHSL(0.62 + t * 0.08, 0.55, 0.32 + 0.06 * Math.sin(s * 2.1));
        sectionColors[s] = c;
      }
    }

    // one instanced mesh per tier
    const list = [];
    for (let s = 0; s < tier.sections; s++) {
      const secSpan = (Math.PI * 2) / tier.sections;
      const mid = (s + 0.5) * secSpan;
      const label = tier.first + s;

      for (let r = 0; r < tier.rows; r++) {
        const rowR = tier.rx + r * tier.dr;
        const rowZ = (tier.rz / tier.rx) * rowR;
        const y = tier.y + r * tier.dy;

        // arc length of this row inside the section (approx by sampling)
        const steps = 24;
        let arc = 0;
        const pts = [];
        for (let k = 0; k <= steps; k++) {
          const th = mid - secSpan / 2 + (k / steps) * secSpan;
          pts.push([th, rowR * Math.cos(th), rowZ * Math.sin(th)]);
        }
        for (let k = 1; k <= steps; k++) {
          arc += Math.hypot(pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2]);
        }
        // aisles eat ~2 seats per section
        const nSeats = Math.max(4, Math.floor(arc / SEAT_SPACING) - 2);

        for (let i = 0; i < nSeats; i++) {
          const f = (i + 0.5) / nSeats;
          const k = f * steps;
          const k0 = Math.min(steps - 1, Math.floor(k));
          const fr = k - k0;
          const th = pts[k0][0] + (pts[k0 + 1][0] - pts[k0][0]) * fr;
          const x = rowR * Math.cos(th);
          const z = rowZ * Math.sin(th);

          // face inward along the ellipse normal
          const nx = Math.cos(th) / rowR;
          const nz = Math.sin(th) / rowZ;
          const yaw = Math.atan2(-nx, -nz);

          const centrality = Math.abs(Math.sin(th)); // 1 = halfway line
          // rand() is consumed in the same order as before (price, score,
          // taken) so the generated stadium stays identical.
          const price = computePrice(tier, r, centrality, rand());
          const score = computeScore(tier, r, centrality, rand());
          const taken = rand() < TAKEN_RATIO;

          list.push({
            id: list.length,
            tier: tier.key,
            tierName: tier.name,
            section: label,
            label,
            row: r + 1,
            seat: i + 1,
            x,
            y,
            z,
            yaw,
            price,
            score,
            taken,
            color: sectionColors[s].clone(),
          });
        }
      }
    }

    const mesh = new THREE.InstancedMesh(seatGeo, seatMat.clone(), list.length);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.tierKey = tier.key;
    mesh.userData.byId = list;

    const base = new Float32Array(list.length * 3);
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      tmpQ.setFromAxisAngle(UP, st.yaw);
      tmpP.set(st.x, st.y, st.z);
      tmpM.compose(tmpP, tmpQ, tmpS);
      mesh.setMatrixAt(i, tmpM);

      const c = st.color.clone();
      if (st.taken) c.multiplyScalar(0.22);
      base[i * 3] = c.r;
      base[i * 3 + 1] = c.g;
      base[i * 3 + 2] = c.b;
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.userData.baseColors = base;

    seats.push(...list);
    meshes.push(mesh);
    parent.add(mesh);
  }

  const tierMeshMap = {};
  tierMeshMap[TIERS[0].key] = meshes[0];
  tierMeshMap[TIERS[1].key] = meshes[1];
  tierMeshMap[TIERS[2].key] = meshes[2];

  return {
    seats,
    meshes,
    meshOf: (seat) => tierMeshMap[seat.tier],
    seatColor: new THREE.Color(0xffd166),
    hoverColor: new THREE.Color(0xf1f5f9),
    confirmedColor: new THREE.Color(0x34d399),
    setColor(mesh, id, color) {
      mesh.setColorAt(id, color);
      mesh.instanceColor.needsUpdate = true;
    },
    restore(mesh, id) {
      const b = mesh.userData.baseColors;
      mesh.setColorAt(id, new THREE.Color(b[id * 3], b[id * 3 + 1], b[id * 3 + 2]));
      mesh.instanceColor.needsUpdate = true;
    },
    // Batch-highlight: repaint every non-taken, non-confirmed seat in the list
    // with colorHex. Confirmed seats keep their green; taken seats are skipped.
    highlightMany(seatList, colorHex) {
      const c = new THREE.Color(colorHex);
      const dirty = new Set();
      for (const seat of seatList) {
        if (seat.confirmed || seat.taken) continue;
        const mesh = tierMeshMap[seat.tier];
        mesh.setColorAt(seat.id, c);
        dirty.add(mesh);
      }
      // one needsUpdate flag per mesh, not per seat
      for (const mesh of dirty) mesh.instanceColor.needsUpdate = true;
    },
    // Batch-clear: restore base colors. NOTE for integrators: the caller is
    // responsible for re-applying the amber "selected" colour to the currently
    // selected seat afterwards, since clear() wipes every highlight.
    clearHighlightMany(seatList) {
      const dirty = new Set();
      for (const seat of seatList) {
        if (seat.confirmed) continue;
        const mesh = tierMeshMap[seat.tier];
        const b = mesh.userData.baseColors;
        mesh.setColorAt(seat.id, new THREE.Color(b[seat.id * 3], b[seat.id * 3 + 1], b[seat.id * 3 + 2]));
        dirty.add(mesh);
      }
      for (const mesh of dirty) mesh.instanceColor.needsUpdate = true;
    },
  };
}
