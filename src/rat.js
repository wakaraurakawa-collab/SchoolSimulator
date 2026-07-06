import { TILE, tileCX, walkY } from "./mapData.js";

// Rats stick to the pantry stretch of 1F (dining/kitchen/storage) unless
// they're fleeing from a student who noticed them.
const PANTRY_X0 = 14;
const PANTRY_X1 = 38;

let nextId = 1;

export class Rat {
  constructor(scene, world) {
    this.id = nextId++;
    this.scene = scene;
    this.world = world;
    this.f = 0;
    this.px = tileCX(PANTRY_X0 + Math.random() * (PANTRY_X1 - PANTRY_X0));
    this.py = walkY(0);
    this.targetPx = this.px;
    this.pauseT = 1 + Math.random() * 3;
    this.huntedBy = null;

    const px = this.px, py = this.py;
    this.body = scene.add.ellipse(px, py, 11, 6, 0x6b5a4a).setStrokeStyle(1, 0x2a2018).setDepth(9);
    this.ear1 = scene.add.circle(px - 3, py - 3, 2, 0x6b5a4a).setDepth(9);
    this.ear2 = scene.add.circle(px + 2, py - 3, 2, 0x6b5a4a).setDepth(9);
    this.tail = scene.add.line(0, 0, px + 5, py, px + 12, py - 4, 0x6b5a4a).setLineWidth(1).setDepth(9);
    this.eye = scene.add.circle(px + 3, py - 1, 0.8, 0x140f0a).setDepth(9);
    this.emote = scene.add.text(px, py - 13, "", { fontSize: "9px" }).setOrigin(0.5).setDepth(11);
  }

  // tile-space x, so students/pathfinding-adjacent code can treat it like a student
  get x() { return this.px / TILE; }

  update(dt) {
    const w = this.world;
    if (this.huntedBy) {
      const away = this.px < this.huntedBy.px ? -1 : 1;
      this.targetPx = Phaser.Math.Clamp(this.px + away * 90, TILE * 7, TILE * 44);
      this.emote.setText("💢");
      this._moveToward(90, dt);
      this._sync();
      return;
    }
    this.emote.setText("");
    this.pauseT -= dt;
    if (this.pauseT <= 0) {
      if (Math.abs(this.px - this.targetPx) < 2) {
        if (Math.random() < 0.4 && w.stocks.food > 0 && !w.flood.active) {
          w.stocks.food = Math.max(0, w.stocks.food - 1);
          w.log("🐀 ネズミが食料をかじった…(食料-1)", 0.6);
        }
        this.targetPx = tileCX(PANTRY_X0 + Math.random() * (PANTRY_X1 - PANTRY_X0));
        this.pauseT = 4 + Math.random() * 5;
      } else {
        this.pauseT = 0.15;
      }
    }
    this._moveToward(24, dt);
    this._sync();
  }

  _moveToward(speed, dt) {
    const dx = this.targetPx - this.px;
    const step = speed * dt;
    if (Math.abs(dx) <= step) this.px = this.targetPx;
    else this.px += Math.sign(dx) * step;
  }

  _sync() {
    const px = this.px, py = this.py;
    this.body.setPosition(px, py);
    this.ear1.setPosition(px - 3, py - 3);
    this.ear2.setPosition(px + 2, py - 3);
    this.tail.setTo(px + 5, py, px + 12, py - 4);
    this.eye.setPosition(px + 3, py - 1);
    this.emote.setPosition(px, py - 13);
  }

  destroy() {
    this.body.destroy();
    this.ear1.destroy();
    this.ear2.destroy();
    this.tail.destroy();
    this.eye.destroy();
    this.emote.destroy();
  }
}
