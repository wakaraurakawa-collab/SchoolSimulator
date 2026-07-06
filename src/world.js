import {
  BX0, BX1, ROOMS, ROOM_W, PLOT_XS, FISH_SPOT_XS, PIER_L, PIER_R,
  INFIRMARY_BEDS, FLOOR_BOTTOM_Y, FLOOR_NAMES, FLOOR_H, WATER_Y, tileCX,
} from "./mapData.js";
import { Rat } from "./rat.js";

const DAY_LEN = 140; // seconds per in-game day
const TASK_PRIORITY = { medicine: 0, trade: 1, repair: 2, haul: 3, harvest: 4, tend: 5, plant: 6 };
const URGENT_TYPES = ["medicine", "trade", "repair"];
const OUTDOOR_TYPES = ["haul", "trade", "plant", "tend", "harvest"];

export const DAYS_PER_SEASON = 4;
export const SEASONS = ["spring", "summer", "autumn", "winter"];
export const SEASON_INFO = {
  spring: { icon: "🌸", label: "春" },
  summer: { icon: "🌻", label: "夏" },
  autumn: { icon: "🍁", label: "秋" },
  winter: { icon: "❄️", label: "冬" },
};
// weather -> [next weather -> chance], normalized on pick
const WEATHER_TABLE = {
  sunny: { sunny: 0.4, cloudy: 0.6 },
  cloudy: { sunny: 0.35, cloudy: 0.3, rain: 0.35 },
  rain: { cloudy: 0.6, rain: 0.4 },
};

export class World {
  constructor(scene) {
    this.scene = scene;
    this.stocks = { food: 10, medicine: 2, material: 5, tool: 1 };
    this.items = [];   // drifted crates on the piers: {type, x, spr}
    this.tasks = [];   // {type, claimed?, cancelled?, ...target refs}
    this.leaks = [];   // {f, x, room, txt, baseY}
    this.plots = PLOT_XS.map((x) => ({ x, stage: 0, watered: false, t: 0, dirty: true }));
    this.fishSpots = FISH_SPOT_XS.map((x) => ({ x, takenBy: null }));
    this.clock = { t: 20, day: 1 };
    this.driftT = 6;
    this.eventT = 45;
    this.boat = { phase: "none", x: -80, t: 70, traded: false, tradeTask: null };
    this.storm = { active: false, t: 0, kind: "rain" };
    this.heat = { active: false, t: 0 };
    this.flood = { active: false, t: 0, level: 0, waterY: WATER_Y };
    this.weather = "sunny";
    this.weatherT = 30 + Math.random() * 20;
    this.sickList = []; // {student, t, treated, treatT, kind}
    this.infOcc = new Map(); // student -> infirmary bed
    this.logs = [];
    this.students = [];
    this.rats = [];
    this.ratSpawnT = 25 + Math.random() * 30;
  }

  get phase() {
    const t = this.clock.t;
    return t < 80 ? "day" : t < 110 ? "evening" : "night";
  }

  get dayFrac() {
    return this.clock.t / DAY_LEN;
  }

  get season() {
    return SEASONS[Math.floor((this.clock.day - 1) / DAYS_PER_SEASON) % SEASONS.length];
  }

  get isSnowing() {
    return this.weather === "rain" && this.season === "winter";
  }

  get growthMul() {
    return this.season === "winter" ? 1.6 : this.season === "summer" ? 0.85 : 1;
  }

  get bedsBlocked() {
    return this.flood.active && this.flood.level >= 2;
  }

  get bigCrisisActive() {
    return this.storm.active || this.heat.active || this.flood.active;
  }

  log(text, chance = 1) {
    if (Math.random() > chance) return;
    this.logs.push(text);
    if (this.logs.length > 7) this.logs.shift();
  }

