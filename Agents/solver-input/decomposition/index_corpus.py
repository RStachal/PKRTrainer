"""Make the decomposed corpus legible, and say where it is thin.

The night run produces tens of thousands of files across hundreds of board
folders. That is data nobody can consult: to know whether a spot is covered you
would have to guess a filename. This walks the corpus once and writes an index
plus a quality report, so the next question - "do we have the turn on this board
after this line?" - is a lookup rather than an excavation.

  python index_corpus.py <corpus-dir> [--out=index.json] [--report]

What it checks, and why each one is a real failure mode rather than a formality:

- a dump that will not parse, or carries no strategy: the solver died between
  opening the file and finishing it, which leaves a plausible-looking stub
- a node whose strategy covers no hands: structurally valid and completely useless
- a board whose solved count falls short of its plan: the honest measure of
  coverage, and the number that decides whether a night was worth it
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict


def board_depth(folder: str) -> int:
    match = re.search(r"MTT9_(\d+)BB", folder)
    return int(match.group(1)) if match else 0


def family_of(folder: str) -> str:
    return folder.split("__")[0]


def scan(corpus: str):
    boards = []
    for folder in sorted(os.listdir(corpus)):
        path = os.path.join(corpus, folder)
        if not os.path.isdir(path):
            continue

        planned = 0
        plan_path = os.path.join(path, "plan.json")
        coverage = None
        if os.path.exists(plan_path):
            try:
                plan = json.load(open(plan_path, encoding="utf8"))
                planned = len(plan.get("items", []))
                coverage = plan.get("coverageAchieved")
            except Exception:
                planned = 0

        nodes, broken, empty = [], [], []
        for name in os.listdir(path):
            if not name.endswith(".json") or name == "plan.json":
                continue
            full = os.path.join(path, name)
            try:
                dump = json.load(open(full, encoding="utf8"))
                block = dump.get("strategy") or {}
                strategy = block.get("strategy") or {}
                actions = block.get("actions") or []
            except Exception:
                broken.append(name)
                continue
            if not actions:
                broken.append(name)
                continue
            if not strategy:
                empty.append(name)
                continue
            line, _, turn = name[:-5].partition("__")
            nodes.append({
                "line": line,
                "turn": turn,
                "actions": actions,
                "combos": len(strategy),
                "bytes": os.path.getsize(full),
            })

        boards.append({
            "board": folder,
            "family": family_of(folder),
            "depthBB": board_depth(folder),
            "planned": planned,
            "solved": len(nodes),
            "coverageAchieved": coverage,
            "broken": broken,
            "empty": empty,
            "nodes": nodes,
        })
    return boards


def main():
    corpus = sys.argv[1]
    out = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--out=")), "")
    boards = scan(corpus)

    solved = sum(b["solved"] for b in boards)
    planned = sum(b["planned"] for b in boards)
    broken = sum(len(b["broken"]) for b in boards)
    empty = sum(len(b["empty"]) for b in boards)

    print(f"boards {len(boards)}   subgames {solved} of {planned} planned"
          f"   broken {broken}   empty {empty}")

    by_family = defaultdict(lambda: [0, 0, 0])
    for b in boards:
        row = by_family[b["family"]]
        row[0] += 1
        row[1] += b["solved"]
        row[2] += b["planned"]
    print("")
    print(f"{'family':46}{'boards':>7}{'solved':>9}{'planned':>9}{'':>3}")
    for family, (count, done, plan) in sorted(by_family.items(), key=lambda kv: -kv[1][1]):
        flag = "" if plan and done >= plan else "  <- short"
        print(f"{family[:44]:46}{count:>7}{done:>9}{plan:>9}{flag}")

    widths = Counter(len(n["actions"]) for b in boards for n in b["nodes"])
    print("")
    print("actions at the turn node:", dict(sorted(widths.items())))

    incomplete = [b for b in boards if b["planned"] and b["solved"] < b["planned"]]
    if incomplete:
        print("")
        print(f"boards short of their plan: {len(incomplete)}")
        for b in incomplete[:10]:
            print(f"  {b['board']}: {b['solved']}/{b['planned']}")

    if out:
        json.dump(boards, open(out, "w", encoding="utf8"))
        print(f"\nwritten: {out}")


if __name__ == "__main__":
    main()
