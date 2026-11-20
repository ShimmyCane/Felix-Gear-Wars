# Book 2: plan (draft, not built)

Unlocked after chapter 10 of book 1. Same rhythm as book 1: chapters of three levels, one new unit per chapter, a boss on level 3. Book 2 adds **resources and buildings** and **terrain**. There are **no pegs**.

## Decisions (from the author)

1. **Fifteen chapters**, three levels each. Fifteen units, one new unit per chapter.
2. **Up to three units per building.** Buildings can make one, two or three types.
3. **No gears.** Buildings replace them. Units are shown at the top of the screen, where the pegboard used to be. Clicking a unit shows a countdown for every unit that building is making; a building can then be clicked again for its next unit.
4. **Jean Raitt** is not a character. Farms are a resource building that produces food.
5. **The unit schedule** (checked against the chapter numbers):
   - Chapter 9: four buildings make two units each, and the fifth makes one: 9 units.
   - Chapter 12: two buildings make three units each, and three make two: 12 units.
   - Chapter 15: all five buildings make three: 15 units.
6. **Resource buildings** can be upgraded. They cost coins, but may also use other resources. The author wants delayed satisfaction, and asks for balancing scripts and tests to propose the best mix.

## Resources (default)

| Building | Makes | Rate | Notes |
|---|---|---|---|
| Farm | food | steady, over time; upgradeable | the first resource building |
| Sawmill | wood | steady; upgradeable | builds barracks and stables |
| Mine | runes | steady; upgradeable | needed for the strongest units |
| Market | gold | steady; upgradeable | replaces the coin purse of book 1 |

## Unit-producing buildings (default: five, two or three units each)

Each **barracks** (or other unit building) trains a unit by spending food and waiting for a timer. A building can be upgraded to train its second unit.

| Building | Units (default) |
|---|---|
| Barracks | pikemen, men-at-arms |
| Archery workshop | archers, crossbowmen |
| Wizards tower | apprentices, battle mages |
| Stables | riders, knights |
| Church | monks, shield bearers |

## Sequence (from the author's numbers)

- One new unit per chapter, fifteen in all.
- Chapter 9: nine units, from four buildings with two each and one with one.
- Chapter 12: twelve units, from two buildings with three each and three with two each.
- Chapter 15: fifteen units, three from each of the five buildings.

## Terrain (new in book 2)

- **Open ground:** the same as book 1.
- **Trees:** block missiles (arrows and stones are stopped or slowed) and slow units that walk through them.
- **Marshland:** slows units; missiles fly lower and hit less often.
- **Hills:** range units fire farther from high ground; ground units climb slower.

Terrain is data in `js/data.js` (per level), and the rules are in `js/sim.js`, as in book 1.

## Build order

1. Resource buildings and food, with the barracks timer, in a single chapter (chapter 1).
2. The remaining buildings and units, chapter by chapter.
3. Terrain.
4. Balance: `tools/balance_tune.js` with thirty levels becomes forty-five (or whatever the chapter count is).
5. Narration for every new story (`tools/make_voice.py`).