  update(dt) {
    this.clock.t += dt;
    if (this.clock.t >= DAY_LEN) {
      this.clock.t -= DAY_LEN;
      const prevSeason = this.season;
      this.clock.day++;
      if (this.season !== prevSeason) {
        const info = SEASON_INFO[this.season];
        this.log(`${info.icon} 季節が${info.label}になった`);
      }
    }

    if (!this.storm.active) {
      this.weatherT -= dt;
      if (this.weatherT <= 0) this._rollWeather();
    }

    this.driftT -= dt;
    if (this.driftT <= 0) {
      if (this.items.length < 7 && !this.storm.active && !this.flood.active) this.spawnDrift();
      this.driftT = 9 + Math.random() * 6;
    }

    for (const p of this.plots) {
      if ((p.stage === 1 || p.stage === 2) && p.watered) {
        p.t += dt / this.growthMul;
        if (p.t >= 40) {
          p.t = 0;
          p.stage++;
          p.watered = false;
          p.dirty = true;
        }
      }
    }
    this.ensurePlotTasks();

    this.eventT -= dt;
    if (this.eventT <= 0) {
      this.randomEvent();
      this.eventT = 55 + Math.random() * 40;
    }

    if (this.storm.active) {
      this.storm.t -= dt;
      if (this.storm.t <= 0) this.endStorm();
    }
    if (this.heat.active) {
      this.heat.t -= dt;
      if (this.heat.t <= 0) this.endHeat();
    }
    if (this.flood.active) {
      this.flood.t -= dt;
      if (this.flood.t <= 0) this.endFlood();
    }
    const floodTargetY = this.flood.active ? FLOOR_BOTTOM_Y[this.flood.level] : WATER_Y;
    this.flood.waterY += (floodTargetY - this.flood.waterY) * Math.min(1, dt * 0.8);

    this.updateBoat(dt);

    for (const rec of [...this.sickList]) {
      rec.t += dt;
      if ((rec.treated && rec.t >= rec.treatT + 15) || rec.t >= 90) this.cure(rec);
    }

    if (!this.flood.active) {
      this.ratSpawnT -= dt;
      if (this.ratSpawnT <= 0 && this.rats.length < 2) {
        this.rats.push(new Rat(this.scene, this));
        this.ratSpawnT = 40 + Math.random() * 45;
      }
    }
    for (const rat of this.rats) rat.update(dt);
  }

  // ---- weather -------------------------------------------------------------

  _rollWeather() {
    const table = WEATHER_TABLE[this.weather];
    const total = Object.values(table).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let next = this.weather;
    for (const [w, chance] of Object.entries(table)) {
      r -= chance;
      if (r <= 0) { next = w; break; }
    }
    if (next !== this.weather) {
      this.weather = next;
      const label = next === "rain" ? (this.season === "winter" ? "❄️ 雪が降ってきた" : "🌧 雨が降ってきた")
        : next === "cloudy" ? "☁️ 曇ってきた" : "☀️ 晴れてきた";
      this.log(label, 0.7);
    }
    this.weatherT = 25 + Math.random() * 30;
  }

  // ---- drift supplies ----------------------------------------------------

  spawnDrift() {
    if (this.items.length >= 10) return;
    const side = Math.random() < 0.5 ? PIER_L : PIER_R;
    const x = side.from + ((Math.random() * (side.to - side.from + 1)) | 0);
    const roll = Math.random();
    const type = roll < 0.35 ? "food" : roll < 0.62 ? "material" : roll < 0.82 ? "tool" : "medicine";
    const spr = this.scene.addCrate(type, x);
    const item = { type, x, spr };
    this.items.push(item);
    this.tasks.push({ type: "haul", item });
  }

  pickItem(item) {
    item.spr.destroy();
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
  }

  // ---- garden ------------------------------------------------------------

  ensurePlotTasks() {
    for (const p of this.plots) {
      const need = this.storm.active ? null
        : p.stage === 0 ? "plant"
        : p.stage === 3 ? "harvest"
        : !p.watered ? "tend" : null;
      const existing = this.tasks.find((t) => t.plot === p);
      if (existing) {
        if (existing.type !== need && !existing.claimed) {
          this.tasks.splice(this.tasks.indexOf(existing), 1);
          if (need) this.tasks.push({ type: need, plot: p });
        }
      } else if (need) {
        this.tasks.push({ type: need, plot: p });
      }
    }
  }

  // ---- task board ----------------------------------------------------------

