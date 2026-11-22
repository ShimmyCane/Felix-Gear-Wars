// Felix Gear Wars: the game rules. No DOM and no drawing, so tools/balance_sim.js can run it in Node.
// The screen reads sim.units / sim.gears / sim.proj and drains sim.events (pops, hits, coins...) each frame.
(function () {
  'use strict';
  var F = globalThis.FGW;
  var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // heart sides: E, S, W, N (clockwise from east)
  var STEP = 1 / 30;
  var TOWER_REBUILD = 45;           // seconds for a destroyed tower to be rebuilt

  function Sim(cfg, o) {
    o = o || {};
    this.cfg = cfg; this.o = o;
    this.rnd = F.rng(o.seed || cfg.seed || 1);
    this.noEvents = !!o.noEvents;
    this.t = 0; this.acc = 0; this.speed = 1; this.nid = 1; this.events = [];
    this.cols = cfg.board.cols; this.rows = cfg.board.rows;
    this.heart = { c: cfg.board.heart.c, r: cfg.board.heart.r };
    this.heartA = -0.35;                       // the angle shown (radians): the heart snaps a quarter turn on each tick and the gears fill only then
    this.ticks = 0; this.tickAcc = 0;
    this.world = cfg.world || F.WORLD; this.ebx = this.world - 160;   // width of the battlefield and the enemy fortress
    this.heartPeriod = o.heartPeriod || F.HEART_PERIOD / (o.heartSpeed || 1);
    this.holes = {}; cfg.board.holes.forEach(function (h) { this.holes[h[0] + ',' + h[1]] = true; }, this);
    this.grid = {}; this.gears = []; this.units = []; this.proj = [];
    this.coins = cfg.coins; this.maxLives = cfg.lives; this.lives = cfg.lives;
    this.status = 'build';                     // build | running | won | lost
    this.waveIdx = -1; this.queue = []; this.waveTimer = Infinity; this.waveCount = Infinity;
    this.leaks = 0; this.kills = 0; this.earned = 0; this.spent = 0; this.undo = [];
    this.es = F.enemyScale(cfg.idx);
    // With each kind of enemy capped, a bigger press cannot add more of them, so it also makes them tougher: health and attack grow with the square root of the press (above 1).
    this.es.foe = Math.sqrt(Math.max(1, F.modePress(cfg.mode, cfg.idx)));
    var qk = cfg.quick ? 0.6 : 1;                // Quick game squeezes the whole hill
    var pace = F.modePace(cfg.mode);            // medium and hard: more time between waves, a longer hill
    this.pace = pace;
    this.fun = { peak: (o.funPeak || F.FUN.peak) * 60 * qk * pace, fade: (o.funFade || F.FUN.fade) * 60 * qk * pace, ch: o.challenge || 1 };
    this.gap = F.waveGap(cfg.idx) * (cfg.quick ? 0.8 : 1) * pace;
    this.holesCleared = 0;
    if (!cfg.free) this.waveCount = Math.max(2, Math.floor(this.fun.fade / this.gap));
    this.bossWave = cfg.bossType ? Math.max(1, Math.round(this.fun.peak / this.gap)) : -1; this.bossDone = false;
    this.startT = 0; this.faded = false;
    this.specialty = o.specialty || null;      // the culture's starred fighter (+25%); the screen sets it
    this.pool = cfg.pool.concat(cfg.specials || []);
    // book 2: resources, buildings on plots, unit queues and terrain (no multipliers, no pegboard)
    this.book = cfg.book || 0; this.terrain = cfg.terrain || [];
    this.res = Object.assign({ food: 0, wood: 0, runes: 0 }, cfg.res || {});
    this.buildings = []; this.plotUse = {}; this.plotX = [];
    for (var pi = 0; pi < (cfg.plots || 0); pi++) this.plotX.push(180 + pi * 100);
    if (!this.book) F.multTiers(cfg.free ? 0 : cfg.ch).forEach(function (v) { this.pool.push('mult@' + v); }, this);
    this.maxChamps = o.champMax || F.MAX_CHAMPIONS;                                                       // the player's champions on the map at once
    this.maxArmy = cfg.free ? (o.armyMax || F.FREE_ARMY) : F.MAX_UNITS;                                  // free-for-all: 25 by default, up to 50 in the settings
    this.maxEnemy = cfg.free ? Math.ceil(this.maxArmy * F.freeFoe(cfg.mode)) : F.MAX_UNITS;             // the enemy army: 1x, 2x or 3x yours by mode
    this.tray = [null, null, null];
    this.sideGain = [{}, {}, {}, {}];
    this.rollTray();
    var self = this;
    cfg.board.dormant.forEach(function (d) { self.addGear(d.type, d.level, d.c, d.r, true); });
    this.recompute();
    this.buildStructures();
  }

  var P = Sim.prototype;
  Object.defineProperty(P, 'baseHp', { get: function () { return this.fort.hp; } });
  Object.defineProperty(P, 'baseMax', { get: function () { return this.fort.max; } });

  // ---- castles, towers and the enemy fortress ------------------------------------------------
  // Each side has a castle that shoots arrows and stones. From chapter 4 each side also builds a tower at 10% and one at 25%
  // of the way across. Towers can be destroyed and are rebuilt slowly. The enemy fortress falling wins the level.
  P.buildStructures = function () {
    var cfg = this.cfg, idx = cfg.idx, es = this.es.atk, self = this;
    var rs = Math.max(0.55, Math.min(1, this.world / 2560));     // castle and tower ranges follow the length of the map
    var D = F.castleUnits(idx) * 10;               // a castle shoots as hard as 5 fighters at first and 10 at the end (a spearman does about 10 damage a second)
    this.structs = []; this.raised = [];      // raised shields (fighter move): zones that block arrows and stones for a while
    function add(side, kind, x, hp, weapons, extra) {
      var k = side === 'enemy' ? es : 1;
      var s = Object.assign({ id: self.nid++, side: side, kind: kind, x: x, hp: hp, max: hp, alive: true, rebuild: 0, targetable: true, flash: 0, invuln: false,
        weapons: weapons.map(function (w) { return { kind: w.kind, range: w.range * rs, min: (w.min || 0) * rs, cd: w.cd, t: w.cd * (0.4 + self.rnd() * 0.6), dmg: w.dps * w.cd * k, splash: w.splash || 0 }; }) }, extra || {});
      self.structs.push(s); return s;
    }
    // The first levels have only archers in the castle (about two). Stones come from level four (chapter 2, level 1).
    var castleW = idx >= 3 ? [{ kind: 'arrow', range: 440, cd: 0.5, dps: 0.6 * D }, { kind: 'stone', range: 720, min: 180, cd: 3.5, dps: 0.4 * D / 1.5, splash: 70 }]
      : [{ kind: 'arrow', range: 440, cd: 0.5, dps: 0.3 * D }];
    this.castle = add('ally', 'castle', 90, 1e9, castleW, { targetable: false, invuln: true });
    this.fort = add('enemy', 'fortress', this.ebx + 60, cfg.baseHp, castleW, { invuln: !!cfg.free });
    if (cfg.towers) {
      var thp = 220 + 40 * idx, a = Math.round(this.world * 0.10), b = Math.round(this.world * 0.25);
      [['ally', a, 'tower1'], ['ally', b, 'tower2'], ['enemy', this.world - a, 'tower1'], ['enemy', this.world - b, 'tower2']].forEach(function (t) {
        add(t[0], t[2], t[1], thp, t[2] === 'tower1' ? [{ kind: 'arrow', range: 360, cd: 0.8, dps: 0.25 * D }] : [{ kind: 'stone', range: 520, min: 140, cd: 3.5, dps: 0.35 * D / 1.5, splash: 65 }], { tower: true });
      });
    }
  };
  P.structById = function (id) { for (var i = 0; i < this.structs.length; i++) if (this.structs[i].id === id) return this.structs[i]; return null; };
  P.hurtStruct = function (s, amount) {
    if (!s || !s.alive || s.invuln) return;
    s.hp -= amount; s.flash = 0.15; this.emit({ k: 'structhit', id: s.id, x: s.x, kind: s.kind });
    if (s.hp <= 0) {
      s.hp = 0; s.alive = false; s.rebuild = 0; this.emit({ k: 'structdown', id: s.id, x: s.x, kind: s.kind, side: s.side });
      if (s.kind === 'fortress') {
        this.emit({ k: 'basefall' });
        if (this.status === 'running') { this.status = 'won'; this.emit({ k: 'end', win: true, base: true }); }
      }
    }
  };
  P.hurtStructsAt = function (x, r, amount, projSide) {
    for (var i = 0; i < this.structs.length; i++) {
      var s = this.structs[i];
      if (s.side !== projSide && s.alive && s.targetable && Math.abs(s.x - x) <= r + 30) this.hurtStruct(s, amount);
    }
  };
  P.pickStruct = function (u) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.structs.length; i++) {
      var s = this.structs[i]; if (s.side === u.side || !s.alive || !s.targetable) continue;
      var d = Math.abs(s.x - u.x);
      if (d <= u.range + 24 && !(u.minRange && d < u.minRange) && d < bd) { bd = d; best = s; }
    }
    return best;
  };
  // A fallen tower is rebuilt only when its owner has pushed the other side back beyond that place (plus a margin).
  P.contested = function (s) {
    for (var i = 0; i < this.units.length; i++) {
      var o = this.units[i]; if (o.side === s.side || o.dead || o.state === 'dying') continue;
      if (s.side === 'ally' ? o.x <= s.x + 320 : o.x >= s.x - 320) return true;
    }
    return false;
  };
  P.updateStructs = function (dt) {
    for (var i = 0; i < this.structs.length; i++) {
      var s = this.structs[i];
      if (s.flash > 0) s.flash -= dt;
      if (!s.alive) {
        if (s.tower && !this.contested(s)) { s.rebuild += dt / TOWER_REBUILD; if (s.rebuild >= 1) { s.alive = true; s.hp = s.max; s.rebuild = 0; this.emit({ k: 'structup', id: s.id, x: s.x, kind: s.kind }); } }
        continue;
      }
      for (var j = 0; j < s.weapons.length; j++) {
        var w = s.weapons[j]; w.t -= dt; if (w.t > 0) continue;
        var foe = null, bd = 1e9;
        for (var k = 0; k < this.units.length; k++) {
          var o = this.units[k]; if (o.side === s.side || o.state === 'dying' || o.state === 'fall' || o.dead) continue;
          var d = Math.abs(o.x - s.x); if (d <= w.range && d >= w.min && d < bd) { bd = d; foe = o; }
        }
        if (!foe) { w.t = 0.25; continue; }
        w.t = w.cd;
        var stone = w.kind === 'stone', dist = Math.abs(foe.x - s.x);
        this.proj.push({ id: this.nid++, kind: w.kind, x0: s.x, y0: s.tower ? -78 : -70, x1: foe.x, y1: foe.y, t: 0, dur: Math.max(0.25, dist / (stone ? 300 : 520)), side: s.side,
          owner: { type: stone ? 'catapult' : 'archer', atk: w.dmg, magic: false }, tgt: stone ? 0 : foe.id, base: false, splash: w.splash, fromStruct: s.id });
        this.emit({ k: 'shot', kind: w.kind, x: s.x, y: 0, side: s.side, struct: true });
      }
    }
  };
  P.emit = function (e) { if (!this.noEvents) { this.events.push(e); if (this.events.length > 400) this.events.shift(); } };
  P.key = function (c, r) { return c + ',' + r; };
  P.inBoard = function (c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; };
  P.isHeart = function (c, r) { return c === this.heart.c && r === this.heart.r; };
  P.isHole = function (c, r) { return !!this.holes[c + ',' + r]; };
  P.gearAt = function (c, r) { var id = this.grid[c + ',' + r]; return id ? this.gearById(id) : null; };
  P.gearById = function (id) { for (var i = 0; i < this.gears.length; i++) if (this.gears[i].id === id) return this.gears[i]; return null; };
  P.isFree = function (c, r) { return this.inBoard(c, r) && !this.isHeart(c, r) && !this.isHole(c, r) && !this.grid[c + ',' + r]; };
  P.dropX = function (c) { return F.DROP_X0 + (c + 0.5) / this.cols * F.DROP_SPAN; };

  // ---- gears -------------------------------------------------------------------------------
  P.addGear = function (type, level, c, r, locked) {
    var g = { id: this.nid++, type: type, level: level, c: c, r: r, charge: 0, locked: !!locked, rate: 0, active: false, pulse: 0, ready: false };
    this.gears.push(g); this.grid[c + ',' + r] = g.id; return g;
  };
  P.removeGear = function (g) {
    this.gears.splice(this.gears.indexOf(g), 1); delete this.grid[g.c + ',' + g.r];
  };
  P.canMerge = function (a, b) {
    var max = a.type === 'mult' ? F.MULT_MAXLEVEL : F.MAXLEVEL;
    return a && b && a !== b && a.type === b.type && a.level === b.level && a.level < max && !a.locked && !b.locked;
  };
  // Every gear you own makes the next one dearer (a level starts with a fixed purse and the price creeps up), so the number of gears
  // you can afford by the end follows the size of the enemy's last wave. Merging and selling bring the price down again.
  P.priceOf = function (type) {
    var n = 0; for (var i = 0; i < this.gears.length; i++) if (!this.gears[i].locked) n++;
    var p = F.trayParts(type);
    return Math.round(F.gearValue(p.type, p.level) * (1 + (this.cfg.creep || 0) * n));
  };
  // ---- removable pegs: each blocked peg costs more to clear than the one before -------------
  P.holeCost = function () { return Math.round(F.HOLE_BASE * Math.pow(F.HOLE_GROWTH, this.holesCleared)); };
  P.clearHole = function (c, r) {
    if (!this.isHole(c, r)) return 'none';
    var cost = this.holeCost();
    if (this.coins < cost) return 'poor';
    this.coins -= cost; this.spent += cost; this.holesCleared++;
    delete this.holes[c + ',' + r];
    var self = this;
    this.undo.push(function () { self.holes[c + ',' + r] = true; self.holesCleared--; self.coins += cost; self.spent -= cost; });
    this.emit({ k: 'hole', c: c, r: r });
    return 'ok';
  };
  // Merge everything that can merge. Each pair folds into the gear nearer the heart; the nearest pairs go first.
  P.autoMerge = function () {
    var self = this, n = 0, guard = 0;
    function hd(g) { return Math.abs(g.c - self.heart.c) + Math.abs(g.r - self.heart.r); }
    for (;;) {
      var best = null, i, j;
      for (i = 0; i < this.gears.length; i++) for (j = i + 1; j < this.gears.length; j++) {
        var a = this.gears[i], b = this.gears[j];
        if (!this.canMerge(a, b)) continue;
        var keep = hd(a) <= hd(b) ? a : b, other = keep === a ? b : a, d = hd(keep) * 100 + hd(other);
        if (!best || d < best.d) best = { keep: keep, other: other, d: d };
      }
      if (!best || guard++ > 200) break;
      this.moveGear(best.other, best.keep.c, best.keep.r); n++;
    }
    return n;
  };

  P.sellValue = function (g) { return Math.floor(F.gearValue(g.type, g.level) * 0.5); };

  // Which gears get ticks from which side of the heart, and how many (multiplier gears multiply what passes through).
  P.recompute = function () {
    var self = this;
    this.gears.forEach(function (g) { g.rate = 0; g.gmax = 0; g.active = false; });
    for (var s = 0; s < 4; s++) {
      var gain = {}; this.sideGain[s] = gain;
      var first = this.gearAt(this.heart.c + DIRS[s][0], this.heart.r + DIRS[s][1]);
      if (!first) continue;
      // distance from the heart along the chain: boosts only flow outward, so a loop cannot compound
      var dist = {}, order = [first], qi = 0;
      dist[first.id] = 0;
      while (qi < order.length) {
        var gq = order[qi++];
        for (var dq = 0; dq < 4; dq++) {
          var qc = gq.c + DIRS[dq][0], qr = gq.r + DIRS[dq][1];
          if (self.isHeart(qc, qr)) continue;
          var hq = self.gearAt(qc, qr);
          if (hq && dist[hq.id] === undefined) { dist[hq.id] = dist[gq.id] + 1; order.push(hq); }
        }
      }
      gain[first.id] = 1;
      for (var oi = 0; oi < order.length; oi++) {
        var g = order[oi];
        // a 4x or 8x multiplier speeds up everything after it on the chain by a tenth of its extra (8x is 1.7 times, not 8)
        var chain = (g.type === 'mult' && F.MULTV[g.level - 1] >= 4) ? 1 + 0.1 * (F.MULTV[g.level - 1] - 1) : 1;
        var out = Math.min(F.MULTCAP, gain[g.id] * chain);
        for (var d = 0; d < 4; d++) {
          var nc = g.c + DIRS[d][0], nr = g.r + DIRS[d][1];
          if (self.isHeart(nc, nr)) continue;
          var h = self.gearAt(nc, nr);
          if (h && dist[h.id] === dist[g.id] + 1 && (gain[h.id] || 0) < out) gain[h.id] = out;
        }
      }
      // a 1x or 2x multiplier speeds up only the gears right next to it, and does not pass the boost on
      for (var id2 in gain) {
        var gg2 = this.gearById(+id2); if (gg2.type === 'mult') continue;
        var adj = 1;
        for (var d2 = 0; d2 < 4; d2++) {
          var nb = this.gearAt(gg2.c + DIRS[d2][0], gg2.r + DIRS[d2][1]);
          if (nb && nb.type === 'mult' && F.MULTV[nb.level - 1] < 4 && gain[nb.id]) adj = Math.max(adj, F.MULTV[nb.level - 1]);
        }
        gain[id2] = Math.min(F.MULTCAP, gain[id2] * adj);
      }
      for (var id in gain) { var gg = this.gearById(+id); gg.rate += gain[id]; gg.gmax = Math.max(gg.gmax, gain[id]); gg.active = true; }
    }
  };

  // ---- the tray and the shop ---------------------------------------------------------------
  // The shop gives each gear at a level that suits your money: the highest level (up to TRAY_MAXLEVEL) whose price is at most a tenth of it.
  P.trayLevel = function (type) {
    var n = 0; for (var i = 0; i < this.gears.length; i++) if (!this.gears[i].locked) n++;
    var mul = 1 + (this.cfg.creep || 0) * n, lv = 1;
    for (var L = 2; L <= F.TRAY_MAXLEVEL; L++) if (F.gearValue(type, L) * mul <= this.coins * F.TRAY_SHARE) lv = L;
    return lv;
  };
  P.rollOne = function () {
    var t = this.rollPick(), p = F.trayParts(t);
    if (p.type === 'mult' || p.type === 'boss' || p.level > 1) return t;
    var lv = this.trayLevel(p.type);
    return lv > 1 ? p.type + '@' + lv : t;
  };
  P.armyCap = function () { return Math.min(this.maxArmy, F.armyCap(this.cfg.pool)); };
  P.rollPick = function () {
    var pool = this.pool, w = pool.map(function (t) { return F.trayParts(t).type === 'mult' ? 0.7 : t === 'boss' ? 0.35 : F.UNITS[t] ? 1 : 0.8; });
    var tot = w.reduce(function (a, b) { return a + b; }, 0), x = this.rnd() * tot;
    for (var i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i]; }
    return pool[0];
  };
  P.rollTray = function () {
    if (this.book === 2) { var bs = F.b2Buildings(this.cfg.ch); for (var bi = 0; bi < 3; bi++) this.tray[bi] = bs[Math.floor(this.rnd() * bs.length)]; return; }
    for (var i = 0; i < 3; i++) this.tray[i] = this.rollOne();
    // always offer at least one fighter so a tray is never all specials
    if (!this.tray.some(function (t) { return F.UNITS[F.trayParts(t).type]; })) this.tray[0] = this.cfg.pool[this.cfg.pool.length - 1];
  };
  P.refreshCost = function () { var n = 0; for (var i = 0; i < this.gears.length; i++) if (!this.gears[i].locked) n++; return F.refreshCost(n); };
  P.refreshTray = function () {
    var cost = this.refreshCost(); if (this.coins < cost) return false;
    var old = this.tray.slice(); this.coins -= cost; this.spent += cost; this.rollTray();
    var self = this; this.undo.push(function () { self.tray = old; self.coins += cost; self.spent -= cost; });
    return true;
  };
  P.buy = function (slot, c, r) {
    var type = this.tray[slot];
    if (!type) return 'none';
    if (!this.isFree(c, r)) return 'blocked';
    var cost = this.priceOf(type);
    if (this.coins < cost) return 'poor';
    this.coins -= cost; this.spent += cost;
    var p = F.trayParts(type), g = this.addGear(p.type, p.level, c, r, false);
    var prev = type, self = this;
    this.tray[slot] = this.rollOne();
    this.recompute();
    this.emit({ k: 'place', id: g.id });
    this.undo.push(function () { self.removeGear(self.gearById(g.id) || g); self.coins += cost; self.spent -= cost; self.tray[slot] = prev; self.recompute(); });
    return 'ok';
  };
  // Move a gear; on a gear of the same kind it merges, on another it swaps. Returns 'moved' | 'merged' | 'swapped' | 'no'.
  P.moveGear = function (g, c, r) {
    if (!g || g.locked || !this.inBoard(c, r) || this.isHeart(c, r) || this.isHole(c, r)) return 'no';
    if (g.c === c && g.r === r) return 'no';
    var other = this.gearAt(c, r), self = this, oc = g.c, or = g.r;
    if (!other) {
      delete this.grid[g.c + ',' + g.r]; g.c = c; g.r = r; this.grid[c + ',' + r] = g.id; this.recompute();
      this.undo.push(function () { delete self.grid[g.c + ',' + g.r]; g.c = oc; g.r = or; self.grid[oc + ',' + or] = g.id; self.recompute(); });
      return 'moved';
    }
    if (this.canMerge(g, other)) {
      var oldLevel = other.level, oldCharge = other.charge, goldCharge = g.charge;
      var gc = g.c, gr = g.r, gid = g.id;
      this.removeGear(g); other.level++; other.charge = Math.min(other.charge, Math.max(0, F.ticksNeeded(other.type, other.level) - 1));
      this.recompute(); this.emit({ k: 'merge', id: other.id, level: other.level });
      this.undo.push(function () {
        other.level = oldLevel; other.charge = oldCharge;
        var back = { id: gid, type: other.type, level: oldLevel, c: gc, r: gr, charge: goldCharge, locked: false, rate: 0, active: false, pulse: 0, ready: false };
        self.gears.push(back); self.grid[gc + ',' + gr] = gid; self.recompute();
      });
      return 'merged';
    }
    if (other.locked) return 'no';
    // swap places
    this.grid[g.c + ',' + g.r] = other.id; this.grid[c + ',' + r] = g.id;
    other.c = g.c; other.r = g.r; g.c = c; g.r = r; this.recompute();
    this.undo.push(function () {
      self.grid[g.c + ',' + g.r] = other.id; self.grid[other.c + ',' + other.r] = g.id;
      var tc = g.c, tr = g.r; g.c = other.c; g.r = other.r; other.c = tc; other.r = tr; self.recompute();
    });
    return 'swapped';
  };
  P.sellGear = function (g) {
    if (!g || g.locked) return false;
    var v = this.sellValue(g), self = this, copy = Object.assign({}, g);
    this.removeGear(g); this.coins += v; this.recompute();
    this.undo.push(function () { self.gears.push(copy); self.grid[copy.c + ',' + copy.r] = copy.id; self.coins -= v; self.recompute(); });
    return true;
  };
  P.undoLast = function () { var u = this.undo.pop(); if (u) { u(); return true; } return false; };

  // ---- waves -------------------------------------------------------------------------------
  P.start = function () { if (this.status === 'build') { this.status = 'running'; this.waveTimer = 0; this.startT = this.t; } };
  P.callNext = function () { if (this.status === 'running' && this.waveIdx + 1 < this.waveCount) this.waveTimer = 0; };
  // How strong is Felix right now, and how strong will he be by the time a wave arrives? In "spearman power" units.
  P.playerPower = function (window) {
    var p = 0, i, u, g, need, perSec = 4 / this.heartPeriod;
    if (this.book === 2) { for (i = 0; i < this.buildings.length; i++) { var bb = this.buildings[i]; var BB = F.B2_BUILDINGS[bb.type]; if (BB.kind === 'unit') p += F.unitPower(BB.units[0]) * window / F.b2UnitTime(BB.units[0]) * (1 + 0.25 * (bb.level - 1)); } }
    for (i = 0; i < this.units.length; i++) {
      u = this.units[i]; if (u.side !== 'ally' || u.dead || u.state === 'dying') continue;
      p += F.unitPower(u.type) * (u.champ ? F.SM[0] * 1.6 : F.SM[u.level - 1]) * Math.max(0.2, u.hp / u.max) * (u.special ? F.SPECIALTY_BONUS : 1);
    }
    for (i = 0; i < this.gears.length; i++) {
      g = this.gears[i]; if (g.rate <= 0 || !F.UNITS[g.type] || F.UNITS[g.type].champ) continue;
      need = F.ticksNeeded(g.type, g.level); if (!need) continue;
      p += F.unitPower(g.type) * F.SM[g.level - 1] * (g.rate * perSec / need) * window;
    }
    return p;
  };
  // The next wave is sized from the fun curve and from Felix's strength (the Candy-Crush idea: aim the hardest wave at the fun
  // peak, keep it exciting but not unfair, and ease off as the level fades). Free-for-all just keeps growing.
  P.makeWave = function (k) {
    var cfg = this.cfg, t = Math.max(0, this.t - this.startT), tm = t / 60, c, ratio;
    if (cfg.free) { c = Math.min(1, 0.4 + 0.08 * k); ratio = F.freeFoe(cfg.mode) * Math.min(1, 0.25 + 0.75 * k / 25) * this.fun.ch; }   // climbs over 25 waves to 1x, 2x or 3x the value of your army
    else { c = F.funCurve(tm, this.fun.peak / 60, this.fun.fade / 60); ratio = (F.TUNE.rLow + (F.TUNE.rPeak - F.TUNE.rLow) * c) * (1 + F.TUNE.rIdx * Math.min(1, cfg.idx / 23)) * (cfg.len || 1) * this.fun.ch * F.modePress(cfg.mode, cfg.idx); }
    var es = this.es, scale = Math.sqrt(es.hp * es.atk), pool = cfg.pool, i;
    var E = this.playerPower(Math.min(30, this.gap)) * ratio;
    var floor = F.unitPower(pool[0]) * scale * (k === 0 ? 2 : 1.5);
    var boss = false;
    if (!cfg.free && k === this.bossWave && !this.bossDone) { boss = true; this.bossDone = true; E = Math.max(floor, E - F.unitPower(cfg.bossType) * scale * 3); }
    if (cfg.free && cfg.bossEvery && (k + 1) % cfg.bossEvery === 0) boss = true;
    E = Math.max(floor, E);
    var types = pool.map(function (tp, n) { return { t: tp, w: 1 + n * 0.35 + (n === pool.length - 1 ? 1.2 : 0) }; });
    var list = [], got = 0, guard = 0;
    var lv = F.enemyLevel(c, cfg.idx);           // the Horde trains: its gears get stronger along the fun curve
    // a wave holds up to 26 fighters at press 1; harder modes allow bigger waves (the cap grows with the square root of the press)
    var cap = cfg.free ? this.maxEnemy : Math.round(F.WAVE_BASE * Math.max(1, Math.sqrt(F.modePress(cfg.mode, cfg.idx))));
    while (got < E && list.length < cap && guard++ < 160) {
      var tp = F.weightedPick(this.rnd, types); list.push({ type: tp, boss: false, level: lv }); got += F.unitPower(tp) * scale * F.SM[lv - 1];
    }
    var at = 0; list.forEach(function (s2) { s2.at = at; at += 0.8 + this.rnd() * 0.9; }, this);
    if (boss) list.push({ type: cfg.free ? pool[pool.length - 1 - (k % 3)] : cfg.bossType, boss: true, at: at + 3 });
    return { spawn: list, size: list.length, power: got, ratio: ratio, fun: c };
  };
  P.launchWave = function () {
    this.waveIdx++;
    var w = this.makeWave(this.waveIdx), self = this;
    this.lastWaveInfo = w;
    w.spawn.forEach(function (s) { self.queue.push({ at: self.t + s.at, type: s.type, boss: s.boss, level: s.level || 1 }); });
    this.emit({ k: 'wave', n: this.waveIdx + 1, total: this.waveCount, boss: w.spawn.some(function (s) { return s.boss; }), size: w.spawn.length });
    var nextAt = (this.waveIdx + 1) * this.gap;
    this.waveTimer = (this.waveIdx + 1 < this.waveCount && (this.cfg.free || nextAt < this.fun.fade)) ? this.gap : Infinity;
  };

  // ---- units -------------------------------------------------------------------------------
  P.makeUnit = function (side, type, level, x, boss) {
    var d = F.UNITS[type], sm = F.SM[level - 1], es = side === 'enemy' ? this.es : { hp: 1, atk: 1, def: 1 };
    var foe = side === 'enemy' ? (es.foe || 1) : 1;
    var hp = d.hp * sm * es.hp * foe, atk = d.atk * sm * es.atk * foe, def = d.def * (1 + 0.4 * (level - 1)) * es.def, spd = d.speed, sc = level >= F.BIG_LEVEL ? 2.8 : 1 + (level - 1) * 0.1;
    if (d.champ) sc = d.scale * (1 + (level - 1) * 0.08);
    var special = side === 'ally' && this.specialty === type;
    if (special) { hp *= F.SPECIALTY_BONUS; atk *= F.SPECIALTY_BONUS; }
    if (boss) { hp *= 9; atk *= 2.2; def *= 1.6; spd *= 0.85; sc = 2.8; }
    var u = { id: this.nid++, side: side, type: type, level: level, boss: !!boss, x: x, y: this.rnd() * 52, hp: hp, max: hp, atk: atk, def: def,
      range: d.range * (boss || level >= F.BIG_LEVEL ? 1.25 : 1), big: level >= F.BIG_LEVEL, minRange: d.minRange || 0, speed: spd, cdMax: d.cd, cd: 0.3 + this.rnd() * 0.4, state: 'fall', t: 0,
      anim: 'fall', at: 0, hitDone: false, special: special, champ: !!d.champ, fly: !!d.fly, slow: 0, healT: 1.2, tgt: 0, dir: side === 'ally' ? 1 : -1, scale: sc, charged: false, flash: 0, phase: this.rnd() * 6.28, dead: false, vx: 0 };
    this.units.push(u); return u;
  };

  function dmgFrom(atk, a, t, d) {   // a = attacker spec {type, atk, magic}, t = target unit, d = data
    var A = F.UNITS[a.type], T = F.UNITS[t.type], m = 1;
    if (A.vs && A.vs[t.type]) m *= A.vs[t.type];
    if (A.kind === 'ranged' && T.shield) m *= T.shield;
    var def = t.def * (A.magic ? 0.4 : 1);
    return atk * m * 40 / (40 + def);
  }
  P.hurt = function (t, amount, src) {
    if (t.dead || t.state === 'dying') return;
    t.hp -= amount; t.flash = 0.18;
    this.emit({ k: 'hit', x: t.x, y: t.y, dmg: amount, side: t.side, type: t.type, big: amount > t.max * 0.25 });
    if (t.hp <= 0) this.kill(t, src);
  };
  P.kill = function (t, src) {
    t.state = 'dying'; t.anim = 'die'; t.t = 0; t.hp = 0;
    // a blob bit that lands a kill grows, and five kills by the bits reform the blob
    if (src && src.group && t.side === 'enemy') {
      var g = src.group; g.kills++;
      if ((src.grows || 0) < 4) { src.grows = (src.grows || 0) + 1; var oldMax = src.max; src.max *= 1.25; src.hp += 0.25 * oldMax; src.atk *= 1.15; }
      if (g.kills >= 5) this.reformBlob(g);
    }
    // a necromancer raises the enemy that just fell, if one is near and ready
    if (t.side === 'enemy' && !t.champ && !t.boss && !t.bit) {
      for (var ni = 0; ni < this.units.length; ni++) {
        var n = this.units[ni];
        if (n.side === 'ally' && n.type === 'necromancer' && !n.dead && n.state !== 'dying' && (n.raiseCD || 0) <= 0 && Math.abs(n.x - t.x) <= 320) {
          var r = this.makeUnit('ally', t.type, 1, t.x, false); r.hp = r.max * 0.5; r.raised = true; n.raiseCD = 3;
          this.emit({ k: 'raise', x: t.x, y: t.y, unit: r.id }); break;
        }
      }
    }
    if (t.side === 'enemy') {
      var b = F.bounty(t.type, t.boss);
      this.coins += b; this.earned += b; this.kills++;
      this.emit({ k: 'coin', x: t.x, y: t.y, n: b });
    }
    this.emit({ k: 'die', x: t.x, y: t.y, side: t.side, type: t.type, boss: t.boss });
  };
  P.foes = function (u) { var s = u.side === 'ally' ? 'enemy' : 'ally'; return this.units.filter(function (o) { return o.side === s && o.state !== 'dying' && o.state !== 'fall' && !o.dead; }); };

  P.pickTarget = function (u) {
    var foes = this.foes(u), best = null, bs = 1e9, i, o, dx, score;
    var D = F.UNITS[u.type];
    for (i = 0; i < foes.length; i++) {
      o = foes[i]; dx = Math.abs(o.x - u.x);
      if (o.fly && D.kind === 'melee' && !u.fly) continue;       // spears cannot reach a dragon
      if (u.minRange && dx < u.minRange) continue;
      var reach = D.hunts ? 480 : Math.max(u.range, 150);
      if (dx > reach) continue;
      score = dx;
      if (D.hunts && F.UNITS[o.type].kind === 'ranged') score -= 400;
      if (score < bs) { bs = score; best = o; }
    }
    return best;
  };
  P.tooClose = function (u) {
    if (!u.minRange) return false;
    var foes = this.foes(u);
    for (var i = 0; i < foes.length; i++) if (Math.abs(foes[i].x - u.x) < u.minRange) return true;
    return false;
  };

  // ---- single-use moves -----------------------------------------------------------------------
  // An enemy can be moved, slowed or hurt by a move only when it is not ranked above the unit (tier), not a champion and not a boss.
  P.canMove = function (u, o) { return !o.champ && !o.boss && F.tierOf(o.type) <= F.tierOf(u.type); };
  P.skillFoes = function (u, range) {
    var out = [], fs = this.foes(u);
    for (var i = 0; i < fs.length; i++) if (this.canMove(u, fs[i]) && Math.abs(fs[i].x - u.x) <= range) out.push(fs[i]);
    return out;
  };
  P.useSkill = function (u, S) {
    var self = this, i, o, list, emitName = function () { self.emit({ k: 'skill', name: S.name, x: u.x, y: u.y, side: u.side }); };
    emitName();
    if (u.type === 'spearman') {                                     // push the wave back
      this.skillFoes(u, S.radius).forEach(function (f) { f.x += u.dir * S.push; f.slow = Math.max(f.slow || 0, 0.8); });
    } else if (u.type === 'archer') {                                // a long shot at the weakest archer, mage or catapult in reach
      list = this.skillFoes(u, S.reach); var pick = null;
      list.forEach(function (f) { if ((f.type === 'archer' || f.type === 'mage' || f.type === 'catapult') && (!pick || f.hp < pick.hp)) pick = f; });
      if (!pick && list.length) pick = list.reduce(function (a, b) { return a.hp <= b.hp ? a : b; });
      if (pick) this.proj.push({ id: this.nid++, kind: 'arrow', x0: u.x, y0: u.y, x1: pick.x, y1: pick.y, t: 0, dur: Math.max(0.25, Math.abs(pick.x - u.x) / 520), side: u.side,
        owner: { type: u.type, atk: u.atk * S.mult, magic: false }, tgt: pick.id, tgtS: 0, base: false, splash: 0, boss: false });
    } else if (u.type === 'fighter') {                               // raise the shield: arrows and stones bounce off for 2 s
      this.raised.push({ x: u.x, side: u.side, t: S.dur, r: S.radius });
    } else if (u.type === 'assassin') {                              // dive through the front line
      var x0 = u.x; u.x += u.dir * S.dist;
      this.foes(u).forEach(function (f) { if (Math.abs(f.x - x0) <= S.dist + 20 && (f.x - x0) * u.dir >= -20 && self.canMove(u, f)) self.hurt(f, dmgFrom(u.atk * S.mult, { type: u.type }, f), u); });
      this.emit({ k: 'slash', x: u.x, y: u.y, side: u.side, type: 'assassin' });
    } else if (u.type === 'tank') {                                  // stomp: enemies near it crawl
      this.skillFoes(u, S.radius).forEach(function (f) { f.slow = Math.max(f.slow || 0, S.slow); });
      this.emit({ k: 'quake', x: u.x, y: u.y, r: S.radius, side: u.side });
    } else if (u.type === 'mage') {                                  // fireball on the nearest group ahead
      list = this.skillFoes(u, S.dist); if (!list.length) return;
      o = list.reduce(function (a, b) { return Math.abs(a.x - u.x) <= Math.abs(b.x - u.x) ? a : b; });
      var cx = o.x; this.foes(u).forEach(function (f) { if (self.canMove(u, f) && Math.abs(f.x - cx) <= S.radius) self.hurt(f, dmgFrom(u.atk * S.mult, { type: u.type, magic: true }, f), u); });
      this.emit({ k: 'boom', x: cx, y: 0, r: S.radius, kind: 'bolt' });
    } else if (u.type === 'catapult') {                              // three stones at three enemies
      list = this.skillFoes(u, S.reach).sort(function (a, b) { return Math.abs(a.x - u.x) - Math.abs(b.x - u.x); }).slice(0, S.count);
      list.forEach(function (f) { self.hurt(f, dmgFrom(u.atk * S.mult, { type: u.type }, f), u); self.emit({ k: 'boom', x: f.x, y: f.y, r: 40, kind: 'stone' }); });
    } else if (u.type === 'monk') {                                  // bless: allies nearby heal
      this.units.forEach(function (a) { if (a.side === u.side && !a.dead && a.state !== 'dying' && Math.abs(a.x - u.x) <= S.radius) a.hp = Math.min(a.max, a.hp + S.heal * a.max); });
      this.emit({ k: 'heal', x: u.x, y: u.y });
    } else if (u.type === 'shield') {                                // bulwark: a stronger ring for a while
      u.bulwark = S.dur;
    }
  };
  P.woundedNear = function (u, r) {
    for (var i = 0; i < this.units.length; i++) { var a = this.units[i]; if (a.side === u.side && !a.dead && a.state !== 'dying' && a.hp < a.max * 0.6 && Math.abs(a.x - u.x) <= r) return true; }
    return false;
  };
  // ---- the blob: splits into ten bits, five kills reform it; only one blob at a time ----------------------------
  // ---- book 2: buildings, resources and unit queues ---------------------------------------------------------------
  P.terrainAt = function (x) { for (var i = 0; i < this.terrain.length; i++) { var z = this.terrain[i]; if (x >= z.x0 && x <= z.x1) return z.kind; } return null; };
  P.missileMul = function (x) { var k = this.terrainAt(x); return k === 'trees' ? 0.5 : k === 'marsh' ? 0.85 : 1; };
  P.b2Place = function (slot, plot) {
    var key = this.tray[slot], B = F.B2_BUILDINGS[key];
    if (this.book !== 2 || !B) return 'none';
    if (this.plotUse[plot] || plot < 0 || plot >= this.plotX.length) return 'blocked';
    if (this.coins < B.cost) return 'poor';
    if (this.res.wood < B.wood || this.res.runes < B.runes) return 'poor';
    this.coins -= B.cost; this.res.wood -= B.wood; this.res.runes -= B.runes; this.spent += B.cost;
    var b = { id: this.nid++, type: key, plot: plot, x: this.plotX[plot], level: 1, queue: [], kind: B.kind };
    this.buildings.push(b); this.plotUse[plot] = b.id;
    this.tray[slot] = this.b2Shop(slot);
    this.emit({ k: 'place', id: b.id });
    return 'ok';
  };
  P.b2Shop = function (slot) { var bs = F.b2Buildings(this.cfg.ch); return bs[Math.floor(this.rnd() * bs.length)]; };
  P.b2Train = function (bid, unit) {
    var b = this.buildings.filter(function (x) { return x.id === bid; })[0];
    if (!b || b.kind !== 'unit') return 'none';
    if (F.B2_BUILDINGS[b.type].units.indexOf(unit) < 0 || F.b2Unlocked(this.cfg.ch).indexOf(unit) < 0) return 'locked';
    if (b.queue.length >= 3) return 'full';
    var cost = F.UNITS[unit].cost;
    if (this.res.food < cost) return 'food';
    this.res.food -= cost;
    b.queue.push({ type: unit, left: F.b2UnitTime(unit) / (1 + 0.25 * (b.level - 1)), total: F.b2UnitTime(unit) / (1 + 0.25 * (b.level - 1)) });
    return 'ok';
  };
  P.b2Upgrade = function (bid) {
    var b = this.buildings.filter(function (x) { return x.id === bid; })[0];
    if (!b || b.level >= 3) return 'none';
    var gold = 60 * b.level, wood = 20 * b.level;
    if (this.coins < gold || this.res.wood < wood) return 'poor';
    this.coins -= gold; this.res.wood -= wood; this.spent += gold; b.level++;
    return 'ok';
  };
  P.b2Tick = function (dt) {
    var i, b, B;
    for (i = 0; i < this.buildings.length; i++) {
      b = this.buildings[i]; B = F.B2_BUILDINGS[b.type];
      if (B.kind === 'res') {
        var made = B.rate * (1 + 0.5 * (b.level - 1)) * dt;
        if (B.makes === 'gold') this.coins += made; else this.res[B.makes] += made;
        this.earned += B.makes === 'gold' ? made : 0;
      } else if (b.queue.length) {
        var q = b.queue[0]; q.left -= dt;
        if (q.left <= 0) {
          var ally = 0; for (var k = 0; k < this.units.length; k++) if (this.units[k].side === 'ally' && !this.units[k].dead) ally++;
          if (ally >= this.maxArmy || this.typeCount(q.type, 'ally') >= F.UNIT_CAP(q.type)) { q.left = 0; continue; }   // stalls until there is room
          b.queue.shift();
          var u = this.makeUnit('ally', q.type, 1, b.x + (this.rnd() - 0.5) * 24, false); u.bid = b.id;
          this.emit({ k: 'pop', gear: b.id, c: 0, r: 0, unit: u.id, type: q.type, level: 1 });
        }
      }
    }
  };
  // Book 2 level: how far the next unit is along in a building's queue (for the countdown)
  P.b2Countdown = function (bid) {
    var b = this.buildings.filter(function (x) { return x.id === bid; })[0];
    return b && b.queue.length ? b.queue.map(function (q) { return { type: q.type, left: Math.max(0, q.left), total: q.total }; }) : [];
  };
  P.terrainLabel = function (x) { return this.terrainAt(x); };

  // The crown gear picks the next champion from all of them, most often the most valuable (by its power); never a second blob.
  P.pickChampion = function () {
    var blob = this.blobAlive(), list = F.CHAMP_ORDER.filter(function (k) { return !(k === 'blob' && blob); });
    var w = list.map(function (k) { return F.unitPower(k); }), tot = w.reduce(function (a, b) { return a + b; }, 0), x = this.rnd() * tot;
    for (var i = 0; i < list.length; i++) { x -= w[i]; if (x <= 0) return list[i]; }
    return list[list.length - 1];
  };
  P.blobAlive = function () {
    for (var i = 0; i < this.units.length; i++) { var o = this.units[i]; if (o.side === 'ally' && (o.type === 'blob' || o.type === 'blobling') && !o.dead && o.state !== 'dying') return true; }
    return false;
  };
  P.split = function (u) {
    u.split = true; u.dead = true;
    var g = { kills: 0 };
    for (var i = 0; i < 10; i++) { var b = this.makeUnit('ally', 'blobling', 1, u.x + (i - 4.5) * 12, false); b.group = g; }
    this.emit({ k: 'split', x: u.x, y: u.y });
  };
  P.reformBlob = function (g) {
    var bits = this.units.filter(function (o) { return o.group === g && !o.dead && o.state !== 'dying'; });
    if (!bits.length) return;
    if (this.units.some(function (o) { return o.type === 'blob' && o.side === 'ally' && !o.dead && o.state !== 'dying'; })) return;   // never more than one blob
    var x = 0; bits.forEach(function (b) { x += b.x; }); x /= bits.length;
    bits.forEach(function (b) { b.dead = true; });
    var nb = this.makeUnit('ally', 'blob', 1, x, false); nb.split = true;
    g.kills = 0;
    this.emit({ k: 'reform', x: x, y: 0 });
  };
  // How far a fighter is ahead of the rearmost fighter on its side.
  P.leadGap = function (u) {
    var rear = u.x;
    for (var i = 0; i < this.units.length; i++) { var o = this.units[i]; if (o.side === u.side && !o.dead && o.state !== 'dying' && o.state !== 'fall' && o.x < rear) rear = o.x; }
    return u.x - rear;
  };
  P.raisedAt = function (x, side) {
    for (var i = 0; i < this.raised.length; i++) { var z = this.raised[i]; if (z.side === side && Math.abs(z.x - x) <= z.r) return true; }
    return false;
  };
  // Monk: turns the nearest enemy in reach (not a champion or a boss) for a while. The turned unit fights for Felix, then goes back.
  P.monkWork = function (u, dt) {
    u.convT = (u.convT || 0) - dt; if (u.convT > 0 || u.state === 'fall' || u.state === 'getup' || u.state === 'dying') return;
    var D = F.UNITS[u.type].convert, cands = [], i, o;
    for (i = 0; i < this.units.length; i++) {
      o = this.units[i];
      if (o.side !== 'enemy' || o.dead || o.state === 'dying' || o.state === 'fall' || o.champ || o.boss) continue;
      var dx = Math.abs(o.x - u.x); if (dx <= D.range) cands.push({ o: o, dx: dx });
    }
    if (!cands.length) { u.convT = 0.4; return; }          // nobody in reach yet: look again soon
    cands.sort(function (a, b) { return a.dx - b.dx; });
    var n = u.big ? 2 : 1, time = D.time * (u.big ? 1.5 : 1);     // a big monk turns two, for longer
    for (i = 0; i < Math.min(n, cands.length); i++) {
      var best = cands[i].o; best.side = 'ally'; best.dir = 1; best.converted = time; best.anim = 'walk';
      this.emit({ k: 'convert', x: best.x, y: best.y, unit: best.id });
    }
    u.convT = D.cool;
  };
  // Shield caster: is there an allied shield caster close enough to a point to take the blow?
  P.shieldAt = function (x, side) {
    for (var i = 0; i < this.units.length; i++) { var o = this.units[i], R = F.UNITS.shield.aura * (o.big ? 1.5 : 1) * (o.bulwark > 0 ? 2 : 1); if (o.side === side && o.type === 'shield' && !o.dead && o.state !== 'dying' && o.state !== 'fall' && Math.abs(o.x - x) <= R) return true; }
    return false;
  };
  // Fighters of one kind alive on that side (the cap per kind).
  P.countChampions = function (side) {
    var n = 0; for (var i = 0; i < this.units.length; i++) { var o = this.units[i]; if (o.side === side && o.champ && !o.dead && o.state !== 'dying') n++; } return n;
  };
  P.typeCount = function (type, side) {
    var n = 0; for (var i = 0; i < this.units.length; i++) { var o = this.units[i]; if (o.side === side && o.type === type && !o.dead && o.state !== 'dying') n++; } return n;
  };

  P.updateUnit = function (u, dt) {
    u.t += dt; u.cd -= dt; if (u.flash > 0) u.flash -= dt;
    if (u.converted > 0) { u.converted -= dt; if (u.converted <= 0) { u.converted = 0; u.side = 'enemy'; u.dir = -1; this.emit({ k: 'unconvert', x: u.x, y: u.y }); } }
    if (u.state === 'dying') { if (u.t > 0.75) u.dead = true; return; }
    if (u.state === 'fall') { if (u.t >= 0.55) { u.state = 'getup'; u.t = 0; this.emit({ k: 'land', x: u.x, y: u.y, side: u.side }); } return; }
    if (u.state === 'getup') { u.anim = 'getup'; if (u.t >= 0.45) { u.state = 'go'; u.t = 0; } return; }
    var D = F.UNITS[u.type];
    if (u.slow > 0) u.slow -= dt;
    var spd = u.speed * (u.slow > 0 ? 0.4 : 1);
    // book 2 terrain: marsh slows everyone, hills slow melee fighters; the terrain is remembered for missiles and the hill bonus
    var tk = this.terrain.length ? this.terrainAt(u.x) : null; u.terr = tk;
    if (tk === 'marsh') spd *= 0.6; else if (tk === 'hills' && D.kind === 'melee') spd *= 0.85;
    if (D.power === 'rally') this.rally(u, dt);
    if (D.power === 'heal') { u.healT -= dt; if (u.healT <= 0) { u.healT = 2.2; this.healAround(u); } }
    if (D.power === 'pierce') this.cartHit(u, dt);
    if (D.convert && u.side === 'ally') this.monkWork(u, dt);
    if (u.bulwark > 0) u.bulwark -= dt;
    if (u.raiseCD > 0) u.raiseCD -= dt;
    if (u.champ && u.hp < u.max) u.hp = Math.min(u.max, u.hp + F.CHAMP_REGEN * u.max * dt);
    if (D.power === 'split' && !u.split) this.split(u);
    if (u.level >= 3 && u.side === 'ally' && !u.skillUsed && F.SKILLS[u.type]) {
      var SK = F.SKILLS[u.type];
      var ready = u.type === 'monk' ? this.woundedNear(u, SK.radius) : this.skillFoes(u, SK.trigger).length;   // a monk blesses a hurt ally: its conversion would take the enemies
      if (ready) { u.skillUsed = true; this.useSkill(u, SK); }
    }
    if (u.anim === 'attack') {
      u.at += dt;
      var wind = Math.min(0.5, u.cdMax * 0.45) * 0.7;
      if (!u.hitDone && u.at >= wind) { u.hitDone = true; this.fire(u); }
      if (u.at >= Math.min(0.55, u.cdMax * 0.5)) { u.anim = 'idle'; }
      return;
    }
    var target = D.power === 'pierce' ? null : this.pickTarget(u), dir = u.dir, dist;
    var st = target ? null : this.pickStruct(u);
    // positioning: level 5 heals slowly out of battle; level 4 falls back to shelter when badly hurt under attack; level 2 waits for its group
    var near = this.foes(u).some(function (o) { return Math.abs(o.x - u.x) <= 300; });
    if (u.side === 'ally') {
      if (near) u.outT = 0; else u.outT = (u.outT || 0) + dt;
      if (u.level >= 5 && u.outT > 3 && u.hp < u.max) u.hp = Math.min(u.max, u.hp + 0.03 * u.max * dt);
      if (u.level >= 4) {
        if (near && u.hp < 0.4 * u.max) u.retreat = true;
        else if (u.retreat && (!near || u.hp >= 0.8 * u.max)) u.retreat = false;
      }
    }
    if (u.retreat && u.x > 110 && !(target && Math.abs(target.x - u.x) <= u.range)) {
      u.x -= dir * spd * dt; u.anim = 'walk';                     // fall back toward the castle and the other fighters
    } else if (target || st) {
      dist = st ? Math.abs(st.x - u.x) : Math.abs(target.x - u.x);
      if (!st && dist > u.range) {
        u.x += dir * spd * dt; u.anim = 'walk';
      } else if (u.cd <= 0) {
        u.anim = 'attack'; u.at = 0; u.hitDone = false; u.tgt = st ? 0 : target.id; u.tgtS = st ? st.id : 0; u.cd = u.cdMax;
      } else u.anim = 'idle';
      u.facing = Math.sign((st ? st.x : target.x) - u.x) || u.dir;
    } else {
      if (this.tooClose(u)) { u.x -= dir * spd * 0.6 * dt; u.anim = 'walk'; }
      else if (u.side === 'ally' && u.x >= this.ebx + 50) u.anim = 'idle';
      else if (u.side === 'ally' && u.level >= 2 && this.leadGap(u) > 260) u.anim = 'idle';   // too far ahead: wait for the others
      else { u.x += dir * spd * dt; u.anim = 'walk'; }
    }
    if (u.side === 'enemy' && u.x <= F.BASE_X) {         // got through: one life
      var cost = u.boss ? 5 : 1; this.lives -= cost; this.leaks += cost; u.dead = true;
      this.emit({ k: 'leak', x: u.x, n: cost, boss: u.boss });
      if (this.lives <= 0) { this.lives = 0; this.status = 'lost'; this.emit({ k: 'end', win: false }); }
    }
    if (u.x < 40) u.x = 40; if (u.x > this.world - 20) u.x = this.world - 20;
  };

  // ---- champion powers --------------------------------------------------------------------------------------------
  P.allies = function (u) { var s = u.side; return this.units.filter(function (o) { return o.side === s && !o.dead && o.state !== 'dying' && o.state !== 'fall'; }); };
  P.rally = function (u, dt) {           // King: heals fighters near him
    var al = this.allies(u);
    for (var i = 0; i < al.length; i++) if (Math.abs(al[i].x - u.x) < 320 && al[i].hp < al[i].max) al[i].hp = Math.min(al[i].max, al[i].hp + 4 * dt * (al[i].champ ? 0.5 : 1));
  };
  P.rallyMult = function (u) {           // a King near an attacker gives +30% attack
    var al = this.allies(u);
    for (var i = 0; i < al.length; i++) if (al[i].type === 'king' && Math.abs(al[i].x - u.x) < 320) return 1.3;
    return 1;
  };
  P.healAround = function (u) {          // Unicorn: a rainbow that heals everyone near it
    var al = this.allies(u), n = 0;
    for (var i = 0; i < al.length; i++) if (Math.abs(al[i].x - u.x) < 360 && al[i].hp < al[i].max) { al[i].hp = Math.min(al[i].max, al[i].hp + al[i].max * 0.07); n++; }
    if (n) this.emit({ k: 'heal', x: u.x, y: u.y, r: 360 });
  };
  P.cartHit = function (u, dt) {         // Felix the Cart: everything it rolls over is hurt and knocked back
    u.hitT = (u.hitT || 0) - dt; if (u.hitT > 0) return; u.hitT = 0.45;
    var foes = this.foes(u), D = F.UNITS[u.type];
    for (var i = 0; i < foes.length; i++) if (Math.abs(foes[i].x - u.x) < 60 * (u.scale / 1.6)) {
      this.hurt(foes[i], dmgFrom(u.atk, { type: u.type }, foes[i]), u); foes[i].x += u.dir * 26; foes[i].slow = Math.max(foes[i].slow, 0.8);
      this.emit({ k: 'slash', x: foes[i].x, y: foes[i].y, side: u.side, type: 'cart' });
    }
  };
  P.breath = function (u, power, S2) {   // Dragon: fire on everything in front, in range
    var foes = this.foes(u), n = 0;
    for (var i = 0; i < foes.length; i++) {
      var d = (foes[i].x - u.x) * u.dir; if (d < -30 || d > u.range) continue;
      this.hurt(foes[i], dmgFrom(power, { type: u.type }, foes[i]) * (1 - 0.4 * d / u.range), u); n++;
    }
    for (var j = 0; j < this.structs.length; j++) { var s = this.structs[j]; if (s.side !== u.side && s.alive && s.targetable && (s.x - u.x) * u.dir > -30 && Math.abs(s.x - u.x) <= u.range + 30) this.hurtStruct(s, power * 1.5); }
    this.emit({ k: 'breath', x: u.x, y: u.y, dir: u.dir, range: u.range, side: u.side });
  };
  P.quake = function (u, power) {        // Golem: a stomp that hurts and slows all near it
    var foes = this.foes(u);
    for (var i = 0; i < foes.length; i++) if (Math.abs(foes[i].x - u.x) < 130) { this.hurt(foes[i], dmgFrom(power * 0.6, { type: u.type }, foes[i]), u); foes[i].slow = 2.4; }
    this.emit({ k: 'quake', x: u.x, y: u.y, r: 130 });
  };

  // the moment of a hit or a shot
  P.fire = function (u) {
    var D = F.UNITS[u.type], t = null, i;
    if (u.tgt > 0) for (i = 0; i < this.units.length; i++) if (this.units[i].id === u.tgt) t = this.units[i];
    var S2 = u.tgtS ? this.structById(u.tgtS) : null;
    if (!t && !S2) return;
    if (t && (t.dead || t.state === 'dying')) return;
    if (S2 && !S2.alive) return;
    var power = u.atk * (D.charge && !u.charged ? D.charge : 1) * this.rallyMult(u) * (u.terr === 'hills' && D.kind === 'ranged' ? 1.2 : 1);
    if (D.charge) u.charged = true;
    if (D.power === 'breath') { this.breath(u, power, S2); return; }
    if (D.kind === 'ranged') {
      var tx = S2 ? S2.x : t.x, ty = S2 ? 0 : t.y;
      var dist = Math.abs(tx - u.x);
      var kind = u.type === 'archer' ? 'arrow' : (u.type === 'mage' || D.magic) ? 'bolt' : 'stone';
      var speed = kind === 'arrow' ? 520 : kind === 'bolt' ? 420 : 300;
      this.proj.push({ id: this.nid++, kind: kind, x0: u.x, y0: u.y, x1: tx, y1: ty, t: 0, dur: Math.max(0.2, dist / speed), side: u.side,
        owner: { type: u.type, atk: power, magic: !!D.magic }, tgt: t ? t.id : 0, tgtS: S2 ? S2.id : 0, base: false, splash: (D.splash || 0) * (u.boss ? 1.4 : 1), boss: u.boss });
      this.emit({ k: 'shot', kind: kind, x: u.x, y: u.y, side: u.side });
      return;
    }
    if (S2) { this.hurtStruct(S2, power * (D.siege || 1.3)); this.emit({ k: 'slash', x: S2.x, y: 0, side: u.side }); return; }
    var dm = dmgFrom(power, { type: u.type }, t);
    this.hurt(t, dm, u);
    if (D.drain) u.hp = Math.min(u.max, u.hp + dm);      // a bit drains what it hits
    this.emit({ k: 'slash', x: t.x, y: t.y, from: u.x, side: u.side, type: u.type });
    if (D.power === 'quake') this.quake(u, power);
  };
  P.hitBase = function (amount) { this.hurtStruct(this.fort, amount); };

  P.updateProj = function (p, dt) {
    p.t += dt;
    if (p.kind === 'shuriken') {
      p.x0 += 210 * dt; p.life -= dt;
      var foes = this.units.filter(function (o) { return o.side === 'enemy' && o.state !== 'dying' && o.state !== 'fall' && !o.dead; });
      for (var i = 0; i < foes.length; i++) {
        var o = foes[i];
        if (Math.abs(o.x - p.x0) < 38 * (p.scale || 1) && (!p.hit[o.id] || this.t - p.hit[o.id] > 0.6)) {
          p.hit[o.id] = this.t; this.hurt(o, p.dmg * 40 / (40 + o.def), null); this.emit({ k: 'slash', x: o.x, y: o.y, side: 'ally', type: 'shuriken' });
        }
      }
      for (var si = 0; si < this.structs.length; si++) { var ss = this.structs[si]; if (ss.side === 'enemy' && ss.alive && ss.targetable && !p.hitS[ss.id] && Math.abs(ss.x - p.x0) < 50) { p.hitS[ss.id] = true; this.hurtStruct(ss, p.dmg * 3); } }
      if (p.life <= 0 || p.x0 >= this.world - 60) p.done = true;
      return;
    }
    if (p.tgt && p.kind !== 'stone') { for (var j = 0; j < this.units.length; j++) if (this.units[j].id === p.tgt && !this.units[j].dead && this.units[j].state !== 'dying') { p.x1 = this.units[j].x; p.y1 = this.units[j].y; } }
    if (p.t < p.dur) return;
    p.done = true;
    var L = this, foes2 = p.side === 'ally' ? 'enemy' : 'ally';
    if ((p.kind === 'arrow' || p.kind === 'bolt' || p.owner.type === 'catapult') && this.raisedAt(p.x1, foes2)) { this.emit({ k: 'shielded', x: p.x1, y: p.y1 }); return; }
    if (p.splash) {
      if (p.owner.type === 'catapult' && this.shieldAt(p.x1, foes2)) { this.emit({ k: 'shielded', x: p.x1, y: p.y1 }); return; }
      this.emit({ k: 'boom', x: p.x1, y: p.y1, r: p.splash, kind: p.kind });
      var hits = this.units.filter(function (o) { return o.side === foes2 && o.state !== 'dying' && o.state !== 'fall' && !o.dead && Math.abs(o.x - p.x1) <= p.splash && !(p.kind === 'stone' && o.type === 'knight'); });
      hits.sort(function (a, b) { return Math.abs(a.x - p.x1) - Math.abs(b.x - p.x1); });
      // The nearest five take the full hit (less at the edge). Any others share half the blast, spread evenly, so a dense pack cannot all fall at once.
      var direct = hits.slice(0, F.SPLASH_MAX), rest = hits.slice(F.SPLASH_MAX);
      direct.forEach(function (o) {
        var fall = 1 - Math.abs(o.x - p.x1) / (p.splash * 1.4);
        L.hurt(o, dmgFrom(p.owner.atk, p.owner, o) * fall * L.missileMul(o.x), null);
      });
      rest.forEach(function (o) { L.hurt(o, dmgFrom(p.owner.atk * 0.5 / rest.length, p.owner, o), null); });
      this.hurtStructsAt(p.x1, p.splash, p.owner.atk * (F.UNITS[p.owner.type].siege || 1) * (p.fromStruct ? 0.5 : 1), p.side);
    } else {
      var tu = null; for (var m = 0; m < this.units.length; m++) if (this.units[m].id === p.tgt) tu = this.units[m];
      if (tu && p.kind === 'stone' && tu.type === 'knight' && !tu.dead && tu.state !== 'dying') { this.emit({ k: 'dodge', x: tu.x, y: tu.y }); }
      else if (tu && !tu.dead && tu.state !== 'dying') this.hurt(tu, dmgFrom(p.owner.atk, p.owner, tu) * this.missileMul(tu.x), null);
      else if (p.tgtS) this.hurtStruct(this.structById(p.tgtS), p.owner.atk * (F.UNITS[p.owner.type].siege || 1));
      this.emit({ k: 'arrowhit', x: p.x1, y: p.y1, kind: p.kind });
    }
  };

  // ---- gears produce things -----------------------------------------------------------------
  // Gears fill smoothly as the heart turns: a quarter turn is one tick, and a gear gets `rate` ticks per quarter turn.
  P.fillGears = function (qt) {
    for (var i = 0; i < this.gears.length; i++) {
      var g = this.gears[i];
      if (g.rate > 0 && g.type !== 'mult') { g.charge += g.rate * qt; this.produce(g); }
    }
  };
  // A gear fed by a big multiplier needs more ticks for each unit: sqrt(gain / 2) times as many above 2x, so 8x is twice 2x, not four times.
  P.gearNeed = function (g) {
    var base = F.ticksNeeded(g.type, g.level);
    if (g.type === 'boss') {
      // the crown gear comes round faster on harder modes, and 5 turns slower for each champion beyond five, up to 100 turns
      var champs = 0; for (var ci = 0; ci < this.units.length; ci++) { var cu = this.units[ci]; if (cu.side === 'ally' && cu.champ && !cu.dead && cu.state !== 'dying') champs++; }
      var revs = Math.min(100, F.BOSS_REVS + 5 * Math.max(0, champs - 5));
      return base * (revs / F.BOSS_REVS) / F.modeRoyal(this.cfg.mode);
    }
    return g.gmax > 2 ? base * Math.sqrt(g.gmax / 2) : base;
  };
  P.produce = function (g) {
    if (!F.ticksNeeded(g.type, g.level)) return;
    var need = this.gearNeed(g);
    if (g.charge > need * 2) g.charge = need * 2;          // at most two units stored: no single big drop
    var allies = 0; for (var i = 0; i < this.units.length; i++) if (this.units[i].side === 'ally') allies++;
    var guard = 0;
    while (g.charge >= need && guard++ < 1) {
      if (F.UNITS[g.type]) {
        if (allies >= this.maxArmy || this.typeCount(g.type, 'ally') >= F.UNIT_CAP(g.type)) { g.charge = need; return; }
        var x = this.dropX(g.c) + (this.rnd() - 0.5) * 24;
        var u = this.makeUnit('ally', g.type, g.level, x, false);
        u.gc = g.c; u.gr = g.r; allies++;
        this.emit({ k: 'pop', gear: g.id, c: g.c, r: g.r, unit: u.id, type: g.type, level: g.level });
        g.charge -= need;
      } else if (g.type === 'boss') {
        if (allies >= this.maxArmy || this.countChampions('ally') >= this.maxChamps) { g.charge = need; return; }
        var ct = this.pickChampion();
        var bu = this.makeUnit('ally', ct, g.level, this.dropX(g.c), false);
        allies++;
        this.emit({ k: 'pop', gear: g.id, c: g.c, r: g.r, unit: bu.id, type: ct, level: g.level, champ: true });
        g.charge -= need;
      } else if (!this.special(g)) { g.charge = need; g.ready = true; return; }
      else { g.charge -= need; g.ready = false; }
    }
  };
  P.special = function (g) {
    var S = F.SPECIALS[g.type], sm = F.SM[g.level - 1];
    var foes = this.units.filter(function (o) { return o.side === 'enemy' && o.state !== 'dying' && o.state !== 'fall' && !o.dead; });
    if (!foes.length) return false;
    foes.sort(function (a, b) { return a.x - b.x; });
    if (g.type === 'lightning') {
      var n = Math.min(foes.length, S.strikes + g.level - 1);
      for (var i = 0; i < n; i++) {
        this.hurt(foes[i], S.dmg * sm * (foes[i].boss ? 0.6 : 1), null);
        this.emit({ k: 'bolt', x: foes[i].x, y: foes[i].y, c: g.c, r: g.r });
      }
      return true;
    }
    if (g.type === 'rocket') {
      var t = foes[0], rk = Math.min(foes.length, 1 + (g.level > 2 ? 1 : 0));
      for (var j = 0; j < rk; j++) {
        this.proj.push({ id: this.nid++, kind: 'rocket', x0: this.dropX(g.c), y0: -300, x1: foes[j].x, y1: foes[j].y, t: 0, dur: 0.7, side: 'ally',
          owner: { type: 'mage', atk: S.dmg * sm, magic: true }, tgt: 0, base: false, splash: S.splash, c: g.c, r: g.r, rocketOwner: true });
      }
      this.emit({ k: 'launch', c: g.c, r: g.r });
      return true;
    }
    if (g.type === 'shuriken') {
      this.proj.push({ id: this.nid++, kind: 'shuriken', x0: this.dropX(g.c), y0: 0, t: 0, life: 9, dmg: S.dmg * sm, hit: {}, hitS: {}, scale: 1 + (g.level - 1) * 0.25, side: 'ally' });
      this.emit({ k: 'launch', c: g.c, r: g.r });
      return true;
    }
    return false;
  };

  // ---- the main step -------------------------------------------------------------------------
  P.step = function (dt) {
    if (this.status === 'won' || this.status === 'lost') return;
    var i;
    this.t += dt;
    // the heart turns smoothly (even before the first wave, so Felix sees it work) and the gears fill as it turns
    // the heart ticks once per quarter turn: the gears get their ticks then, not continuously
    this.tickAcc += dt * 4 / this.heartPeriod;
    while (this.tickAcc >= 1) { this.tickAcc -= 1; this.ticks++; this.fillGears(1); this.emit({ k: 'tick' }); }
    if (this.book === 2) this.b2Tick(dt);
    this.heartA += (this.ticks * Math.PI / 2 - 0.35 - this.heartA) * Math.min(1, dt * 16);
    if (this.status === 'running') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0 && this.waveIdx + 1 < this.waveCount) this.launchWave();
      for (i = this.queue.length - 1; i >= 0; i--) {
        var q = this.queue[i];
        if (this.t >= q.at && this.enemiesAlive() < this.maxEnemy && (q.boss || this.typeCount(q.type, 'enemy') < F.UNIT_CAP(q.type))) {
          var e = this.makeUnit('enemy', q.type, q.level || 1, this.ebx + 20, q.boss);
          e.state = 'go'; e.anim = 'walk'; this.queue.splice(i, 1);
          this.emit({ k: 'enemy', unit: e.id, boss: q.boss });
        }
      }
    }
    if (this.status === 'running' && !this.cfg.free && this.t - this.startT >= this.fun.fade) {      // the level fades: the Horde loses heart
      if (!this.faded) { this.faded = true; this.waveTimer = Infinity; this.emit({ k: 'fade' }); }
      this.hurtStruct(this.fort, this.fort.max * 0.02 * dt);
    }
    this.updateStructs(dt);
    for (i = this.raised.length - 1; i >= 0; i--) { this.raised[i].t -= dt; if (this.raised[i].t <= 0) this.raised.splice(i, 1); }
    for (i = 0; i < this.units.length; i++) this.updateUnit(this.units[i], dt);
    for (i = 0; i < this.proj.length; i++) this.updateProj(this.proj[i], dt);
    this.units = this.units.filter(function (u) { return !u.dead; });
    this.proj = this.proj.filter(function (p) { return !p.done; });
  };
  P.update = function (dt) {
    this.acc += dt * this.speed;
    var n = 0;
    while (this.acc >= STEP && n++ < 12) { this.step(STEP); this.acc -= STEP; }
    if (n >= 12) this.acc = 0;
  };
  P.stars = function () {
    if (this.status !== 'won') return 0;
    var f = this.leaks / this.maxLives;
    return f <= 0.1 ? 3 : f <= 0.4 ? 2 : 1;
  };
  P.enemiesAlive = function () { return this.units.filter(function (u) { return u.side === 'enemy'; }).length; };
  P.alliesAlive = function () { return this.units.filter(function (u) { return u.side === 'ally'; }).length; };

  F.Sim = Sim;
})();
