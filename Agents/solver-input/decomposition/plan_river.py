"""Plan the river subgames worth solving for one solved turn subgame.

Same idea as plan_board.py, one street later: read a solved turn subgame, work
out which turn lines actually get played, and write a work list with one entry
per (line, river card) plus the pot, the stack and the ranges both players
arrive with.

  python plan_river.py <turn_subgame.json> <board> <pot> <stack> <out.json> [coverage]

Why this exists at all, given the solver already solved the river:

The night solves configure bet sizes for turn *and* river, so every turn subgame
was solved to the end of the hand. What was written to disk is only the turn
layer - `set_dump_rounds 1` - because round two writes the whole river layer and
that is hundreds of megabytes per board against 4.2 GB already spent on turns.
The river strategy was computed and discarded, and the discarding was right: a
whole river layer is mostly lines nobody reaches.

So the river is solved the same way the turn was. Not by dumping everything and
filtering afterwards, but by planning the lines that carry the reach and solving
those as their own small subgames. A turn subgame has at most a few live lines
and 44 river cards, and after suit isomorphism far fewer - which turns a layer
nobody can store into a list that fits in a night.

## What differs from the turn planner

The pot arithmetic. On the turn the caller starts from the flop's pot and the
line's bet level; here the starting pot is the turn subgame's own pot, which the
caller passes in, and the level is what was committed on the turn.

And there is no further street. A river line that puts both stacks in has nothing
left to solve, exactly as on the turn, but a river line that merely ends has
nothing after it either - so the terminal test is the same and the planner stops
one street earlier in the tree rather than looking for another chance node.
"""
import json
import sys
from collections import Counter, defaultdict

RANKS = "23456789TJQKA"


def combo_class(combo):
    r1, s1, r2, s2 = combo[0], combo[1], combo[2], combo[3]
    if r1 == r2:
        return r1 + r2
    hi, lo = (r1, r2) if RANKS.index(r1) > RANKS.index(r2) else (r2, r1)
    return hi + lo + ("s" if s1 == s2 else "o")


def collect_lines(dump):
    """Every turn line reaching the river, with each player's per-combo reach.

    The chance node is the river being dealt, and in these dumps it is a leaf:
    `set_dump_rounds 1` stopped the write there. That leaf is exactly the marker
    this planner needs - it is where a river subgame begins.
    """
    found = []

    def walk(node, path, reach, level):
        kind = node.get("node_type")
        if kind == "chance_node":
            found.append({
                "path": list(path),
                "reach": {0: dict(reach[0]), 1: dict(reach[1])},
                "level": level,
            })
            return
        if kind != "action_node":
            return
        block = node.get("strategy")
        if block is None:
            return
        actions, player = block["actions"], node["player"]
        for index, action in enumerate(actions):
            child = (node.get("childrens") or {}).get(action)
            if child is None:
                continue
            nxt = {0: dict(reach[0]), 1: dict(reach[1])}
            for combo, probs in block["strategy"].items():
                nxt[player][combo] = nxt[player].get(combo, 1.0) * probs[index]
            amount = float(action.split()[1]) if action.startswith(("BET", "RAISE")) else level
            path.append(action)
            walk(child, path, nxt, amount)
            path.pop()

    walk(dump, [], {0: {}, 1: {}}, 0.0)
    return found


def joint_reach(reach):
    out = 1.0
    for player in (0, 1):
        values = reach[player]
        out *= (sum(values.values()) / len(values)) if values else 1.0
    return out


def distinct_rivers(board):
    """One representative per suit-isomorphic group of river cards.

    Same reasoning as the turn: a card's suit matters only through how many of
    that suit are already on the board. With four cards down rather than three
    the groups are smaller, so this saves less than it did one street earlier -
    but it still refuses to pay twice for one answer.
    """
    on_board = Counter(card[1] for card in board)
    groups = defaultdict(list)
    for rank in RANKS:
        for suit in "cdhs":
            card = rank + suit
            if card in board:
                continue
            groups[(rank, on_board.get(suit, 0))].append(card)
    return {sorted(v)[0]: sorted(v) for v in groups.values()}


def weighted_classes(reach_for_player, blocked):
    total, count = defaultdict(float), defaultdict(int)
    for combo, weight in reach_for_player.items():
        if combo[0:2] in blocked or combo[2:4] in blocked:
            continue
        name = combo_class(combo)
        total[name] += weight
        count[name] += 1
    return {n: round(total[n] / count[n], 4) for n in total if count[n] and total[n] / count[n] > 1e-4}


def main():
    dump_path, board_text, pot, stack, out_path = sys.argv[1:6]
    coverage = float(sys.argv[6]) if len(sys.argv) > 6 else 0.99
    pot, stack = float(pot), float(stack)
    board = board_text.split(",")
    if len(board) != 4:
        raise SystemExit(f"river planning needs a four-card board, got {len(board)}: {board_text}")

    print(f"loading {dump_path} ...", file=sys.stderr)
    dump = json.load(open(dump_path, encoding="utf8"))
    lines = collect_lines(dump)
    if not lines:
        raise SystemExit("no line in this subgame reaches a river")

    for line in lines:
        line["weight"] = joint_reach(line["reach"])
    # A line with both stacks already in has no river strategy left to solve.
    live = [l for l in lines if l["level"] < stack - 0.5]
    live.sort(key=lambda l: l["weight"], reverse=True)
    live_total = sum(l["weight"] for l in live) or 1.0

    chosen, running = [], 0.0
    for line in live:
        chosen.append(line)
        running += line["weight"]
        if running / live_total >= coverage:
            break

    rivers = distinct_rivers(board)
    items = []
    for line in chosen:
        for card, equivalents in rivers.items():
            blocked = set(board) | {card}
            items.append({
                "line": line["path"],
                "river": card,
                "represents": equivalents,
                "reach": round(line["weight"] / live_total, 6),
                "pot": pot + 2 * line["level"],
                "stack": stack - line["level"],
                "board": board + [card],
                "oop": weighted_classes(line["reach"][1], blocked),
                "ip": weighted_classes(line["reach"][0], blocked),
            })

    plan = {
        "source": dump_path,
        "street": "RIVER",
        "board": board,
        "pot": pot,
        "stack": stack,
        "coverageTarget": coverage,
        "coverageAchieved": round(running / live_total, 6),
        "linesTotal": len(lines),
        "linesLive": len(live),
        "linesChosen": len(chosen),
        "riverGroups": len(rivers),
        "items": items,
    }
    json.dump(plan, open(out_path, "w", encoding="utf8"), indent=1)
    print(
        f"{len(items)} river subgames from {len(chosen)}/{len(live)} live lines "
        f"and {len(rivers)} card groups; coverage {plan['coverageAchieved']:.3f}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
