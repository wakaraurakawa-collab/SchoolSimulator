import {
  BX0, BX1, ROOMS, ROOM_W, PLOT_XS, FISH_SPOT_XS, PIER_L, PIER_R,
  INFIRMARY_BEDS, FLOOR_BOTTOM_Y, FLOOR_NAMES, FLOOR_H, tileCX,
} from "./mapData.js";

const DAY_LEN = 140; // seconds per in-game day
const TASK_PRIORITY = { medicine: 0, trade: 1, repair: 2, haul: 3, harvest: 4, tend: 5, plant: 6 };
const URGENT_TYPES = ["medicine", "trade", "repair"];
const OUTDOOR_TYPES = ["haul", "trade", "plant", "tend", "harvest"];

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
    this.storm = { active: false, t: 0 };
    this.sickList = []; // {student, t, treated, treatT}
    this.infOcc = new Map(); // student -> infirmary bed
    this.logs = [];
    this.students = [];
  }

  get phase() {
    const t = this.clock.t;
    return t < 80 ? "day" : t < 110 ? "evening" : "night";
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
      this.clock.day++;
    }

    this.driftT -= dt;
    if (this.driftT <= 0) {
      if (this.items.length < 7 && !this.storm.active) this.spawnDrift();
      this.driftT = 9 + Math.random() * 6;
    }

    for (const p of this.plots) {
      if ((p.stage === 1 || p.stage === 2) && p.watered) {
        p.t += dt;
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

    this.updateBoat(dt);

    for (const rec of [...this.sickList]) {
      rec.t += dt;
      if ((rec.treated && rec.t >= rec.treatT + 15) || rec.t >= 90) this.cure(rec);
    }
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
    if (t.type === "repair" && this.stocks.material < 1) return false;
    if (t.type === "medicine" && this.stocks.medicine < 1) return false;
    return true;
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
    if (r < 0.30) {
      this.makeLeak();
    } else if (r < 0.52) {
      const c = this.students.filter((s) => !s.sick && !s.exhausted);
      if (c.length) this.makeSick(c[(Math.random() * c.length) | 0]);
      else this.makeLeak();
    } else if (r < 0.67) {
      if (this.stocks.food > 2) {
        this.stocks.food -= 2;
        this.log("🐀 ネズミが食料をかじった…(食料-2)");
      } else this.spawnBonus();
    } else if (r < 0.82) {
      this.spawnBonus();
    } else if (!this.storm.active) {
      this.startStorm();
    } else {
      this.makeLeak();
    }
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

  makeSick(st) {
    st.sick = true;
    st.interrupt();
    const rec = { student: st, t: 0, treated: false, treatT: 0 };
    this.sickList.push(rec);
    this.tasks.push({ type: "medicine", patient: st, rec });
    this.log(`🤒 ${st.name}が熱を出して寝込んでしまった…`);
  }

  cure(rec) {
    rec.student.sick = false;
    const i = this.sickList.indexOf(rec);
    if (i >= 0) this.sickList.splice(i, 1);
    const task = this.tasks.find((t) => t.type === "medicine" && t.rec === rec);
    if (task) this.cancelTask(task);
    this.log(`✨ ${rec.student.name}の熱が下がった!`);
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

  // ---- storm ---------------------------------------------------------------

  startStorm() {
    this.storm.active = true;
    this.storm.t = 20;
    this.log("⛈ 嵐が来た!みんな屋内へ!");
    for (const st of this.students) {
      const outdoor = st.f === 3 || st.x < BX0 || st.x >= BX1 || st.fishSpot;
      if (outdoor) {
        st.interrupt();
        st.setEmote("💦");
      }
    }
  }

  endStorm() {
    this.storm.active = false;
    const nLeak = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < nLeak; i++) this.makeLeak();
    const p = this.plots[(Math.random() * this.plots.length) | 0];
    if (p.stage > 1) {
      p.stage--;
      p.watered = false;
      p.dirty = true;
      this.log("🥀 嵐で屋上菜園が荒れてしまった…");
    }
    const n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) this.spawnDrift();
    this.log("🌊 嵐が過ぎ去り、物資が流れ着いた!");
  }

  // ---- trading boat ----------------------------------------------------------

  updateBoat(dt) {
    const b = this.boat;
    if (b.phase === "none") {
      if (!this.storm.active) b.t -= dt;
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
