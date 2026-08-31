import { TIERS } from './config.js';

export const favoriteKey = (s) => `${s.tier}:${s.section}:${s.row}:${s.seat}`;

// Demo currency conversion (fixed rate — no live FX in a concept demo)
export const EUR_TO_USD = 1.09;
export const usd = (eur) => Math.round(eur * EUR_TO_USD);
export const usd2 = (eur) => (eur * EUR_TO_USD).toFixed(2);

export function tierOf(seat) {
  return TIERS.find((t) => t.key === seat.tier);
}

export function nextFrame() {
  // rAF alone stalls when the tab is hidden (background throttling), so race
  // it with a short timeout — in a visible tab rAF always wins.
  return new Promise((resolve) => {
    let done = false;
    const fire = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    requestAnimationFrame(fire);
    setTimeout(fire, 60);
  });
}
