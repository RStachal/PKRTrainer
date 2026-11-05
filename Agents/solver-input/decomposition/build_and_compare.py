"""Solve the extracted turn node on its own, then score it against the monolith.

The subgame gets the same turn and river action set the monolithic solve used, so
any difference is decomposition, not a different game. Comparison is on the
strategy at the node itself, per hand class, weighted by how often each class is
actually there - a class arriving with weight 0.01 being wrong matters far less
than the top of the range being wrong.
"""
import json
import subprocess
import sys
from collections import defaultdict

RANKS = "23456789TJQKA"
SOLVER = r"C:\Users\stachal\PKRTrainer\tools\TexasSolver-v0.2.0-Windows\TexasSolver-v0.2.0-Windows"


def combo_class(combo):
    r1, s1, r2, s2 = combo[0], combo[1], combo[2], combo[3]
    if r1 == r2:
        return r1 + r2
    hi, lo = (r1, r2) if RANKS.index(r1) > RANKS.index(r2) else (r2, r1)
    return hi + lo + ("s" if s1 == s2 else "o")


def write_param(extract, path):
    ranges = extract["ranges"]
    def spec(side):
        return ",".join(f"{name}:{weight:.4f}" for name, weight in sorted(ranges[side].items()))

    lines = [
        "set_pot 84",
        "set_effective_stack 633",
        "set_board 4s,3h,3d,Kc",
        f"set_range_oop {spec('oop')}",
        f"set_range_ip {spec('ip')}",
        # Same sizes the monolith used on these streets, so the trees match.
        "set_bet_sizes oop,turn,bet,50,75",
        "set_bet_sizes oop,turn,raise,100",
        "set_bet_sizes oop,turn,allin",
        "set_bet_sizes ip,turn,bet,50,75",
        "set_bet_sizes ip,turn,raise,100",
        "set_bet_sizes ip,turn,allin",
        "set_bet_sizes oop,river,bet,50,75",
        "set_bet_sizes oop,river,raise,100",
        "set_bet_sizes oop,river,donk,50",
        "set_bet_sizes oop,river,allin",
        "set_bet_sizes ip,river,bet,50,75",
        "set_bet_sizes ip,river,raise,100",
        "set_bet_sizes ip,river,allin",
        "set_allin_threshold 0.67",
        "build_tree",
        "set_thread_num 8",
        "set_accuracy 0.3",
        "set_max_iteration 300",
        "set_print_interval 50",
        "set_use_isomorphism 1",
        "start_solve",
        "set_dump_rounds 2",
        r"dump_result C:\pkrtmp\subgame_solved.json",
    ]
    open(path, "w", newline="\n").write("\n".join(lines) + "\n")


def by_class(strategy_block, weights):
    """Average each class's action probabilities over its surviving combos."""
    actions = strategy_block["actions"]
    total = defaultdict(lambda: [0.0] * len(actions))
    count = defaultdict(int)
    for combo, probs in strategy_block["strategy"].items():
        name = combo_class(combo)
        for i, p in enumerate(probs):
            total[name][i] += p
        count[name] += 1
    return actions, {n: [v / count[n] for v in total[n]] for n in total}


def main():
    extract = json.load(open("C:/pkrtmp/subgame_extract.json", encoding="utf8"))
    write_param(extract, "C:/pkrtmp/subgame_run.txt")
    print("solving subgame ...", file=sys.stderr)
    result = subprocess.run(
        [SOLVER + r"\console_solver.exe", "-i", r"C:\pkrtmp\subgame_run.txt"],
        cwd=SOLVER, capture_output=True, text=True, timeout=3600,
    )
    tail = [l for l in result.stdout.splitlines() if "exploitability" in l][-1:]
    print("subgame:", tail, "exit", result.returncode, file=sys.stderr)

    solved = json.load(open("C:/pkrtmp/subgame_solved.json", encoding="utf8"))
    ref = extract["reference"]
    weights = extract["ranges"]["oop" if ref["player"] == 1 else "ip"]

    ref_actions, ref_by = by_class(ref, weights)
    sub_actions, sub_by = by_class(
        {"actions": solved["strategy"]["actions"], "strategy": solved["strategy"]["strategy"]}, weights
    )
    print(f"\nmonolith actions: {ref_actions}")
    print(f"subgame  actions: {sub_actions}")
    if len(ref_actions) != len(sub_actions):
        print("different action counts - not comparable")
        return

    shared = [n for n in ref_by if n in sub_by]
    tw = sum(weights.get(n, 0) for n in shared)
    if tw == 0:
        print("no shared weight")
        return
    wdiff = 0.0
    rows = []
    for n in shared:
        w = weights.get(n, 0.0)
        d = sum(abs(a - b) for a, b in zip(ref_by[n], sub_by[n])) / 2  # total variation
        wdiff += w * d
        rows.append((w * d, n, w, d))
    print(f"\nclasses compared: {len(shared)}   weighted mean total-variation distance: {wdiff / tw:.4f}")
    print("\nlargest contributors (weight x distance):")
    print(f"{'class':7}{'weight':>8}{'distance':>10}   monolith -> subgame")
    for _, n, w, d in sorted(rows, reverse=True)[:12]:
        r = " ".join(f"{v:.2f}" for v in ref_by[n])
        s = " ".join(f"{v:.2f}" for v in sub_by[n])
        print(f"{n:7}{w:8.3f}{d:10.3f}   [{r}] -> [{s}]")


if __name__ == "__main__":
    main()
