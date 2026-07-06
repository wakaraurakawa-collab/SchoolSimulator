import {
  BX0, BX1, GRID_W, BEDS, BINS, DINING, PLAY_SPOTS, STUDY_SPOTS, TRADE_X,
  tileCX, walkY,
} from "./mapData.js";
import { findPath } from "./pathfinding.js";
import { RES } from "./resource.js";

const BASE_SPEED = 55; // px/sec

export class Student {
  constructor(scene, world, name, idx) {
    this.scene = scene;
    this.world = world;
    this.name = name;
    this.bedIdx = idx;
    this.f = 0;
    this.x = Math.min(BX1 - 2, 10 + idx * 3);
    this.px = tileCX(this.x);
    this.py = walkY(this.f);

    this.hunger = 55 + Math.random() * 30; // 0 = starving
    this.energy = 65 + Math.random() * 30;
    this.fun = 40 + Math.random() * 40;
    this.stamina = 0.85 + Math.random() * 0.4; // energy decay multiplier
    this.nightOwl = Math.random() < 0.3;

    this.state = "idle";
    this.stateT = 0;
    this.path = [];
    this.afterWalk = null;
    this.workDone = null;
    this.task = null;
    this.carrying = null;
    this.fishSpot = null;
    this.catches = 0;
    this.sick = false;
    this.exhausted = false;
    this.nap = false;

    const color = Phaser.Display.Color.HSLToColor(Math.random(), 0.5, 0.62).color;
    this.body = scene.add.circle(this.px, this.py, 6, color).setStrokeStyle(1, 0x10131a).setDepth(10);
    this.head = scene.add.circle(this.px, this.py - 6, 3.5, 0xffe0c0).setDepth(10);
    this.label = scene.add.text(this.px, this.py - 16, name, {
      fontSize: "8px", color: "#c8d2e0", fontFamily: "sans-serif",
    }).setOrigin(0.5).setDepth(11);
    this.emoteTxt = scene.add.text(this.px, this.py - 27, "", { fontSize: "11px" })
      .setOrigin(0.5).setDepth(11);
  }

  setEmote(s) {
    this.emoteTxt.setText(s);
  }

  working() {
    return ["work", "walk", "fish"].includes(this.state) && (this.task || this.fishSpot);
  }

  interrupt() {
    if (this.fishSpot) {
      this.fishSpot.takenBy = null;
      this.fishSpot = null;
      this.catches = 0;
    }
    if (this.task) {
      this.world.releaseTask(this.task);
      this.task = null;
    }
    if (this.carrying) {
      // hand-wave: whatever they were hauling makes it to the stockpile
      this.world.stocks[this.carrying.type]++;
      this.carrying = null;
    }
    this.path = [];
    this.afterWalk = null;
    this.workDone = null;
    this.setEmote("");
    this.state = "idle";
  }

  update(dt) {
    const w = this.world;
    const resting = this.state === "sleep" || this.state === "bedrest";

    if (resting) {
      this.energy = Math.min(100, this.energy + dt * (this.state === "sleep" ? 3.5 : 2.2));
      this.hunger = Math.max(0, this.hunger - dt * 0.12);
    } else {
      const drain = 0.22 * this.stamina * (this.working() ? 1.7 : 1) * (this.sick ? 1.6 : 1);
      this.energy = Math.max(0, this.energy - dt * drain);
      this.hunger = Math.max(0, this.hunger - dt * 0.3);
    }
    if (this.state === "play") this.fun = Math.min(100, this.fun + dt * 4);
    else this.fun = Math.max(0, this.fun - dt * 0.35 * (this.state === "fish" ? 0.3 : 1));

    if (this.energy <= 2 && !this.exhausted && !resting) this._collapse();

    switch (this.state) {
      case "idle": this._decide(); break;
      case "walk": this._walk(dt); break;
      case "work":
        this.stateT -= dt;
        if (this.stateT <= 0) {
          const fn = this.workDone;
          this.workDone = null;
          fn();
        }
        break;
      case "eat":
        this.stateT -= dt;
        if (this.stateT <= 0) {
          if (w.stocks.food > 0) {
            w.stocks.food--;
            this.hunger = Math.min(100, this.hunger + 42);
          }
          this.setEmote("");
          this.state = "idle";
        }
        break;
      case "play":
      case "study":
        this.stateT -= dt;
        if (this.stateT <= 0) {
          this.setEmote("");
          this.state = "idle";
        }
        break;
      case "fish": this._fish(dt); break;
      case "sleep": {
        const wake = this.nap ? this.energy >= 60 : w.phase === "day" && this.energy >= 40;
        if (wake) {
          this.nap = false;
          this.setEmote("");
          this.state = "idle";
        }
        break;
      }
      case "collapsedLie":
        this.stateT -= dt;
        this.energy = Math.max(this.energy, 3);
        if (this.stateT <= 0) {
          this._goBed(w.takeInfBed(this) || BEDS[this.bedIdx], "bedrest");
        }
        break;
      case "bedrest":
        this.setEmote(this.sick ? "🤒" : "😪");
        if (!this.sick && this.energy >= 70) {
          this.exhausted = false;
          w.freeInfBed(this);
          w.log(`✨ ${this.name}は元気になった!`);
          this.setEmote("");
          this.state = "idle";
        }
        break;
    }
    this._sync();
  }

