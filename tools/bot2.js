// The book 2 bot: places farms and unit buildings, trains the newest unit it can afford, and upgrades.
// It is a measuring stick for the book 2 rules, like tools/bot.js is for book 1. Run: node tools/bot2.js levels [runs]
'use strict';
var path = require('path'), ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'js/data.js')); require(path.join(ROOT, 'js/sim.js'));
var F = globalThis.FGW;
var BUILD_ORDER = ['farm', 'barracks', 'farm', 'archery', 'sawmill', 'wizards', 'stables', 'market', 'church', 'mine'];

function bot2(sim, rnd) {
  // place a building whenever a card we want is affordable and a plot is free
  var free = -1; for (var p = 0; p < sim.plotX.length; p++) if (!sim.plotUse[p]) { free = p; break; }
  if (free >= 0) {
    var have = sim.buildings.map(function (b) { return b.type; });
    for (var k = 0; k < BUILD_ORDER.length; k++) {
      var want = BUILD_ORDER[k], B = F.B2_BUILDINGS[want];
      if (!B || B.unlock > sim.cfg.ch) continue;
      if (want === 'farm' && have.filter(function (x) { return x === 'farm'; }).length >= 2 && k > 1) continue;
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
    for (var i = 0; i < options.length; i++) { if (b.queue.length >= 2) break; if (sim.res.food >= F.UNITS[options[i]].cost) { sim.b2Train(b.id, options[i]); } }
  });
  // upgrade the farms and barracks when there is spare gold
  if (sim.coins > 350) { var u = sim.buildings.filter(function (b) { return b.level < 2 && (b.type === 'farm' || b.type === 'barracks'); })[0]; if (u) sim.b2Upgrade(u.id); }
}

function playLevel(cfg, seed) {
  var sim = new F.Sim(cfg, { noEvents: true, seed: seed }), rnd = F.rng(seed * 31 + 7);
  sim.start();
  for (var s = 0; s < 30 * 900 && sim.status === 'running'; s++) { if (s % 30 === 0) bot2(sim, rnd); sim.step(1 / 30); }
  return { status: sim.status, leaks: sim.leaks, time: sim.t, buildings: sim.buildings.length };
}
module.exports = { bot2: bot2, playLevel: playLevel };

if (require.main === module) {
  var runs = +(process.argv[3] || 2), mode = process.argv[4] || 'medium';
  console.log('Book 2 bot, ' + runs + ' runs per level, ' + mode + ' mode');
  console.log('level  win%  leaks/lives  secs  buildings');
  var total = 0, wins = 0;
  for (var ch = 1; ch <= 15; ch++) for (var lv = 1; lv <= 3; lv++) {
    var cfg0 = F.b2Config(ch, lv, { mode: mode }), w = 0, leaks = 0, time = 0, bl = 0;
    for (var k = 0; k < runs; k++) { var r = playLevel(F.b2Config(ch, lv, { mode: mode }), 100 + k); if (r.status === 'won') w++; leaks += r.leaks; time += r.time; bl += r.buildings; }
    total += runs; wins += w;
    console.log(('b' + ch + '.' + lv + '    ').slice(0, 7) + String(Math.round(w / runs * 100)).padStart(4) + '%  ' + (leaks / runs).toFixed(1).padStart(6) + '/' + String(cfg0.lives).padEnd(4) + String(Math.round(time / runs)).padStart(5) + String(Math.round(bl / runs)).padStart(8));
  }
  console.log('overall win rate ' + Math.round(wins / total * 100) + '%');
}
