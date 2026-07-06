// Legend for floor ASCII maps:
//  ' ' void / water (outside the building, not walkable)
//  '#' wall (not walkable)
//  '.' floor / corridor (walkable)
//  'D' door (walkable, drawn slightly differently)
//  'S' stairs (walkable, links to the same column/row on the floor above/below)
// Room zones and shore (resource drop) tiles are declared separately as coordinate
// lists so the ASCII stays readable.

export const TILE_SIZE = 32;

const FLOOR_1 = [
  "                    ",
  "   ############     ",
  "   #..........#     ",
  "   #.RRRR.KKKK#     ",
  "   #.RRRR.KKKK#     ",
  "  ##D....D....D##   ",
  " #.............. #  ",
  " #.CCCC.SS.HHHH.. #  ",
  " #.CCCC.SS.HHHH.. #  ",
  " #..............# # ",
  "  ##############    ",
  "                    ",
];

const FLOOR_2 = [
  "                    ",
  "   ############     ",
  "   #.AAAA.AAAA#     ",
  "   #.AAAA.AAAA#     ",
  "   #..........#     ",
  "  ##D....D....D##   ",
  " #.............. #  ",
  " #.AAAA.SS.AAAA.. #  ",
  " #.AAAA.SS.AAAA.. #  ",
  " #..............# # ",
  "  ##############    ",
  "                    ",
];

const FLOOR_3 = [
  "                    ",
  "   ############     ",
  "   #.AAAA.EEEE#     ",
  "   #.AAAA.EEEE#     ",
  "   #..........#     ",
  "  ##D....D....D##   ",
  " #.............. #  ",
  " #.AAAA.SS.LLLL.. #  ",
  " #.AAAA.SS.LLLL.. #  ",
  " #..............# # ",
  "  ##############    ",
  "                    ",
];

const ROOF = [
  "                    ",
  "   ############     ",
  "   #..........#     ",
  "   #..GGGG....#     ",
  "   #..GGGG....#     ",
  "   #..........#     ",
  "   #..........#     ",
  "   #..SS......#     ",
  "   #..........#     ",
  "   #..........#     ",
  "   ############     ",
  "                    ",
];

// Room labels: R=classroom, K=kitchen/cafeteria, C=classroom, H=infirmary,
// A=classroom, E=staff room, L=home-ec/library storeroom, G=garden planters (roof)
export const ROOM_NAMES = {
  R: "教室",
  K: "給食室",
  C: "教室",
  H: "保健室",
  A: "教室",
  E: "職員室",
  L: "資料室",
  G: "屋上菜園",
};

// Storage bins ('S' tiles) are assigned a resource category round-robin per floor.
export const BIN_CATEGORIES = ["food", "medicine", "tool", "material"];

// Shore tiles: void cells directly outside the floor-1 perimeter where supplies
// drift in. Resources spawn here and students must walk to the adjacent floor
// tile to reach in and grab them.
export const SHORE_CELLS = [
  { x: 2, y: 5 }, { x: 2, y: 6 }, { x: 2, y: 7 }, { x: 2, y: 8 },
  { x: 17, y: 5 }, { x: 17, y: 6 }, { x: 17, y: 7 }, { x: 17, y: 8 },
  { x: 8, y: 1 }, { x: 9, y: 1 }, { x: 10, y: 1 }, { x: 11, y: 1 },
];

export const FLOORS = {
  1: FLOOR_1,
  2: FLOOR_2,
  3: FLOOR_3,
  roof: ROOF,
};

export function tileAt(floorKey, x, y) {
  const rows = FLOORS[floorKey];
  if (!rows || y < 0 || y >= rows.length) return " ";
  const row = rows[y];
  if (x < 0 || x >= row.length) return " ";
  return row[x];
}

export function isFloorWalkable(floorKey, x, y) {
  const ch = tileAt(floorKey, x, y);
  return ch !== " " && ch !== "#";
}

export const FLOOR_ORDER = ["1", "2", "3", "roof"];
