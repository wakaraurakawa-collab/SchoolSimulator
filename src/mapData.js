// Side-view (cross-section) school map, RimWorld / ant-farm style.
// Floors are horizontal strips; students walk left-right and use stairwells
// to change floors. Everything outside the building is water.
//
//   □□           <- roof level: 2 boxes (stair house + shed), rest is open deck
//   □□□□□        <- 3F
//   □□□□□        <- 2F
//   □□□□□        <- 1F, with piers over the water on both sides

export const TILE = 16;
export const GRID_W = 52;
export const CANVAS_W = GRID_W * TILE; // 832
export const CANVAS_H = 432;

export const BX0 = 6;    // building west edge (tile)
export const BX1 = 46;   // building east edge (exclusive)
export const ROOM_W = 8; // tiles per room slot

// Pixel y of each floor's walk line (bottom of the floor zone). Index = floor.
export const FLOOR_BOTTOM_Y = [384, 304, 224, 144];
export const FLOOR_H = 80;
export const WATER_Y = 380;
export const FLOOR_NAMES = ["1F", "2F", "3F", "屋上"];

export const STAIRS = [
  { x: 11, minF: 0, maxF: 3 }, // west stairwell, reaches the roof
  { x: 36, minF: 0, maxF: 2 }, // east stairwell, 1F-3F only
];

export const PIER_L = { from: 0, to: 5 };
export const PIER_R = { from: 46, to: 51 };
export const FISH_SPOT_XS = [0, 50, 51];
export const TRADE_X = 2; // where students meet the trading boat

export const ROOMS = [];
const defRoom = (f, slot, name, type) =>
  ROOMS.push({ f, slot, name, type, x0: BX0 + slot * ROOM_W, x1: BX0 + (slot + 1) * ROOM_W });

defRoom(0, 0, "昇降口", "hall");
defRoom(0, 1, "食堂", "dining");
defRoom(0, 2, "調理室", "kitchen");
defRoom(0, 3, "倉庫", "storage");
defRoom(0, 4, "保健室", "infirmary");
defRoom(1, 0, "教室", "study");
defRoom(1, 1, "寝室A", "bedroom");
defRoom(1, 2, "寝室B", "bedroom");
defRoom(1, 3, "寝室C", "bedroom");
defRoom(1, 4, "図書室", "library");
defRoom(2, 0, "職員室", "hq");
defRoom(2, 1, "教室", "study");
defRoom(2, 2, "音楽室", "music");
defRoom(2, 3, "工作室", "workshop");
defRoom(2, 4, "美術室", "art");
defRoom(3, 0, "階段室", "hall");
defRoom(3, 1, "物置", "shed");

export const DECK = { f: 3, x0: BX0 + 2 * ROOM_W, x1: BX1 }; // open rooftop deck
export const PLOT_XS = [24, 29, 34, 39]; // garden planters on the deck

export const BEDS = [];
for (const slot of [1, 2, 3]) {
  const base = BX0 + slot * ROOM_W;
  const xs = slot === 3 ? [base + 1, base + 3, base + 5] // east stair eats one spot
                        : [base + 1, base + 3, base + 5, base + 7];
  for (const x of xs) BEDS.push({ f: 1, x });
}
export const INFIRMARY_BEDS = [{ f: 0, x: 40 }, { f: 0, x: 42 }, { f: 0, x: 44 }];

// Fallback spots to curl up in (floor 2+) when the flood submerges the
// bedrooms on floor 1 - poor sleep, but better than nothing.
export const MAKESHIFT_SLEEP = [{ f: 2, x: 17 }, { f: 2, x: 33 }, { f: 3, x: 43 }];

// x may be fractional (used for drawing); round before pathfinding.
export const BINS = {
  food:     { f: 0, x: 31 },
  medicine: { f: 0, x: 32.5 },
  material: { f: 0, x: 34 },
  tool:     { f: 0, x: 35.3 },
};

export const DINING = { x0: 15, x1: 21 };
export const PLAY_SPOTS = [
  { f: 0, x: 8,  emote: "🃏" },
  { f: 1, x: 42, emote: "📚" },
  { f: 2, x: 26, emote: "🎵" },
  { f: 2, x: 42, emote: "🎨" },
  { f: 3, x: 43, emote: "⚽" },
];
export const STUDY_SPOTS = [{ f: 1, x: 8 }, { f: 2, x: 17 }];

export function isWalkable(f, x) {
  if (f === 0) return x >= 0 && x < GRID_W; // piers included
  if (f >= 1 && f <= 3) return x >= BX0 && x < BX1;
  return false;
}

export function canClimb(f, x, dir) {
  return STAIRS.some((s) =>
    s.x === x && (dir > 0 ? f >= s.minF && f < s.maxF : f > s.minF && f <= s.maxF));
}

export function walkY(f) {
  return FLOOR_BOTTOM_Y[f] - 10;
}

export function tileCX(x) {
  return x * TILE + TILE / 2;
}

export function roomAt(f, x) {
  return ROOMS.find((r) => r.f === f && x >= r.x0 && x < r.x1) || null;
}
