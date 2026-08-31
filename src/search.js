// Framework-free seat search/filter UI ("가격대 최고 시야 추천").
// createSearch(seatApi) receives the buildSeats() return object and exposes
// mount/apply/clear/bestView. All colour work goes through the batch helpers
// highlightMany / clearHighlightMany so instanceColor uploads once per mesh.

const FILTER_COLOR = 0x67e8f9; // cyan — plain filter matches
const BEST_COLOR = 0xfacc15; // amber-gold — best-view picks

export function createSearch(seatApi) {
  const { seats, highlightMany, clearHighlightMany } = seatApi;

  let lastResult = { count: 0, matches: [] };
  let lastCriteria = { tier: 'all', minPrice: null, maxPrice: null };

  function matchesCriteria(seat, criteria) {
    if (seat.taken || seat.confirmed) return false;
    if (criteria.tier && criteria.tier !== 'all' && seat.tier !== criteria.tier) return false;
    if (criteria.minPrice != null && seat.price < criteria.minPrice) return false;
    if (criteria.maxPrice != null && seat.price > criteria.maxPrice) return false;
    return true;
  }

  function apply(criteria) {
    lastCriteria = { ...criteria };
    const matches = seats.filter((s) => matchesCriteria(s, criteria));
    lastResult = { count: matches.length, matches };
    highlightMany(matches, FILTER_COLOR);
    return lastResult;
  }

  // Top-n seats within the CURRENT criteria, score desc, price asc as tie-break.
  function bestView(n = 5) {
    const ranked = [...lastResult.matches]
      .sort((a, b) => b.score - a.score || a.price - b.price)
      .slice(0, n);
    // Show only the winners in gold; the rest of the match set goes cyan.
    highlightMany(lastResult.matches, FILTER_COLOR);
    highlightMany(ranked, BEST_COLOR);
    return ranked;
  }

  // Wipes every highlight. NOTE: the integrator must re-apply the amber
  // "selected" colour to the currently selected seat after calling this
  // (clearHighlightMany restores base colours for everything non-confirmed).
  function clear() {
    clearHighlightMany(seats);
    lastResult = { count: 0, matches: [] };
    lastCriteria = { tier: 'all', minPrice: null, maxPrice: null };
  }

  function mount(rootEl, callbacks = {}) {
    const { onApply = () => {}, onBest = () => {}, onClear = () => {} } = callbacks;

    // actual price range across all sellable seats drives the slider bounds
    let minBound = Infinity;
    let maxBound = -Infinity;
    for (const s of seats) {
      if (s.taken) continue;
      if (s.price < minBound) minBound = s.price;
      if (s.price > maxBound) maxBound = s.price;
    }

    rootEl.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'sv-filter';

    // tier select
    const tierLabel = document.createElement('label');
    tierLabel.className = 'sv-filter-label';
    tierLabel.textContent = 'Tier';
    const tierSelect = document.createElement('select');
    tierSelect.className = 'sv-filter-tier';
    tierSelect.setAttribute('aria-label', 'Filter by tier');
    for (const [value, text] of [
      ['all', 'All tiers'],
      ['lower', 'Lower'],
      ['club', 'Club'],
      ['upper', 'Upper'],
    ]) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      tierSelect.appendChild(opt);
    }
    tierLabel.appendChild(tierSelect);

    // price sliders
    const mkSlider = (which, initial) => {
      const label = document.createElement('label');
      label.className = 'sv-filter-label sv-filter-price';
      const span = document.createElement('span');
      span.textContent = `${which} €${initial}`;
      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'sv-filter-range';
      input.min = String(minBound);
      input.max = String(maxBound);
      input.step = '2';
      input.value = String(initial);
      input.setAttribute('aria-label', `${which} price filter`);
      input.addEventListener('input', () => {
        span.textContent = `${which} €${input.value}`;
      });
      label.appendChild(span);
      label.appendChild(input);
      return { label, input };
    };
    const minSlider = mkSlider('Min', minBound);
    const maxSlider = mkSlider('Max', maxBound);

    // buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'sv-filter-buttons';
    const applyBtn = document.createElement('button');
    applyBtn.className = 'sv-btn sv-btn-apply';
    applyBtn.textContent = 'Apply filter';
    const bestBtn = document.createElement('button');
    bestBtn.className = 'sv-btn sv-btn-best';
    bestBtn.textContent = 'Best view';
    const clearBtn = document.createElement('button');
    clearBtn.className = 'sv-btn sv-btn-clear';
    clearBtn.textContent = 'Clear';
    btnRow.append(applyBtn, bestBtn, clearBtn);

    // results line
    const results = document.createElement('p');
    results.className = 'sv-filter-results';
    results.textContent = '0 seats match';
    results.setAttribute('aria-live', 'polite');

    applyBtn.addEventListener('click', () => {
      const criteria = {
        tier: tierSelect.value,
        minPrice: Number(minSlider.input.value),
        maxPrice: Number(maxSlider.input.value),
      };
      const result = apply(criteria);
      results.textContent = `${result.count} seats match`;
      onApply(criteria, result);
    });

    bestBtn.addEventListener('click', () => {
      const top = bestView(5);
      if (top.length > 0) onBest(top[0]);
    });

    clearBtn.addEventListener('click', () => {
      clear();
      results.textContent = '0 seats match';
      onClear();
    });

    panel.append(tierLabel, minSlider.label, maxSlider.label, btnRow, results);
    rootEl.appendChild(panel);
  }

  return { mount, apply, clear, bestView };
}
