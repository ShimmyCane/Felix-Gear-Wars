// Felix Gear Wars: self-balancing difficulty. It plays levels with the bot, measures how often the bot wins, moves the press
// until the win rate is on target, then nudges each level, and finally checks the result on seeds it has not used.
//
//   node tools/balance_tune.js tune <medium|hard> [runs]   prints JSON {press, levelPress, trace} for that mode (about 20 min)
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
var Bot = require('./bot.js');

var TARGET = { easy: 0.95, medium: 0.75, hard: 0.35 };
var BAND = { easy: [0.9, 1.0], medium: [0.6, 0.85], hard: [0.2, 0.5] };     // verify: the bot's win rate must fall in these
var SAMPLE = [[1, 1], [1, 3], [2, 2], [3, 1], [4, 3], [5, 2], [6, 3], [7, 1], [8, 1], [8, 3]];   // spread over the campaign
var ALL = []; for (var i = 0; i < 24; i++) ALL.push([Math.floor(i / 3) + 1, i % 3 + 1]);

function play(mode, p, seed) {
  var cfg = F.levelConfig(p[0], p[1], { mode: mode });
  return Bot.playLevel(cfg, seed);
}
// win rate over a set of levels, `runs` seeds each
function winRate(mode, levels, runs, seedBase) {
  var w = 0, n = 0;
  levels.forEach(function (p, li) {
    for (var k = 0; k < runs; k++) { if (play(mode, p, seedBase + li * 37 + k * 7).status === 'won') w++; n++; }
  });
  return w / n;
}
function setPress(mode, press) { F.MODE_PRESS[mode] = press; }
function setLevelPress(mode, arr) { F.LEVEL_PRESS[mode] = arr.slice(); }

// ---- tune one mode ----------------------------------------------------------------------------
function tune(mode, runs) {
  var target = TARGET[mode], trace = [];
  if (!F.LEVEL_PRESS[mode] || F.LEVEL_PRESS[mode].length !== 24) setLevelPress(mode, ALL.map(function () { return 1; }));
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
  var lp = F.LEVEL_PRESS[mode].slice();
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
  var a = s.indexOf('  // tuned:begin'), b = s.indexOf('  // tuned:end');
  if (a < 0 || b < 0) throw new Error('tuned block markers not found in js/data.js');
  var cur = { easy: F.MODE_PRESS.easy, medium: F.MODE_PRESS.medium, hard: F.MODE_PRESS.hard };
  var pr = Object.assign({}, cur, press);
  var cl = {}; ['easy', 'medium', 'hard'].forEach(function (m) { cl[m] = (lp[m] || F.LEVEL_PRESS[m]).map(function (v) { return +v; }); });
  var block = '  // tuned:begin (written by tools/balance_tune.js apply; re-tune after changing the rules)\n' +
    '  F.MODE_PRESS = { easy: ' + pr.easy + ', medium: ' + pr.medium + ', hard: ' + pr.hard + ' };\n' +
    '  F.LEVEL_PRESS = {\n' +
    ['easy', 'medium', 'hard'].map(function (m) { return '    ' + m + ': [' + cl[m].join(', ') + ']'; }).join(',\n') + '\n  };\n';
  s = s.slice(0, a) + block + s.slice(b);
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
  var lvls = [1, 2, 3, 4, 5, 6, 7].map(function (c) { return F.enemyLevel(c / 10, 20); });
  check(lvls.every(function (v, i, a) { return i === 0 || v >= a[i - 1]; }) && lvls[0] === 1 && lvls[6] === 3, 'enemy levels rise along the fun curve');
  var sim1 = new F.Sim(F.levelConfig(1, 1), { noEvents: true, seed: 3 }), sim4 = new F.Sim(F.levelConfig(2, 1), { noEvents: true, seed: 3 });
  check(sim1.fort.weapons.every(function (w) { return w.kind !== 'stone'; }), 'chapter 1 castle has no stones');
  check(sim4.fort.weapons.some(function (w) { return w.kind === 'stone'; }), 'chapter 2 castle has stones');
  check(F.UNIT_CAP('spearman') === 5 && F.UNIT_CAP('shield') === 50 && F.UNIT_ORDER.length === 10, 'unit caps run 5 to 50 over ten kinds');
  check(F.SPEEDS.join() === '0.5,1,2,4,8' && F.RENDER_SKIP_SPEED === 4, 'speeds 0.5 to 8, drawn every 0.1 s from 4x');
  check(F.MODES.hard.holes > F.MODES.medium.holes && F.MODES.medium.holes > F.MODES.easy.holes, 'harder modes block more pegs');
  check(F.MODES.hard.pace > F.MODES.medium.pace && F.MODES.medium.pace >= F.MODES.easy.pace, 'harder modes go slower');
  var hs = new F.Sim(F.levelConfig(2, 2, { mode: 'hard' }), { noEvents: true, seed: 2 }), hc0 = hs.holeCost(); hs.holesCleared = 1;
  check(F.HOLE_GROWTH > 1 && hs.holeCost() > hc0, 'clearing a peg costs more each time (' + hc0 + ' then ' + hs.holeCost() + ')');
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
  if (!TARGET[arg] || arg === 'easy') { console.error('tune medium or hard'); process.exit(2); }
  console.log(JSON.stringify(tune(arg, runs)));
} else if (cmd === 'apply') {
  apply(process.argv.slice(3));
} else if (cmd === 'verify') {
  verify(+(arg || 6));
} else {
  console.log('usage: balance_tune.js tune <medium|hard> [runs] | apply <file.json>... | verify [runs]');
  process.exitCode = 2;
}
