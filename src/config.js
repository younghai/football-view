// Stadium dimensions, ticket tiers, palettes and the demo fixture.
// All geometry is derived from these numbers at build time.

export const FIELD = { L: 105, W: 68 };

export const SEAT_SPACING = 0.55;

export const TIERS = [
  {
    key: 'lower',
    name: 'Lower Tier',
    first: 101,
    sections: 30,
    rows: 16,
    rx: 60,
    rz: 44,
    y: 1.2,
    dr: 0.82,
    dy: 0.46,
    basePrice: 85,
    elevationBonus: 0,
  },
  {
    key: 'club',
    name: 'Club Tier',
    first: 201,
    sections: 22,
    rows: 12,
    rx: 80,
    rz: 62,
    y: 14,
    dr: 0.78,
    dy: 0.58,
    basePrice: 205,
    elevationBonus: 4,
  },
  {
    key: 'upper',
    name: 'Upper Tier',
    first: 301,
    sections: 30,
    rows: 16,
    rx: 96,
    rz: 76,
    y: 26,
    dr: 0.78,
    dy: 0.68,
    basePrice: 45,
    elevationBonus: 7,
  },
];

for (const t of TIERS) {
  t.rxTop = t.rx + t.rows * t.dr;
  t.rzTop = t.rz + t.rows * t.dr;
  t.yTop = t.y + t.rows * t.dy;
}

export const ROOF = { inRx: 100, inRz: 80, inY: 40, outRx: 126, outRz: 104, outY: 46 };

// Section colour palettes, one entry per section, cycled per tier.
export const PALETTES = {
  classic: ['#c8323e', '#e8e6df', '#d99a2b', '#c8323e', '#2f6f9f', '#e8e6df'],
  club: ['#1d3f7a', '#153a63', '#24509b', '#a16207'],
  sky: ['#3730a3', '#4338ca', '#5b21b6', '#312e81', '#4c1d95', '#1e3a8a'],
};

export const TIER_BENEFITS = {
  lower: ['Cushioned seat', 'Sharp sightline', 'Concession voucher'],
  club: ['Lounge access', 'Half-time table service', 'Wide padded seat'],
  upper: ['Panoramic pitch view', 'Great value', 'Express concourse'],
};

export const FIXTURE = {
  competition: 'ARENA INVITATIONAL',
  home: { name: 'HANRIVER FC', short: 'HAN', colors: ['#d0342f', '#f3f4f6'] },
  away: { name: 'NAKDONG UNITED', short: 'NAK', colors: ['#2b6cb0', '#e2e8f0'] },
  kickoff: '7:45 PM',
  date: 'Demo fixture',
  venue: 'Hanul Arena, Seoul',
};

export const TAKEN_RATIO = 0.14; // share of seats already sold (simulated)

// Deterministic PRNG so every reload shows the same stadium.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CAMERA_HOME = { radius: 232, phi: 1.02, theta: -0.68, target: [0, 8, 0] };
