import { TIERS, FIXTURE } from './config.js';

// Two 2D instruments drawn on canvas:
//  - minimap: live top-down footprint with the camera marker and seat dot
//  - overview: static stylised section map of the bowl

function hexToRgba(hex, a = 1) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function createMinimap(canvas, getState) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  function draw() {
    const state = getState();
    const { camera, seat, rig } = state;
    const scale = Math.min(W / 300, H / 250);
    const cx = W / 2;
    const cy = H / 2;

    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,12,24,0.85)';
    g.fillRect(0, 0, W, H);

    // tiers
    for (const t of TIERS) {
      g.beginPath();
      g.ellipse(cx, cy, t.rxTop * scale * 1.28, t.rzTop * scale * 1.28, 0, 0, Math.PI * 2);
      g.strokeStyle = t.key === 'lower' ? '#c8323e' : t.key === 'club' ? '#3b6fd4' : '#7c5cd6';
      g.lineWidth = 3;
      g.stroke();
    }

    // pitch
    g.fillStyle = '#1f6b2c';
    g.fillRect(cx - 52.5 * scale, cy - 34 * scale, 105 * scale, 68 * scale);
    g.strokeStyle = 'rgba(255,255,255,0.65)';
    g.lineWidth = 1;
    g.strokeRect(cx - 52.5 * scale, cy - 34 * scale, 105 * scale, 68 * scale);
    g.beginPath();
    g.moveTo(cx, cy - 34 * scale);
    g.lineTo(cx, cy + 34 * scale);
    g.stroke();

    // camera marker: dot + facing wedge
    const off = camera.position.clone().sub(rig.homeTarget);
    const r = Math.hypot(off.x, off.z);
    const ang = Math.atan2(off.z, off.x);
    const mr = Math.min(1, r / 240);
    const px = cx + Math.cos(ang) * 120 * scale * mr * 1.9;
    const pz = cy + Math.sin(ang) * 120 * scale * mr * 1.9;

    g.fillStyle = '#ffd166';
    g.beginPath();
    g.arc(px, pz, 3.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 1;
    g.stroke();

    // selected seat
    if (seat) {
      g.fillStyle = seat.confirmed ? '#34d399' : '#67e8f9';
      g.beginPath();
      g.arc(cx + seat.x * scale * 1.28, cy + seat.z * scale * 1.28, 3.4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(103,232,249,0.5)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(cx + seat.x * scale * 1.28, cy + seat.z * scale * 1.28, 7 + Math.sin(performance.now() / 300) * 2, 0, Math.PI * 2);
      g.stroke();
    }
  }

  return { draw };
}

