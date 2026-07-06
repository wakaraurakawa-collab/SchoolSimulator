import { TILE_SIZE } from "./mapData.js";
import { findPath } from "./pathfinding.js";
import { RESOURCE_TYPES } from "./resource.js";

const NAMES = ["ミナ", "ユウ", "カイ", "レン", "アオイ", "ソラ", "ハル", "ツキ"];
const SPEED = 55; // px/sec

let nextId = 1;

export const STATE = {
  WANDER: "wander",
  GOTO_RESOURCE: "goto_resource",
  CARRY: "carry",
  GOTO_BIN: "goto_bin",
  REST: "rest",
  EAT: "eat",
};

export class Student {
  constructor(scene, floorKey, tileX, tileY) {
    this.id = nextId++;
    this.name = NAMES[Math.floor(Math.random() * NAMES.length)] + this.id;
    this.scene = scene;
    this.floorKey = floorKey;
    this.tileX = tileX;
    this.tileY = tileY;
    this.state = STATE.WANDER;
    this.path = [];
    this.carrying = null;
    this.hunger = 30 + Math.random() * 20; // 0 = starving, 100 = full
    this.energy = 60 + Math.random() * 30;
    this.wanderCooldown = 0;
    this.color = Phaser.Display.Color.RandomRGB(120, 220).color;

    const px = tileX * TILE_SIZE + TILE_SIZE / 2;
    const py = tileY * TILE_SIZE + TILE_SIZE / 2;
    this.px = px;
    this.py = py;
    this.body = scene.add.circle(px, py, 7, this.color).setStrokeStyle(1, 0x000000);
    this.head = scene.add.circle(px, py - 5, 3, 0xffe0c0);
    this.label = scene.add.text(px, py - 18, this.name, {
      fontSize: "9px", color: "#ffffff",
    }).setOrigin(0.5);
    this.carryIcon = scene.add.text(px, py - 12, "", { fontSize: "10px" }).setOrigin(0.5);
  }

  get container() {
    return [this.body, this.head, this.label, this.carryIcon];
  }

  setVisible(v) {
    for (const g of this.container) g.setVisible(v);
  }

  worldPos() {
    return { x: this.px, y: this.py };
  }

  update(dt, world) {
    this.hunger = Math.max(0, this.hunger - dt * 0.6);
    this.energy = Math.max(0, this.energy - dt * 0.4);

    this._advanceAlongPath(dt);

    if (this.path.length > 0) return; // still moving, decide next only when idle at a tile

    switch (this.state) {
      case STATE.WANDER:
        this._decideNextAction(world);
        break;
      case STATE.GOTO_RESOURCE:
        this._tryPickup(world);
        break;
      case STATE.CARRY:
        this._headToBin(world);
        break;
      case STATE.GOTO_BIN:
        this._tryDeposit(world);
        break;
      case STATE.EAT:
        this._tryEat(world);
        break;
      case STATE.REST:
        this._rest(dt);
        break;
    }
  }

  _advanceAlongPath(dt) {
    if (this.path.length === 0) return;
    const target = this.path[0];
    const pos = this.worldPos();
    const tx = target.x * TILE_SIZE + TILE_SIZE / 2;
    const ty = target.y * TILE_SIZE + TILE_SIZE / 2;
    const dx = tx - pos.x;
    const dy = ty - pos.y;
    const dist = Math.hypot(dx, dy);
    const step = SPEED * dt;
    if (dist <= step) {
      this.tileX = target.x;
      this.tileY = target.y;
      this.path.shift();
      this._setWorldPos(tx, ty);
    } else {
      const nx = pos.x + (dx / dist) * step;
      const ny = pos.y + (dy / dist) * step;
      this._setWorldPos(nx, ny);
    }
  }

  _setWorldPos(x, y) {
    this.px = x;
    this.py = y;
    this.body.setPosition(x, y);
    this.head.setPosition(x, y - 5);
    this.label.setPosition(x, y - 18);
    this.carryIcon.setPosition(x, y - 12);
  }

  _decideNextAction(world) {
    if (this.energy < 20) {
      this.state = STATE.REST;
      return;
    }
    if (this.hunger < 25 && world.hasFood()) {
      const bin = world.nearestBinWithFood(this.tileX, this.tileY);
      if (bin) {
        const path = findPath(this.floorKey, { x: this.tileX, y: this.tileY }, bin);
        if (path) {
          this.path = path;
          this.state = STATE.EAT;
          this.targetBin = bin;
          return;
        }
      }
    }
    const resource = world.claimNearestResource(this);
    if (resource) {
      const path = findPath(this.floorKey, { x: this.tileX, y: this.tileY }, resource);
      if (path) {
        this.path = path;
        this.state = STATE.GOTO_RESOURCE;
        this.targetResource = resource;
        return;
      }
      world.releaseResource(resource);
    }
    this._wanderRandom(world);
  }

  _wanderRandom(world) {
    const tx = this.tileX + Math.floor(Math.random() * 5) - 2;
    const ty = this.tileY + Math.floor(Math.random() * 5) - 2;
    const path = findPath(this.floorKey, { x: this.tileX, y: this.tileY }, { x: tx, y: ty });
    if (path) this.path = path;
  }

  _tryPickup(world) {
    const r = this.targetResource;
    if (!r || r.picked) {
      this.state = STATE.WANDER;
      return;
    }
    this.carrying = r;
    r.picked = true;
    r.sprite.setVisible(false);
    this.carryIcon.setText(RESOURCE_TYPES[r.type].label);
    this.state = STATE.CARRY;
  }

  _headToBin(world) {
    const bin = world.nearestBinForType(this.carrying.type, this.tileX, this.tileY);
    if (!bin) {
      this.state = STATE.WANDER;
      return;
    }
    const path = findPath(this.floorKey, { x: this.tileX, y: this.tileY }, bin);
    if (path) {
      this.path = path;
      this.targetBin = bin;
      this.state = STATE.GOTO_BIN;
    } else {
      this.state = STATE.WANDER;
    }
  }

  _tryDeposit(world) {
    world.depositResource(this.carrying);
    this.carrying = null;
    this.carryIcon.setText("");
    this.state = STATE.WANDER;
  }

  _tryEat(world) {
    if (world.consumeFood(this.targetBin)) {
      this.hunger = Math.min(100, this.hunger + 50);
    }
    this.state = STATE.WANDER;
  }

  _rest(dt) {
    this.energy = Math.min(100, this.energy + dt * 8);
    if (this.energy >= 90) this.state = STATE.WANDER;
  }
}
