import { TILE_SIZE, FLOORS, BIN_CATEGORIES, SHORE_CELLS } from "./mapData.js";
import { spawnResource } from "./resource.js";

// Manages resources and storage bins for a single floor (floor "1", where the
// shoreline and storage room live in this MVP).
export class World {
  constructor(scene, floorKey) {
    this.scene = scene;
    this.floorKey = floorKey;
    this.resources = [];
    this.bins = this._collectBinTiles();
    this.binStock = new Map(); // key `${x},${y}` -> { category, count }
    this.bins.forEach((b, i) => {
      const category = BIN_CATEGORIES[i % BIN_CATEGORIES.length];
      this.binStock.set(`${b.x},${b.y}`, { category, count: 0 });
      b.category = category;
    });
    this.sortedTotal = 0;
  }

  _collectBinTiles() {
    const rows = FLOORS[this.floorKey];
    const bins = [];
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === "S") bins.push({ x, y });
      }
    });
    return bins;
  }

  spawnFromShore() {
    const cell = SHORE_CELLS[Math.floor(Math.random() * SHORE_CELLS.length)];
    // resources render at the shore cell itself; pickup happens from an
    // adjacent walkable tile via targetTile.
    const target = this._adjacentWalkable(cell);
    if (!target) return null;
    const px = cell.x * TILE_SIZE + TILE_SIZE / 2;
    const py = cell.y * TILE_SIZE + TILE_SIZE / 2;
    const res = spawnResource(this.scene, px, py);
    res.sprite.setPosition(px, py);
    res.x = target.x;
    res.y = target.y;
    res.picked = false;
    this.resources.push(res);
    return res;
  }

  _adjacentWalkable(cell) {
    const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    for (const { dx, dy } of dirs) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      const rows = FLOORS[this.floorKey];
      const row = rows[ny];
      if (row && row[nx] && row[nx] !== " " && row[nx] !== "#") {
        return { x: nx, y: ny };
      }
    }
    return null;
  }

  hasFood() {
    for (const stock of this.binStock.values()) {
      if (stock.category === "food" && stock.count > 0) return true;
    }
    return false;
  }

  nearestBinWithFood(x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const b of this.bins) {
      const stock = this.binStock.get(`${b.x},${b.y}`);
      if (stock.category !== "food" || stock.count <= 0) continue;
      const d = Math.abs(b.x - x) + Math.abs(b.y - y);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
  }

  nearestBinForType(type, x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const b of this.bins) {
      if (b.category !== type) continue;
      const d = Math.abs(b.x - x) + Math.abs(b.y - y);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
  }

  claimNearestResource(student) {
    let best = null;
    let bestDist = Infinity;
    for (const r of this.resources) {
      if (r.claimedBy || r.picked) continue;
      const d = Math.abs(r.x - student.tileX) + Math.abs(r.y - student.tileY);
      if (d < bestDist) { bestDist = d; best = r; }
    }
    if (best) best.claimedBy = student.id;
    return best;
  }

  releaseResource(resource) {
    resource.claimedBy = null;
  }

  depositResource(resource) {
    const idx = this.resources.indexOf(resource);
    if (idx >= 0) this.resources.splice(idx, 1);
    resource.sprite.destroy();
    const bin = this.bins.find((b) => b.category === resource.type);
    if (bin) {
      const stock = this.binStock.get(`${bin.x},${bin.y}`);
      stock.count += 1;
    }
    this.sortedTotal += 1;
  }

  consumeFood(bin) {
    const stock = this.binStock.get(`${bin.x},${bin.y}`);
    if (stock && stock.count > 0) {
      stock.count -= 1;
      return true;
    }
    return false;
  }
}
