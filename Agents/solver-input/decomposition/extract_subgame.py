"""Pull a turn node out of a monolithic solve, so it can be re-solved on its own.

The point is to separate two different errors. Decomposition has one error from
solving a subgame instead of the whole tree, and another from the cheap flop pass
that supplies the ranges arriving at that subgame. Taking the ranges from the
monolithic solve itself removes the second error, so what is left measures the
first one alone.

Emits: the weighted ranges for both players at the node, the pot and stack there,
and the strategy the monolith plays - which is the answer a re-solve has to match.

  python extract_subgame.py <dump.json> <turn_card> <action> [<action> ...]
"""
import json
import sys
from collections import defaultdict

RANKS = "23456789TJQKA"


def combo_class(combo):
    """AcQc -> AQs, AdAc -> AA, AdKd -> AKs, AdKc -> AKo."""
    r1, s1, r2, s2 = combo[0], combo[1], combo[2], combo[3]
    if r1 == r2:
        return r1 + r2
    hi, lo = (r1, r2) if RANKS.index(r1) > RANKS.index(r2) else (r2, r1)
    return hi + lo + ("s" if s1 == s2 else "o")


def walk(dump, turn_card, path):
    """Follow `path` from the root, tracking each player's reach per combo."""
    node = dump
    # Reach starts uniform: the ranges in the parameter file are the prior, and a
    # weight there scales the whole branch identically, so it cancels in the
    # normalised strategy we compare. Reported anyway for the range file.
    reach = {0: defaultdict(lambda: 1.0), 1: defaultdict(lambda: 1.0)}
    seen_any = False

    for action in path:
        if node.get("node_type") != "action_node":
            raise SystemExit(f"expected an action node before {action!r}, found {node.get('node_type')}")
        player = node["player"]
        block = node["strategy"]
        actions = block["actions"]
        if action not in actions:
            raise SystemExit(f"action {action!r} not available; options are {actions}")
        index = actions.index(action)
        for combo, probs in block["strategy"].items():
            reach[player][combo] *= probs[index]
            seen_any = True
        node = node["childrens"][action]

    if not seen_any:
        raise SystemExit("path reached no decision, nothing to weight")

    if node.get("node_type") != "chance_node":
        raise SystemExit(f"path does not end at a chance node but at {node.get('node_type')}")
    deal = node.get("dealcards") or node.get("childrens")
    if turn_card not in deal:
        raise SystemExit(f"turn card {turn_card!r} not dealt here; have {list(deal)[:6]}...")
    return reach, deal[turn_card]


def weighted_classes(reach_for_player, blocked):
    """Collapse combos to the classes a parameter file speaks, weight-averaged.

    A hand class is several combos and the solver plays them differently, so the
    class weight is their mean rather than any one of them. Combos containing a
    board card are gone, which is why the mean is taken over what survives.
    """
    total = defaultdict(float)
    count = defaultdict(int)
    for combo, weight in reach_for_player.items():
        if combo[0:2] in blocked or combo[2:4] in blocked:
            continue
        total[combo_class(combo)] += weight
        count[combo_class(combo)] += 1
    return {
        name: total[name] / count[name]
        for name in total
        if count[name] > 0 and total[name] / count[name] > 1e-4
    }


def main():
    dump_path, turn_card, *path = sys.argv[1:]
    print(f"loading {dump_path} ...", file=sys.stderr)
    with open(dump_path, encoding="utf8") as handle:
        dump = json.load(handle)

    reach, turn_node = walk(dump, turn_card, path)

    board = sys.argv[0]  # placeholder, board comes from the caller's parameter file
    blocked = {turn_card}

    out = {}
    for player, label in ((0, "ip"), (1, "oop")):
        classes = weighted_classes(reach[player], blocked)
        out[label] = classes
        print(f"{label}: {len(classes)} hand classes with weight", file=sys.stderr)

    # The monolith's own answer at this node, kept so a re-solve can be scored.
    node = turn_node
    while node.get("node_type") == "chance_node":
        node = next(iter((node.get("dealcards") or node["childrens"]).values()))
    reference = None
    if node.get("node_type") == "action_node":
        reference = {
            "player": node["player"],
            "actions": node["strategy"]["actions"],
            "strategy": node["strategy"]["strategy"],
        }

    json.dump({"ranges": out, "reference": reference}, open("C:/pkrtmp/subgame_extract.json", "w"))
    print("wrote C:/pkrtmp/subgame_extract.json", file=sys.stderr)
    if reference:
        print(f"reference node: player {reference['player']} actions {reference['actions']}", file=sys.stderr)


if __name__ == "__main__":
    main()
