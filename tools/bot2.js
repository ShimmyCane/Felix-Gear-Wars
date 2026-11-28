// The book 2 bot: places farms and unit buildings, trains the newest unit it can afford, and upgrades.
// It is a measuring stick for the book 2 rules, like tools/bot.js is for book 1. Run: node tools/bot2.js levels [runs]
'use strict';
var path = require('path'), ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'js/data.js')); require(path.join(ROOT, 'js/sim.js'));
var F = globalThis.FGW;
// Build order: one of each resource building first (the market is the only gold, so it comes early), then one of each unit building.
// Book 3 adds its three buildings. A second building of a kind comes only when every kind in the order has one.
var BUILD_ORDER = ['market', 'farm', 'barracks', 'sawmill', 'mine', 'archery', 'wizards', 'stables', 'church'];
var BOOK3_EXTRA = ['icehouse', 'foundry', 'shrine'];

function bot2(sim, rnd) {
  // place the first wanted building that is unlocked and affordable (and wait for it, so cheap ones do not jump the queue)
  var free = -1; for (var p = 0; p < sim.plotX.length; p++) if (!sim.plotUse[p]) { free = p; break; }
  if (free >= 0) {
    var have = sim.buildings.map(function (b) { return b.type; });
    var order = sim.book === 3 ? BUILD_ORDER.concat(BOOK3_EXTRA) : BUILD_ORDER;
    var kinds = order.filter(function (t) { return F.B2_BUILDINGS[t] && F.B2_BUILDINGS[t].unlock <= sim.cfg.ch; });
    var allBuilt = kinds.every(function (t) { return have.indexOf(t) >= 0; });
    for (var k = 0; k < order.length; k++) {
      var want = order[k], B = F.B2_BUILDINGS[want], n = have.filter(function (x) { return x === want; }).length;
      if (!B || B.unlock > sim.cfg.ch) continue;
      if (n >= 1 && !(allBuilt && n < 2)) continue;
      var slot = sim.tray.indexOf(want);
      if (slot < 0) { if (sim.coins >= 10 && rnd() < 0.3) sim.refreshTray(); continue; }
      if (sim.coins >= B.cost && sim.res.wood >= B.wood && sim.res.runes >= B.runes) { sim.b2Place(slot, free); return; }
      break;
    }
  }
  // train: each unit building keeps two units queued, the newest unit it can afford
  sim.buildings.forEach(function (b) {
    var B = F.B2_BUILDINGS[b.type];
    if (B.kind !== 'unit') return;
    var unlocked = F.unlockedFor(sim.cfg);
    var options = B.units.filter(function (u) { return unlocked.indexOf(u) >= 0; }).reverse();
    // train the newest unit whose four costs (food, wood, gold, runes) are all there
    for (var i = 0; i < options.length; i++) { if (b.queue.length >= 2) break; if (!sim.trainShort(options[i])) { sim.b2Train(b.id, options[i]); } }
  });
  // upgrades: resource buildings first (a level doubles their output), lowest level first, keeping a small reserve of gold
  var up = sim.buildings.filter(function (b) { return b.level < 3; });
  up.sort(function (x, y) { var rx = F.B2_BUILDINGS[x.type].kind === 'res' ? 0 : 1, ry = F.B2_BUILDINGS[y.type].kind === 'res' ? 0 : 1; return rx - ry || x.level - y.level; });
  for (var ui = 0; ui < up.length; ui++) {
    var lvl = up[ui].level;
    if (sim.coins >= 60 * lvl + 40 && sim.res.wood >= 20 * lvl + 10) { sim.b2Upgrade(up[ui].id); break; }
  }
}

// Plays one level and measures what a balance needs: the army on the board (average and peak, sampled every second),
// the units queued, the resources left in stock (average), and the share of time a unit building sat empty (idle).
function playLevel(cfg, seed) {
  var sim = new F.Sim(cfg, { noEvents: true, seed: seed }), rnd = F.rng(seed * 31 + 7);
  var m = { armySum: 0, armyPeak: 0, queueSum: 0, coinSum: 0, foodSum: 0, woodSum: 0, runesSum: 0, idleSum: 0, samples: 0, starvedSum: 0 };
  sim.start();
  for (var s = 0; s < 30 * 900 && sim.status === 'running'; s++) {
    if (s % 30 === 0) {
      bot2(sim, rnd);
      var army = sim.alliesAlive(), queued = 0, idle = 0, units = 0;
      sim.buildings.forEach(function (b) { if (b.kind === 'unit') { units++; queued += b.queue.length; if (!b.queue.length) idle++; } });
      m.armySum += army; m.armyPeak = Math.max(m.armyPeak, army); m.queueSum += queued;
      m.coinSum += sim.coins; m.foodSum += sim.res.food; m.woodSum += sim.res.wood; m.runesSum += sim.res.runes;
      m.idleSum += units ? idle / units : 0; m.samples++;
    }
    sim.step(1 / 30);
  }
  var n = Math.max(1, m.samples);
  return { status: sim.status, leaks: sim.leaks, time: sim.t, buildings: sim.buildings.length,
    army: m.armySum / n, armyPeak: m.armyPeak, queued: m.queueSum / n, coins: m.coinSum / n, food: m.foodSum / n,
    wood: m.woodSum / n, runes: m.runesSum / n, idle: m.idleSum / n };
}
module.exports = { bot2: bot2, playLevel: playLevel };

