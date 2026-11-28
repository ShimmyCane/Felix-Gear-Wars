# Felix Gear Wars: version log

Newest first. The version number is `F.version` in `js/data.js`; the balance numbers are in `research/balance.md`.

## 0.11.0

- **Units cost four things in books 2 and 3.** Each unit takes food, wood, gold and runes to train (the table is `F.TRAIN` in `js/data.js`). Ranged units lean on wood, magic units on runes, the rest on gold. The training popup shows every cost, and a short one shows in red.
- **Six units can queue in a building** (was three). The popup shows how many are waiting.
- **Fixed: some units took 55 seconds to train.** Units added after book 1 were missing from the tier list, so they fell back to the slowest time. Every unit now has its own time.
- **Headless balance report.** `python3 tools/balance_report.py` runs the book bot on every level of books 2 and 3 and prints a line per chapter (win rate, boss win rate, leaks, and a flag when a chapter is outside the band). `--book`, `--mode`, `--runs` and `--chapters` choose what runs.
- Press numbers re-tuned for the new costs (`tools/balance_tune.js`); the bot has since changed, so book 2 is due another re-tune.
- **Each book has its own training table** (`F.TRAIN_BOOK`). `tools/balance_book2.py` and `tools/balance_book3.py` price each book from its units' power and role, play every level with the bot, and report the army, idle buildings and leftover stock per chapter. `--write` saves the table.
- **The bot builds one of each resource first, buys upgrades for resource buildings, and reports army and stock** (`node tools/bot2.js json`).

## 0.10.0

- **Books 2 and 3 have five levels per chapter.** The boss is on level 5. Beating a level opens the next one, as before.
- **More plots.** Book 2 has twelve plots (a 6 by 2 grid): enough for the five unit buildings, the four resource buildings and three spare. Book 3 has fifteen (five per lane): enough for its eight unit buildings, four resource buildings and three spare.
- **Kills pay more at higher levels** (books 2 and 3). A level-2 kill pays 1.5 times, level 6 pays 3.5 times.
- **Base gold trickle** (books 2 and 3). One coin every eight seconds, even between waves. A new slider in the settings (log scale, half a second to one minute) sets the time, for testing.
- **Five level buttons fit on a phone.** The fifth (boss) button of each book 2 and 3 chapter ran off the card.
- **Notes name the book 2 and 3 chapters** (they read "undefined" before).
- Book 2 and 3 press numbers re-tuned for five levels (`tools/balance_tune.js`, `BOOK=2` or `BOOK=3`).

## 0.9.1

- **Books 2 and 3 are easy to find.** The settings open with a Levels and books panel: Book 2 and Book 3 buttons jump straight to their levels. The map has Book 1, 2 and 3 tabs at the top. A Preview switch (on by default) opens every level of books 2 and 3; Locked makes them wait for the book before.
- **The coin cheat grows with prices.** It adds about the price of one new gear or building (at least 25) instead of a flat 25.
- Script files carry the version in their address, so a browser cannot keep an old copy.

## 0.9.0

- **Book 3 is map first.** The battlefield fills the screen. Building is behind a Build button. Tap a unit to select it, then choose Move (tap the map; the lane follows the tap), Attach (tap a friendly unit to follow and fight beside it), Hide (retreat behind the castle, where enemies cannot target the unit) or Clear. Units without orders fight on their own.
- Book 3 press values re-tuned for the five new characters.

## 0.8.0

- **Book 3 introduces five new characters:** the freezer (slows the nearest three enemies in its lanes every five seconds; from level three it chooses the most dangerous), the summoner (summons a stoneguard every ten seconds, two at a time), the stoneguard (a defensive creature that keeps summoning after its summoner falls; at level four or more it traps the enemies near it when it falls), the builder (places spike walls ahead in its lane), and the flanker (flanks again after 1.5 seconds). Three new buildings: foundry, ice house, shrine.
- **Endless play for each book.** Book 2 and book 3 have an endless mode with every unit of the book. The best wave is kept per book.

## 0.7.0

- **Book 2: The Gear Works.** Fifteen chapters, one new unit each (nine units by chapter 9, twelve by chapter 12, fifteen by 15). Five unit buildings (barracks, archery workshop, wizards tower, stables, church) train up to three units each from food over a timer. Resource buildings (farm, sawmill, mine, market) upgrade to level 3. No pegboard: buildings go on six plots. Terrain per chapter: trees halve missile damage, marsh slows, hills slow melee and boost ranged damage. Opens after book 1 chapter 10.
- **Book 3: The Lanes.** Ten chapters seen from above, in three lanes. Nine plots, one per lane slot. Fighters can flank into the next lane (6 second cooldown). Opens after book 2 chapter 15.
- Book 2 and 3 have their own press numbers (`tools/balance_tune.js` with `BOOK=2` or `BOOK=3`), and `tools/bot2.js` plays them.

## 0.6.0

- **At most eight champions on the map** for the player. The crown gear waits while you have eight.
- **Settings slider** for the champion limit (1 to 8, default 8).

## 0.5.0

- **Multipliers cost four times as much.** The 1X, 2X, 4X and 8X prices are now 60, 160, 440 and 1,200 (were 15, 40, 110 and 300).
- **4X and 8X are a tenth as strong down the chain.** Every gear after a 4X or 8X runs 1.3 times faster (or 1.7 times for 8X), not 4 or 8 times.
- **1X and 2X only reach their neighbours.** A 2X doubles the gears right next to it, and does not pass the boost on. A 1X has no effect (its value is 1).
- **Loops no longer compound.** Boosts flow outward from the heart, so a loop of gears around a multiplier counts its boost once.

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
