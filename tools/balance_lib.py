"""Shared helpers for the book balance scripts (tools/balance_book2.py, tools/balance_book3.py).

Nothing here changes the game on its own. The scripts:
  1. read each unit's power and role from the game (node tools/bot2.js exportcosts);
  2. set every unit's four training costs from one price level per book:
         total price = level x power, split between food, wood, gold and runes by the unit's role;
  3. play every level of the book with the bot (node tools/bot2.js json) and measure the army on
     the board, the idle unit buildings and the resources left over;
  4. search for the price level that puts the army closest to the target for each chapter;
  5. optionally write the tuned table into js/data.js (F.TRAIN_BOOK).

Standard library only. Needs Node.js.
"""
import json
import math
import os
import re
import subprocess
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
RESOURCES = ("food", "wood", "gold", "runes")


def node_json(args):
    """Run tools/bot2.js with arguments and parse its JSON output."""
    cmd = ["node", os.path.join(ROOT, "tools", "bot2.js")] + [str(a) for a in args]
    out = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, check=False)
    if out.returncode != 0:
        raise SystemExit("node failed: %s" % (out.stderr.strip() or out.stdout.strip()))
    return json.loads(out.stdout)


def export_units(book):
    """Every unit the book can train: power, kind, magic, siege, the current costs and training seconds."""
    return node_json(["exportcosts", book])["units"]


def round5(v):
    return int(5 * round(v / 5.0))


def role_mix(u):
    """How a unit's price is split between the four resources. Shares add to 1.

    melee: food and gold, some wood. ranged: wood-heavy (bows and bolts). magic: runes-heavy.
    siege (catapults): mostly wood. A unit that is both magic and ranged counts as magic.
    """
    if u.get("siege"):
        return {"food": 0.3, "wood": 0.5, "gold": 0.2, "runes": 0.0}
    if u.get("magic"):
        return {"food": 0.25, "wood": 0.0, "gold": 0.25, "runes": 0.5}
    if u.get("kind") == "ranged":
        return {"food": 0.3, "wood": 0.4, "gold": 0.3, "runes": 0.0}
    return {"food": 0.4, "wood": 0.2, "gold": 0.4, "runes": 0.0}


def price(u, level):
    """Four costs for one unit at a price level: total = level x power, split by role, rounded to 5."""
    total = level * u["power"]
    cost = {}
    for r in RESOURCES:
        share = role_mix(u)[r]
        v = total * share
        cost[r] = round5(v) if v >= 2.5 else 0
    return cost


def table_for(units, level):
    """The game's table form: unit -> [food, wood, gold, runes, seconds] (training seconds are kept)."""
    out = {}
    for name, u in units.items():
        c = price(u, level)
        out[name] = [c["food"], c["wood"], c["gold"], c["runes"], u["seconds"]]
    return out


def current_table(units):
    return {name: [u["cost"]["food"], u["cost"]["wood"], u["cost"]["gold"], u["cost"]["runes"], u["seconds"]] for name, u in units.items()}


def probe(book, table, runs, mode):
    """Play every level of the book with the candidate table. Returns one row per level."""
    fd, path = tempfile.mkstemp(suffix=".json")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(table, f)
        return node_json(["json", book, runs, mode, path])
    finally:
        os.remove(path)


def chapter_stats(rows, chapters_total):
    """Average per chapter: win rate, army on the board, peak army, idle share, and what is left in stock."""
    out = {}
    for r in rows:
        out.setdefault(r["ch"], []).append(r)
    stats = {}
    for ch in range(1, chapters_total + 1):
        lv = out.get(ch, [])
        if not lv:
            continue
        n = len(lv)

        def avg(k):
            return sum(r[k] for r in lv) / n
        stats[ch] = {"win": avg("win"), "army": avg("army"), "peak": max(r["armyPeak"] for r in lv), "idle": avg("idle"),
                     "queued": avg("queued"), "coins": avg("coins"), "food": avg("food"), "wood": avg("wood"), "runes": avg("runes")}
    return stats


def army_target(ch, chapters_total, lo=15, hi=50):
    """The army the design wants on the board: 15 in the first chapter, 50 in the last, straight line between."""
    if chapters_total <= 1:
        return hi
    return lo + (hi - lo) * (ch - 1) / (chapters_total - 1)


def fit_error(stats, chapters_total):
    """How far the armies are from their targets: mean squared relative error over the chapters."""
    errs = []
    for ch, s in stats.items():
        t = army_target(ch, chapters_total)
        errs.append(((s["army"] - t) / t) ** 2)
    return sum(errs) / max(1, len(errs))


def golden_search(f, lo, hi, iters=7):
    """Minimise f over the log of the price level between lo and hi (golden section)."""
    phi = (math.sqrt(5) - 1) / 2
    a, b = math.log(lo), math.log(hi)
    c, d = b - phi * (b - a), a + phi * (b - a)
    fc, fd = f(math.exp(c)), f(math.exp(d))
    for _ in range(iters):
        if fc < fd:
            b, d, fd = d, c, fc
            c = b - phi * (b - a)
            fc = f(math.exp(c))
        else:
            a, c, fc = c, d, fd
            d = a + phi * (b - a)
            fd = f(math.exp(d))
    best = c if fc < fd else d
    return math.exp(best)


def fmt_row(s):
    return "%5.0f%%  %6.1f  %4d  %5.0f%%  %6.0f  %6.0f  %6.0f  %6.0f" % (
        s["win"] * 100, s["army"], s["peak"], s["idle"] * 100, s["coins"], s["food"], s["wood"], s["runes"])


def print_stats(title, stats, chapters_total):
    print(title)
    print("  chapter  win   army  peak  idle    coins    food    wood   runes   target")
    for ch in sorted(stats):
        s = stats[ch]
        flag = ""
        t = army_target(ch, chapters_total)
        if s["army"] < 0.75 * t:
            flag = "  army low"
        elif s["army"] > 1.25 * t:
            flag = "  army high"
        if s["idle"] > 0.5:
            flag += "  buildings idle"
        print("  %7d %s  %5.0f%s" % (ch, fmt_row(s), t, flag))


def write_tables(tables):
    """Replace the F.TRAIN_BOOK block in js/data.js with the given {book: {unit: [..]}} tables."""
    path = os.path.join(ROOT, "js/data.js")
    src = open(path, encoding="utf-8").read()
    start = src.index("  F.TRAIN_BOOK = {")
    end = src.index("\n  };\n", start) + len("\n  };\n")
    lines = ["  F.TRAIN_BOOK = {"]
    for book in sorted(tables):
        lines.append("  %d: {" % book)
        for name, v in tables[book].items():
            lines.append("    %s: [%s]," % (name, ", ".join(str(x) for x in v)))
        lines.append("  },")
    lines.append("  };")
    block = "\n".join(lines) + "\n"
    src = src[:start] + block + src[end:]
    open(path, "w", encoding="utf-8").write(src)
    return path
