import './style.css';
import gsap from 'gsap';
import { createScene } from './scene.js';
import { createPostFX } from './postfx.js';
import { buildPitch } from './pitch.js';
import { buildBowl } from './bowl.js';
import { buildSeats } from './seats.js';
import { buildActors, buildCrowd } from './actors.js';
import { createRig } from './cameraRig.js';
import { createMinimap, createOverview } from './minimap.js';
import { createCrowdAudio } from './audio.js';
import { createPicker } from './picker.js';
import { createSearch } from './search.js';
import { createUI } from './ui.js';
import { track } from './analytics.js';
import { mulberry32 } from './config.js';
import { nextFrame } from './util.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- boot ---------- */
const canvas = document.getElementById('c');
let sceneKit;
try {
  sceneKit = createScene(canvas);
} catch (err) {
  document.getElementById('webgl-fallback').hidden = false;
  document.getElementById('loader')?.remove();
  throw err;
}
const { renderer, scene, camera } = sceneKit;
const postfx = createPostFX(renderer, scene, camera);
window.addEventListener('resize', () => postfx.setSize(window.innerWidth, window.innerHeight));

const ui = createUI({ renderer, scene, camera, rig: null, seatApi: null, reduced: REDUCED });
const audio = createCrowdAudio();

const loaderStages = [
  ['Levelling the pitch…', 12],
  ['Raising the stands…', 30],
  ['Fitting 30,000+ seats…', 62],
  ['Letting the crowd in…', 84],
  ['Kick-off ready', 100],
];
let stageIdx = 0;
function stage(msg, pct) {
  ui.loaderText.textContent = msg;
  ui.loaderBar.style.width = pct + '%';
}
stage(...loaderStages[0]);

/* ---------- build ---------- */
buildPitch(scene);
await nextFrame();
stage(...loaderStages[1]);
await nextFrame();

const bowl = buildBowl(scene);
await nextFrame();

const seatApi = buildSeats(scene);
ui.sbHint.dataset.seats = seatApi.seats.length.toLocaleString('en-US');
await nextFrame();
stage(...loaderStages[2]);
await nextFrame();

const actors = buildActors(scene);
const crowd = buildCrowd(scene, seatApi.seats);
seatApi.seatCount = seatApi.seats.length;
stage(...loaderStages[3]);
await nextFrame();

/* ---------- rig + instruments ---------- */
const rig = createRig(camera, renderer.domElement, REDUCED);
const minimap = createMinimap(document.getElementById('mm'), () => ({
  camera,
  seat: ui.selected,
  rig,
}));
const overview = createOverview(document.getElementById('ov'), seatApi.seats, {
  onPick(label) {
    const seat = seatApi.seats.find((s) => s.section === label && !s.taken && !s.confirmed);
    if (!seat) {
      ui.toast(`Section ${label} is sold out — pick another section`);
      return;
    }
    track('section_pick', { section: label, tier: seat.tier });
    selectSeat(seat, seatApi.meshOf(seat));
  },
});

const seatApiFull = {
  ...seatApi,
  meshOf: seatApi.meshOf,
};
ui.deps.seatApi = seatApiFull;

const picker = createPicker({
  renderer,
  camera,
  seatApi: seatApiFull,
  ui,
  onPick: (seat, mesh) => {
    if (seat.taken || seat.confirmed) return;
    selectSeat(seat, mesh);
  },
});

function selectSeat(seat, mesh) {
  picker.clearHover();
  closeSheet(); // get the mobile search sheet out of the view
  track('seat_preview', { section: seat.section, row: seat.row, seat: seat.seat, price: seat.price });
  const prev = ui.selected;
  if (prev && prev !== seat && !prev.confirmed) {
    seatApi.restore(seatApi.meshOf(prev), prev.id);
  }
  seatApi.setColor(mesh, seat.id, seatApi.seatColor);
  ui.showSeat(seat, 'previewing');
  rig.enterSeat(seat, () => {
    ui.setSeatMode(true);
  });
  overview.draw(seat);
}

