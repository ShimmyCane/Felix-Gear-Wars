// Felix Gear Wars: game data (units, gears, chapters, levels, stories). No DOM, so Node can load it for the balance tests.
(function () {
  'use strict';
  var F = globalThis.FGW = globalThis.FGW || {};
  F.version = '0.8.0';

  // ---- the world --------------------------------------------------------------------------
  F.VIEW_W = 1280;             // logical width of the screen
  F.WORLD = 2560;              // the battlefield is two screens wide
  F.BASE_X = 150;              // our wall: enemies that cross it cost a life
  F.ENEMY_BASE_X = 2400;       // the enemy fortress
  F.DROP_X0 = 130; F.DROP_SPAN = 860;   // pegboard columns map onto this stretch of ground
  F.HEART_PERIOD = 3.2;        // seconds for one turn of the heart (half the first pace; the slider scales it)
  F.BOSS_REVS = 20;            // heart turns one boss-gear turn takes (⚙️ can change it): 10 to 200 against other gears
  // difficulty knobs, used by levelConfig and enemyScale (tools/balance_sim.js sweeps them)
  F.TUNE = { base: 30, perLevel: 26, perWave: 0.5, hp: 0.09, atk: 0.055, fort: 700, fortPer: 80, short: 0.6, mid: 0.85, rLow: 0.4, rPeak: 1.1, rIdx: 1.1, gearsPerLast: 0.8 };   // rLow, rPeak: wave power against Felix's power at the start and at the fun peak; rIdx: extra pressure by the last level   // short, mid: wave size on a one-screen and a one-and-a-half-screen map
  F.MAX_UNITS = 50;            // soldiers on each side at once

  F.SM = [1, 2.2, 4.6, 9.4, 19.5, 41];   // stat multiplier per gear level (more than double per merge)
  F.SPECIALTY_BONUS = 1.25;    // a culture's starred fighter gets +25% attack and health
  F.LEVEL_SPEED = 0.92;        // each merge level needs this much of the ticks: stats x2.2 for 8% less time, about 20% better than two side by side
  F.MULTV = [1, 2, 4, 8];      // multiplier gear values
  F.MULTCAP = 8;               // a chain of multipliers never passes on more than 8x (22x used to break the screen)
  F.MULT_COST = [60, 160, 440, 1200]; // price of a multiplier by its value (four times the first version's prices)
  F.MAXLEVEL = 6;              // level 5 shows a gold star in place of the pips; level 6 adds a crown and makes a boss-sized fighter
  F.BIG_LEVEL = 6;             // from this level a fighter is boss-sized, reaches 25% further and its ability is stronger
  F.MULT_MAXLEVEL = 4;         // multipliers stop at 8x (no value for a fifth level)
  F.SPLASH_MAX = 5;            // a splash hit takes at most this many soldiers at full strength; the rest share the spread
  // Price, and sell value at half, of a gear: multipliers by their value, others by level (each merge doubles).
  F.gearValue = function (type, level) { return type === 'mult' ? F.MULT_COST[level - 1] : F.gearCost(type) * Math.pow(2, level - 1); };
  // Tray multipliers: 1X from chapter 3, 2X from chapter 4, 4X from chapter 6 (free-for-all has them all).
  F.multTiers = function (ch) { if (!ch) return [1, 2, 3]; var t = []; if (ch >= 3) t.push(1); if (ch >= 4) t.push(2); if (ch >= 6) t.push(3); return t; };
  // A tray entry is a type, or 'mult@N' for a multiplier of value N.
  F.trayParts = function (t) { var m = /^([a-z]+)@(\d)$/.exec(t || ''); return m ? { type: m[1], level: +m[2] } : { type: t, level: 1 }; };
  // Free-for-all refresh: 5 coins, plus 5 for every five gears on the pegboard.
  F.refreshCost = function (gears) { return 5 + 5 * Math.floor(gears / 5); };
  // Opponents train: the level of an enemy gear follows the fun curve (c, 0 to 1). Level 2 from the back half of the hill (c over 0.6); level 3 only at the top of it on the later levels (idx 12 and up).
  F.enemyLevel = function (c, idx) { return 1 + (c > 0.6 ? 1 : 0) + (c > 0.92 && idx >= 12 ? 1 : 0); };

  // ---- difficulty modes ---------------------------------------------------------------------
  // lives: the share of a level's lives this mode gives. press: how hard the waves are (wave power against Felix's power, times this).
  // The press numbers and per-level factors are tuned by tools/balance_tune.js against the bot (block below). Easy is the first version of the game.
  // pace: the time between waves and the length of the hill (medium and hard go slower and more deliberately). holes: extra blocked pegs.
  F.MODES = { easy: { name: 'Easy', lives: 1, pace: 1, holes: 0 }, medium: { name: 'Medium', lives: 0.9, pace: 1.25, holes: 2 }, hard: { name: 'Hard', lives: 0.75, pace: 1.5, holes: 4 } };
  F.modePace = function (mode) { return F.MODES[F.modeOf(mode)].pace; };
  var ONES = []; for (var oi = 0; oi < 24; oi++) ONES.push(1);
  // tuned:begin (written by tools/balance_tune.js apply; re-tune after changing the rules)
  F.MODE_PRESS = { easy: 0.517, medium: 1.737, hard: 2.511 };
  F.LEVEL_PRESS = {
    easy: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.92, 1, 0.92, 1, 0.716, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    medium: [1.6, 1.6, 1.379, 1.036, 1.239, 1.464, 0.778, 0.659, 0.931, 1.126, 1.6, 1.6, 1.225, 0.846, 0.716, 0.659, 1.331, 0.659, 1.464, 1.6, 1.331, 0.659, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6],
    hard: [0.606, 0.6, 0.6, 0.614, 0.6, 0.659, 0.659, 0.6, 0.716, 0.66, 0.867, 0.659, 1.24, 0.942, 0.788, 0.6, 0.667, 0.868, 1.472, 1.464, 1.347, 0.942, 0.6, 1.113, 1.6, 1.6, 1.6, 1.037, 1.6, 1.037]
  };
  // tuned:end
  // Removable pegs: tap a blocked peg to see its price, tap again to pay. Each one cleared costs more than the last.
  F.HOLE_BASE = 20; F.HOLE_GROWTH = 2;
  // Game speeds (the speed button cycles through these).
  F.SPEEDS = [0.5, 1, 2, 4, 8];
  F.RENDER_SKIP_SPEED = 4;     // at this speed and up the screen is drawn one frame every 0.1 s (the game still runs every frame)
  F.WAVE_BASE = 26;             // enemies in one wave at press 1 (harder modes allow more, see sim.js makeWave)
  F.MODE_ROYAL = { easy: 1, medium: 1.4, hard: 2 };   // how much faster the crown (royal) gear fills, by mode
  F.modeRoyal = function (m) { return F.MODE_ROYAL[F.modeOf(m)]; };
  // Book 2 has its own press numbers (the tuner sets them): 45 levels, so the lists are longer.
  var B2ONES = []; for (var b2i = 0; b2i < 45; b2i++) B2ONES.push(1);
  var B2ONES30 = []; for (var b3i = 0; b3i < 30; b3i++) B2ONES30.push(1);
  // tuned2:begin (written by tools/balance_tune.js apply; re-tune after changing the rules)
  F.B2_MODE_PRESS = { easy: 1.559, medium: 1.854, hard: 2.859 };
  F.B2_LEVEL_PRESS = {
    easy: [0.92, 0.92, 0.778, 1, 1, 1, 1, 1, 1, 0.92, 1, 0.92, 0.92, 0.92, 0.92, 1, 1, 1, 1, 1, 1, 1, 0.92, 0.846, 1, 1, 0.92, 1, 0.92, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    medium: [0.846, 0.778, 0.778, 1.331, 1.21, 1.012, 1.331, 1.331, 1.331, 0.778, 0.846, 0.931, 0.778, 0.846, 0.778, 1.21, 1.21, 1.1, 0.931, 1.012, 1, 1.113, 0.92, 0.846, 1, 1.012, 1.012, 1.1, 1.012, 0.931, 1, 1.331, 1.1, 1.1, 1.1, 1.012, 1.012, 1.1, 1.1, 1.21, 1.1, 1.21, 1.331, 1.331, 1.331],
    hard: [1.1, 1, 0.778, 1.1, 1.113, 1, 1.1, 1.1, 1.1, 0.846, 0.92, 0.92, 0.778, 0.778, 0.778, 0.92, 1, 0.92, 1.012, 0.92, 1, 1, 0.92, 0.778, 0.92, 0.846, 0.846, 1, 0.92, 0.92, 0.778, 1, 1, 1, 0.846, 0.846, 1, 1.21, 1.012, 1, 1.012, 0.92, 1.21, 1, 1]
  };
  // tuned2:end
  // tuned3:begin
  F.B3_MODE_PRESS = { easy: 1, medium: 1, hard: 1 };
  F.B3_LEVEL_PRESS = { easy: B2ONES30, medium: B2ONES30, hard: B2ONES30 };
  // tuned3:end
  F.modeOf = function (m) { return F.MODES[m] ? m : 'medium'; };
  F.modePress = function (mode, idx, book) {
    var m = F.modeOf(mode);
    if (book === 3) return F.B3_MODE_PRESS[m] * ((F.B3_LEVEL_PRESS[m] && F.B3_LEVEL_PRESS[m][idx]) || 1);
    if (book === 2) return F.B2_MODE_PRESS[m] * ((F.B2_LEVEL_PRESS[m] && F.B2_LEVEL_PRESS[m][idx]) || 1);
    return F.MODE_PRESS[m] * ((F.LEVEL_PRESS[m] && F.LEVEL_PRESS[m][idx]) || 1);
  };

  // ---- fighters ---------------------------------------------------------------------------
  // tick0 = quarter turns of the heart one gear needs for one level-1 fighter. The spearman is the reference (12). The others follow
  // their power, so every gear makes about the same amount of attack, defence and health per minute: the archer matches the spearman,
  // the fighter, assassin, knight and mage take 1.4 to 1.7 times as long, the tank 2.5 times and the catapult 3 times.
  // kind: melee | ranged. vs = damage multiplier against a type. shield = multiplier on incoming ranged damage.
  F.UNITS = {
    spearman: { name: 'Spearman', cost: 30, tick0: 12, hp: 70, atk: 10, def: 5, range: 46, speed: 46, cd: 1.0, kind: 'melee',
      vs: { knight: 2.6 }, order: 1 },
    archer:   { name: 'Archer', cost: 40, tick0: 12, hp: 40, atk: 9, def: 1, range: 330, speed: 40, cd: 1.1, kind: 'ranged',
      vs: { spearman: 1.4, fighter: 1.1, tank: 0.6, knight: 0.9 }, order: 2 },
    fighter:  { name: 'Fighter', cost: 45, tick0: 17, hp: 105, atk: 11, def: 9, range: 46, speed: 42, cd: 0.95, kind: 'melee',
      vs: { archer: 1.5, mage: 1.4, catapult: 1.3 }, shield: 0.55, order: 3 },
    assassin: { name: 'Assassin', cost: 50, tick0: 16, hp: 46, atk: 18, def: 2, range: 40, speed: 98, cd: 0.6, kind: 'melee',
      vs: { archer: 2.0, mage: 2.0, catapult: 2.0, fighter: 0.6, tank: 0.4 }, hunts: true, order: 4 },
    knight:   { name: 'Knight', cost: 65, tick0: 20, hp: 125, atk: 15, def: 10, range: 56, speed: 92, cd: 1.1, kind: 'melee',
      vs: { archer: 1.6, mage: 1.5, catapult: 1.6, assassin: 1.2, spearman: 0.8, tank: 0.6 }, charge: 3, order: 5 },
    tank:     { name: 'Tank', cost: 70, tick0: 30, hp: 290, atk: 12, def: 26, range: 50, speed: 26, cd: 1.4, kind: 'melee',
      vs: {}, order: 6 },
    mage:     { name: 'Mage', cost: 70, tick0: 18, hp: 44, atk: 22, def: 1, range: 280, speed: 36, cd: 1.7, kind: 'ranged',
      vs: { tank: 1.6, knight: 1.3 }, magic: true, splash: 70, order: 7 },
    catapult: { name: 'Catapult', cost: 90, tick0: 36, hp: 95, atk: 30, def: 6, range: 560, minRange: 170, speed: 22, cd: 3.2, kind: 'ranged',
      vs: { tank: 1.3 }, splash: 80, siege: 2.2, order: 8 },
    // tier 9 and 10. The monk walks in among the enemy and turns one of them for a while (it fights for Felix, then wanders home).
    // The shield caster's aura blocks every catapult stone that lands near it.
    monk: { name: 'Monk', cost: 90, tick0: 30, hp: 110, atk: 9, def: 6, range: 50, speed: 34, cd: 1.2, kind: 'melee', convert: { range: 240, time: 12, cool: 9 }, order: 9 },
    shield: { name: 'Shield caster', cost: 110, tick0: 36, hp: 120, atk: 8, def: 12, range: 50, speed: 30, cd: 1.3, kind: 'melee', aura: 250, order: 10 },
  };
  F.UNIT_ORDER = ['spearman', 'archer', 'fighter', 'assassin', 'knight', 'tank', 'mage', 'catapult', 'monk', 'shield'];
  // Most fighters of one kind on the field: 5 for tier 1 up to 50 for tier 10 (the order above). The free-for-all has them all.
  F.tierOf = function (type) { var i = F.UNIT_ORDER.indexOf(type); return i < 0 ? 99 : i + 1; };
  // Single-use moves, from merge level 3. They fire once, the first time an enemy they can reach comes close.
  // They do nothing to a higher-ranked enemy (a higher tier, a champion or a boss).
  F.SKILLS = {
    spearman: { name: 'Push back', trigger: 120, radius: 140, push: 200 },
    archer:   { name: 'Long shot', trigger: 600, reach: 660, mult: 3 },              // the weakest enemy archer, mage or catapult in reach
    fighter:  { name: 'Raise shield', trigger: 140, dur: 2, radius: 190 },           // allies in front block arrows and catapult stones for 2 s
    assassin: { name: 'Dive', trigger: 260, dist: 340, mult: 0.8 },                  // dives through the front line, hurting all it passes
    tank:     { name: 'Stomp', trigger: 120, radius: 170, slow: 1.5 },               // enemies near it crawl for 1.5 s
    mage:     { name: 'Fireball', trigger: 300, dist: 320, radius: 110, mult: 1.6 },  // a burst of fire on a group ahead
    catapult: { name: 'Volley', trigger: 300, reach: 560, count: 3, mult: 1.4 },      // three stones at three enemies
    monk:     { name: 'Bless', trigger: 160, radius: 240, heal: 0.4 },                // allies nearby heal 40% of their health
    shield:   { name: 'Bulwark', trigger: 160, dur: 4 },                              // its ring is twice as strong for 4 s
  };
  // The most fighters a level's army can reach: the caps of its kinds added up, never more than the overall limit.
  F.armyCap = function (pool) { var t = 0; pool.forEach(function (p) { t += F.UNIT_CAP(p); }); return Math.min(F.MAX_UNITS, t); };
  // The shop offers a gear at the highest level whose price is at most this share of the money you have (1/10; the level below is about 1/25 to 1/10), up to this level.
  F.TRAY_SHARE = 0.1; F.TRAY_MAXLEVEL = 4;
  // Free-for-all: the wave's value is this many times the value of your army at full strength (the waves climb to it over time).
  F.freeFoe = function (mode) { return { easy: 1, medium: 2, hard: 3 }[F.modeOf(mode)]; };
  F.MAX_CHAMPIONS = 8;         // champions the player can have on the map at once (a settings slider can lower it)
  F.FREE_ARMY = 25;            // the free-for-all army limit (a slider in the settings goes up to 50)
  F.UNIT_CAP = function (type) { var i = F.UNIT_ORDER.indexOf(type); return i < 0 ? F.MAX_UNITS : 5 * (i + 1); };

  // ---- champions: what a boss gear makes. Each is a different awesome unit with its own power --------------------
  F.CHAMP_HP = 2.5;             // champions have this many times the health of their stats (they are meant to last)
  F.CHAMP_REGEN = 0.01;        // champions recover this share of their health a second
  F.CHAMPS = {
    dragon:  { name: 'Dragon', hp: 420, atk: 36, def: 10, range: 300, speed: 70, cd: 2.4, kind: 'ranged', fly: true, power: 'breath', scale: 1.5, info: 'Flies and breathes fire on everything in front of it.' },
    king:    { name: 'King', hp: 620, atk: 30, def: 22, range: 56, speed: 50, cd: 1.0, kind: 'melee', power: 'rally', scale: 1.5, info: 'Rallies fighters near him: +30% attack and he heals them.' },
    cart:    { name: 'Felix the Cart', hp: 520, atk: 26, def: 28, range: 40, speed: 140, cd: 0.5, kind: 'melee', power: 'pierce', scale: 1.35, info: 'Rolls straight through the enemy and knocks them back.' },
    griffin: { name: 'Griffin', hp: 300, atk: 40, def: 6, range: 50, speed: 150, cd: 0.9, kind: 'melee', fly: true, hunts: true, charge: 1.6, scale: 1.35, power: 'dive', info: 'Flies over spears and dives on the back line.' },
    golem:   { name: 'Golem', hp: 1100, atk: 34, def: 40, range: 52, speed: 28, cd: 1.8, kind: 'melee', power: 'quake', scale: 1.9, info: 'Stomps the ground and slows every enemy near it.' },
    necromancer: { name: 'Necromancer', hp: 380, atk: 16, def: 8, range: 260, speed: 34, cd: 1.5, kind: 'ranged', magic: true, power: 'raise', scale: 1.35, info: 'Raises the fighters that fall near it to fight for Felix.' },
    blob:    { name: 'Blob', hp: 640, atk: 14, def: 16, range: 40, speed: 40, cd: 0.9, kind: 'melee', power: 'split', scale: 1.7, info: 'Splits into ten bits that latch on and drain the Horde. Five kills and the bits join into one blob again.' },
    unicorn: { name: 'Unicorn', hp: 360, atk: 20, def: 14, range: 220, speed: 70, cd: 1.4, kind: 'ranged', magic: true, power: 'heal', scale: 1.25, info: 'Heals the fighters near it with a rainbow.' },
  };
  F.CHAMP_ORDER = ['dragon', 'king', 'cart', 'griffin', 'golem', 'unicorn', 'necromancer', 'blob'];
  Object.keys(F.CHAMPS).forEach(function (k) { F.UNITS[k] = Object.assign({ cost: 0, tick0: 0, vs: {}, champ: true }, F.CHAMPS[k], { hp: F.CHAMPS[k].hp * F.CHAMP_HP }); });
  // The blob's bits: small green pieces that latch on, drain and grow. Not a fighter for the tray or the army cap.
  F.UNITS.blobling = { name: 'Blob bit', cost: 0, tick0: 0, vs: {}, hp: 45, atk: 6, def: 0, range: 30, speed: 60, cd: 0.8, kind: 'melee', drain: true, bit: true };

  // ---- how much power is a fighter? sqrt(effective health x damage per second) with range, splash and siege modifiers.
  var powerCache = {};
  F.unitPower = function (type) {
    if (powerCache[type]) return powerCache[type];
    var u = F.UNITS[type], ehp = u.hp * (1 + u.def / 40), dps = u.atk / u.cd, rm = u.kind === 'ranged' ? 1 + u.range / 600 : 1, sp = u.splash ? 1 + u.splash / 300 : 1, sg = u.siege ? 1.15 : 1;
    return (powerCache[type] = Math.sqrt(ehp * dps) * rm * sp * sg);
  };
  // ---- the fun curve: a level is a hill. Calm start, most exciting at the peak, easing off to the fade time. Minutes in, 0 to 1 out.
  F.FUN = { peak: 3, fade: 7 };
  F.funCurve = function (t, peak, fade) {
    if (t >= fade) return 0;
    if (t <= peak) { var x = Math.max(0, t / peak); return 0.25 + 0.75 * (x * x * (3 - 2 * x)); }
    var y = (t - peak) / (fade - peak); return 1 - y * y * (3 - 2 * y);
  };
  // ---- castles, fortresses and towers: the castle is worth 5 fighters on the first level and 10 on the last
  F.castleUnits = function (idx) { return 5 + 5 * Math.min(1, idx / 23); };
  // ---- gear economy: a level starts with a fixed purse, and every gear you own makes the next one dearer, so the number of gears
  // you can have at the end follows the size of the enemy's last wave.
  F.economy = function (idx) {
    var lastWave = Math.round(5 + idx);                           // opponents in the expected last wave
    var target = Math.max(4, Math.round(F.TUNE.gearsPerLast * lastWave));
    return { lastWave: lastWave, gearTarget: target, creep: 1.5 / target, coins: 45 * Math.max(3, Math.ceil(0.35 * target)) };   // the target-th gear costs 2.5 times the first
  };

  // ---- gears that are not fighters --------------------------------------------------------
  F.SPECIALS = {
    mult:      { name: 'Multiplier', cost: 60, icon: 'mult', note: 'Passes ticks on, times 1, 2, 4 or 8' },
    boss:      { name: 'Boss gear', cost: 120, icon: 'boss', note: 'Turns very slowly, then a champion steps out' },
    lightning: { name: 'Lightning', cost: 60, tick0: 20, icon: 'lightning', dmg: 30, strikes: 2 },
    rocket:    { name: 'Rockets', cost: 70, tick0: 24, icon: 'rocket', dmg: 40, splash: 95 },
    shuriken:  { name: 'Shuriken', cost: 60, tick0: 20, icon: 'shuriken', dmg: 22 },
  };
  F.gearInfo = function (type) { return F.UNITS[type] || F.SPECIALS[type]; };
  F.gearCost = function (type) { return F.gearInfo(type).cost; };
  F.ticksNeeded = function (type, level) {
    if (type === 'boss') return Math.max(1, Math.ceil(4 * F.BOSS_REVS * Math.pow(0.75, level - 1)));   // a quarter turn of the heart = 1
    var g = F.gearInfo(type); if (!g.tick0) return 0;
    return Math.max(1, Math.round(g.tick0 * Math.pow(F.LEVEL_SPEED, level - 1)));
  };
  F.bounty = function (type, boss) {
    var u = F.UNITS[type]; var b = Math.ceil(u.cost * 0.24);
    return boss ? b * 6 : b;
  };

  // ---- chapters ---------------------------------------------------------------------------
  F.CHAPTERS = [
    { n: 1, screens: 1, title: 'The Waking Heart',    fighter: 'spearman', cols: 7, rows: 3, biome: 'meadow',   boss: 'Rust Pike Lord',  special: null },
    { n: 2, screens: 1, title: 'The Whistling Wood',  fighter: 'archer',   cols: 7, rows: 3, biome: 'forest',   boss: 'The Whistle Thief', special: null },
    { n: 3, screens: 1, title: 'Brass and Shield',    fighter: 'fighter',  cols: 8, rows: 3, biome: 'hills',    boss: 'Baron Brassback', special: 'lightning' },
    { n: 4, screens: 1.5, title: 'Shadows in the Mist', fighter: 'assassin', cols: 8, rows: 3, biome: 'marsh',    boss: 'Fogblade',        special: null },
    { n: 5, screens: 1.5, title: 'The Iron Gallop',     fighter: 'knight',   cols: 8, rows: 4, biome: 'plains',   boss: 'Captain Clatter', special: 'shuriken' },
    { n: 6, screens: 2, title: 'The Mountain Wall',   fighter: 'tank',     cols: 8, rows: 4, biome: 'mountain', boss: 'The Walking Wall', special: null },
    { n: 7, screens: 2, title: 'Tower of Stars',      fighter: 'mage',     cols: 9, rows: 4, biome: 'night',    boss: 'The Ash Wizard',  special: 'rocket' },
    { n: 8, screens: 2, title: 'The Rust Throne',     fighter: 'catapult', cols: 9, rows: 4, biome: 'fortress', boss: 'The Rust King',   special: null },
    // Chapters 9 and 10 teach the two new units. Each side fights with the same two kinds: the key unit and one other (pool).
    { n: 9, screens: 2, title: 'The Silent Bell',     fighter: 'monk',   pool: ['monk', 'knight'],    cols: 8, rows: 4, biome: 'plains',   boss: 'Abbot of the Bell', special: null },
    { n: 10, screens: 2, title: 'The Bronze Shield',   fighter: 'shield', pool: ['shield', 'catapult'], cols: 9, rows: 4, biome: 'fortress', boss: 'The Bronze Bulwark', special: null },
  ];

  // Colours per place (the art style filters them). sky top, sky bottom, far hills, near hills, ground, accent.
  F.BIOMES = {
    meadow:   ['#9fd3f0', '#f6efc8', '#a8c8a0', '#7cb872', '#5fa15a', '#f2c94c'],
    forest:   ['#a8d6c4', '#e9f0cf', '#6f9f84', '#4c8466', '#3f7358', '#e8a33d'],
    hills:    ['#b9c9ee', '#f8e6c4', '#b3a6c9', '#8f9a6e', '#7a8a58', '#d9893a'],
    marsh:    ['#a9b9c4', '#dfe6d8', '#8aa095', '#6a8774', '#58765f', '#c9d36a'],
    plains:   ['#8ec6ee', '#fbeec2', '#d1c48a', '#b9b062', '#a39a4e', '#d95f3a'],
    mountain: ['#b4c7e6', '#eef0f5', '#8f9bb8', '#6f7d97', '#76806a', '#c9d3e6'],
    night:    ['#2d2f6e', '#7b6bb0', '#4a4a8c', '#37386f', '#2f3a5c', '#ffe08a'],
    fortress: ['#c97a6a', '#f4d4a6', '#8c5a52', '#6c4440', '#5a4a46', '#ff9a3c'],
  };

  // ---- stories: caption (picture tier), short (one or two sentences), story (a paragraph) ---
  F.STORIES = [
    // chapter 1
    { cap: 'The Heart wakes!', short: 'The Great Heart of Cogsworth ticks. Add a gear next to it and a spearman pops out!',
      story: 'For a hundred years the Great Heart of Cogsworth slept. This morning it gave one tiny tick. Gears began to turn, and out of the very first gear tumbled a brave spearman. The rust-red scouts of the Rust Horde saw the light from far away. Keeper, hold the road!' },
    { cap: 'Two gears, two spears', short: 'Gears side by side each make a spearman. Drop one gear on another to merge them into a stronger gear.',
      story: 'The scouts came back, and this time they brought friends. Old Cogsworth wisdom says two gears side by side make two spearmen, but two gears merged into one make a stronger spearman, a little faster. Choose your way, Keeper.' },
    { cap: 'The Rust Pike Lord!', short: 'A giant rusty pike lord marches down the road. Stop him before he reaches the wall!',
      story: 'The Rust Pike Lord is three times the size of any spearman and as stubborn as old iron. He stamps down the road toward the wall, and his scarf drags in the dust. The Heart ticks faster than ever. Build, merge, and do not let him through!' },
    // chapter 2
    { cap: 'Archers in the Wood', short: 'The Whistling Wood sings to the Heart. Archers join you. They shoot far, so keep them safe.',
      story: 'Beyond the meadow lies the Whistling Wood, where the trees hum along with the Heart. Its archers have been waiting for the first tick. They shoot from far away, but they are fragile. Rust Horde assassins and knights would love to reach them.' },
    { cap: 'Arrows on the wind', short: 'Archers beat spearmen and fighters, but not tanks or knights. Mix your army.',
      story: 'The Horde brings its own bows now. Archers are fierce against spearmen and shields, but a knight at a gallop can sweep over them. A good Keeper always has a counter in the next gear.' },
    { cap: 'The Whistle Thief!', short: 'The Whistle Thief stole the forest song. Take it back from this giant thief!',
      story: 'Someone has stolen the song of the wood. The Whistle Thief, three times as tall as a common archer, hides the Horde march behind a tune that is not his own. Break his bow, return the song, and let the forest sing again.' },
    // chapter 3
    { cap: 'Brass and shields', short: 'Fighters carry big shields. Arrows bounce off them. Lightning gears are in the old tower!',
      story: 'In the Brass Hills the smiths hammered the first shields, and the first fighters marched out from behind them. Arrows bounce from their shields, and swords bite archers and mages. In an old tower you find a new kind of gear that calls down lightning.' },
    { cap: 'Zap! A lightning gear', short: 'A lightning gear does not make a fighter. It zaps enemies from the sky when it turns.',
      story: 'Lightning gears fill with sparks while they turn, then call a bolt to strike the enemies closest to your wall. They can only strike when there is someone to hit, so they wait, crackling, until the Horde appears.' },
    { cap: 'Baron Brassback!', short: 'Baron Brassback wears stolen shields. Show him who owns brass.',
      story: 'Baron Brassback has hung the stolen shields of three villages on his back. He is slow but very hard to hurt. Arrows will not help, but magic and lightning might. Keep your gears turning!' },
    // chapter 4
    { cap: 'Fog on the marsh', short: 'Fog hides the marsh road. Assassins join you. They are fast and dive on archers.',
      story: 'The marsh road is full of fog, so thick that you hear the Horde before you see it. Your new assassins slip through the mist like cats. They love to jump on archers and mages. Armour makes them think twice, though.' },
    { cap: 'Cats in the mist', short: 'Assassins hunt the back line. Heavy fighters and tanks stop them.',
      story: 'The Horde have assassins too, and they are hunting your archers. A shield or two in the front lines can save the soft ones behind. The Heart ticks, and the fog drips.' },
    { cap: 'Fogblade appears!', short: 'Fogblade is a giant shadow with two long daggers. Keep your armour in front.',
      story: 'Out of the fog steps Fogblade, three times the size of an assassin and nearly as quiet. He wants to cut the chain of gears that feeds the Heart. Hold him with armour and strike him down before he reaches your back line.' },
    // chapter 5
    { cap: 'Horses on the plain', short: 'Knights gallop fast and hit hard. Spearmen stop horses. Shuriken gears are rolling!',
      story: 'The plains are wide and flat, a good place for horses. Your knights charge with a mighty first strike, and they run down archers and mages. Spearmen are their only fear. A shuriken gear rolls its spinning blade across the field to clear the path.' },
    { cap: 'Spinning blades!', short: 'A shuriken gear rolls a huge blade along the ground. It hurts everything it touches.',
      story: 'A shuriken gear spins up, then lets go a huge blade that rolls along the ground and slices through anyone in its path. It cannot tell friend from foe, so Cogsworth has taught it to wait for the Horde to show. Use it when the lane is crowded.' },
    { cap: 'Captain Clatter!', short: 'Captain Clatter leads a rusty cavalry. Bring spears!',
      story: 'You hear him before you see him: clang, clatter, clang. Captain Clatter rides a horse three times the size of any, and his armour is held together with string. Spears will stop him. Stack them up and hold!' },
    // chapter 6
    { cap: 'The Mountain Wall', short: 'Tanks arrive. Slow, tough and heavy. Arrows and swords barely scratch them.',
      story: 'High in the mountains lies the pass called the Wall. The tanks come from here, wrapped in heavy plate and slow as glaciers. Arrows barely scratch them and swords only chip the paint. Magic is what armour fears most.' },
    { cap: 'Armour everywhere', short: 'Mages burn through armour. Assassins and knights are poor against tanks.',
      story: 'The Horde has learned to wrap its warriors in armour too. Your knights and assassins find the plates hard to cut. A Keeper who has been paying attention knows what to do with armour: hit it with magic and lightning, or wear it down with many hands.' },
    { cap: 'The Walking Wall!', short: 'A moving wall of armour blocks the pass. Break it down!',
      story: 'The Walking Wall is a boss like no other: a tank three times the size, so heavy the ground shakes. It cannot be rushed or surprised. Be patient, build up your gears, and bring everything you have.' },
    // chapter 7
    { cap: 'The Tower of Stars', short: 'Mages join you, in the Tower of Stars. Their fire burns armour and hits many at once.',
      story: 'The Tower of Stars stands above the clouds. Its mages read the sky, and their fire spreads wide and burns right through armour. They are as fragile as paper, so keep them behind your line. Rockets, fireworks of war, are ready to light.' },
    { cap: 'Fireworks of war', short: 'Rocket gears fire bursting rockets at the front of the Horde.',
      story: 'The tower\'s old rocket gears still work. Each time they turn they fire a bursting rocket at the very front of the Horde. They love a crowd. A Keeper with rockets and mages can melt a wall of enemies from far away.' },
    { cap: 'The Ash Wizard!', short: 'The Ash Wizard wants to put out the stars. Stop the giant wizard!',
      story: 'The Ash Wizard has been blowing out the stars one at a time. He is three times the size of a mage and his fire burns hot. Strike him quickly with knights and assassins, before his big spells reach your gears.' },
    // chapter 8
    { cap: 'The Rust Throne', short: 'Catapults throw huge stones. They fire far, but not at things up close.',
      story: 'The last road leads to the Rust Throne, an old castle eaten by rust. Your catapults throw huge stones that splash across the Horde and smash gates, but they cannot fire at anything close. Keep them guarded.' },
    { cap: 'Stones and thunder', short: 'Catapults wreck groups and the enemy fortress. Guard them well.',
      story: 'Catapults are slow but terrible. One stone can flatten a whole squad, and they are very good against walls. Send your sturdy fighters out in front, and let the stones fly over their heads.' },
    { cap: 'The Rust King!', short: 'The Rust King sits on his throne of old gears. Break through and turn the last gear!',
      story: 'The Rust King was once the Great Heart\'s first keeper, until he tried to stop it ticking. Rust has taken everything but his crown. Three times your size, he marches out of his gate. Break his army, topple his fortress, and turn the very last gear.' },
    // chapter 9: the silent bell
    { cap: 'Monks walk in', short: 'Monks walk into the Horde and turn one enemy for a while. Watch for turned units!',
      story: 'At the Bell Monastery the monks walk barefoot into the Horde, each with a staff and a little brass cross. A monk who reaches an enemy can turn it, and for a little while that enemy fights for you. The Horde fight over it, and the Heart ticks on.' },
    { cap: 'Turned and turning', short: 'A turned enemy walks home after a while. Keep the Horde busy near your monks.',
      story: 'The turned knights are very confused. Some wander back to the Horde, and some are so pleased to be on your side that they charge the wrong way. Keep your monks near the front, where they can reach the enemy.' },
    { cap: 'The Abbot of the Bell!', short: 'The Abbot turns two at a time, and no one can turn him. Strike him down.',
      story: 'The Abbot of the Bell rings a huge bell, and every enemy near him is ready to turn. He can turn two at a time, but he cannot be turned himself. Hit him hard, and make your monks ring the bell back.' },
    // chapter 10: the bronze shield
    { cap: 'Shield casters guard', short: 'A shield caster guards the ground around it. Catapult stones that land there do nothing.',
      story: 'The shield casters of the Bronze Hall hold their round shields up in a ring. Any stone that falls inside the ring bounces off, so the catapults waste their shots. Place a shield caster where the stones land.' },
    { cap: 'Stones at the wall', short: 'The Horde catapults shoot at your wall. Stand a shield caster close to it.',
      story: 'The Horde bring their catapults right up to your wall. Each stone is a little bigger than the last. A shield caster standing near the wall turns every one of them into a bang on bronze. Keep the Heart ticking.' },
    { cap: 'The Bronze Bulwark!', short: 'The Bronze Bulwark has a wide ring of shield. Break his line with fighters.',
      story: 'The Bronze Bulwark is a giant shield caster with a ring wider than any other. Stones cannot touch anyone inside it. Your fighters must get in close and break the line.' },
  ];

  // ---- tiny seeded random numbers ---------------------------------------------------------
  F.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };

  F.levelIndex = function (ch, lv) { return (ch - 1) * 3 + (lv - 1); };
  // After chapter 10 the story is to be continued: endless chapters, every unit on both sides, a new fighter to learn each time.
  F.chapter = function (ch) {
    if (ch <= F.CHAPTERS.length) return F.CHAPTERS[ch - 1];
    var k = ch - F.CHAPTERS.length, biomes = ['plains', 'fortress', 'night', 'mountain', 'forest'];
    return { n: ch, screens: 2, title: 'To be continued ' + k, fighter: F.UNIT_ORDER[(k - 1) % F.UNIT_ORDER.length], pool: F.UNIT_ORDER.slice(),
      cols: 9, rows: 4, biome: biomes[k % biomes.length], boss: 'The Horde Champion', special: null, endless: true };
  };
  F.endStory = function (idx) {
    var k = idx - F.STORIES.length;
    if (k === 0) return { cap: 'To be continued...', short: 'Chapter 10 is won. The Horde is not finished. Every fighter is now on the field, on both sides.',
      story: 'The bells, the shields and the stones have all been seen. But the Horde is not finished, and neither are you. From here on, every fighter is in every battle. Keep your gears turning. To be continued...' };
    return { cap: 'Chapter ' + (k + 10) + ' — to be continued', short: 'Every fighter, both sides. Learn each one and keep going.', story: 'The fight goes on. Every fighter stands on both sides now. Hold the wall and keep the Heart ticking.' };
  };
  F.unlockedFighters = function (ch) {
    var c = F.chapter(ch), res = [];
    for (var i = 0; i < F.UNIT_ORDER.length; i++) { res.push(F.UNIT_ORDER[i]); if (F.UNIT_ORDER[i] === c.fighter) break; }
    return res;
  };
  F.unlockedSpecials = function (ch) {
    var res = ch >= 2 ? ['boss'] : [];
    for (var i = 1; i <= ch; i++) if (F.chapter(i).special) res.push(F.chapter(i).special);
    return res;
  };
  F.tierFor = function (idx, setting) {
    if (setting === '0' || setting === '1' || setting === '2') return +setting;
    return idx < 3 ? 0 : idx < 7 ? 1 : 2;
  };

  // ---- pegboard layout for a level --------------------------------------------------------
  function layout(cols, rows, idx, rnd) {
    var hc = Math.min(cols - 3, Math.max(2, 2 + Math.floor(rnd() * (cols - 4))));
    var hr = Math.floor(rnd() * rows);
    if (idx === 0) { hc = 2; hr = 1; }
    var heart = { c: hc, r: hr };
    var holes = [], dormant = [];
    var nHoles = idx < 2 ? 0 : Math.min(9, Math.floor(idx * 0.45) + 1);
    var near = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(function (d) { return (hc + d[0]) + ',' + (hr + d[1]); });
    var blockedNear = idx >= 7 ? 1 : 0;
    var guard = 0;
    while (holes.length < nHoles && guard++ < 300) {
      var c = Math.floor(rnd() * cols), r = Math.floor(rnd() * rows);
      var key = c + ',' + r;
      if (c === hc && r === hr) continue;
      if (holes.some(function (h) { return h[0] === c && h[1] === r; })) continue;
      if (near.indexOf(key) >= 0) { if (blockedNear > 0) { blockedNear--; } else continue; }
      holes.push([c, r]);
    }
    return { heart: heart, holes: holes, dormantSpots: null };
  }

  // ---- a level's full configuration -------------------------------------------------------
  function weightedPick(rnd, types) {
    var tot = 0, i; for (i = 0; i < types.length; i++) tot += types[i].w;
    var x = rnd() * tot;
    for (i = 0; i < types.length; i++) { x -= types[i].w; if (x <= 0) return types[i].t; }
    return types[types.length - 1].t;
  }
  function makeWave(rnd, k, idx, pool, opts) {
    var budget = (opts.base + opts.perLevel * idx) * (1 + opts.perWave * k) * (opts.quick ? 0.6 : 1) * (opts.len || 1);
    var types = pool.map(function (t, i) { return { t: t, w: 1 + i * 0.35 + (t === pool[pool.length - 1] ? 1.2 : 0) }; });
    var list = [], spent = 0, guard = 0;
    while (spent < budget && guard++ < 60) {
      var t = weightedPick(rnd, types);
      list.push({ type: t, boss: false });
      spent += F.UNITS[t].cost;
    }
    // spread spawns out in time, a little jittered
    var at = 0;
    list.forEach(function (s) { s.at = at; at += 0.8 + rnd() * 0.9; });
    return { spawn: list, size: list.length };
  }
  F.waveGap = function (idx) { return Math.max(18, 32 - idx * 0.5); };

  F.levelConfig = function (ch, lv, o) {
    o = o || {};
    var C = F.chapter(ch), idx = F.levelIndex(ch, lv);
    var seed = 1000 + idx * 77 + (o.seedOffset || 0);
    var rnd = F.rng(seed);
    var lay = layout(C.cols, C.rows, idx, rnd);
    // the harder modes block more pegs (drawn with the same random source, after the layout, so easy levels do not change)
    var holes = lay.holes.slice(), extra = F.MODES[F.modeOf(o.mode)].holes || 0, tries2 = 0;
    while (extra > 0 && tries2++ < 400) {
      var hc2 = Math.floor(rnd() * C.cols), hr2 = Math.floor(rnd() * C.rows);
      if (Math.abs(hc2 - lay.heart.c) + Math.abs(hr2 - lay.heart.r) < 2) continue;
      if (holes.some(function (h) { return h[0] === hc2 && h[1] === hr2; })) continue;
      holes.push([hc2, hr2]); extra--;
    }
    var pool = C.pool ? C.pool.slice() : F.unlockedFighters(ch);
    var eco = F.economy(idx);
    // dormant bonus gears, far from the heart, wake when a chain reaches them
    var dorm = [];
    var nd = idx < 3 ? 0 : Math.min(4, 1 + Math.floor((idx - 3) / 5));
    var tries = 0;
    while (dorm.length < nd && tries++ < 200) {
      var c = Math.floor(rnd() * C.cols), r = Math.floor(rnd() * C.rows);
      if (Math.abs(c - lay.heart.c) + Math.abs(r - lay.heart.r) < 3) continue;
      if (holes.some(function (h) { return h[0] === c && h[1] === r; })) continue;
      if (dorm.some(function (d) { return d.c === c && d.r === r; })) continue;
      dorm.push({ type: pool[Math.floor(rnd() * pool.length)], level: idx > 12 ? 2 : 1, c: c, r: r });
    }
    return {
      id: 'c' + ch + 'l' + lv, ch: ch, lv: lv, idx: idx, seed: seed, free: false, world: Math.round(F.VIEW_W * C.screens), towers: idx >= 9, biome: C.biome, title: C.title,
      board: { cols: C.cols, rows: C.rows, heart: lay.heart, holes: holes, dormant: dorm },
      mode: F.modeOf(o.mode), lives: Math.round((20 + 5 * ch) * F.MODES[F.modeOf(o.mode)].lives), coins: Math.round(eco.coins * (C.endless ? 1.6 : 1)), creep: eco.creep, gearTarget: eco.gearTarget, lastWave: eco.lastWave, dynamic: true, len: C.screens <= 1 ? F.TUNE.short : C.screens < 2 ? F.TUNE.mid : 1, waves: [], bossName: lv === 3 ? C.boss : null, bossType: lv === 3 ? C.fighter : null,
      baseHp: F.TUNE.fort + F.TUNE.fortPer * idx, pool: pool, specials: F.unlockedSpecials(ch), quick: !!o.quick,
      story: F.STORIES[idx] || F.endStory(idx),
    };
  };

  // Free-for-all: every fighter and gear, a 9 x 4 board, waves that never stop growing.
  F.freeConfig = function (o) {
    o = o || {};
    var idx = 20, rnd = F.rng(o.seed || (Date.now() % 100000));
    var lay = layout(9, 4, 8, rnd);
    var pool = F.UNIT_ORDER.slice();
    var eco = F.economy(idx);
    return {
      id: 'free', ch: 0, lv: 0, idx: idx, seed: 7, free: true, world: F.WORLD, towers: true, biome: 'fortress', title: 'Free-for-all',
      board: { cols: 9, rows: 4, heart: lay.heart, holes: lay.holes, dormant: [] },
      mode: F.modeOf(o.mode), lives: Math.round(60 * F.MODES[F.modeOf(o.mode)].lives), coins: Math.round(eco.coins * 1.6), creep: eco.creep, gearTarget: eco.gearTarget, lastWave: eco.lastWave, dynamic: true, len: 1, waves: [],
      bossEvery: 5, bossName: null, baseHp: 99999, pool: pool, specials: ['boss', 'lightning', 'shuriken', 'rocket'],
      quick: !!o.quick,
      story: { cap: 'Free-for-all!', short: 'Every fighter, every gear. The Horde never stops. How long can you hold?',
        story: 'No chapter, no rules, no end. Every fighter and every gear is ready, and so is the Horde. Waves keep coming and keep growing. How many can you hold back?' },
    };
  };


  // ---- book 2: the Gear Works. Buildings on plots instead of pegs, resources, and terrain. --------------------------
  // Five unit buildings make fifteen units. The unit introduced in each chapter is listed in B2_SEQ; the counts check out at
  // chapter 9 (nine units), chapter 12 (twelve) and chapter 15 (fifteen).
  // Five new units (crossbow, apprentice, battlemage, rider, healer) reuse a drawing from book 1 through `draw`.
  F.UNITS.crossbow   = { name: 'Crossbowman', cost: 55, hp: 70, atk: 20, def: 3, range: 360, speed: 36, cd: 1.6, kind: 'ranged', shield: 0.55, draw: 'archer', vs: {}, order: 0 };
  F.UNITS.apprentice = { name: 'Apprentice', cost: 45, hp: 40, atk: 12, def: 1, range: 250, speed: 40, cd: 1.3, kind: 'ranged', magic: true, splash: 50, draw: 'mage', vs: {}, order: 0 };
  F.UNITS.battlemage = { name: 'Battlemage', cost: 120, hp: 90, atk: 34, def: 4, range: 300, speed: 36, cd: 1.8, kind: 'ranged', magic: true, splash: 90, draw: 'mage', vs: {}, order: 0 };
  F.UNITS.rider      = { name: 'Rider', cost: 80, hp: 110, atk: 15, def: 6, range: 56, speed: 130, cd: 0.9, kind: 'melee', charge: 1.6, draw: 'knight', vs: {}, order: 0 };
  F.UNITS.healer     = { name: 'Healer', cost: 70, hp: 90, atk: 6, def: 4, range: 200, speed: 44, cd: 1.6, kind: 'ranged', magic: true, power: 'heal', draw: 'monk', vs: {}, order: 0 };
  F.B2_SEQ = ['spearman', 'archer', 'mage', 'knight', 'fighter', 'catapult', 'apprentice', 'rider', 'monk', 'tank', 'assassin', 'shield', 'crossbow', 'healer', 'battlemage'];
  F.B2_BUILDINGS = {
    farm:     { name: 'Farm', kind: 'res', makes: 'food', rate: 1.0, cost: 40, wood: 0, runes: 0, unlock: 1 },
    sawmill:  { name: 'Sawmill', kind: 'res', makes: 'wood', rate: 0.8, cost: 40, wood: 0, runes: 0, unlock: 1 },
    mine:     { name: 'Mine', kind: 'res', makes: 'runes', rate: 0.5, cost: 60, wood: 0, runes: 0, unlock: 2 },
    market:   { name: 'Market', kind: 'res', makes: 'gold', rate: 1.2, cost: 60, wood: 0, runes: 0, unlock: 2 },
    barracks: { name: 'Barracks', kind: 'unit', units: ['spearman', 'fighter', 'tank'], cost: 80, wood: 20, runes: 0, unlock: 1 },
    archery:  { name: 'Archery workshop', kind: 'unit', units: ['archer', 'catapult', 'crossbow'], cost: 90, wood: 30, runes: 0, unlock: 2 },
    wizards:  { name: 'Wizards tower', kind: 'unit', units: ['mage', 'apprentice', 'battlemage'], cost: 110, wood: 0, runes: 10, unlock: 3 },
    stables:  { name: 'Stables', kind: 'unit', units: ['knight', 'rider', 'assassin'], cost: 120, wood: 40, runes: 0, unlock: 4 },
    church:   { name: 'Church', kind: 'unit', units: ['monk', 'shield', 'healer'], cost: 120, wood: 0, runes: 20, unlock: 9 },
  };
  // the unit and building for each chapter: the unit introduced there, and the terrain it is fought on
  F.B2_CHAPTERS = [
    { n: 1, title: 'The Gear Works',       unit: 'spearman',   terrain: [] },
    { n: 2, title: 'Arrows in the Trees',  unit: 'archer',     terrain: [{ x0: 1100, x1: 1500, kind: 'trees' }] },
    { n: 3, title: 'The Wizards\' Marsh',  unit: 'mage',       terrain: [{ x0: 900, x1: 1400, kind: 'marsh' }] },
    { n: 4, title: 'The Iron Stables',     unit: 'knight',     terrain: [{ x0: 1200, x1: 1700, kind: 'hills' }] },
    { n: 5, title: 'Barracks in the Hills', unit: 'fighter',   terrain: [{ x0: 600, x1: 900, kind: 'trees' }, { x0: 1500, x1: 1900, kind: 'hills' }] },
    { n: 6, title: 'Siege by the Pines',   unit: 'catapult',   terrain: [{ x0: 700, x1: 1100, kind: 'marsh' }, { x0: 1600, x1: 2000, kind: 'trees' }] },
    { n: 7, title: 'Apprentices in Fog',   unit: 'apprentice', terrain: [{ x0: 500, x1: 800, kind: 'marsh' }, { x0: 1300, x1: 1800, kind: 'hills' }] },
    { n: 8, title: 'Riders on the Ridge',  unit: 'rider',      terrain: [{ x0: 1000, x1: 1500, kind: 'hills' }, { x0: 1800, x1: 2200, kind: 'trees' }] },
    { n: 9, title: 'The Bell Tower',       unit: 'monk',       terrain: [{ x0: 700, x1: 1000, kind: 'trees' }, { x0: 1400, x1: 1900, kind: 'marsh' }] },
    { n: 10, title: 'The Iron Bulwark',    unit: 'tank',       terrain: [{ x0: 800, x1: 1200, kind: 'hills' }, { x0: 1600, x1: 2000, kind: 'marsh' }] },
    { n: 11, title: 'Shadows at the Mill', unit: 'assassin',   terrain: [{ x0: 500, x1: 900, kind: 'trees' }, { x0: 1200, x1: 1700, kind: 'marsh' }] },
    { n: 12, title: 'The Bronze Shield Hall', unit: 'shield',  terrain: [{ x0: 900, x1: 1300, kind: 'hills' }, { x0: 1700, x1: 2100, kind: 'trees' }] },
    { n: 13, title: 'Crossbows at Dusk',   unit: 'crossbow',   terrain: [{ x0: 600, x1: 1000, kind: 'marsh' }, { x0: 1400, x1: 1900, kind: 'hills' }] },
    { n: 14, title: 'The Healing Ford',    unit: 'healer',     terrain: [{ x0: 800, x1: 1200, kind: 'trees' }, { x0: 1500, x1: 2000, kind: 'marsh' }] },
    { n: 15, title: 'The Battlemage Keep', unit: 'battlemage', terrain: [{ x0: 500, x1: 900, kind: 'hills' }, { x0: 1100, x1: 1600, kind: 'trees' }, { x0: 1800, x1: 2300, kind: 'marsh' }] },
  ];
  // ---- book 3's five new characters (the freezer, the summoner and its stoneguard, the builder, the flanker) ----------
  F.UNITS.freezer   = { name: 'Freezer', cost: 60, hp: 80, atk: 8, def: 4, range: 240, speed: 40, cd: 1.6, kind: 'ranged', magic: true, power: 'freeze', draw: 'mage', vs: {}, order: 0 };
  F.UNITS.summoner  = { name: 'Summoner', cost: 90, hp: 90, atk: 10, def: 3, range: 260, speed: 34, cd: 1.7, kind: 'ranged', magic: true, power: 'summon', draw: 'monk', vs: {}, order: 0 };
  F.UNITS.stoneguard = { name: 'Stoneguard', cost: 0, hp: 180, atk: 9, def: 22, range: 50, speed: 30, cd: 1.3, kind: 'melee', power: 'trap', draw: 'tank', vs: {}, order: 0, summoned: true };
  F.UNITS.builder   = { name: 'Builder', cost: 70, hp: 100, atk: 9, def: 8, range: 50, speed: 46, cd: 1.1, kind: 'melee', power: 'build', draw: 'fighter', vs: {}, order: 0 };
  F.UNITS.flanker   = { name: 'Flanker', cost: 75, hp: 70, atk: 16, def: 3, range: 50, speed: 110, cd: 0.8, kind: 'melee', power: 'flank', draw: 'assassin', vs: {}, order: 0 };
  F.B3_BUILDINGS = {
    foundry:  { name: 'Foundry', kind: 'unit', units: ['builder', 'flanker'], cost: 110, wood: 40, runes: 10, unlock: 3 },
    icehouse: { name: 'Ice house', kind: 'unit', units: ['freezer'], cost: 90, wood: 0, runes: 20, unlock: 2 },
    shrine:   { name: 'Shrine', kind: 'unit', units: ['summoner'], cost: 100, wood: 0, runes: 30, unlock: 4 },
  };
  F.B3_SPIKE = { dps: 22, life: 30, radius: 50, max: 3, every: 12 };   // the builder's spike walls

  // ---- book 3: the Lanes. Seen from above, three lanes, nine plots, and fighters that can flank into the next lane. -----
  // Ten chapters. The fifteen book 2 units arrive two or three at a time; the last chapters have them all.
  F.B3_UNITS_BY_CH = [['spearman', 'archer'], ['mage', 'freezer'], ['knight', 'summoner'], ['builder', 'fighter'], ['flanker', 'catapult'],
    ['apprentice', 'rider'], ['monk', 'tank'], ['assassin', 'shield'], ['crossbow', 'healer'], ['battlemage']];
  F.b3Unlocked = function (ch) { var res = []; for (var i = 0; i < Math.min(ch, F.B3_UNITS_BY_CH.length); i++) res = res.concat(F.B3_UNITS_BY_CH[i]); return res; };
  F.b3Buildings = function (ch) { return F.b2Buildings(ch, 3); };
  Object.keys(F.B3_BUILDINGS).forEach(function (k) { F.B2_BUILDINGS[k] = F.B3_BUILDINGS[k]; });   // one lookup for every building
  F.unlockedFor = function (cfg) { return cfg.book === 3 ? F.b3Unlocked(cfg.ch) : F.b2Unlocked(cfg.ch); };
  F.B3_CHAPTERS = [
    { n: 1, title: 'Three Roads', terrain: [] }, { n: 2, title: 'Mages on the Middle Road', terrain: [] },
    { n: 3, title: 'The Flank', terrain: [] }, { n: 4, title: 'Fog on the Lanes', terrain: [] }, { n: 5, title: 'The Bell Road', terrain: [] },
    { n: 6, title: 'Shadows and Shields', terrain: [] }, { n: 7, title: 'Crossbows in Three Lanes', terrain: [] },
    { n: 8, title: 'The Battlemage Gate', terrain: [] }, { n: 9, title: 'Every Road at Once', terrain: [] }, { n: 10, title: 'The Last Crossing', terrain: [] },
  ];
  F.b3Config = function (ch, lv, o) {
    o = o || {}; var idx = (ch - 1) * 3 + (lv - 1), C = F.B3_CHAPTERS[ch - 1];
    var pool = F.b3Unlocked(ch), gold = 180 + 15 * idx, unit = pool[pool.length - 1] || 'spearman';
    return {
      id: 'b3c' + ch + 'l' + lv, book: 3, lanes: 3, ch: ch, lv: lv, idx: idx, seed: 7000 + idx * 77, free: false, world: 2560,
      board: { cols: 3, rows: 3, heart: { c: 0, r: 0 }, holes: [], dormant: [] },
      lives: 20 + 5 * ch, coins: gold, creep: 0, gearTarget: 0, lastWave: 5 + idx, dynamic: true, len: 1, waves: [],
      bossName: lv === 3 ? 'The Lane Captain ' + ch : null, bossType: lv === 3 ? unit : null,
      baseHp: F.TUNE.fort + F.TUNE.fortPer * idx, pool: pool, specials: [], quick: !!o.quick, mode: F.modeOf(o.mode),
      terrain: C.terrain, plots: 9, res: { food: 80, wood: 50, runes: 25 },
      story: { cap: 'Book 3, chapter ' + ch + ': ' + C.title, short: 'Three lanes. Send fighters where the Horde is thinnest.', story: 'The road splits into three lanes. Your fighters can flank into the next lane to meet the enemy where it is weakest.' },
    };
  };
  F.B2_BOSS = { 3: 'The Marsh Witch', 6: 'Lord of the Pines', 9: 'The Bell Keeper', 12: 'Bronze Warden', 15: 'The Battlemage King' };
  F.B2_PLOTS = 6;              // building plots along the front of the map
  F.b2Unlocked = function (ch) { var res = []; for (var i = 0; i < ch; i++) res.push(F.B2_SEQ[i]); return res; };
  F.b2Buildings = function (ch, book) { return Object.keys(F.B2_BUILDINGS).filter(function (k) { return F.B2_BUILDINGS[k].unlock <= ch && (book === 3 || !F.B3_BUILDINGS[k]); }); };
  // Endless play for books 2 and 3: every unit of the book, the waves keep growing, the fortress cannot fall. Best wave is kept per book.
  F.b2FreeConfig = function (o) {
    o = o || {}; var c = F.b2Config(15, 3, o), pool = F.b2Unlocked(15);
    c.id = 'b2free'; c.free = true; c.ch = 15; c.lv = 0; c.idx = 44; c.bossName = null; c.bossType = null; c.bossEvery = 5;
    c.pool = pool; c.lives = 60; c.coins = 400; c.baseHp = 99999; c.res = { food: 120, wood: 80, runes: 40 }; c.plots = 6; c.terrain = [];
    c.story = { cap: 'Book 2: endless', short: 'Every Gear Works unit, every building. The Horde never stops.', story: 'No chapter now. Build the Works, train every unit and hold back the Horde for as long as you can.' };
    return c;
  };
  F.b3FreeConfig = function (o) {
    o = o || {}; var c = F.b3Config(10, 3, o), pool = F.b3Unlocked(10);
    c.id = 'b3free'; c.free = true; c.ch = 10; c.lv = 0; c.idx = 29; c.bossName = null; c.bossType = null; c.bossEvery = 5;
    c.pool = pool; c.lives = 60; c.coins = 400; c.baseHp = 99999; c.res = { food: 120, wood: 80, runes: 40 }; c.plots = 9; c.terrain = [];
    c.story = { cap: 'Book 3: endless', short: 'Three lanes, every unit, every flank. The Horde never stops.', story: 'The lanes run on forever. Flank, freeze and build, and hold the Horde as long as you can.' };
    return c;
  };
  F.b2UnitTime = function (type) { return 6 + 2 * F.tierOf(type === 'monk' ? 'monk' : type) / 4; };   // seconds to train a unit
  F.b2Config = function (ch, lv, o) {
    o = o || {}; var idx = (ch - 1) * 3 + (lv - 1), C = F.B2_CHAPTERS[ch - 1];
    var pool = F.b2Unlocked(ch), gold = 150 + 15 * idx;
    return {
      id: 'b2c' + ch + 'l' + lv, book: 2, ch: ch, lv: lv, idx: idx, seed: 5000 + idx * 77, free: false, world: 2560,
      board: { cols: 3, rows: 2, heart: { c: 0, r: 0 }, holes: [], dormant: [] },
      lives: 20 + 5 * ch, coins: gold, creep: 0, gearTarget: 0, lastWave: 5 + idx, dynamic: true, len: 1, waves: [],
      bossName: lv === 3 ? F.B2_BOSS[ch] || null : null, bossType: lv === 3 ? C.unit : null,
      baseHp: F.TUNE.fort + F.TUNE.fortPer * idx, pool: pool, specials: [], quick: !!o.quick, mode: F.modeOf(o.mode),
      terrain: C.terrain, plots: F.B2_PLOTS, res: { food: 60, wood: 40, runes: 20 },
      story: { cap: 'Chapter ' + ch + ': ' + C.title, short: Art_unit(C.unit) + ' joins the Works.', story: 'In the Gear Works, ' + C.unit + ' is the new unit. Build the buildings that make it, and keep the Horde back.' },
    };
  };
  function Art_unit(t) { return F.UNITS[t] ? F.UNITS[t].name : t; }
  F.weightedPick = weightedPick;
  F.enemyScale = function (idx) {
    return { hp: 1 + F.TUNE.hp * idx, atk: 1 + F.TUNE.atk * idx, def: 1 + 0.03 * idx };
  };
})();
