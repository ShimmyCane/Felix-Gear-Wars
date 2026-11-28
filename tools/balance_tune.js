// Felix Gear Wars: self-balancing difficulty. It plays levels with the bot, measures how often the bot wins, moves the press
// until the win rate is on target, then nudges each level, and finally checks the result on seeds it has not used.
//
//   node tools/balance_tune.js tune <easy|medium|hard> [runs]   prints JSON {press, levelPress, trace} for that mode (30 to 60 min)
//   node tools/balance_tune.js apply <file.json>...        writes the tuned block of js/data.js from those results
//   node tools/balance_tune.js verify [runs]                invariants and win-rate bands on fresh seeds; exits 1 on failure
//
// The bot is a measuring stick, not a player: real kids move gears and use multipliers, so they do better than the bot.
// Targets are set for the bot: easy near always wins, medium about three in four, hard about one in three.
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'js/data.js')); require(path.join(ROOT, 'js/sim.js'));
var F = globalThis.FGW;
var Bot = require('./bot.js'), Bot2 = require('./bot2.js');
// BOOK=2 tunes the book 2 levels with the book 2 bot and writes the book 2 block (tuned2) of js/data.js
var BOOK2 = process.env.BOOK === '2', BOOK3 = process.env.BOOK === '3', BOOK = BOOK2 ? 2 : BOOK3 ? 3 : 1;   // BOOK=3 tunes book 3 (tuned3 block)

var TARGET = { easy: 0.95, medium: 0.75, hard: 0.35 };
var BAND = { easy: [0.9, 1.0], medium: [0.6, 0.85], hard: [0.2, 0.5] };     // verify: the bot's win rate must fall in these
var SAMPLE = BOOK3 ? [[1, 1], [2, 2], [3, 3], [4, 4], [5, 2], [6, 1], [7, 3], [8, 2], [9, 1], [10, 5]] : BOOK2 ? [[1, 1], [2, 2], [3, 5], [4, 3], [5, 2], [6, 4], [7, 3], [8, 2], [9, 5], [10, 1], [12, 5], [15, 4]] : [[1, 1], [1, 3], [2, 2], [3, 1], [4, 3], [5, 2], [6, 3], [7, 1], [8, 1], [8, 3], [9, 2], [10, 1]];   // spread over the campaign (books 2 and 3: the boss is level 5)
// levels per chapter: book 1 has three; books 2 and 3 have F.B2_LV and F.B3_LV (boss on the last one)
var PER = BOOK2 ? F.B2_LV : BOOK3 ? F.B3_LV : 3, CHAPS = BOOK2 ? F.B2_CHAPTERS.length : BOOK3 ? F.B3_CHAPTERS.length : 10;
var ALL = []; for (var i = 0; i < CHAPS * PER; i++) ALL.push([Math.floor(i / PER) + 1, i % PER + 1]);

function play(mode, p, seed) {
  if (BOOK2) return Bot2.playLevel(F.b2Config(p[0], p[1], { mode: mode }), seed);
  if (BOOK3) return Bot2.playLevel(F.b3Config(p[0], p[1], { mode: mode }), seed);
  var cfg = F.levelConfig(p[0], p[1], { mode: mode });
  return Bot.playLevel(cfg, seed);
}
function pressStore() { return BOOK3 ? { mode: F.B3_MODE_PRESS, level: F.B3_LEVEL_PRESS } : BOOK2 ? { mode: F.B2_MODE_PRESS, level: F.B2_LEVEL_PRESS } : { mode: F.MODE_PRESS, level: F.LEVEL_PRESS }; }
// win rate over a set of levels, `runs` seeds each
function winRate(mode, levels, runs, seedBase) {
  var w = 0, n = 0;
  levels.forEach(function (p, li) {
    for (var k = 0; k < runs; k++) { if (play(mode, p, seedBase + li * 37 + k * 7).status === 'won') w++; n++; }
  });
  return w / n;
}
function setPress(mode, press) { pressStore().mode[mode] = press; }
function setLevelPress(mode, arr) { pressStore().level[mode] = arr.slice(); }