/* ---------- dock / toolbar ---------- */
const dReset = document.getElementById('d-reset');
const d2d = document.getElementById('d-3d');
const dVr = document.getElementById('d-vr');
const dZin = document.getElementById('d-zin');
const dZout = document.getElementById('d-zout');
const bkExit = document.getElementById('bk-exit');
const bkSnd = document.getElementById('bk-snd');
const ovExpand = document.getElementById('ov-expand');

function exitSeatMode() {
  ui.setSeatMode(false);
  if (ui.selected) ui.showSeat(ui.selected, 'selected');
  rig.exitSeat();
}
bkExit.addEventListener('click', exitSeatMode);

dReset.addEventListener('click', () => {
  ui.setSeatMode(false);
  rig.overview();
});
dZin.addEventListener('click', () => rig.zoomStep(1));
dZout.addEventListener('click', () => rig.zoomStep(-1));

let is2D = false;
d2d.addEventListener('click', () => {
  is2D = !is2D;
  d2d.classList.toggle('active', is2D);
  d2d.textContent = is2D ? '2D' : '3D';
  d2d.setAttribute('aria-pressed', String(is2D));
  rig.setMode2D(is2D);
});

let stereo = false;
dVr.addEventListener('click', () => {
  stereo = !stereo;
  dVr.classList.toggle('active', stereo);
  if (stereo) ui.toast('Side-by-side stereo view — grab a headset or cross your eyes');
});

bkSnd.addEventListener('click', () => {
  const on = audio.toggle();
  bkSnd.classList.toggle('active', on);
  ui.toast(on ? 'Stadium ambience on' : 'Stadium ambience off');
});
ovExpand.addEventListener('click', () => {
  ui.setSeatMode(false);
  is2D = false;
  d2d.classList.remove('active');
  d2d.textContent = '3D';
  rig.overview();
});

/* ---------- seat search / filter ---------- */
const search = createSearch(seatApiFull);
search.mount(document.getElementById('filter-panel'), {
  onApply(criteria, result) {
    track('filter_apply', { ...criteria, count: result.count });
    if (result.count === 0) ui.toast('No seats match — widen the price range');
  },
  onBest(seat) {
    track('best_pick', { section: seat.section, row: seat.row, score: seat.score });
    ui.toast(`Best available view: Section ${seat.section} · Row ${seat.row} (★ ${seat.score}%)`);
    selectSeat(seat, seatApi.meshOf(seat));
  },
  onClear() {
    // clearHighlightMany restored base colours — re-apply the active selection
    const sel = ui.selected;
    if (sel && !sel.confirmed) seatApi.setColor(seatApi.meshOf(sel), sel.id, seatApi.seatColor);
    if (ui.confirmed) seatApi.setColor(seatApi.meshOf(ui.confirmed), ui.confirmed.id, seatApi.confirmedColor);
  },
});

/* ---------- time of day ---------- */
const todButtons = {
  night: document.getElementById('tod-night'),
  dusk: document.getElementById('tod-dusk'),
  day: document.getElementById('tod-day'),
};

/* ---------- mobile search sheet ---------- */
const filterPanel = document.getElementById('filter-panel');
const searchToggle = document.getElementById('d-search');
function closeSheet() {
  filterPanel.classList.remove('sheet-open');
  searchToggle.setAttribute('aria-expanded', 'false');
}
searchToggle.addEventListener('click', () => {
  const open = filterPanel.classList.toggle('sheet-open');
  searchToggle.setAttribute('aria-expanded', String(open));
});
for (const [name, btn] of Object.entries(todButtons)) {
  btn.addEventListener('click', () => {
    sceneKit.setTimeOfDay(name);
    for (const b of Object.values(todButtons)) {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-pressed', String(b === btn));
    }
    track('time_of_day', { preset: name });
    ui.toast(name === 'night' ? 'Floodlights on' : name === 'dusk' ? 'Golden hour at the arena' : 'Matchday under the sun');
  });
}

/* ---------- keyboard ---------- */
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && ui.isCheckoutOpen()) {
    ui.closeCheckout();
    return;
  }
  if (ev.key === 'Escape' && ui.seatMode) exitSeatMode();
  if (ev.key === 'Enter' && !ui.isCheckoutOpen() && ui.selected && !ui.confirmed) {
    ui.openCheckout(ui.selected);
  }
  if (ev.key === 'r' || ev.key === 'R') rig.overview();
});

