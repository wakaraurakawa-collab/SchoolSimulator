import {
  TILE, GRID_W, CANVAS_W, CANVAS_H, BX0, BX1, ROOM_W,
  FLOOR_BOTTOM_Y, FLOOR_H, WATER_Y, ROOMS, DECK, STAIRS,
  PIER_L, PIER_R, BEDS, INFIRMARY_BEDS, BINS, PLOT_XS,
  tileCX, walkY,
} from "../mapData.js";
import { RES } from "../resource.js";
import { World } from "../world.js";
import { Student } from "../student.js";

const NAMES = ["ミナ", "ユウ", "カイ", "レン", "アオイ", "ソラ", "ハル", "ツキ", "リン", "ナギ", "モモ", "ケイ"];

const ROOM_COLORS = {
  hall: 0x2b303b, dining: 0x3f3529, kitchen: 0x39332b, storage: 0x2e3436,
  infirmary: 0x3a3142, bedroom: 0x2c3446, study: 0x303a4e, library: 0x363023,
  hq: 0x34323e, music: 0x2f2d3a, workshop: 0x333930, art: 0x372f3b, shed: 0x2f2d26,
};

export default class MainScene extends Phaser.Scene {
  constructor() {
    super("main");
  }

  create() {
    this.world = new World(this);
    this._drawStatic();

    const names = Phaser.Utils.Array.Shuffle([...NAMES]).slice(0, 10);
    this.students = names.map((n, i) => new Student(this, this.world, n, i));
    this.world.students = this.students;

    this._createDynamic();
  }

  update(time, deltaMs) {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const t = time / 1000;
    this.world.update(dt);
    for (const s of this.students) s.update(dt);
    this._updateDynamic(t, dt);
  }

  // Crates of drifted supplies sitting on the piers.
  addCrate(type, x) {
    const def = RES[type];
    const rect = this.add.rectangle(0, 0, 13, 11, def.color).setStrokeStyle(1, 0x10131a);
    const txt = this.add.text(0, 0, def.label, { fontSize: "8px", color: "#10131a", fontFamily: "sans-serif" }).setOrigin(0.5);
    return this.add.container(tileCX(x), walkY(0) + 4, [rect, txt]).setDepth(8);
  }

  // ---- static scenery -------------------------------------------------------

  _drawStatic() {
    const W = CANVAS_W;
    // sky
    this.add.rectangle(W / 2, WATER_Y / 2, W, WATER_Y, 0x1c2333);
    // submerged foundation, then translucent water over it
    this.add.rectangle((BX0 + (BX1 - BX0) / 2) * TILE, 396, (BX1 - BX0) * TILE, 32, 0x1a1d24);
    this.add.rectangle(W / 2, (WATER_Y + CANVAS_H) / 2, W, CANVAS_H - WATER_Y, 0x16344f, 0.88);
    this.add.rectangle(W / 2, WATER_Y, W, 2, 0x9fd0e8, 0.3);

    this._drawPier(PIER_L);
    this._drawPier(PIER_R);

    for (const room of ROOMS) this._drawRoom(room);

    // deck slab (rooftop floor) and roofline over the two roof boxes
    this.add.rectangle(((BX0 + BX1) / 2) * TILE, 147, (BX1 - BX0) * TILE, 6, 0x474d5c);
    this.add.rectangle((BX0 + ROOM_W) * TILE, 62, ROOM_W * 2 * TILE, 6, 0x474d5c);

    for (const s of STAIRS) this._drawLadder(s);

    // rooftop planters
    for (const x of PLOT_XS) {
      this.add.rectangle(tileCX(x), 139, 42, 10, 0x5b4630).setStrokeStyle(1, 0x2f2318);
      this.add.rectangle(tileCX(x), 137, 36, 4, 0x2e2318);
    }

    // storage bins
    for (const [key, bin] of Object.entries(BINS)) {
      this.add.rectangle(tileCX(bin.x), 375, 15, 15, RES[key].color, 0.92).setStrokeStyle(1, 0x10131a);
      this.add.text(tileCX(bin.x), 375, RES[key].label, { fontSize: "8px", color: "#10131a", fontFamily: "sans-serif" }).setOrigin(0.5);
    }

    // beds
    for (const b of [...BEDS, ...INFIRMARY_BEDS]) {
      const y = FLOOR_BOTTOM_Y[b.f] - 6;
      this.add.rectangle(tileCX(b.x), y, 26, 8, 0xb9c6d6).setStrokeStyle(1, 0x39404d);
      this.add.rectangle(tileCX(b.x) - 9, y - 1, 6, 5, 0xf2f5f8);
    }
  }

