import {
  BX0, BX1, GRID_W, TILE, BEDS, BINS, DINING, PLAY_SPOTS, STUDY_SPOTS, TRADE_X,
  MAKESHIFT_SLEEP, tileCX, walkY,
} from "./mapData.js";
import { findPath } from "./pathfinding.js";
import { RES } from "./resource.js";

const BASE_SPEED = 55; // px/sec
const FAV_TASKS = ["haul", "tend", "harvest", "repair", "fish", "study"];
const FAV_LABELS = {
  haul: "物資運び", tend: "水やり", harvest: "収穫", repair: "修理", fish: "釣り", study: "勉強",
};
const clamp100 = (v) => Math.max(0, Math.min(100, v));

// Each topic is a function returning the "about ___" fragment of the opening
// line. Combined with the outcome pool below this gives a large spread of
// distinct conversations even though both lists stay short.
const CHAT_TOPICS = [
  (a, b, w) => `${RES[Object.keys(RES)[(Math.random() * 4) | 0]].name}が足りているかどうか`,
  (a, b, w) => `${w.season === "winter" ? "寒さ" : w.season === "summer" ? "暑さ" : "季節の変わり目"}のこと`,
  (a, b, w) => `${FAV_LABELS[a.favTask] ?? "日課"}のコツ`,
  (a, b, w) => `${b.name}の意外な一面`,
  (a, b, w) => "昨日見た夢の話",
  (a, b, w) => "行商船が次いつ来るか",
  (a, b, w) => "屋上菜園の野菜がうまく育つか",
  (a, b, w) => `${["音楽", "絵", "本", "ゲーム", "料理"][(Math.random() * 5) | 0]}の好み`,
  (a, b, w) => "もし学校の外に出られたら何をしたいか",
  (a, b, w) => `${w.weather === "rain" ? "雨" : w.weather === "cloudy" ? "曇り空" : "天気"}のこと`,
  (a, b, w) => "隠していたお菓子の話",
  (a, b, w) => "誰が一番早起きか",
  (a, b, w) => "ネズミ対策",
  (a, b, w) => "寝室の布団が足りているか",
  (a, b, w) => "昔の失敗談",
  (a, b, w) => `${FAV_LABELS[b.favTask] ?? "日課"}を手伝ってほしいという相談`,
];

