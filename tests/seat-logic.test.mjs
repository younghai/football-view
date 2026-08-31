import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIERS } from '../src/config.js';
import { computePrice, computeScore } from '../src/seat-logic.js';

// deterministic pseudo-jitter spread over [0, 1)
function* jitters(n) {
  let x = 12345;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    yield (x / 2147483648);
  }
}

test('computePrice stays within plausible bounds for every tier', () => {
  for (const tier of TIERS) {
    for (let row = 0; row < tier.rows; row++) {
      for (const centrality of [0, 0.25, 0.5, 0.75, 1]) {
        for (const jitter of [0, 0.5, 0.999]) {
          const p = computePrice(tier, row, centrality, jitter);
          assert.ok(p >= 20 && p <= 500, `price ${p} out of bounds (${tier.key})`);
          assert.ok(Number.isInteger(p), 'price must be an integer');
        }
      }
    }
  }
});

test('computeScore clamps to [60, 99]', () => {
  for (const tier of TIERS) {
    for (let row = 0; row < tier.rows; row++) {
      for (const centrality of [0, 1]) {
        for (const jitter of [0, 0.5, 0.999]) {
          const s = computeScore(tier, row, centrality, jitter);
          assert.ok(s >= 60 && s <= 99, `score ${s} out of range (${tier.key})`);
        }
      }
    }
  }
});

test('price grows with centrality on average', () => {
  const avg = (tier, centrality) => {
    let sum = 0;
    const n = 200;
    for (const j of jitters(n)) sum += computePrice(tier, 0, centrality, j);
    return sum / n;
  };
  for (const tier of TIERS) {
    const low = avg(tier, 0);
    const high = avg(tier, 1);
    assert.ok(high > low, `${tier.key}: centrality 1 avg (${high}) should exceed centrality 0 avg (${low})`);
  }
});

test('price rises with row for a fixed centrality/jitter', () => {
  for (const tier of TIERS) {
    const first = computePrice(tier, 0, 0.5, 0.5);
    const last = computePrice(tier, tier.rows - 1, 0.5, 0.5);
    assert.ok(last > first, `${tier.key}: back rows should cost more than front rows`);
  }
});