  _drawPier(pier) {
    const x0 = pier.from * TILE;
    const x1 = (pier.to + 1) * TILE;
    const cx = (x0 + x1) / 2;
    this.add.rectangle(cx, 386, x1 - x0, 6, 0x6a4a2f).setStrokeStyle(1, 0x3a2818);
    for (let px = x0 + 10; px < x1; px += 32) {
      this.add.rectangle(px, 400, 4, 26, 0x54381f);
    }
  }

  _drawRoom(room) {
    const x = room.x0 * TILE;
    const w = (room.x1 - room.x0) * TILE;
    const bot = FLOOR_BOTTOM_Y[room.f];
    const top = bot - FLOOR_H;
    this.add.rectangle(x + w / 2, top + FLOOR_H / 2, w, FLOOR_H, ROOM_COLORS[room.type] ?? 0x2e3440)
      .setStrokeStyle(1, 0x141821);
    this.add.text(x + 4, top + 5, room.name, { fontSize: "9px", color: "#8d97a8", fontFamily: "sans-serif" });
    this._furnish(room, x + w / 2, top, bot);
  }

  _furnish(room, cx, top, bot) {
    switch (room.type) {
      case "dining":
        for (const ox of [-32, 0, 32]) this.add.rectangle(cx + ox, bot - 12, 24, 5, 0x7a5a3a);
        break;
      case "kitchen":
        this.add.rectangle(cx, bot - 10, 42, 9, 0x6d7076);
        this.add.circle(cx - 10, bot - 17, 4, 0x3d4046);
        break;
      case "infirmary":
        this.add.rectangle(cx - 44, top + 14, 12, 12, 0xf2f5f8);
        this.add.rectangle(cx - 44, top + 14, 8, 3, 0xc94f4f);
        this.add.rectangle(cx - 44, top + 14, 3, 8, 0xc94f4f);
        break;
      case "study":
        for (const ox of [-26, -4, 18]) this.add.rectangle(cx + ox, bot - 10, 16, 4, 0x8a6a45);
        break;
      case "library": {
        const sx = cx - 30;
        this.add.rectangle(sx, bot - 24, 30, 36, 0x5a4632);
        for (const oy of [-34, -22, -12]) this.add.rectangle(sx, bot + oy, 26, 2, 0x3a2c1e);
        break;
      }
      case "hq":
        this.add.rectangle(cx + 8, bot - 11, 24, 5, 0x6a5138);
        this.add.rectangle(cx + 4, bot - 15, 7, 4, 0xe8e8ec);
        break;
      case "music":
        this.add.rectangle(cx + 12, bot - 13, 28, 16, 0x1d1d22);
        this.add.rectangle(cx + 12, bot - 7, 28, 4, 0xe8e8ec);
        break;
      case "workshop":
        this.add.rectangle(cx - 4, bot - 10, 32, 6, 0x6a5138);
        this.add.rectangle(cx + 22, bot - 8, 10, 7, 0xb03a3a);
        break;
      case "art":
        this.add.rectangle(cx - 8, bot - 26, 12, 15, 0xf0ead8);
        this.add.rectangle(cx - 12, bot - 10, 3, 18, 0x6a5138);
        this.add.rectangle(cx - 4, bot - 10, 3, 18, 0x6a5138);
        break;
      case "shed":
        this.add.rectangle(cx - 8, bot - 8, 13, 11, 0x6a4a2f);
        this.add.rectangle(cx + 7, bot - 8, 13, 11, 0x6a4a2f);
        this.add.rectangle(cx - 1, bot - 18, 13, 10, 0x7a5a3a);
        break;
      case "hall":
        if (room.f === 0) {
          this.add.rectangle(cx + 18, bot - 17, 36, 30, 0x4a4f58);
          for (const ox of [8, 18, 28]) this.add.rectangle(cx + ox, bot - 17, 1, 28, 0x33383f);
        }
        break;
    }
  }

  _drawLadder(s) {
    const cx = tileCX(s.x);
    const yBot = FLOOR_BOTTOM_Y[s.minF] - 2;
    const yTop = FLOOR_BOTTOM_Y[s.maxF] - 58;
    const h = yBot - yTop;
    for (const ox of [-4, 4]) {
      this.add.rectangle(cx + ox, (yTop + yBot) / 2, 2, h, 0x7d838f, 0.85);
    }
    for (let y = yTop + 4; y < yBot; y += 8) {
      this.add.rectangle(cx, y, 8, 1.5, 0x7d838f, 0.85);
    }
  }

  // ---- dynamic objects --------------------------------------------------------