  claimTask(student, urgentOnly = false) {
    let best = null;
    let bestScore = Infinity;
    for (const t of this.tasks) {
      if (t.claimed || t.cancelled) continue;
      if (urgentOnly && !URGENT_TYPES.includes(t.type)) continue;
      if (!this.taskAllowed(t)) continue;
      const pos = this.taskPos(t);
      const score = TASK_PRIORITY[t.type] * 1000 +
        Math.abs(pos.x - student.x) + Math.abs(pos.f - student.f) * 12;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (best) {
      best.claimed = student;
      if (best.type === "repair") this.stocks.material--;
      if (best.type === "medicine") this.stocks.medicine--;
    }
    return best;
  }

  taskAllowed(t) {
    if (this.storm.active && OUTDOOR_TYPES.includes(t.type)) return false;
    if (this.flood.active && (t.type === "haul" || t.type === "trade")) return false;
    if (t.type === "repair" && this.stocks.material < 1) return false;
    if (t.type === "medicine" && this.stocks.medicine < 1) return false;
    return true;
  }

  // A student proactively grabs a task matching their favorite kind of work,
  // even if it isn't the board's top priority. Falls back to null.
  claimFavoriteTask(student) {
    let best = null;
    let bestDist = Infinity;
    for (const t of this.tasks) {
      if (t.claimed || t.cancelled || t.type !== student.favTask) continue;
      if (!this.taskAllowed(t)) continue;
      const pos = this.taskPos(t);
      const d = Math.abs(pos.x - student.x) + Math.abs(pos.f - student.f) * 12;
      if (d < bestDist) { bestDist = d; best = t; }
    }
    if (best) {
      best.claimed = student;
      if (best.type === "repair") this.stocks.material--;
      if (best.type === "medicine") this.stocks.medicine--;
    }
    return best;
  }

  taskPos(t) {
    switch (t.type) {
      case "haul": return { f: 0, x: t.item.x };
      case "repair": return { f: t.leak.f, x: t.leak.x };
      case "medicine": return { f: 0, x: 32 };
      case "trade": return { f: 0, x: 2 };
      default: return { f: 3, x: t.plot.x };
    }
  }

  // Student voluntarily gives a task back (interrupted). Refund reserves.
  releaseTask(t) {
    if (!t || !this.tasks.includes(t)) return;
    if (t.type === "repair") this.stocks.material++;
    if (t.type === "medicine") this.stocks.medicine++;
    t.claimed = null;
  }

  // Task target disappeared (boat left, patient recovered). Refund + remove.
  cancelTask(t) {
    if (!t) return;
    const i = this.tasks.indexOf(t);
    if (i >= 0) this.tasks.splice(i, 1);
    if (t.claimed) {
      if (t.type === "repair") this.stocks.material++;
      if (t.type === "medicine") this.stocks.medicine++;
    }
    t.cancelled = true;
  }

  completeTask(t) {
    const i = this.tasks.indexOf(t);
    if (i >= 0) this.tasks.splice(i, 1);
  }

  // ---- crises --------------------------------------------------------------

  randomEvent() {
    const r = Math.random();
    if (r < 0.22) {
      this.makeLeak();
    } else if (r < 0.40) {
      const c = this.students.filter((s) => !s.sick && !s.exhausted);
      if (c.length) this.makeSick(c[(Math.random() * c.length) | 0]);
      else this.makeLeak();
    } else if (r < 0.52) {
      this.spawnRatEvent();
    } else if (r < 0.64) {
      this.spawnBonus();
    } else if (r < 0.70) {
      this.lowTide();
    } else if (this.bigCrisisActive) {
      this.makeLeak(); // a big crisis is already running - just add friction
    } else if (this.season === "winter" && this.weather === "rain") {
      this.startStorm("snow");
    } else if (this.season === "summer" && r < 0.85) {
      this.startHeat();
    } else if (this.weather === "rain") {
      this.startStorm("rain");
    } else if (r < 0.94) {
      this.startFlood();
    } else {
      this.makeLeak();
    }
  }

  lowTide() {
    const bonus = { food: 3, material: 2, tool: 1 };
    for (const [k, v] of Object.entries(bonus)) this.stocks[k] += v;
    for (let i = 0; i < 2 + ((Math.random() * 2) | 0); i++) this.spawnDrift();
    this.log("🏖️ 潮が引いて地面が見えた!埋まっていた物資を見つけた");
  }

  spawnBonus() {
    const n = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) this.spawnDrift();
    this.log("🌊 物資がたくさん流れ着いた!");
  }

