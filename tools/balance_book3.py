#!/usr/bin/env python3
"""Book 3 (The Lanes) balance: unit prices against the army the design wants.

The design: an army of about 15 fighters on the board in chapter 1, growing to about 50 by chapter 10,
in three lanes. Book 3 has eight unit buildings (the five from book 2 plus foundry, ice house and shrine)
and four resource buildings, fifteen plots. The bot does not use flank, freeze or summon, so its book 3
numbers are a floor, not what a player would get.

Every unit in book 3 gets its four costs from one price level for book 3 (total = level x power, split by role).
This script finds the price level that brings the army closest to the chapter targets, then prints the table.

    python3 tools/balance_book3.py                 # search the price level (a few minutes), print the chapters
    python3 tools/balance_book3.py --level 0.6     # use a fixed price level, no search
    python3 tools/balance_book3.py --runs 3        # more bot games per level (slower, steadier)
    python3 tools/balance_book3.py --write         # write the tuned table into js/data.js (F.TRAIN_BOOK[3])

Book 2 has its own script (tools/balance_book2.py) and its own price level.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import balance_lib as L  # noqa: E402

BOOK = 3
CHAPTERS = 10


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--level", type=float, help="fixed price level (skip the search)")
    ap.add_argument("--runs", type=int, default=2, help="bot games per level for each try")
    ap.add_argument("--mode", default="medium", choices=["easy", "medium", "hard"])
    ap.add_argument("--lo", type=float, default=0.1, help="lowest price level to try")
    ap.add_argument("--hi", type=float, default=3.0, help="highest price level to try")
    ap.add_argument("--write", action="store_true", help="write the table into js/data.js")
    ap.add_argument("--json", help="also save the chapter stats to this file")
    args = ap.parse_args()

    units = L.export_units(BOOK)
    cur = L.current_table(units)

    def run(level):
        table = L.table_for(units, level)
        rows = L.probe(BOOK, table, args.runs, args.mode)
        return L.chapter_stats(rows, CHAPTERS), rows

    if args.level is not None:
        level = args.level
    else:
        print("searching the price level for book %d (%d units, %d chapters, %d runs per level)..." % (BOOK, len(units), CHAPTERS, args.runs))
        cache = {}

        def score(level):
            key = round(level, 4)
            if key not in cache:
                stats, _ = run(level)
                cache[key] = (L.fit_error(stats, CHAPTERS), stats)
                print("  level %.3f  army error %.3f" % (level, cache[key][0]))
            return cache[key][0]
        level = L.golden_search(score, args.lo, args.hi, iters=6)
        print("chosen price level %.3f" % level)

    stats, rows = run(level)
    L.print_stats("\nBook 3 at price level %.3f (%s mode, %d runs per level)" % (level, args.mode, args.runs), stats, CHAPTERS)
    print("  army error (mean squared, relative to target): %.3f" % L.fit_error(stats, CHAPTERS))
    print("\nprices (food, wood, gold, runes) at this level:")
    table = L.table_for(units, level)
    for name in sorted(table, key=lambda n: units[n]["power"]):
        t = table[name]
        print("  %-11s power %5.1f  food %3d  wood %3d  gold %3d  runes %3d   (was %s)" % (
            name, units[name]["power"], t[0], t[1], t[2], t[3], cur[name][:4]))
    if args.json:
        with open(args.json, "w") as f:
            json.dump({"level": level, "stats": stats, "table": table}, f, indent=1)
    if args.write:
        tables = {3: table}
        # keep book 2's current table as it is
        cur2 = L.node_json(["exportcosts", 2])["units"]
        tables[2] = L.current_table(cur2)
        path = L.write_tables(tables)
        print("\nwrote book 3 prices into %s (book 2 kept as it was)" % path)


if __name__ == "__main__":
    main()
