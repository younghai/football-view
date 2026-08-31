import * as THREE from 'three';
import { usd } from './util.js';

// Raycast hover/click against the instanced seat meshes + cursor tooltip.

export function createPicker({ renderer, camera, seatApi, ui, onPick }) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pending = null;
  let hovered = null; // { seat, mesh }

  function pick(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(seatApi.meshes, false);
    for (const h of hits) {
      const seat = h.object.userData.byId[h.instanceId];
      if (seat) return { seat, mesh: h.object, instanceId: h.instanceId };
    }
    return null;
  }

  function clearHover() {
    if (hovered) {
      const { seat, mesh } = hovered;
      if (seat === ui.selected || seat === ui.confirmed) {
        seatApi.setColor(mesh, seat.id, seat === ui.confirmed ? seatApi.confirmedColor : seatApi.seatColor);
      } else {
        seatApi.restore(mesh, seat.id);
      }
      hovered = null;
    }
    ui.tip.classList.remove('show');
    renderer.domElement.style.cursor = '';
  }

  function frame() {
    // runs once per animation frame while the pointer is over the canvas
    if (!pending) return;
    const hit = pending;
    pending = null;

    clearHover();
    if (!hit) return;

    const { seat, mesh } = hit;
    if (seat.confirmed) {
      ui.showTip(hit.evX, hit.evY, `Seat confirmed`, 'Enjoy the match');
      return;
    }
    if (seat.taken) {
      ui.showTip(hit.evX, hit.evY, `Already sold`, 'Pick another seat');
      return;
    }
    hovered = { seat, mesh };
    seatApi.setColor(mesh, seat.id, seatApi.hoverColor);
    renderer.domElement.style.cursor = 'pointer';
    ui.showTip(hit.evX, hit.evY, `Section ${seat.section} · Row ${seat.row} · Seat ${seat.seat}`, `€${seat.price} ($${usd(seat.price)}) / seat · ★ ${seat.score}% view`);
  }

  const dom = renderer.domElement;

  dom.addEventListener('pointermove', (ev) => {
    if (ui.seatMode) {
      clearHover();
      return;
    }
    pending = { ...pick(ev), evX: ev.clientX, evY: ev.clientY };
  });
  dom.addEventListener('pointerleave', () => {
    clearHover();
    pending = null;
  });

  let downXY = null;
  dom.addEventListener('pointerdown', (ev) => {
    downXY = [ev.clientX, ev.clientY];
  });
  dom.addEventListener('pointerup', (ev) => {
    if (ui.seatMode || !downXY) return;
    const moved = Math.hypot(ev.clientX - downXY[0], ev.clientY - downXY[1]);
    downXY = null;
    if (moved > 6) return; // was a drag, not a click
    const hit = pick(ev);
    if (!hit) return;
    onPick(hit.seat, hit.mesh);
  });

  return { frame, clearHover };
}