// Each outcome pairs a result line with the stat effect it applies to both
// participants once the conversation wraps up.
const CHAT_OUTCOMES = [
  {
    text: (a, b) => `盛り上がって${a.name}も${b.name}も元気になった`,
    effect: (a, b) => { a.fun = clamp100(a.fun + 15); b.fun = clamp100(b.fun + 15); },
  },
  {
    text: (a, b) => `${a.name}の冗談に${b.name}が大笑いした`,
    effect: (a, b) => { a.fun = clamp100(a.fun + 8); b.fun = clamp100(b.fun + 16); },
  },
  {
    text: (a, b) => "微妙にかみ合わず、ちょっと気まずい空気になった",
    effect: (a, b) => { a.fun = clamp100(a.fun - 4); b.fun = clamp100(b.fun - 4); },
  },
  {
    text: (a, b) => `${b.name}が${a.name}の相談に乗ってくれた`,
    effect: (a, b) => { a.fun = clamp100(a.fun + 6); a.sleepDebt = Math.max(0, a.sleepDebt - 6); },
  },
  {
    text: () => "怖い話になって二人とも鳥肌が立った",
    effect: (a, b) => { a.fun = clamp100(a.fun + 3); b.fun = clamp100(b.fun + 3); },
  },
  {
    text: (a, b) => `${a.name}と${b.name}は意気投合し、これからも仲良くしようと約束した`,
    effect: (a, b) => { a.fun = clamp100(a.fun + 12); b.fun = clamp100(b.fun + 12); },
  },
  {
    text: () => "特に盛り上がらず、なんとなく自然解散した",
    effect: (a, b) => { a.fun = clamp100(a.fun + 1); b.fun = clamp100(b.fun + 1); },
  },
  {
    text: (a, b) => `${b.name}が${a.name}を励まし、少し元気が出た`,
    effect: (a, b) => { a.energy = clamp100(a.energy + 8); b.fun = clamp100(b.fun + 4); },
  },
  {
    text: (a, b) => `途中で口論になったが、すぐ${Math.random() < 0.5 ? a.name : b.name}が折れて仲直りした`,
    effect: (a, b) => { a.fun = clamp100(a.fun - 2); b.fun = clamp100(b.fun - 2); },
  },
  {
    text: () => "昔の失敗談で二人とも大盛り上がりした",
    effect: (a, b) => { a.fun = clamp100(a.fun + 10); b.fun = clamp100(b.fun + 10); },
  },
];

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
    this.pace = 0.9 + Math.random() * 0.25;   // personal walking speed
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
    this.poorSleep = false;
    this.sleepDebt = 0; // 0-100, builds up from makeshift sleep spots

    this.favTask = FAV_TASKS[(Math.random() * FAV_TASKS.length) | 0];
    this.favSpotIdx = (Math.random() * PLAY_SPOTS.length) | 0;
    this.chatCooldown = Math.random() * 20;
    this.chatSession = null;
    this.huntTarget = null;
    this.huntT = 0;

    const color = Phaser.Display.Color.HSLToColor(Math.random(), 0.5, 0.62).color;
    this.body = scene.add.circle(this.px, this.py, 6, color).setStrokeStyle(1, 0x10131a).setDepth(10);
    this.head = scene.add.circle(this.px, this.py - 6, 3.5, 0xffe0c0).setDepth(10);
    this.label = scene.add.text(this.px, this.py - 16, name, {
      fontSize: "8px", color: "#c8d2e0", fontFamily: "sans-serif",
    }).setOrigin(0.5).setDepth(11);
    this.emoteTxt = scene.add.text(this.px, this.py - 27, "", { fontSize: "11px" })
      .setOrigin(0.5).setDepth(11);
    this.faceTxt = scene.add.text(this.px + 8, this.py - 6, "🙂", { fontSize: "9px" })
      .setOrigin(0.5).setDepth(12);
  }

  setEmote(s) {
    this.emoteTxt.setText(s);
  }

  // A small mood face shown continuously on the student's head (separate
  // from the transient task/activity emote bubble above them).
  _moodFace() {
    if (this.sick) return "🤒";
    if (this.exhausted) return "😵";
    if (this.state === "chat") return "😄";
    if (this.state === "eat") return "😋";
    if (this.hunger <= 15) return "😖";
    if (this.energy <= 15) return "🥱";
    if (this.sleepDebt >= 60) return "😪";
    if (this.hunger <= 35) return "😟";
    if (this.fun <= 15) return "😞";
    if (this.fun >= 75 && this.energy >= 55) return "😊";
    if (this.fun >= 45 && this.hunger >= 45) return "🙂";
    return "😐";
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
    this.chatSession = null;
    if (this.huntTarget) {
      this.huntTarget.huntedBy = null;
      this.huntTarget = null;
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
    this.chatCooldown = Math.max(0, this.chatCooldown - dt);

    if (resting) {
      const regen = this.state === "sleep" ? (this.poorSleep ? 1.8 : 3.5) : 2.2;
      this.energy = Math.min(100, this.energy + dt * regen);
      this.hunger = Math.max(0, this.hunger - dt * (w.heat.active ? 0.22 : 0.12));
    } else {
      const heatMul = w.heat.active ? 1.5 : 1;
      const debtMul = 1 + Math.min(1, this.sleepDebt / 100) * 0.5;
      const drain = 0.22 * this.stamina * (this.working() ? 1.7 : 1) * (this.sick ? 1.6 : 1) * heatMul * debtMul;
      this.energy = Math.max(0, this.energy - dt * drain);
      this.hunger = Math.max(0, this.hunger - dt * 0.3 * (w.heat.active ? 1.4 : 1));
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
      case "chat":
        this.stateT -= dt;
        if (this.stateT <= 0) this._resolveChat();
        break;
      case "fish": this._fish(dt); break;
      case "hunt": this._hunt(dt); break;
      case "sleep": {
        const wake = this.nap ? this.energy >= 60 : w.phase === "day" && this.energy >= 40;
        if (wake) {
          this.nap = false;
          this.sleepDebt = this.poorSleep
            ? Math.min(100, this.sleepDebt + 18)
            : Math.max(0, this.sleepDebt - 25);
          this.poorSleep = false;
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
    this.faceTxt.setText(this._moodFace());
    this._sync();
  }

  // ---- decisions -----------------------------------------------------------

  _decide() {
    const w = this.world;
    const phase = w.phase;

    if (this.sick || this.exhausted) {
      return this._goBed(w.takeInfBed(this) || BEDS[this.bedIdx], "bedrest");
    }
    if (w.isFloorFlooded(this.f)) return this._evacuate();

    // The dining hall is on 1F - no meals while it's underwater.
    const canEat = w.stocks.food > 0 && !w.isFloorFlooded(0);

    if (phase !== "night" && this._tryHuntRat()) return;
    if (phase !== "night" && this._tryChat()) return;
    if (phase === "night") {
      if (this.nightOwl && w.clock.t < 122 && this.energy > 30 && Math.random() < 0.8) {
        w.log(`🌙 ${this.name}は夜ふかしして遊んでいる`, 0.15);
        return this._goPlay();
      }
      if (this.hunger < 35 && canEat) return this._goEat();
      return this._goBed(BEDS[this.bedIdx], "sleep");
    }
    if (this.hunger <= 22 && canEat) return this._goEat();
    if (this.energy <= 14) {
      this.nap = true;
      return this._goBed(BEDS[this.bedIdx], "sleep");
    }
    if (phase === "evening") {
      const urgent = w.claimTask(this, true);
      if (urgent) return this._startTask(urgent);
      if (this.hunger < 65 && canEat) return this._goEat();
      return this._goPlay();
    }
    // day: urgent work (medicine/trade/repair) always trumps hobby preference
    const urgent = w.claimTask(this, true);
    if (urgent) return this._startTask(urgent);
    const fav = w.claimFavoriteTask(this);
    if (fav) return this._startTask(fav);
    const task = w.claimTask(this);
    if (task) return this._startTask(task);
    if (this.fun <= 25) {
      w.log(`🎈 ${this.name}はこっそりサボって遊んでいる`, 0.2);
      return this._goPlay();
    }
    this._ambient();
  }

  // Head for the lowest dry floor at a random spot inside the building.
  _evacuate() {
    const w = this.world;
    const f = Math.min(3, Math.max(this.f + 1, w.flood.level));
    const x = BX0 + 2 + ((Math.random() * (BX1 - BX0 - 4)) | 0);
    this.setEmote("💦");
    this._goTo(f, x, () => this.setEmote(""));
  }

  _ambient() {
    const boost = 0.2;
    const fishW = 0.3 + (this.favTask === "fish" ? boost : 0);
    const studyW = 0.25 + (this.favTask === "study" ? boost : 0);
    const r = Math.random();
    if (r < fishW && this._goFish()) return;
    if (r < fishW + studyW) return this._goStudy();
    if (r < fishW + studyW + 0.25) return this._goWander();
    this._goPlay();
  }

  // Two idle students nearby strike up a quick conversation. The topic and
  // outcome are each drawn independently from their own pools, so the same
  // pair rarely has the "same" conversation twice.
  _tryChat() {
    const w = this.world;
    if (this.chatCooldown > 0 || Math.random() > 0.15) return false;
    const partner = w.students.find((o) =>
      o !== this && o.state === "idle" && o.chatCooldown <= 0 &&
      !o.sick && !o.exhausted && o.f === this.f && Math.abs(o.x - this.x) <= 4);
    if (!partner) return false;

    const topic = CHAT_TOPICS[(Math.random() * CHAT_TOPICS.length) | 0](this, partner, w);
    const outcome = CHAT_OUTCOMES[(Math.random() * CHAT_OUTCOMES.length) | 0];
    const session = { resolved: false, outcome };
    w.log(`💬 ${this.name}と${partner.name}が、${topic}について話している`, 0.85);

    for (const s of [this, partner]) {
      s.state = "chat";
      s.stateT = 4 + Math.random() * 4;
      s.setEmote("💬");
      s.chatCooldown = 45 + Math.random() * 30;
      s.chatSession = session;
    }
    // Store which of the pair is "a" so the outcome text/effect apply consistently.
    session.a = this;
    session.b = partner;
    return true;
  }

  _resolveChat() {
    const session = this.chatSession;
    this.chatSession = null;
    this.setEmote("");
    this.state = "idle";
    if (!session || session.resolved) return;
    session.resolved = true;
    const { a, b, outcome } = session;
    outcome.effect(a, b);
    this.world.log(`→ ${outcome.text(a, b)}`, 0.9);
  }

  // A nearby, unclaimed rat catches this student's eye.
  _tryHuntRat() {
    const w = this.world;
    const rat = w.rats.find((r) => !r.huntedBy && r.f === this.f && Math.abs(r.x - this.x) <= 6);
    if (!rat || Math.random() > 0.25) return false;
    rat.huntedBy = this;
    this.huntTarget = rat;
    this.huntT = 6;
    this.state = "hunt";
    this.setEmote("👀");
    return true;
  }

  _hunt(dt) {
    const w = this.world;
    const rat = this.huntTarget;
    if (!rat || !w.rats.includes(rat)) {
      this.huntTarget = null;
      this.setEmote("");
      this.state = "idle";
      return;
    }
    this.huntT -= dt;
    const dx = rat.px - this.px;
    if (Math.abs(dx) <= 6) {
      w.resolveRatEncounter(this, rat);
      this.huntTarget = null;
      this.setEmote("");
      this.state = "idle";
      return;
    }
    if (this.huntT <= 0) {
      rat.huntedBy = null;
      this.huntTarget = null;
      this.setEmote("");
      this.state = "idle";
      return;
    }
    this.px = Phaser.Math.Clamp(
      this.px + Math.sign(dx) * BASE_SPEED * this._speedMul() * 1.1 * dt,
      TILE * 1, TILE * 51);
    this.x = Math.round(this.px / TILE);
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
    const w = this.world;
    const blizzard = w.storm.active && w.storm.kind === "snow";
    return this.pace * (this.sick ? 0.5 : 1) * (this.exhausted ? 0.45 : 1) *
      (this.hunger <= 1 ? 0.6 : 1) * (blizzard ? 0.7 : 1);
  }

  _sync() {
    this.body.setPosition(this.px, this.py);
    this.head.setPosition(this.px, this.py - 6);
    this.label.setPosition(this.px, this.py - 16);
    this.emoteTxt.setPosition(this.px, this.py - 27);
    this.faceTxt.setPosition(this.px + 8, this.py - 6);
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
    const w = this.world;
    if (w.isFloorFlooded(bed.f)) {
      // Their bed (or the infirmary) is underwater - curl up somewhere dry.
      bed = MAKESHIFT_SLEEP[(Math.random() * MAKESHIFT_SLEEP.length) | 0];
      if (mode === "sleep") this.poorSleep = true;
    } else if (mode === "sleep") {
      this.poorSleep = false;
    }
    this._goTo(bed.f, bed.x, () => {
      this.state = mode;
      if (mode === "sleep") this.setEmote(this.poorSleep ? "😪" : "💤");
    });
  }

  _goPlay() {
    const w = this.world;
    const spots = PLAY_SPOTS.filter((s) =>
      (!w.storm.active || s.f < 3) && !w.isFloorFlooded(s.f));
    const fav = PLAY_SPOTS[this.favSpotIdx];
    const useFav = spots.includes(fav) && Math.random() < 0.6;
    const s = useFav ? fav : spots[(Math.random() * spots.length) | 0];
    this._goTo(s.f, s.x + ((Math.random() * 3) | 0) - 1, () => {
      this.state = "play";
      this.stateT = 9 + Math.random() * 6;
      this.fun = Math.min(100, this.fun + (useFav ? 6 : 0));
      this.setEmote(s.emote);
    });
  }

  _goStudy() {
    const w = this.world;
    const spots = STUDY_SPOTS.filter((s) => !w.isFloorFlooded(s.f));
    if (!spots.length) return this._goPlay();
    const s = spots[(Math.random() * spots.length) | 0];
    this._goTo(s.f, s.x + ((Math.random() * 4) | 0) - 2, () => {
      this.state = "study";
      this.stateT = 10 + Math.random() * 8;
      this.setEmote("📖");
    });
  }

  _goWander() {
    const w = this.world;
    const floors = [0, 0, 1, 2, 3].filter((f) => !w.isFloorFlooded(f));
    const f = floors[(Math.random() * floors.length) | 0];
    let x;
    if (f === 0 && !w.storm.active && !w.flood.active) x = (Math.random() * GRID_W) | 0;
    else x = BX0 + ((Math.random() * (BX1 - BX0)) | 0);
    this._goTo(f === 3 && w.storm.active ? 1 : f, x, null);
  }

  _goFish() {
    const w = this.world;
    if (w.storm.active || w.flood.active || w.phase !== "day") return false;
    const spot = w.fishSpots.find((s) => !s.takenBy);
    if (!spot) return false;
    spot.takenBy = this;
    this.fishSpot = spot;
    this.catches = 0;
    const ok = this._goTo(0, spot.x, () => {
      this.state = "fish";
      this.stateT = (8 + Math.random() * 7) * this.world.fishMul;
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
      this.stateT = (8 + Math.random() * 7) * w.fishMul;
    }
    const stop = w.phase !== "day" || w.storm.active || w.flood.active ||
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