if (require.main === module) {
  // node tools/bot2.js levels [runs] [mode] [book]   table for book 2 (default) or 3
  // node tools/bot2.js json <book> <runs> <mode>     one JSON object per level, for tools/balance_report.py
  var cmd = process.argv[2] || 'levels';
  if (cmd === 'exportcosts') {
    // every unit a book can train, with its power, role and current four costs: for tools/balance_book2.py and balance_book3.py
    var eb = +(process.argv[3] || 2), units = eb === 3 ? F.b3Unlocked(10).concat(['builder', 'flanker', 'freezer', 'summoner']) : F.b2Unlocked(15);
    var out = {};
    units.forEach(function (u) { if (out[u] || !F.UNITS[u]) return; var d = F.UNITS[u]; out[u] = { power: F.unitPower(u), kind: d.kind, magic: !!d.magic, siege: !!d.siege, ability: d.power || null, cost: F.trainCost(u, eb), seconds: F.b2UnitTime(u, eb) }; });
    console.log(JSON.stringify({ book: eb, units: out }));
    process.exit(0);
  }
  if (cmd === 'json') {
    var jb = +(process.argv[3] || 2), jruns = +(process.argv[4] || 4), jmode = process.argv[5] || 'medium', rows = [];
    // optional 6th argument: a JSON file with a candidate training table for this book (see balance_book2.py)
    if (process.argv[6]) { var cand = JSON.parse(require('fs').readFileSync(process.argv[6], 'utf8')); F.TRAIN_BOOK[jb] = Object.assign({}, F.TRAIN_BOOK[jb], cand); }
    var chapters = jb === 3 ? F.B3_CHAPTERS.length : F.B2_CHAPTERS.length, per = jb === 3 ? F.B3_LV : F.B2_LV;
    var make = function (ch, lv) { return jb === 3 ? F.b3Config(ch, lv, { mode: jmode }) : F.b2Config(ch, lv, { mode: jmode }); };
    for (var jc = 1; jc <= chapters; jc++) for (var jl = 1; jl <= per; jl++) {
      var wins = 0, leaks = 0, secs = 0, blds = 0, cfg0 = make(jc, jl), acc = { army: 0, armyPeak: 0, queued: 0, coins: 0, food: 0, wood: 0, runes: 0, idle: 0 };
      for (var jk = 0; jk < jruns; jk++) { var jr = playLevel(make(jc, jl), 100 + jk); if (jr.status === 'won') wins++; leaks += jr.leaks; secs += jr.time; blds += jr.buildings; Object.keys(acc).forEach(function (k) { acc[k] += jr[k]; }); }
      var row = { book: jb, ch: jc, lv: jl, boss: jl === per, mode: jmode, runs: jruns, win: wins / jruns, leaks: leaks / jruns, lives: cfg0.lives, secs: secs / jruns, buildings: blds / jruns };
      Object.keys(acc).forEach(function (k) { row[k] = acc[k] / jruns; }); rows.push(row);
    }
    console.log(JSON.stringify(rows));
    process.exit(0);
  }
  var runs = +(process.argv[3] || 2), mode = process.argv[4] || 'medium';
  console.log('Book 2 bot, ' + runs + ' runs per level, ' + mode + ' mode');
  console.log('level  win%  leaks/lives  secs  buildings');
  var total = 0, wins = 0;
  for (var ch = 1; ch <= F.B2_CHAPTERS.length; ch++) for (var lv = 1; lv <= F.B2_LV; lv++) {
    var cfg0 = F.b2Config(ch, lv, { mode: mode }), w = 0, leaks = 0, time = 0, bl = 0;
    for (var k = 0; k < runs; k++) { var r = playLevel(F.b2Config(ch, lv, { mode: mode }), 100 + k); if (r.status === 'won') w++; leaks += r.leaks; time += r.time; bl += r.buildings; }
    total += runs; wins += w;
    console.log(('b' + ch + '.' + lv + '    ').slice(0, 7) + String(Math.round(w / runs * 100)).padStart(4) + '%  ' + (leaks / runs).toFixed(1).padStart(6) + '/' + String(cfg0.lives).padEnd(4) + String(Math.round(time / runs)).padStart(5) + String(Math.round(bl / runs)).padStart(8));
  }
  console.log('overall win rate ' + Math.round(wins / total * 100) + '%');
}
