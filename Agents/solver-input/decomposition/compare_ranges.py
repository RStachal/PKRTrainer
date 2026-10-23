"""Compare the ranges a cheap flop pass delivers to a turn node with the truth.

This is the other half of the decomposition error. Re-solving a turn subgame was
already shown to reproduce the monolith closely when handed the monolith's own
ranges; what is left to measure is whether a cheap flop pass hands over the same
ranges. If it does, decomposition is sound end to end. If it does not, the error
enters here and this says how large it is.

  python compare_ranges.py <cheap_flop_dump> <monolith_dump> <action> [<action> ...]
"""
import json
import sys
from collections import defaultdict

RANKS = "23456789TJQKA"


def combo_class(combo):
    r1, s1, r2, s2 = combo[0], combo[1], combo[2], combo[3]
    if r1 == r2:
        return r1 + r2
    hi, lo = (r1, r2) if RANKS.index(r1) > RANKS.index(r2) else (r2, r1)
    return hi + lo + ("s" if s1 == s2 else "o")


def reach_at(dump, path):
    """Each player's per-combo reach after following `path` from the root."""
    node = dump
    reach = {0: defaultdict(lambda: 1.0), 1: defaultdict(lambda: 1.0)}
    for action in path:
        block = node["strategy"]
        actions = block["actions"]
        if action not in actions:
            raise SystemExit(f"{action!r} not available here; options {actions}")
        index = actions.index(action)
        player = node["player"]
        for combo, probs in block["strategy"].items():
            reach[player][combo] *= probs[index]
        node = node["childrens"][action]
    return reach


def classes(reach_for_player):
    total = defaultdict(float)
    count = defaultdict(int)
    for combo, weight in reach_for_player.items():
        total[combo_class(combo)] += weight
        count[combo_class(combo)] += 1
    return {n: total[n] / count[n] for n in total if count[n]}


def main():
    cheap_path, mono_path, *path = sys.argv[1:]
    print("loading cheap flop pass ...", file=sys.stderr)
    cheap = json.load(open(cheap_path, encoding="utf8"))
    print("loading monolith ...", file=sys.stderr)
    mono = json.load(open(mono_path, encoding="utf8"))

    cheap_reach = reach_at(cheap, path)
    mono_reach = reach_at(mono, path)

    for player, label in ((1, "OOP"), (0, "IP")):
        a = classes(cheap_reach[player])
        b = classes(mono_reach[player])
        shared = sorted(set(a) & set(b))
        # How often each class is there at all, so a rarely-arriving class being
        # off does not read the same as the top of the range being off.
        weight = sum(b[n] for n in shared)
        if weight == 0:
            print(f"{label}: no weight arrives here")
            continue
        absolute = sum(abs(a[n] - b[n]) for n in shared)
        relative = sum(b[n] * abs(a[n] - b[n]) for n in shared) / weight
        print(f"\n{label}: {len(shared)} classes   total arriving weight {weight:.2f}")
        print(f"  mean absolute difference in class weight : {absolute / len(shared):.4f}")
        print(f"  weight-weighted mean difference          : {relative:.4f}")
        rows = sorted(((b[n] * abs(a[n] - b[n]), n, a[n], b[n]) for n in shared), reverse=True)
        print(f"  {'class':7}{'cheap':>8}{'monolith':>10}{'diff':>8}")
        for _, n, x, y in rows[:8]:
            print(f"  {n:7}{x:8.3f}{y:10.3f}{x - y:+8.3f}")


if __name__ == "__main__":
    main()
