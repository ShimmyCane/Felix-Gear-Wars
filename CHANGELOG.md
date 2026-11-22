# Felix Gear Wars: version log

Newest first. The version number is `F.version` in `js/data.js`; the balance numbers are in `research/balance.md`.

## 0.4.0

- **The shop matches your money.** Each gear is offered at the highest level (up to 4) whose price is at most a tenth of your coins, so a bigger bank does not mean a lot of merging. The tray shows the level pips.
- **Free-for-all waves climb to a real challenge.** A wave's value is a share of your army's value, climbing over 25 waves to 1x (easy), 2x (medium) or 3x (hard). The enemy army can be 1x, 2x or 3x the size of yours.
- **Free-for-all army limit.** 25 by default, with a settings slider up to 50.
- **Champions.** The crown gear now picks its champion from all of them, most often the most valuable. Beyond five champions in your army it turns 5 turns slower for each extra champion, up to 100 turns.

## 0.3.0

From the notes in the family notes table (versions 0.1.0 and 0.2.0).

- **The heart ticks.** Gears fill in whole ticks, only when the heart ticks, and the heart and gears snap a quarter turn each time (they no longer turn continuously).
- **Army size is clear.** The HUD shows the army cap for the level (the caps of its kinds added up, 5 in chapter 1), and a gear whose kind is at its cap shows `MAX n`.
- **Opponents have the same limit.** Each kind of enemy is capped like each kind of fighter (bosses and champions are exempt).
- **Re-tuned difficulty** for easy, medium and hard, since the caps and ticks change the balance.

## 0.2.0

Book 1 grows and gets harder. Changes since 0.1.0, grouped by pull request.

- **PR #1: review notes.** Multipliers join the tray by chapter (1X, 2X, 4X) and cost more. Chains cap at 8x and gears fed above 2x need more ticks per unit. Splash hits the nearest five soldiers in full and spreads the rest. Castles have archers only before chapter 2. Enemy gears train up the fun curve. Refresh costs 5 coins plus 5 per five gears. The fun curve is hidden until switched on.
- **PR #2: speed, merging, pegs, levels.** Speed steps 0.5x to 8x (drawn every 0.1 s from 4x). Auto-merge button in the top right. Blocked pegs cost more each time to clear. Level 5 (a star) and level 6 (a crown, a boss-sized fighter). Unit caps from 5 to 50 by tier. Monk and shield caster.
- **PR #3: positioning.** Level 2 fighters wait for their group. Level 4 fighters fall back when badly hurt. Level 5 fighters heal out of battle. Endless levels get more coins.
- **PR #4: champions.** The boss gear turns 20 times per boss turn (was 100). Champions have 2.5 times the health and regenerate. Necromancer raises fallen enemies. Blob splits into ten bits and reforms after five kills.
- **PR #5: book 2 plan.** `research/book2.md`. Nothing built.
- **Chapters 9 and 10.** The monk and the shield caster each get a chapter.
- **Single-use moves** from merge level 3 for every unit. Knights crash for 3x and dodge stones. Crown gears fill faster on harder modes. After chapter 10: endless chapters with every unit.
- **Difficulty.** Medium and hard are tuned against the bot (`tools/balance_tune.js`). Hard reaches the press ceiling and wins about 42% of bot games against a 35% target.

## 0.1.0

The first version: book 1 chapters 1 to 8, with the easy mode, the gear board, the fun curve and the narrated story cards.