  // ---- decisions -----------------------------------------------------------

  _decide() {
    const w = this.world;
    const phase = w.phase;

    if (this.sick || this.exhausted) {
      return this._goBed(w.takeInfBed(this) || BEDS[this.bedIdx], "bedrest");
    }
    if (phase === "night") {
      if (this.nightOwl && w.clock.t < 122 && this.energy > 30 && Math.random() < 0.8) {
        w.log(`🌙 ${this.name}は夜ふかしして遊んでいる`, 0.15);
        return this._goPlay();
      }
      if (this.hunger < 35 && w.stocks.food > 0) return this._goEat();
      return this._goBed(BEDS[this.bedIdx], "sleep");
    }
    if (this.hunger <= 22 && w.stocks.food > 0) return this._goEat();
    if (this.energy <= 14) {
      this.nap = true;
      return this._goBed(BEDS[this.bedIdx], "sleep");
    }
    if (phase === "evening") {
      const urgent = w.claimTask(this, true);
      if (urgent) return this._startTask(urgent);
      if (this.hunger < 65 && w.stocks.food > 0) return this._goEat();
      return this._goPlay();
    }
    // day
    const task = w.claimTask(this);
    if (task) return this._startTask(task);
    if (this.fun <= 25) {
      w.log(`🎈 ${this.name}はこっそりサボって遊んでいる`, 0.2);
      return this._goPlay();
    }
    this._ambient();
  }

  _ambient() {
    const r = Math.random();
    if (r < 0.3 && this._goFish()) return;
    if (r < 0.55) return this._goStudy();
    if (r < 0.8) return this._goWander();
    this._goPlay();
  }

  // ---- movement --------------------------------------------------------------

  _goTo(f, x, after) {
    const path = findPath({ f: this.f, x: this.x }, { f, x });
    if (!path) {
      this.state = "idle";
      return false;
    }
    this.path = path;
    this.afterWalk = after || null;
    this.state = "walk";
    return true;
  }

  _walk(dt) {
    let budget = BASE_SPEED * this._speedMul() * dt;
    while (budget > 0 && this.path.length) {
      const n = this.path[0];
      const tx = tileCX(n.x);
      const ty = walkY(n.f);
      const dx = tx - this.px;
      const dy = ty - this.py;
      const d = Math.hypot(dx, dy);
      if (d <= budget) {
        this.px = tx;
        this.py = ty;
        this.f = n.f;
        this.x = n.x;
        this.path.shift();
        budget -= d;
      } else {
        this.px += (dx / d) * budget;
        this.py += (dy / d) * budget;
        budget = 0;
      }
    }
    if (!this.path.length) {
      const cb = this.afterWalk;
      this.afterWalk = null;
      this.state = "idle";
      if (cb) cb();
    }
  }

  _speedMul() {
    return (this.sick ? 0.5 : 1) * (this.exhausted ? 0.45 : 1) * (this.hunger <= 1 ? 0.6 : 1);
  }

  _sync() {
    this.body.setPosition(this.px, this.py);
    this.head.setPosition(this.px, this.py - 6);
    this.label.setPosition(this.px, this.py - 16);
    this.emoteTxt.setPosition(this.px, this.py - 27);
  }

  // ---- activities ------------------------------------------------------------

  _goEat() {
    const x = DINING.x0 + ((Math.random() * (DINING.x1 - DINING.x0 + 1)) | 0);
    this._goTo(0, x, () => {
      if (this.world.stocks.food <= 0) {
        this.setEmote("😢");
        this.state = "idle";
        return;
      }
      this.state = "eat";
      this.stateT = 4.5;
      this.setEmote("🍙");
    });
  }

  _goBed(bed, mode) {
    this._goTo(bed.f, bed.x, () => {
      this.state = mode;
      if (mode === "sleep") this.setEmote("💤");
    });
  }

  _goPlay() {
    const w = this.world;
    const spots = PLAY_SPOTS.filter((s) => !w.storm.active || s.f < 3);
    const s = spots[(Math.random() * spots.length) | 0];
    this._goTo(s.f, s.x + ((Math.random() * 3) | 0) - 1, () => {
      this.state = "play";
      this.stateT = 9 + Math.random() * 6;
      this.setEmote(s.emote);
    });
  }

  _goStudy() {
    const s = STUDY_SPOTS[(Math.random() * STUDY_SPOTS.length) | 0];
    this._goTo(s.f, s.x + ((Math.random() * 4) | 0) - 2, () => {
      this.state = "study";
      this.stateT = 10 + Math.random() * 8;
      this.setEmote("📖");
    });
  }

  _goWander() {
    const w = this.world;
    const f = [0, 0, 1, 2, 3][(Math.random() * 5) | 0];
    let x;
    if (f === 0 && !w.storm.active) x = (Math.random() * GRID_W) | 0;
    else x = BX0 + ((Math.random() * (BX1 - BX0)) | 0);
    this._goTo(f === 3 && w.storm.active ? 1 : f, x, null);
  }