  makeLeak() {
    const candidates = ROOMS.filter((r) => r.f <= 2 || r.slot <= 1);
    const room = candidates[(Math.random() * candidates.length) | 0];
    const x = room.x0 + 1 + ((Math.random() * (ROOM_W - 2)) | 0);
    const baseY = FLOOR_BOTTOM_Y[room.f] - FLOOR_H + 12;
    const txt = this.scene.add.text(tileCX(x), baseY, "💧", { fontSize: "12px" })
      .setOrigin(0.5).setDepth(20);
    const leak = { f: room.f, x, room, txt, baseY };
    this.leaks.push(leak);
    this.tasks.push({ type: "repair", leak });
    this.log(`💧 ${FLOOR_NAMES[room.f]}${room.name}で雨漏りが発生!`);
  }

  fixLeak(leak, by) {
    leak.txt.destroy();
    const i = this.leaks.indexOf(leak);
    if (i >= 0) this.leaks.splice(i, 1);
    this.log(`🔧 ${by.name}が${leak.room.name}の雨漏りを修理した`);
  }

  makeSick(st, kind = "fever") {
    st.sick = true;
    st.interrupt();
    const rec = { student: st, t: 0, treated: false, treatT: 0, kind };
    this.sickList.push(rec);
    this.tasks.push({ type: "medicine", patient: st, rec });
    if (kind !== "bite") this.log(`🤒 ${st.name}が熱を出して寝込んでしまった…`);
  }

  cure(rec) {
    rec.student.sick = false;
    const i = this.sickList.indexOf(rec);
    if (i >= 0) this.sickList.splice(i, 1);
    const task = this.tasks.find((t) => t.type === "medicine" && t.rec === rec);
    if (task) this.cancelTask(task);
    this.log(rec.kind === "bite" ? `✨ ${rec.student.name}の怪我が治った!` : `✨ ${rec.student.name}の熱が下がった!`);
  }

  // ---- rats -----------------------------------------------------------------

  _removeRat(rat) {
    rat.huntedBy = null;
    const i = this.rats.indexOf(rat);
    if (i >= 0) this.rats.splice(i, 1);
    rat.destroy();
  }

  resolveRatEncounter(student, rat) {
    const roll = Math.random();
    if (roll < 0.55) {
      this.log(`🐀💨 ${student.name}がネズミを追い払った!`);
      this._removeRat(rat);
    } else if (roll < 0.8) {
      this.log(`😲 ${student.name}はネズミに驚いて飛び退いた!`);
      this._removeRat(rat);
    } else {
      this.log(`🐀😖 ${student.name}はネズミに反撃されて怪我をしてしまった…保健室へ`);
      this._removeRat(rat);
      this.makeSick(student, "bite");
    }
  }

  spawnRatEvent() {
    if (this.rats.length < 3 && !this.flood.active) {
      this.rats.push(new Rat(this.scene, this));
      this.log("🐀 ネズミが物置から顔を出した!");
    } else if (this.stocks.food > 2) {
      this.stocks.food -= 2;
      this.log("🐀 ネズミが食料をかじった…(食料-2)");
    }
  }

  takeInfBed(st) {
    if (this.infOcc.has(st)) return this.infOcc.get(st);
    const used = new Set(this.infOcc.values());
    const bed = INFIRMARY_BEDS.find((b) => !used.has(b));
    if (bed) this.infOcc.set(st, bed);
    return bed || null;
  }

  freeInfBed(st) {
    this.infOcc.delete(st);
  }

  // ---- storm / blizzard -----------------------------------------------------

  startStorm(kind = "rain") {
    this.storm.active = true;
    this.storm.kind = kind;
    this.storm.t = 20;
    this.weather = "rain";
    this.log(kind === "snow" ? "🌨 猛吹雪が来た!みんな屋内へ!" : "⛈ 嵐が来た!みんな屋内へ!");
    for (const st of this.students) {
      const outdoor = st.f === 3 || st.x < BX0 || st.x >= BX1 || st.fishSpot;
      if (outdoor) {
        st.interrupt();
        st.setEmote(kind === "snow" ? "🥶" : "💦");
      }
    }
  }

