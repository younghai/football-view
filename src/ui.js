import { TIER_BENEFITS, FIXTURE, mulberry32 } from './config.js';
import { favoriteKey, usd, usd2 } from './util.js';

// DOM wiring: seat card, POV thumbnail capture, checkout, tooltips, toast.

export function createUI({ renderer, scene, camera, reduced }) {
  const deps = { seatApi: null };
  const $ = (id) => document.getElementById(id);
  const ui = {
    loader: $('loader'),
    loaderText: $('loader-text'),
    loaderBar: $('loader-bar'),
    matchCard: $('match'),
    camcard: $('camcard'),
    overviewCard: $('overview'),
    seatcard: $('seatcard'),
    pLabel: $('p-label'),
    fav: $('fav'),
    pSection: $('p-section'),
    pTier: $('p-tier'),
    pBlock: $('p-block'),
    pRow: $('p-row'),
    pSeat: $('p-seat'),
    pPrice: $('p-price'),
    pImg: $('p-img'),
    pPh: $('p-ph'),
    pScore: $('p-score'),
    benefits: [...document.querySelectorAll('#benefits .btxt')],
    checkout: $('checkout'),
    checkoutLabel: $('checkout-label'),
    backbar: $('backbar'),
    bkExit: $('bk-exit'),
    bkSnd: $('bk-snd'),
    tip: $('tip'),
    tip1: $('tip1'),
    tip2: $('tip2'),
    toast: $('toast'),
    fanPhotos: $('fan-photos'),
    sbHint: $('sb-hint'),
  };

  let selected = null; // seat highlighted in the card
  let confirmedSeat = null;
  let seatMode = false;
  let toastTimer = null;
  const favs = new Set(JSON.parse(localStorage.getItem('sv-favs') || '[]'));

  // match card
  $('m-comp').textContent = FIXTURE.competition;
  $('m-home').textContent = FIXTURE.home.name;
  $('m-away').textContent = FIXTURE.away.name;
  $('m-date').textContent = FIXTURE.date;
  $('m-kick').textContent = FIXTURE.kickoff;
  $('m-venue').textContent = FIXTURE.venue;
  for (const [el, team] of [
    [$('flag-home'), FIXTURE.home],
    [$('flag-away'), FIXTURE.away],
  ]) {
    el.style.background = `linear-gradient(135deg, ${team.colors[0]} 0 55%, ${team.colors[1]} 55% 100%)`;
  }

  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2600);
    // mirror status changes for screen readers
    const live = document.getElementById('a11y-live');
    if (live) live.textContent = msg;
  }

  function showTip(x, y, line1, line2) {
    ui.tip1.textContent = line1;
    ui.tip2.textContent = line2;
    ui.tip.style.left = Math.min(x + 14, window.innerWidth - 240) + 'px';
    ui.tip.style.top = y + 12 + 'px';
    ui.tip.classList.add('show');
  }

  function setSeatState(state) {
    ui.pLabel.textContent =
      state === 'confirmed' ? 'SEAT CONFIRMED' : state === 'previewing' ? 'PREVIEWING SEAT' : 'SELECTED SEAT';
    ui.seatcard.dataset.state = state;
    ui.checkout.classList.toggle('done', state === 'confirmed');
    ui.checkoutLabel.textContent = state === 'confirmed' ? 'Seat secured ✓' : 'Grab seat';
  }

  function fillCard(seat) {
    ui.pSection.textContent = `Section ${seat.section}`;
    ui.pTier.textContent = seat.tierName;
    ui.pBlock.textContent = `Block ${seat.section}`;
    ui.pRow.textContent = seat.row;
    ui.pSeat.textContent = seat.seat;
    ui.pPrice.innerHTML = `€${seat.price} <span class="unit">/seat</span> <span class="usd">· $${usd(seat.price)}</span>`;
    ui.pScore.textContent = `★ ${seat.score}% view`;
    const b = TIER_BENEFITS[seat.tier];
    ui.benefits.forEach((el, k) => (el.textContent = b[k]));
    ui.fav.classList.toggle('active', favs.has(favoriteKey(seat)));
    ui.seatcard.classList.remove('refresh');
    void ui.seatcard.offsetWidth; // restart the pop-in animation
    ui.seatcard.classList.add('refresh');
  }

  // Render the view from a seat eye into a JPEG data URL.
  function captureFromEye(seat, fov = 62, w = 480, h = 290) {
    const eye = new (camera.position.constructor)(seat.x, seat.y + 1.2, seat.z);
    eye.x += -Math.sin(seat.yaw) * 0.22;
    eye.z += -Math.cos(seat.yaw) * 0.22;
    const sp = camera.position.clone();
    const sq = camera.quaternion.clone();
    const sf = camera.fov;

    camera.position.copy(eye);
    camera.lookAt(0, 2.5, 0);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').drawImage(renderer.domElement, 0, 0, w, h);
    const url = out.toDataURL('image/jpeg', 0.75);

    camera.position.copy(sp);
    camera.quaternion.copy(sq);
    camera.fov = sf;
    camera.updateProjectionMatrix();
    return url;
  }

  // "Fan photos": real renders from two nearby seats in the same section.
  function captureFanPhotos(seat) {
    const neighbours = deps.seatApi.seats
      .filter((s) => s.section === seat.section && s.id !== seat.id && !s.taken)
      .sort((a, b) => Math.abs(a.row - seat.row) - Math.abs(b.row - seat.row))
      .slice(0, 2);
    ui.fanPhotos.querySelectorAll('img').forEach((img, i) => {
      if (neighbours[i]) {
        img.src = captureFromEye(neighbours[i], 68, 320, 200);
        img.classList.add('ready');
      } else {
        img.classList.remove('ready');
      }
    });
  }

  function showSeat(seat, state = 'selected') {
    selected = seat;
    fillCard(seat);
    setSeatState(state);
    const live = document.getElementById('a11y-live');
    if (live) {
      live.textContent = `${state === 'confirmed' ? 'Confirmed' : 'Selected'}: ${seat.tierName}, Section ${seat.section}, Row ${seat.row}, Seat ${seat.seat}, ${seat.price} euros, view score ${seat.score} percent`;
    }
    ui.pPh.style.display = '';
    ui.pImg.classList.remove('ready');
    // let the card paint first, then capture at the next frame
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        ui.pImg.src = captureFromEye(seat);
        ui.pImg.classList.add('ready');
        ui.pPh.style.display = 'none';
        if (deps.seatApi) captureFanPhotos(seat);
      }),
    );
  }

  function confirmSeat(seat, mesh) {
    if (confirmedSeat && confirmedSeat !== seat) {
      confirmedSeat.confirmed = false;
      deps.seatApi.restore(deps.seatApi.meshOf(confirmedSeat), confirmedSeat.id);
    }
    confirmedSeat = seat;
    seat.confirmed = true;
    deps.seatApi.setColor(mesh, seat.id, deps.seatApi.confirmedColor);
    setSeatState('confirmed');
    toast(`Seat ${seat.section}-${seat.row}-${seat.seat} secured · demo only, no real ticket`);
  }

  ui.fav.addEventListener('click', () => {
    if (!selected) return;
    const k = favoriteKey(selected);
    if (favs.has(k)) {
      favs.delete(k);
      ui.fav.classList.remove('active');
      toast('Removed from favourites');
    } else {
      favs.add(k);
      ui.fav.classList.add('active');
      toast('Saved to favourites');
    }
    localStorage.setItem('sv-favs', JSON.stringify([...favs]));
  });

  /* ---------- checkout modal ---------- */
  const modal = $('checkout-modal');
  let modalSeat = null;

  function fakeQR(canvas, seedText) {
    const g = canvas.getContext('2d');
    const n = 25;
    const cell = canvas.width / n;
    let seed = 0;
    for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = mulberry32(seed || 1);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#0a0f1e';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (rnd() < 0.44) g.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    // three finder squares
    const finder = (fx, fy) => {
      g.fillStyle = '#0a0f1e';
      g.fillRect(fx, fy, cell * 5, cell * 5);
      g.fillStyle = '#fff';
      g.fillRect(fx + cell, fy + cell, cell * 3, cell * 3);
      g.fillStyle = '#0a0f1e';
      g.fillRect(fx + cell * 2, fy + cell * 2, cell, cell);
    };
    finder(0, 0);
    finder(cell * (n - 5), 0);
    finder(0, cell * (n - 5));
  }

  function openCheckout(seat) {
    if (!seat || seat === confirmedSeat) return;
    modalSeat = seat;
    $('cm-comp').textContent = FIXTURE.competition;
    $('cm-teams').innerHTML = `<b>${FIXTURE.home.name}</b><i>vs</i><b>${FIXTURE.away.name}</b>`;
    $('cm-meta').textContent = `${FIXTURE.date} · ${FIXTURE.kickoff} · ${FIXTURE.venue}`;
    $('cm-seat-section').textContent = `Section ${seat.section}`;
    $('cm-seat-tier').textContent = seat.tierName;
    $('cm-seat-row').textContent = seat.row;
    $('cm-seat-no').textContent = seat.seat;
    $('cm-seat-score').textContent = `★ ${seat.score}%`;
    const fee = 6.9;
    const totalEur = seat.price + fee;
    $('cm-price').textContent = `€${seat.price} (≈ $${usd(seat.price)})`;
    $('cm-total').textContent = `€${totalEur.toFixed(2)} (≈ $${usd2(totalEur)})`;
    $('cm-pay').textContent = `Pay €${totalEur.toFixed(2)} / $${usd2(totalEur)} — grab this seat`;
    $('cm-form').hidden = false;
    $('cm-success').hidden = true;
    modal.hidden = false;
    $('cm-name').focus();
  }

  function closeCheckout() {
    modal.hidden = true;
    modalSeat = null;
  }

  function finishPurchase() {
    const seat = modalSeat;
    closeCheckout();
    if (seat) confirmSeat(seat, deps.seatApi.meshOf(seat));
  }

  ui.checkout.addEventListener('click', () => openCheckout(selected));

  $('cm-close').addEventListener('click', closeCheckout);
  $('cm-backdrop').addEventListener('click', closeCheckout);
  $('cm-done').addEventListener('click', finishPurchase);

  $('cm-pay').addEventListener('click', () => {
    if (!$('cm-name').value.trim()) {
      $('cm-name').focus();
      return;
    }
    const pay = $('cm-pay');
    pay.disabled = true;
    pay.textContent = 'Processing payment…';
    setTimeout(() => {
      pay.disabled = false;
      $('cm-form').hidden = true;
      $('cm-success').hidden = false;
      fakeQR($('cm-qr'), favoriteKey(modalSeat || { tier: 'x', section: 0, row: 0, seat: 0 }));
      $('cm-success-line').textContent = modalSeat
        ? `Section ${modalSeat.section} · Row ${modalSeat.row} · Seat ${modalSeat.seat} — ticket sent to ${$('cm-email').value.trim() || 'your email'}`
        : '';
    }, 1100);
  });

  return {
    ...ui,
    deps,
    get selected() {
      return selected;
    },
    get confirmed() {
      return confirmedSeat;
    },
    get seatMode() {
      return seatMode;
    },
    isCheckoutOpen: () => !modal.hidden,
    openCheckout,
    closeCheckout,
    setSeatMode(v) {
      seatMode = v;
      document.body.classList.toggle('seat-mode', v);
      ui.backbar.classList.toggle('show', v);
      ui.sbHint.classList.toggle('show', v);
    },
    showSeat,
    confirmSeat,
    toast,
    showTip,
  };
}
