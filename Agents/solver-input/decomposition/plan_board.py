"""Plan the turn subgames worth solving for one board.

Reads a monolithic solve, works out which flop lines actually get played, and
writes a work list: one entry per (line, turn card) with the pot, the stack and
the weighted ranges both players arrive with.

Why this exists: a board has 63 lines reaching a turn and 26 distinct turn cards,
which is 1638 subgames and most of a day. But the mass is not spread evenly - four
lines carry 90 percent of it and seven carry 99, because the rest are raise wars
nobody reaches. Solving in reach order and stopping at a coverage target turns a
day into minutes, and the coverage is reported rather than assumed.

  python plan_board.py <monolith.json> <board> <pot> <stack> <out.json> [coverage]
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
    """Every line reaching a turn, with each player's per-combo reach there.

    The bet level is the last BET or RAISE amount on the line. TexasSolver reports
    these as the total a player has committed on the street, so a line ending in a
    call leaves both players at that level - which is what makes the pot and stack
    below simple arithmetic. That reading was checked by rebuilding a node from it
    and reproducing the monolith's strategy at that node.
    """
    found = []

    def walk(node, path, reach, level):
        kind = node.get("node_type")
        if kind == "chance_node":
            found.append({"path": list(path), "reach": {0: dict(reach[0]), 1: dict(reach[1])}, "level": level})
            return
        if kind != "action_node":
            return
        block = node.get("strategy")
        # `"strategy": null` is a node the solver did not compute: no reach can
        # be carried through it, and `None.items()` would end the planning.
        if block is None or block.get("strategy") is None:
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


def distinct_turns(board):
    """One representative per suit-isomorphic group of turn cards.

    A turn card's suit matters only through how many of that suit are already on
    the board, so two cards of a rank whose suits play the same role produce the
    same subgame up to renaming. Solving both would be paying twice for one answer.
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

    print(f"loading {dump_path} ...", file=sys.stderr)
    dump = json.load(open(dump_path, encoding="utf8"))
    lines = collect_lines(dump)

    for line in lines:
        line["weight"] = joint_reach(line["reach"])
    # A line that already has both stacks in has no turn strategy left to solve.
    # Neither has a line nobody plays: with zero reach the solver gets empty
    # ranges and writes the tree back unsolved (see plan_river.py, 15 Oct 2026).
    live = [l for l in lines if l["level"] < stack - 0.5 and l["weight"] > 0]
    live.sort(key=lambda l: l["weight"], reverse=True)
    live_total = sum(l["weight"] for l in live) or 1.0

    chosen, running = [], 0.0
    for line in live:
        chosen.append(line)
        running += line["weight"]
        if running / live_total >= coverage:
            break

    turns = distinct_turns(board)
    items = []
    for line in chosen:
        for card, equivalents in turns.items():
            blocked = set(board) | {card}
            oop = weighted_classes(line["reach"][1], blocked)
            ip = weighted_classes(line["reach"][0], blocked)
            # A player with no hand left has nothing to solve for, and the solver
            # does not say so - it writes the tree back unsolved.
            if not oop or not ip:
                continue
            items.append({
                "line": line["path"],
                "turn": card,
                "represents": equivalents,
                "reach": round(line["weight"] / live_total, 6),
                "pot": pot + 2 * line["level"],
                "stack": stack - line["level"],
                "board": board + [card],
                "oop": oop,
                "ip": ip,
            })

    json.dump({
        "source": dump_path,
        "board": board,
        "pot": pot,
        "stack": stack,
        "coverageTarget": coverage,
        "coverageAchieved": round(running / live_total, 6),
        "linesTotal": len(lines),
        "linesLive": len(live),
        "linesChosen": len(chosen),
        "turnGroups": len(turns),
        "items": items,
    }, open(out_path, "w"), indent=1)

    print(f"lines {len(lines)} total, {len(live)} live, {len(chosen)} chosen "
          f"({running / live_total:.1%} of live mass)")
    print(f"turn groups {len(turns)} of 49 cards")
    print(f"subgames planned: {len(items)}  -> {out_path}")


if __name__ == "__main__":
    main()
