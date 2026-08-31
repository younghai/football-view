// Pure price/score math extracted from seats.js so it can be unit-tested in
// plain node without importing three. Formulas must stay byte-identical to the
// ones originally inlined in the seat-generation loop.
import { TIERS } from './config.js';

// tier: one of the TIERS objects; row: 0-based row index;
// centrality: 0..1 (|sin θ|); jitter: 0..1 (replaces the previous rand() call).
export function computePrice(tier, row, centrality, jitter) {
  return (
    Math.round(
      (tier.basePrice + row * (tier.key === 'club' ? 4 : 1.8) + centrality * (tier.key === 'club' ? 60 : 38) + jitter * 10) / 2,
    ) * 2
  );
}

export function computeScore(tier, row, centrality, jitter) {
  return Math.min(99, Math.round(64 + centrality * 26 + tier.elevationBonus + row * 0.35 + jitter * 5));
}

export function tierByKey(key) {
  return TIERS.find((t) => t.key === key);
}