// ---- tune one mode ----------------------------------------------------------------------------
function tune(mode, runs) {
  var target = TARGET[mode], trace = [];
  if (!pressStore().level[mode] || pressStore().level[mode].length !== ALL.length) setLevelPress(mode, ALL.map(function () { return 1; }));
  // 1. find the global press by bisection on log scale: more press, fewer wins
  var lo = Math.log(0.5), hi = Math.log(8);
  for (var it = 0; it < 7; it++) {
    var mid = (lo + hi) / 2; setPress(mode, Math.exp(mid));
    var w = winRate(mode, SAMPLE, runs, 1000 + it * 97);
    trace.push({ step: 'global', press: +Math.exp(mid).toFixed(3), win: +w.toFixed(3) });
    if (w > target) lo = mid; else hi = mid;
  }
  var press = Math.exp((lo + hi) / 2); setPress(mode, press);
  // 2. nudge each level toward the target, three rounds, new seeds each round
  var lp = pressStore().level[mode].slice();
  for (var round = 0; round < 3; round++) {
    ALL.forEach(function (p, idx) {
      var w = winRate(mode, [p], runs, 5000 + round * 131 + idx * 17);
      var f = lp[idx];
      if (w > target + 0.15) f *= 1.1;            // too easy here: press harder
      else if (w < target - 0.15) f *= 0.92;      // too hard here: ease off
      lp[idx] = +Math.min(1.6, Math.max(0.6, f)).toFixed(3);
      setLevelPress(mode, lp);
      trace.push({ step: 'level', round: round, idx: idx, win: +w.toFixed(3), factor: lp[idx] });
    });
  }
  return { mode: mode, target: target, press: +press.toFixed(3), levelPress: lp, trace: trace };
}

// ---- write the tuned block into js/data.js ----------------------------------------------------
function apply(files) {
  var press = {}, lp = {};
  files.forEach(function (f) { var r = JSON.parse(fs.readFileSync(f, 'utf8')); press[r.mode] = r.press; lp[r.mode] = r.levelPress; });
  var dataPath = path.join(ROOT, 'js/data.js'), s = fs.readFileSync(dataPath, 'utf8');
  var tag = BOOK3 ? 'tuned3' : BOOK2 ? 'tuned2' : 'tuned';
  var a = s.indexOf('  // ' + tag + ':begin'), b = s.indexOf('  // ' + tag + ':end');
  if (a < 0 || b < 0) throw new Error(tag + ' block markers not found in js/data.js');
  var cur = { easy: pressStore().mode.easy, medium: pressStore().mode.medium, hard: pressStore().mode.hard };
  var pr = Object.assign({}, cur, press);
  var cl = {}; ['easy', 'medium', 'hard'].forEach(function (m) { cl[m] = (lp[m] || pressStore().level[m]).map(function (v) { return +v; }); });
  var names = BOOK3 ? ['B3_MODE_PRESS', 'B3_LEVEL_PRESS'] : BOOK2 ? ['B2_MODE_PRESS', 'B2_LEVEL_PRESS'] : ['MODE_PRESS', 'LEVEL_PRESS'];
  var block = '  // ' + tag + ':begin (written by tools/balance_tune.js apply; re-tune after changing the rules)\n' +
    '  F.' + names[0] + ' = { easy: ' + pr.easy + ', medium: ' + pr.medium + ', hard: ' + pr.hard + ' };\n' +
    '  F.' + names[1] + ' = {\n' +
    ['easy', 'medium', 'hard'].map(function (m) { return '    ' + m + ': [' + cl[m].join(', ') + ']'; }).join(',\n') + '\n  };\n  // ' + tag + ':end\n';
  s = s.slice(0, a) + block + s.slice(s.indexOf('\n', b) + 1);
  fs.writeFileSync(dataPath, s);
  console.log('wrote tuned block: MODE_PRESS ' + JSON.stringify(pr) + ' (' + Object.keys(press).join(', ') + ' updated)');
}

