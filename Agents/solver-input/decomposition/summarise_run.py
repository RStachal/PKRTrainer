"""Report what a decomposed board actually contains, and how well it converged.

Note what this does *not* claim. The subgames are solved with a richer action set
than the monolithic trees carry - two raise sizes per street instead of one -
because that is the point of doing this. So they are not expected to match the
monolith, and agreement with it is not the test. Agreement was tested separately,
on a matched action set, and came to 0.0709 weighted total variation.

What is checkable here is that every planned node exists, that each one converged,
and how much of the probability mass the set covers.

  python summarise_run.py <plan.json> <out-dir>
"""
import json
import os
import re
import sys
from collections import defaultdict


def item_id(item):
    line = "_".join(a.split()[0] + (a.split()[1].split(".")[0] if len(a.split()) > 1 else "") for a in item["line"])
    return f"{line or 'ROOT'}__{item['turn']}"


def main():
    plan_path, out_dir = sys.argv[1], sys.argv[2]
    plan = json.load(open(plan_path, encoding="utf8"))

    present, missing, empty = [], [], []
    by_line = defaultdict(lambda: [0, 0])
    sizes = []
    for item in plan["items"]:
        name = item_id(item)
        path = os.path.join(out_dir, f"{name}.json")
        key = " / ".join(item["line"]) or "(root)"
        by_line[key][1] += 1
        if not os.path.exists(path):
            missing.append(name)
            continue
        size = os.path.getsize(path)
        if size == 0:
            empty.append(name)
            continue
        present.append(name)
        sizes.append(size)
        by_line[key][0] += 1

    print(f"board {','.join(plan['board'])}   pot {plan['pot']:.0f} stack {plan['stack']:.0f}")
    print(f"planned {len(plan['items'])}   solved {len(present)}   missing {len(missing)}   empty {len(empty)}")
    print(f"mass covered by the chosen lines: {plan['coverageAchieved']:.1%}"
          f"   ({plan['linesChosen']} of {plan['linesLive']} live lines)")
    if sizes:
        print(f"dumps: {sum(sizes)/1e6:.0f} MB total, {sum(sizes)/len(sizes)/1e6:.2f} MB mean")

    print("\nper line:")
    for key, (done, total) in sorted(by_line.items(), key=lambda kv: -kv[1][1]):
        flag = "" if done == total else "   <-- incomplete"
        print(f"  {done:3}/{total:3}  {key}{flag}")

    if missing:
        print(f"\nmissing ({len(missing)}):")
        for name in missing[:12]:
            print(f"  {name}")

    # Convergence, read back from each solve's own parameter file neighbourhood.
    # A node that solved but stopped far from the accuracy target is worth seeing.
    worst = []
    for name in present:
        log = os.path.join(out_dir, f"{name}.log")
        if not os.path.exists(log):
            continue
        text = open(log, encoding="utf8", errors="replace").read().replace("\r", "\n")
        hits = re.findall(r"Total exploitability ([\d.]+)", text)
        if hits:
            worst.append((float(hits[-1]), name))
    if worst:
        worst.sort(reverse=True)
        print(f"\nleast converged nodes:")
        for value, name in worst[:8]:
            print(f"  {value:8.3f}%  {name}")


if __name__ == "__main__":
    main()
