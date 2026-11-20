# Book 2: plan (draft, not built)

Unlocked after chapter 10 of book 1. Same rhythm as book 1: chapters of three levels, one new unit per chapter, a boss on level 3. Book 2 adds **resources and buildings** and **terrain**. There are **no pegs**.

## Open questions (please answer before building)

1. **Chapter count.** Ten (like book 1) or fifteen? The unit list below assumes fifteen.
2. **Units per building.** Five buildings times two units is ten, not fifteen. Options: (a) three units per building, five buildings, fifteen units; (b) seven buildings, two units each; (c) keep ten units and cut the list to ten chapters.
3. **Gears.** With no pegs, do buildings replace the gears entirely? My default: yes. Buildings are placed on a grid, and each one produces the units it lists.
4. **"Jean Raitt".** Is this the farmer (a character), the farm's name, or something else? Default below: a farmer character.
5. **Sequence notation.** "ABC DE, 2B2C2D2E2, 3B3C3D3E3" reads like: the first chapter introduces A, B, C; later chapters add a second and third step for each building. My default reading is in the sequence table below. Please confirm or correct it.
6. **Shopping.** Do the resource buildings (farm, mine, sawmill, market) pay for buildings, or only for units? Default: units only, and buildings cost coins.

## Resources (default)

| Building | Makes | Rate | Notes |
|---|---|---|---|
| Farm (Jean Raitt) | food | steady, over time | the first building in chapter 1 |
| Sawmill | wood | steady | builds barracks and stables |
| Mine | runes | steady | needed for the strongest units |
| Market | gold | steady, plus a bonus when sold | replaces the coin purse of book 1 |

## Unit-producing buildings (default: five, two or three units each)

Each **barracks** (or other unit building) trains a unit by spending food and waiting for a timer. A building can be upgraded to train its second unit.

| Building | Units (default) |
|---|---|
| Barracks | pikemen, men-at-arms |
| Archery workshop | archers, crossbowmen |
| Wizards tower | apprentices, battle mages |
| Stables | riders, knights |
| Church | monks, shield bearers |

## Sequence (default reading of the notation)

- Chapters 1 to 3: A, B, C (one new unit each, from the buildings above).
- Chapters 4 to 6: the second unit of each of those buildings (the "2" set), one per chapter.
- Chapters 7 to 9: the third unit of each building (the "3" set).
- Chapter 10: the "E" building opens.

This gives fifteen unit slots. It needs answers to questions 2 and 5 before it is final.

## Terrain (new in book 2)

- **Open ground:** the same as book 1.
- **Trees:** block missiles (arrows and stones are stopped or slowed) and slow units that walk through them.
- **Marshland:** slows units; missiles fly lower and hit less often.
- **Hills:** range units fire farther from high ground; ground units climb slower.

Terrain is data in `js/data.js` (per level), and the rules are in `js/sim.js`, as in book 1.

## Build order (once the questions are answered)

1. Resource buildings and food, with the barracks timer, in a single chapter (chapter 1).
2. The remaining buildings and units, chapter by chapter.
3. Terrain.
4. Balance: `tools/balance_tune.js` with thirty levels becomes forty-five (or whatever the chapter count is).
5. Narration for every new story (`tools/make_voice.py`).