  _createDynamic() {
    // trading boat
    const hull = this.add.rectangle(0, 0, 54, 12, 0x5d4530).setStrokeStyle(1, 0x2f2318);
    const cabin = this.add.rectangle(-12, -10, 18, 9, 0x7a5a3a);
    const mast = this.add.rectangle(10, -19, 2, 26, 0x3f3428);
    const sail = this.add.triangle(18, -18, 0, 0, 0, 18, 15, 9, 0xe8e2d0);
    const flag = this.add.rectangle(10, -34, 8, 5, 0xc94f4f);
    this.boatView = this.add.container(-80, 391, [hull, cabin, mast, sail, flag])
      .setDepth(3).setVisible(false);

    // garden plot views
    this.plotViews = PLOT_XS.map((x) => {
      const cx = tileCX(x);
      return {
        cx,
        plant: this.add.ellipse(cx, 132, 6, 6, 0x55a555).setDepth(6).setVisible(false),
        fruits: [[-5, -2], [4, -4], [0, 2]].map(([ox, oy]) =>
          this.add.circle(cx + ox, 128 + oy, 2, 0xd9534f).setDepth(7).setVisible(false)),
        drop: this.add.text(cx + 15, 120, "💧", { fontSize: "9px" }).setOrigin(0.5).setDepth(20).setVisible(false),
      };
    });

    // rain + night tint
    this.rain = Array.from({ length: 50 }, () =>
      this.add.rectangle(Math.random() * CANVAS_W, Math.random() * CANVAS_H, 1.5, 9, 0x9fc0e8, 0.5)
        .setDepth(55).setVisible(false));
    this.nightOv = this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, 0x0a1030)
      .setAlpha(0).setDepth(60);

    // water sparkle
    this.waves = Array.from({ length: 6 }, (_, i) =>
      this.add.rectangle((i * 149) % CANVAS_W, WATER_Y + 3 + (i % 3) * 9, 26, 2, 0x6fa8cc, 0.3).setDepth(2));

    // HUD + event log
    this.hud = this.add.text(8, 6, "", {
      fontSize: "13px", color: "#e8edf5", fontFamily: "sans-serif",
      backgroundColor: "rgba(10,14,22,0.55)", padding: { x: 6, y: 3 },
    }).setDepth(100);
    this.logTexts = Array.from({ length: 7 }, (_, i) =>
      this.add.text(CANVAS_W - 8, 6 + i * 14, "", {
        fontSize: "11px", color: "#cdd6e4", fontFamily: "sans-serif",
      }).setOrigin(1, 0).setDepth(100));
  }

  _updateDynamic(t, dt) {
    const w = this.world;

    // boat
    const b = w.boat;
    this.boatView.setVisible(b.phase !== "none");
    this.boatView.x = b.x;
    this.boatView.y = 391 + Math.sin(t * 1.6) * 1.5;

    // garden
    for (let i = 0; i < w.plots.length; i++) {
      const p = w.plots[i];
      const v = this.plotViews[i];
      if (p.dirty) {
        p.dirty = false;
        const size = [0, 5, 11, 16][p.stage];
        v.plant.setVisible(p.stage > 0);
        v.plant.setSize(size, size);
        v.plant.setPosition(v.cx, 135 - size / 2);
        v.fruits.forEach((f) => f.setVisible(p.stage === 3));
      }
      v.drop.setVisible(!p.watered && (p.stage === 1 || p.stage === 2));
    }

    // leak drips wobble
    for (const leak of w.leaks) {
      leak.txt.y = leak.baseY + ((t * 14 + leak.x * 5) % 8);
    }

    // weather + night
    const targets = { day: 0, evening: 0.16, night: 0.42 };
    const target = targets[w.phase] + (w.storm.active ? 0.18 : 0);
    this.nightOv.alpha += (target - this.nightOv.alpha) * Math.min(1, dt * 2);

    for (const r of this.rain) {
      r.setVisible(w.storm.active);
      if (w.storm.active) {
        r.y += 270 * dt;
        r.x -= 40 * dt;
        if (r.y > CANVAS_H) {
          r.y = -10;
          r.x = Math.random() * (CANVAS_W + 60);
        }
      }
    }

    for (const wave of this.waves) {
      wave.x = (wave.x + 12 * dt) % CANVAS_W;
    }

    // HUD
    const icons = { day: "☀️", evening: "🌇", night: "🌙" };
    const icon = w.storm.active ? "⛈" : icons[w.phase];
    const sleeping = this.students.filter((s) => s.state === "sleep" || s.state === "bedrest").length;
    const sickCount = this.students.filter((s) => s.sick).length;
    this.hud.setText(
      `Day ${w.clock.day} ${icon}  🍙${w.stocks.food} 💊${w.stocks.medicine} 🪵${w.stocks.material} 🔧${w.stocks.tool}  😴${sleeping} 🤒${sickCount}`);

    for (let i = 0; i < this.logTexts.length; i++) {
      const line = w.logs[i] ?? "";
      this.logTexts[i].setText(line);
      this.logTexts[i].setAlpha(0.5 + 0.5 * ((i + 1) / Math.max(1, w.logs.length)));
    }
  }
}
