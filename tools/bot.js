// The bot that plays a level, shared by tools/balance_sim.js and tools/balance_tune.js.
// It buys and merges, never moves a gear and never uses the boss gear, so it measures the rules, not a player.
'use strict';
require('../js/data.js'); require('../js/sim.js');
var F = globalThis.FGW;

// ---- a bot that plays a level -------------------------------------------------------------
function bot(sim, rnd) {
  // merge any pair that exists
  var g = sim.gears, i, j;
  outer: for (i = 0; i < g.length; i++) for (j = i + 1; j < g.length; j++) if (sim.canMerge(g[i], g[j])) {
    var keep = g[i].rate >= g[j].rate ? g[i] : g[j], other = keep === g[i] ? g[j] : g[i];      // keep the gear that is better connected to the heart
    sim.moveGear(other, keep.c, keep.r); break outer;
  }
  // buy the best affordable thing
  var order = [0, 1, 2].sort(function () { return rnd() - 0.5; });
  for (var k = 0; k < order.length; k++) {
    var slot = order[k], type = sim.tray[slot]; if (!type || type === 'boss') continue;
    if (sim.coins < sim.priceOf(type)) continue;
    var cell = bestCell(sim, type); if (!cell) return;
    sim.buy(slot, cell[0], cell[1]); return;
  }
}
function bestCell(sim, type) {
  var best = null, bs = -1;
  for (var c = 0; c < sim.cols; c++) for (var r = 0; r < sim.rows; r++) {
    if (!sim.isFree(c, r)) continue;
    var s = 0, adj = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    adj.forEach(function (d) {
      var nc = c + d[0], nr = r + d[1];
      if (sim.isHeart(nc, nr)) s += 6;
      else { var o = sim.gearAt(nc, nr); if (o) s += o.active ? 3 : 1; }
    });
    if (type === 'mult') s = s > 0 && sim.gears.length > 2 ? s : -1;
    if (s > bs) { bs = s; best = [c, r]; }
  }
  return best;
}
function playLevel(cfg, seed) {
  var sim = new F.Sim(cfg, { noEvents: true, seed: seed }), rnd = F.rng(seed * 31 + 7);
  sim.start();
  var peak = 0, army = [];
  for (var s = 0; s < 30 * 600 && sim.status === 'running'; s++) {
    if (s % 20 === 0) bot(sim, rnd);
    sim.step(1 / 30);
    if (s % 30 === 0) { var a = sim.alliesAlive(); if (a > peak) peak = a; if (s % (30 * 60) === 0) army.push(a); }
  }
  return { status: sim.status, leaks: sim.leaks, stars: sim.stars(), time: sim.t, gears: sim.gears.length, coins: sim.coins, kills: sim.kills, peak: peak, army: army };
}
module.exports = { bot: bot, playLevel: playLevel, bestCell: bestCell };