// ---- verify: invariants first, then win-rate bands on seeds the tuner never used ----------------
function verify(runs) {
  var fails = [], notes = [];
  function check(ok, msg) { (ok ? notes : fails).push((ok ? 'ok   ' : 'FAIL ') + msg); }
  // invariants of the rules
  check(F.MULTCAP <= 8, 'multiplier chain capped at 8x');
  check(F.refreshCost(0) === 5 && F.refreshCost(5) === 10 && F.refreshCost(9) === 10, 'refresh costs 5 plus 5 per five gears');
  check(F.trayParts('mult@2').level === 2 && F.trayParts('spearman').level === 1, 'tray parts read mult@N');
  check([1, 2].every(function (c) { return F.multTiers(c).length === 0; }) && F.multTiers(3).join() === '1' && F.multTiers(8).join() === '1,2,3', 'multipliers join the tray by chapter');
  var lvls = [0, 0.5, 0.7, 0.95].map(function (c) { return F.enemyLevel(c, 20); });
  check(lvls.join() === '1,1,2,3', 'enemy levels rise along the fun curve: level 2 above 0.6, level 3 above 0.92 (' + lvls.join(',') + ')');
  var sim1 = new F.Sim(F.levelConfig(1, 1), { noEvents: true, seed: 3 }), sim4 = new F.Sim(F.levelConfig(2, 1), { noEvents: true, seed: 3 });
  check(sim1.fort.weapons.every(function (w) { return w.kind !== 'stone'; }), 'chapter 1 castle has no stones');
  check(sim4.fort.weapons.some(function (w) { return w.kind === 'stone'; }), 'chapter 2 castle has stones');
  check(F.UNIT_CAP('spearman') === 5 && F.UNIT_CAP('shield') === 50 && F.UNIT_ORDER.length === 10, 'unit caps run 5 to 50 over ten kinds');
  check(F.SPEEDS.join() === '0.5,1,2,4,8' && F.RENDER_SKIP_SPEED === 4, 'speeds 0.5 to 8, drawn every 0.1 s from 4x');
  check(F.MODES.hard.holes > F.MODES.medium.holes && F.MODES.medium.holes > F.MODES.easy.holes, 'harder modes block more pegs');
  check(F.MODES.hard.pace > F.MODES.medium.pace && F.MODES.medium.pace >= F.MODES.easy.pace, 'harder modes go slower');
  var hs = new F.Sim(F.levelConfig(2, 2, { mode: 'hard' }), { noEvents: true, seed: 2 }), hc0 = hs.holeCost(); hs.holesCleared = 1;
  check(F.HOLE_GROWTH > 1 && hs.holeCost() > hc0, 'clearing a peg costs more each time (' + hc0 + ' then ' + hs.holeCost() + ')');
  // the heart ticks: a gear's charge changes only when the heart ticks
  var ts = new F.Sim(F.levelConfig(1, 2, { mode: 'easy' }), { noEvents: true, seed: 3 }); ts.tray = ['spearman', 'spearman', 'spearman']; ts.coins = 500; ts.buy(0, ts.heart.c + 1, ts.heart.r); ts.recompute();
  var tg = ts.gears[0], tprev = tg.charge, tlast = ts.ticks, between = 0;
  for (var ti = 0; ti < 30 * 10; ti++) { ts.step(1 / 30); if (tg.charge !== tprev) { if (ts.ticks === tlast) between++; tprev = tg.charge; } tlast = ts.ticks; }
  check(ts.ticks > 5 && between === 0, 'gears fill only when the heart ticks (' + ts.ticks + ' ticks, ' + between + ' changes between)');
  // the opponents have the same cap per kind: a wave of twenty spearmen never has more than five on the field
  var es = new F.Sim(F.levelConfig(1, 2, { mode: 'easy' }), { noEvents: true, seed: 4 }); es.start(); es.waveTimer = Infinity;
  for (var ei = 0; ei < 20; ei++) es.queue.push({ at: 0, type: 'spearman', boss: false, level: 1 });
  var epeak = 0; for (var ej = 0; ej < 30 * 6; ej++) { es.step(1 / 30); epeak = Math.max(epeak, es.typeCount('spearman', 'enemy')); }
  check(epeak <= F.UNIT_CAP('spearman') && epeak > 0, 'opponents are capped per kind too (peak ' + epeak + ' of ' + F.UNIT_CAP('spearman') + ')');
  check(F.armyCap(F.levelConfig(1, 1).pool) === 5 && F.armyCap(F.UNIT_ORDER) === F.MAX_UNITS, 'the army cap shown is the kinds added up (5 in chapter 1)');
  check(F.MODES.easy.lives >= F.MODES.medium.lives && F.MODES.medium.lives >= F.MODES.hard.lives, 'lives: easy >= medium >= hard');
  check(F.modePress('easy', 4) === F.MODE_PRESS.easy && F.MODE_PRESS.easy <= F.MODE_PRESS.medium && F.MODE_PRESS.medium <= F.MODE_PRESS.hard, 'press: easy <= medium <= hard');
  // win-rate bands on seeds the tuner did not use (base 9000+)
  var res = {};
  ['easy', 'medium', 'hard'].forEach(function (m) {
    var w = winRate(m, ALL, runs, 9000), band = BAND[m];
    res[m] = w;
    check(w >= band[0] && w <= band[1], m + ' bot wins ' + Math.round(w * 100) + '% (band ' + Math.round(band[0] * 100) + '-' + Math.round(band[1] * 100) + '%, ' + ALL.length * runs + ' games)');
  });
  check(res.easy >= res.medium && res.medium >= res.hard, 'win rates fall from easy to medium to hard');
  notes.concat(fails).forEach(function (l) { console.log(l); });
  console.log(fails.length ? '\n' + fails.length + ' check(s) failed.' : '\nall checks passed.');
  if (fails.length) process.exitCode = 1;
}

var cmd = process.argv[2], arg = process.argv[3], runs = +(process.argv[4] || 6);
if (cmd === 'tune') {
  if (!TARGET[arg]) { console.error('tune easy, medium or hard'); process.exit(2); }
  console.log(JSON.stringify(tune(arg, runs)));
} else if (cmd === 'apply') {
  apply(process.argv.slice(3));
} else if (cmd === 'verify') {
  verify(+(arg || 6));
} else {
  console.log('usage: balance_tune.js tune <medium|hard> [runs] | apply <file.json>... | verify [runs]');
  process.exitCode = 2;
}