  _goFish() {
    const w = this.world;
    if (w.storm.active || w.phase !== "day") return false;
    const spot = w.fishSpots.find((s) => !s.takenBy);
    if (!spot) return false;
    spot.takenBy = this;
    this.fishSpot = spot;
    this.catches = 0;
    const ok = this._goTo(0, spot.x, () => {
      this.state = "fish";
      this.stateT = 8 + Math.random() * 7;
      this.setEmote("🎣");
    });
    if (!ok) {
      spot.takenBy = null;
      this.fishSpot = null;
    }
    return ok;
  }

  _fish(dt) {
    const w = this.world;
    this.stateT -= dt;
    if (this.stateT <= 0) {
      w.stocks.food++;
      w.log(`🐟 ${this.name}が魚を釣りあげた!`, 0.3);
      this.fun = Math.min(100, this.fun + 6);
      this.catches++;
      this.stateT = 8 + Math.random() * 7;
    }
    const stop = w.phase !== "day" || w.storm.active ||
      this.hunger <= 22 || this.energy <= 14 || this.catches >= 3;
    if (stop) {
      if (this.fishSpot) {
        this.fishSpot.takenBy = null;
        this.fishSpot = null;
      }
      this.catches = 0;
      this.setEmote("");
      this.state = "idle";
    }
  }

  _collapse() {
    this.interrupt();
    this.exhausted = true;
    this.state = "collapsedLie";
    this.stateT = 5;
    this.setEmote("😵");
    this.world.log(`😵 ${this.name}は疲れ果てて倒れてしまった…`);
  }

  // ---- tasks --------------------------------------------------------------

  _work(sec, emote, done) {
    this.state = "work";
    this.stateT = sec;
    this.setEmote(emote);
    this.workDone = done;
  }

  _taskValid() {
    return this.task && !this.task.cancelled && this.world.tasks.includes(this.task);
  }

  _dropTask() {
    this.world.releaseTask(this.task);
    this.task = null;
    this.setEmote("");
    this.state = "idle";
  }

  _finishTask() {
    this.world.completeTask(this.task);
    this.task = null;
    this.setEmote("");
    this.state = "idle";
  }

  _startTask(t) {
    this.task = t;
    const w = this.world;
    switch (t.type) {
      case "haul":
        this._goTo(0, t.item.x, () => {
          if (!this._taskValid()) return this._dropTask();
          w.pickItem(t.item);
          this.carrying = { type: t.item.type };
          this.setEmote("📦");
          this._goTo(0, Math.round(BINS[t.item.type].x), () => {
            const type = this.carrying.type;
            w.stocks[type]++;
            this.carrying = null;
            w.log(`📦 ${this.name}が漂着物資を仕分けた (${RES[type].name}+1)`, 0.3);
            this._finishTask();
          });
        });
        break;

      case "repair":
        this._goTo(t.leak.f, t.leak.x, () => {
          if (!this._taskValid()) return this._dropTask();
          this._work(6, "🔧", () => {
            w.fixLeak(t.leak, this);
            this._finishTask();
          });
        });
        break;

      case "medicine":
        this._goTo(0, Math.round(BINS.medicine.x), () => {
          if (!this._taskValid()) return this._dropTask();
          t.pickedUp = true;
          this.setEmote("💊");
          const p = t.patient;
          this._goTo(p.f, p.x, () => {
            this._work(2, "💊", () => {
              if (this._taskValid()) {
                t.rec.treated = true;
                t.rec.treatT = t.rec.t;
                w.log(`💊 ${this.name}が${p.name}に薬を届けた`);
                this._finishTask();
              } else {
                this._dropTask();
              }
            });
          });
        });
        break;

      case "trade":
        this._goTo(0, TRADE_X, () => {
          if (!this._taskValid() || w.boat.phase !== "docked") return this._dropTask();
          this._work(4, "🤝", () => {
            if (w.boat.phase === "docked") w.doTrade();
            this._finishTask();
          });
        });
        break;

      case "plant":
      case "tend":
      case "harvest": {
        const p = t.plot;
        const cfg = { plant: [4, "🌱"], tend: [3, "💦"], harvest: [4, "🧺"] }[t.type];
        this._goTo(3, p.x, () => {
          if (!this._taskValid()) return this._dropTask();
          this._work(cfg[0], cfg[1], () => {
            if (t.type === "plant" && p.stage === 0) {
              p.stage = 1;
              p.watered = false;
              p.dirty = true;
              w.log(`🌱 ${this.name}が屋上菜園にタネをまいた`, 0.35);
            } else if (t.type === "tend") {
              p.watered = true;
              p.dirty = true;
            } else if (t.type === "harvest" && p.stage === 3) {
              p.stage = 0;
              p.t = 0;
              p.dirty = true;
              w.stocks.food += 3;
              w.log(`🍅 ${this.name}が野菜を収穫した!(食料+3)`);
            }
            this._finishTask();
          });
        });
        break;
      }
    }
  }
}
