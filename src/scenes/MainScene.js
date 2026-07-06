import { TILE_SIZE, FLOORS, ROOM_NAMES, FLOOR_ORDER } from "../mapData.js";
import { Student } from "../student.js";
import { World } from "../world.js";

const WALL_COLOR = 0x3a3f4b;
const FLOOR_COLOR = 0x21242c;
const DOOR_COLOR = 0x4a3f2a;
const STAIRS_COLOR = 0x6a5a3a;
const WATER_COLOR = 0x0d2740;
const ROOM_COLORS = {
  R: 0x2a3a4a, K: 0x4a3a2a, C: 0x2a3a4a, H: 0x3a2a3a,
  A: 0x2a3a4a, E: 0x2a2a3a, L: 0x2a3a3a, G: 0x1f3a2a,
};

export default class MainScene extends Phaser.Scene {
  constructor() {
    super("main");
  }

  create() {
    this.currentFloor = "1";
    this.floorLayers = {};
    this.students = [];

    FLOOR_ORDER.forEach((floorKey) => this._buildFloor(floorKey));

    this.world = new World(this, "1");

    for (let i = 0; i < 6; i++) {
      const s = new Student(this, "1", 9 + (i % 3), 6 + Math.floor(i / 3));
      this.students.push(s);
    }

    this.spawnTimer = 0;
    this._showFloor("1");

    this.hud = this.add.text(6, 6, "", { fontSize: "12px", color: "#ffffff", backgroundColor: "#00000080" })
      .setScrollFactor(0)
      .setDepth(100);

    this._buildFloorSwitcher();
  }

  _buildFloor(floorKey) {
    const rows = FLOORS[floorKey];
    const layer = this.add.container(0, 0);
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        let color = null;
        if (ch === " ") color = WATER_COLOR;
        else if (ch === "#") color = WALL_COLOR;
        else if (ch === ".") color = FLOOR_COLOR;
        else if (ch === "D") color = DOOR_COLOR;
        else if (ch === "S") color = STAIRS_COLOR;
        else if (ROOM_COLORS[ch] !== undefined) color = ROOM_COLORS[ch];
        if (color !== null) {
          const rect = this.add.rectangle(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE - 1, TILE_SIZE - 1, color);
          layer.add(rect);
        }
        if (ROOM_NAMES[ch] && x % 4 === 1) {
          const label = this.add.text(px, py, ROOM_NAMES[ch], { fontSize: "8px", color: "#888899" });
          layer.add(label);
        }
      }
    });
    this.floorLayers[floorKey] = layer;
  }

  _buildFloorSwitcher() {
    const labels = { 1: "1F", 2: "2F", 3: "3F", roof: "屋上" };
    let x = 640 - 140;
    FLOOR_ORDER.forEach((key) => {
      const btn = this.add.text(x, 6, labels[key], {
        fontSize: "14px", color: "#ffffff", backgroundColor: "#333344", padding: { x: 8, y: 4 },
      }).setScrollFactor(0).setDepth(100).setInteractive({ useHandCursor: true });
      btn.on("pointerdown", () => this._showFloor(key));
      x += 36;
    });
  }

  _showFloor(floorKey) {
    this.currentFloor = floorKey;
    FLOOR_ORDER.forEach((key) => {
      this.floorLayers[key].setVisible(key === floorKey);
    });
    this.students.forEach((s) => s.setVisible(s.floorKey === floorKey));
    this.world?.resources.forEach((r) => r.sprite.setVisible(floorKey === "1" && !r.picked));
  }

  update(time, delta) {
    const dt = delta / 1000;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const newest = this.world.spawnFromShore();
      if (newest) newest.sprite.setVisible(this.currentFloor === "1");
      this.spawnTimer = 4 + Math.random() * 4;
    }

    for (const s of this.students) {
      s.update(dt, this.world);
      if (s.floorKey === "1") {
        s.setVisible(this.currentFloor === "1");
      }
    }

    this._updateHud();
  }

  _updateHud() {
    const w = this.world;
    const foodCount = [...w.binStock.values()].filter((b) => b.category === "food").reduce((a, b) => a + b.count, 0);
    const lines = [
      `生徒: ${this.students.length}人  仕分け済み: ${w.sortedTotal}  漂着物資待ち: ${w.resources.length}`,
      `食料備蓄: ${foodCount}`,
    ];
    this.hud.setText(lines.join("\n"));
  }
}
