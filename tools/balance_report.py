#!/usr/bin/env python3
"""Headless balance report for books 2 and 3 (no browser).

It runs the book bot (tools/bot2.js) on every level of a book and prints one row per chapter:
the average bot win rate, the win rate on the boss level, the leaks against lives, and a flag when
the chapter falls outside the target band for the mode. The bot is a measuring stick, not a player.

    python3 tools/balance_report.py                      # books 2 and 3, medium, 4 runs per level
    python3 tools/balance_report.py --book 3 --mode hard --runs 8
    python3 tools/balance_report.py --chapters 1 5 10    # only some chapters
    python3 tools/balance_report.py --csv out.csv        # also write every level to a CSV

Needs Node.js (the same node the game tools use) and nothing else. Standard library only.
"""
import argparse
import csv
import json
import os
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
BAND = {"easy": (0.90, 1.00), "medium": (0.60, 0.85), "hard": (0.20, 0.50)}   # same bands as tools/balance_tune.js verify


def run_bot(book, runs, mode):
    """Ask the bot for one JSON row per level."""
    cmd = ["node", os.path.join(ROOT, "tools", "bot2.js"), "json", str(book), str(runs), mode]
    out = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, check=False)
    if out.returncode != 0:
        sys.exit("bot failed (book %d): %s" % (book, out.stderr.strip() or out.stdout.strip()))
    return json.loads(out.stdout)


def chapter_rows(rows, chapters):
    """Group level rows into chapters: average win, boss win, leaks ratio and time."""
    by_ch = {}
    for r in rows:
        if chapters and r["ch"] not in chapters:
            continue
        by_ch.setdefault(r["ch"], []).append(r)
    summary = []
    for ch in sorted(by_ch):
        levels = by_ch[ch]
        boss = [r for r in levels if r["boss"]]
        avg_win = sum(r["win"] for r in levels) / len(levels)
        leak_ratio = sum(r["leaks"] / r["lives"] for r in levels) / len(levels)
        summary.append({
            "ch": ch,
            "levels": levels,
            "avg_win": avg_win,
            "boss_win": boss[0]["win"] if boss else None,
            "leak_ratio": leak_ratio,
            "secs": sum(r["secs"] for r in levels) / len(levels),
            "buildings": sum(r["buildings"] for r in levels) / len(levels),
        })
    return summary


def flag(win, mode):
    lo, hi = BAND[mode]
    if win < lo:
        return "HARD"
    if win > hi:
        return "easy"
    return "ok"


def print_book(book, rows, mode, chapters):
    print("\nBook %d, %s mode (target band %d-%d%% per chapter average)" % (book, mode, BAND[mode][0] * 100, BAND[mode][1] * 100))
    print("  chapter            | avg win  boss win  leaks/lives  bot secs  buildings  flag")
    summary = chapter_rows(rows, chapters)
    for s in summary:
        boss = "   -  " if s["boss_win"] is None else "%5d%%" % round(s["boss_win"] * 100)
        print("  %7d            | %6d%%  %8s  %10.0f%%  %8.0f  %9.1f  %s" % (
            s["ch"], round(s["avg_win"] * 100), boss, round(s["leak_ratio"] * 100), s["secs"], s["buildings"], flag(s["avg_win"], mode)))
    flagged = [s["ch"] for s in summary if flag(s["avg_win"], mode) != "ok"]
    print("  chapters outside the band: %s" % (", ".join(str(c) for c in flagged) if flagged else "none"))
    overall = sum(r["win"] for r in rows) / max(1, len(rows))
    print("  overall win rate %d%% over %d levels" % (round(overall * 100), len(rows)))
    return summary


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--book", choices=["2", "3", "both"], default="both")
    ap.add_argument("--mode", choices=sorted(BAND), default="medium")
    ap.add_argument("--runs", type=int, default=4, help="bot games per level (more is slower and steadier)")
    ap.add_argument("--chapters", type=int, nargs="*", default=[], help="only these chapters")
    ap.add_argument("--csv", help="write every level to this CSV file")
    args = ap.parse_args()

    books = [2, 3] if args.book == "both" else [int(args.book)]
    all_rows = []
    for b in books:
        rows = run_bot(b, args.runs, args.mode)
        print_book(b, rows, args.mode, set(args.chapters))
        all_rows.extend(rows)
    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(all_rows[0].keys()))
            w.writeheader()
            w.writerows(all_rows)
        print("\nwrote %d levels to %s" % (len(all_rows), args.csv))


if __name__ == "__main__":
    main()