export function createOverview(canvas, seats, opts) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const onPick = typeof opts?.onPick === 'function' ? opts.onPick : null;
  const onHover = typeof opts?.onHover === 'function' ? opts.onHover : null;
  const interactive = !!(onPick || onHover);

  // pre-bucket seats: [tierKey][section] → row count + colour
  const bySection = new Map();
  for (const s of seats) {
    const key = s.section;
    if (!bySection.has(key)) bySection.set(key, { tier: s.tier, color: s.color, seats: 0 });
    bySection.get(key).seats++;
  }

  // Shared view transform — used by draw() AND hit-testing so they can't drift.
  const view = {
    get cx() { return W / 2; },
    get cy() { return H / 2 + 6; },
    get scale() { return Math.min(W / 270, H / 210); },
    ySquash: 0.62,
  };

  // bowl-space (x, z) → canvas point
  function toCanvas(x, z) {
    return [view.cx + x * view.scale, view.cy + view.ySquash * z * view.scale];
  }

  // canvas point → bowl space (undoes y-squash and center offset)
  function toBowl(px, py) {
    return [(px - view.cx) / view.scale, (py - view.cy) / (view.ySquash * view.scale)];
  }

  // Hit-test: returns section label (e.g. 213) or null.
  // Mirrors draw(): wedge s spans th0 = s*secSpan - π/2 to th0 + secSpan*0.92,
  // radially between inner ellipse (rx, rz) and outer ellipse (rxTop, rzTop).
  // NOTE: ctx.ellipse angles are PARAMETRIC angles — a boundary at angle th sits
  // at bowl point (rxTop*cos th, rzTop*sin th), so the inverse of the drawn
  // geometry is φ = atan2(z/rzTop, x/rxTop), NOT atan2(z, x).
  function hitSection(px, py) {
    const [x, z] = toBowl(px, py);
    if (x === 0 && z === 0) return null;
    for (const t of TIERS) {
      const kIn = Math.sqrt((x / t.rx) ** 2 + (z / t.rz) ** 2);       // ≥1 → outside inner ellipse
      const kOut = Math.sqrt((x / t.rxTop) ** 2 + (z / t.rzTop) ** 2); // ≤1 → inside outer ellipse
      if (kIn < 1 || kOut > 1) continue;
      // Blend parameter along the (straight) wedge edge between inner and outer
      // param points; interpolate radii so section cuts match the drawn edges.
      const u = kIn >= kOut ? (kIn - 1) / Math.max(kIn - kOut, 1e-9) : 0;
      const rxL = t.rx + u * (t.rxTop - t.rx);
      const rzL = t.rz + u * (t.rzTop - t.rz);
      const theta = Math.atan2(z / rzL, x / rxL); // invert the drawn parameterization
      const secSpan = (Math.PI * 2) / t.sections;
      const frac = (theta + Math.PI / 2) / secSpan;
      // normalize for atan2 wrap-around (theta < -π/2 lands in the last sections)
      const s = ((Math.floor(frac) % t.sections) + t.sections) % t.sections;
      const fracIn = ((frac % 1) + 1) % 1;
      if (fracIn > 0.92) continue; // in the drawn gap between wedges
      return t.first + s;
    }
    return null;
  }

  let hoverSection = null;

  function draw(selected, hover = null) {
    g.clearRect(0, 0, W, H);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(12,17,34,0.9)');
    grad.addColorStop(1, 'rgba(8,12,24,0.9)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    const cx = view.cx;
    const cy = view.cy;
    const scale = view.scale;

    // pitch with perspective squash
    g.save();
    g.translate(cx, cy);
    g.scale(1, 0.62);

    g.fillStyle = '#1e6a2c';
    g.fillRect(-52.5 * scale, -34 * scale, 105 * scale, 68 * scale);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 1;
    g.strokeRect(-52.5 * scale, -34 * scale, 105 * scale, 68 * scale);
    g.beginPath();
    g.moveTo(0, -34 * scale);
    g.lineTo(0, 34 * scale);
    g.stroke();
    g.beginPath();
    g.ellipse(0, 0, 9.15 * scale, 9.15 * scale, 0, 0, Math.PI * 2);
    g.stroke();

    // section wedges per tier
    for (const t of TIERS) {
      const secSpan = (Math.PI * 2) / t.sections;
      for (let s = 0; s < t.sections; s++) {
        const label = t.first + s;
        const info = bySection.get(label);
        const col = info ? info.color : { getHexString: () => '556677' };
        const th0 = s * secSpan - Math.PI / 2;
        const th1 = th0 + secSpan * 0.92;
        g.beginPath();
        g.moveTo(t.rx * scale * Math.cos(th0), t.rz * scale * Math.sin(th0));
        g.ellipse(0, 0, t.rxTop * scale, t.rzTop * scale, 0, th0, th1);
        g.ellipse(0, 0, t.rx * scale, t.rz * scale, 0, th1, th0, true);
        g.closePath();
        const hex = '#' + col.getHexString();
        const isSel = selected && selected.section === label;
        const isHov = hover === label || (interactive && hoverSection === label);
        g.fillStyle = hexToRgba(hex, isSel ? 1 : isHov ? 0.95 : 0.82);
        g.fill();
        if (isSel) {
          g.strokeStyle = '#67e8f9';
          g.lineWidth = 2;
          g.stroke();
        } else if (isHov) {
          g.strokeStyle = '#67e8f9';
          g.lineWidth = 1.5;
          g.stroke();
        }
      }
    }
    g.restore();

    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = '10px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(`${FIXTURE.home.short} end`, 22, cy - 2);
    g.fillText(`${FIXTURE.away.short} end`, W - 26, cy - 2);

    if (interactive) {
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.font = '9px system-ui, sans-serif';
      g.textAlign = 'right';
      g.fillText('Click a section', W - 6, H - 6);
    }
  }

  if (interactive) {
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Stadium section map, click to preview a section');

    const evPoint = (e) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
    };

    canvas.addEventListener('click', (e) => {
      if (!onPick) return;
      const [px, py] = evPoint(e);
      const label = hitSection(px, py);
      if (label !== null) onPick(label, bySection.get(label)?.tier ?? null);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!onHover) return;
      const [px, py] = evPoint(e);
      const label = hitSection(px, py);
      if (label !== hoverSection) {
        hoverSection = label;
        canvas.style.cursor = label !== null ? 'pointer' : 'default';
        onHover(label);
        draw();
      }
    });

    canvas.addEventListener('pointerleave', () => {
      if (onHover && hoverSection !== null) {
        hoverSection = null;
        canvas.style.cursor = 'default';
        onHover(null);
        draw();
      }
    });
  }

  return { draw };
}