  endStorm() {
    const wasSnow = this.storm.kind === "snow";
    this.storm.active = false;
    this.weather = "cloudy";
    this.weatherT = 25 + Math.random() * 30;
    const nLeak = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < nLeak; i++) this.makeLeak();
    const p = this.plots[(Math.random() * this.plots.length) | 0];
    if (p.stage > 1) {
      p.stage--;
      p.watered = false;
      p.dirty = true;
      this.log(wasSnow ? "🥀 吹雪で屋上菜園が傷んでしまった…" : "🥀 嵐で屋上菜園が荒れてしまった…");
    }
    if (wasSnow && Math.random() < 0.4) {
      const c = this.students.filter((s) => !s.sick && !s.exhausted);
      if (c.length) this.makeSick(c[(Math.random() * c.length) | 0]);
    }
    const n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) this.spawnDrift();
    this.log(wasSnow ? "❄️ 吹雪が過ぎ去り、物資が流れ着いた!" : "🌊 嵐が過ぎ去り、物資が流れ着いた!");
  }

  // ---- heatwave --------------------------------------------------------------

  startHeat() {
    this.heat.active = true;
    this.heat.t = 32;
    this.log("🥵 猛烈な暑さがやってきた!のどが渇きやすくなりそう");
  }

  endHeat() {
    this.heat.active = false;
    if (this.stocks.food > 1 && Math.random() < 0.5) {
      this.stocks.food -= 1;
      this.log("😮‍💨 暑さが和らいだ。食料が少し傷んでしまった(食料-1)");
    } else {
      this.log("😮‍💨 暑さが和らいだ");
    }
  }

  // ---- flood ------------------------------------------------------------------

  startFlood() {
    this.flood.active = true;
    this.flood.level = Math.random() < 0.65 ? 1 : 2;
    this.flood.t = 34;
    for (const item of [...this.items]) this.pickItem(item);
    this.tasks = this.tasks.filter((t) => t.type !== "haul");
    for (const st of this.students) {
      if (st.fishSpot || (st.f === 0 && (st.x < BX0 || st.x >= BX1))) {
        st.interrupt();
        st.setEmote("💦");
      }
    }
    for (const rat of [...this.rats]) this._removeRat(rat);
    if (this.flood.level >= 2) {
      this.log("🌊⚠️ 水位が大きく上昇してきた!2階の寝室まで危ない!");
    } else {
      this.log("🌊⚠️ 水位が上昇してきた!1階の物は流されてしまった");
    }
  }

  endFlood() {
    this.flood.active = false;
    this.driftT = 1;
    const n = 4 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) this.spawnDrift();
    this.log("🌊 水が引いた!漂着物が増えそうだ");
  }

  // ---- trading boat ----------------------------------------------------------

  updateBoat(dt) {
    const b = this.boat;
    if (b.phase === "none") {
      if (!this.storm.active && !this.flood.active) b.t -= dt;
      if (b.t <= 0) {
        b.phase = "in";
        b.x = -80;
        this.log("⛵ 沖に行商船が見えてきた!");
      }
    } else if (b.phase === "in") {
      b.x += 26 * dt;
      if (b.x >= 26) {
        b.phase = "docked";
        b.t = 32;
        b.traded = false;
        b.tradeTask = { type: "trade" };
        this.tasks.push(b.tradeTask);
        this.log("⛵ 行商船が桟橋に着いた");
      }
    } else if (b.phase === "docked") {
      b.t -= dt;
      if (b.traded || b.t <= 0) {
        b.phase = "out";
        this.cancelTask(b.tradeTask);
        b.tradeTask = null;
        if (!b.traded) this.log("⛵ 行商船は行ってしまった…");
      }
    } else if (b.phase === "out") {
      b.x -= 30 * dt;
      if (b.x < -80) {
        b.phase = "none";
        b.t = 110 + Math.random() * 60;
      }
    }
  }

  doTrade() {
    const s = this.stocks;
    if (s.food >= 6) {
      s.food -= 4;
      s.medicine += 2;
      s.material += 2;
      this.log("🤝 交易成立!食料4 → 薬2・材料2");
    } else if (s.food <= 2) {
      s.food += 2;
      this.log("🤝 行商船が食料を分けてくれた (食料+2)");
    } else {
      s.food -= 1;
      s.tool += 1;
      this.log("🤝 交易成立!食料1 → 道具1");
    }
    this.boat.traded = true;
  }
}