/* ---------- suggested seat ---------- */
function suggestSeat() {
  const rnd = mulberry32(Date.now() & 0xffff);
  const open = seatApi.seats.filter((s) => !s.taken && !s.confirmed);
  if (!open.length) return; // fully-sold bowl edge case
  const seat = open[Math.floor(rnd() * open.length)];
  seatApi.setColor(seatApi.meshOf(seat), seat.id, seatApi.seatColor);
  ui.showSeat(seat, 'selected');
  overview.draw(seat);

  // vantage point above the roof, looking down into the bowl at the seat
  const p = new (camera.position.constructor)(
    seat.x * 0.72,
    seat.y + 62,
    seat.z * 0.72,
  );
  const q = new (camera.quaternion.constructor)().setFromRotationMatrix(
    new (camera.matrixWorld.constructor)().lookAt(p, new (camera.position.constructor)(seat.x, seat.y + 2, seat.z), new (camera.position.constructor)(0, 1, 0)),
  );
  rig.flyTo(p, q, 2.2, 'power3.out');
}

/* ---------- render loop ---------- */
let elapsed = 0;
function tick(_time, deltaMS) {
  const dt = Math.min(deltaMS / 1000, 0.1);
  elapsed += dt;

  // keep the drawing buffer in sync with the CSS size (robust against
  // environments where the resize event fires before the module is ready)
  const cw = renderer.domElement.clientWidth;
  const ch = renderer.domElement.clientHeight;
  const pr = renderer.getPixelRatio();
  if (cw > 0 && ch > 0) {
    const bw = Math.round(cw * pr);
    const bh = Math.round(ch * pr);
    if (renderer.domElement.width !== bw || renderer.domElement.height !== bh) {
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.setSize(cw, ch, false);
    }
  }

  // OrbitControls fights the GSAP flight (stale target + polar clamps) and
  // has nothing to do while a seat look-around is active, so it only runs in
  // orbit/top mode between flights.
  if (!rig.rig.flight && rig.rig.mode !== 'seat') rig.controls.update();
  for (const fn of actors.animators) fn(elapsed, dt);
  crowd.update(elapsed);
  if (bowl.tickScoreboard(dt)) {
    crowd.celebrate();
    ui.toast('GOAL! The stand behind the ball erupts');
    track('goal_celebration');
  }
  for (const b of bowl.boards) b.userData.scroll.offset.x -= dt * 0.025;
  picker.frame();
  minimap.draw();

  if (stereo) {
    // stereo uses the plain renderer: the composer owns the full viewport
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setScissorTest(true);
    const eye = camera.position.clone();
    const q = camera.quaternion.clone();
    const right = new (eye.constructor)().set(1, 0, 0).applyQuaternion(q);
    for (const [side, dir] of [[0, -1], [1, 1]]) {
      renderer.setViewport(side * (w / 2), 0, w / 2, h);
      renderer.setScissor(side * (w / 2), 0, w / 2, h);
      camera.position.copy(eye).addScaledVector(right, dir * 0.35);
      renderer.render(scene, camera);
    }
    camera.position.copy(eye);
    renderer.setScissorTest(false);
  } else {
    postfx.render(dt);
  }
}
gsap.ticker.add(tick);

/* ---------- reveal ---------- */
overview.draw(null);
stage(...loaderStages[4]);
suggestSeat();
await nextFrame();
gsap.to(ui.loader, {
  opacity: 0,
  duration: 0.6,
  delay: 0.4,
  onComplete: () => ui.loader.remove(),
});
ui.toast(`Welcome to Hanul Arena — click any seat to preview the view`);
track('app_open', { reduced: REDUCED });

// QA/testing hook
window.__sv = {
  renderer,
  scene,
  camera,
  seatApi: seatApiFull,
  rig,
  ui,
  bowl,
  crowd,
  gsap,
  search,
  postfx,
  renderOnce: () => tick(performance.now() / 1000, 16),
};
