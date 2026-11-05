"""Kolik nocí by stála flopová EV, deska po desce, v pořadí podle dosahu.

  python measure_flop_ev_nights.py [--rate=55] [--workers=8] [--coverage=0.99]

## Proč to musí vzniknout

Bod 218 odhadl flopovou EV na ~60 nocí z jednoho podílu: 15 % turnových karet
mělo riverovou vrstvu. Byl to odhad z průměru, ne cena po deskách - a flopová
EV se dodává **po deskách**: flopové rozhodnutí se zprůměruje přes turnové
karty jedné desky, takže deska je hotová, až když mají vrstvu všechny její
turnové podhry pod dodávanými linkami. Cena desky je tedy součet cen jejích
turnových podher bez vrstvy, a cena podhry se umí spočítat předem
(`price_river_layers.py`, bod 243).

Tenhle skript to spočítá pro každou desku, kterou flopový pack dodává, seřadí
desky podle dosahu flopových pravidel a vypíše křivku: kolik nocí stojí prvních
N desek. Z toho se dá rozhodnout, jestli a kdy flopovou EV začít - a rozhodnout
se má z křivky, ne z průměru.

## Co se nepočítá

Turnové podhry, které plán desky nemá (linky pod prahem pokrytí 0,99), se
nepočítají - flopová EV by je zprůměrovala jako chybějící stejně jako turnová
(prahuje se po řádcích). All-in linky vrstvu nepotřebují (dojezd).
"""
import json
import os
import sys
import time
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import plan_river  # noqa: E402
from price_river_layers import WORK, COVERAGE  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
FLOP_PACKS = os.path.join(REPO, "src", "data", "ranges", "flop")


def has_complete_layer(directory, subgame):
    out_dir = os.path.join(WORK, directory, "river", subgame)
    plan = os.path.join(out_dir, "plan.json")
    if not os.path.exists(plan):
        return False
    planned = len(json.load(open(plan, encoding="utf8")).get("items", []))
    solved = len([f for f in os.listdir(out_dir) if f.endswith(".json") and f != "plan.json"])
    return solved >= planned


def subgame_name(item):
    parts = []
    for action in item.get("line", []):
        head = action.strip().split()[0].upper()
        if head in ("BET", "RAISE", "ALLIN", "ALL_IN"):
            parts.append(f"{head}{round(float(action.split()[1]))}")
        else:
            parts.append(head)
    return "__".join(["_".join(parts), item["turn"]])


def cost_of(args):
    """Cena riverové vrstvy jedné turnové podhry, nebo 0, když ji už má / nepotřebuje.

    Pokrytí se předává v úloze, ne globálem: pracovní procesy si modul
    načítají znovu (spawn), takže by globál z `main` neviděly.
    """
    directory, item, coverage = args
    name = subgame_name(item)
    dump_path = os.path.join(WORK, directory, name + ".json")
    if not os.path.exists(dump_path):
        return directory, name, None
    if has_complete_layer(directory, name):
        return directory, name, 0
    try:
        dump = json.load(open(dump_path, encoding="utf8"))
        lines = plan_river.collect_lines(dump)
        if not lines:
            return directory, name, 0
        for line in lines:
            line["weight"] = plan_river.joint_reach(line["reach"])
        live = [line for line in lines if line["level"] < float(item["stack"]) - 0.5]
        if not live:
            return directory, name, 0
        live.sort(key=lambda line: line["weight"], reverse=True)
        total = sum(line["weight"] for line in live) or 1.0
        chosen, running = 0, 0.0
        for line in live:
            chosen += 1
            running += line["weight"]
            if running / total >= coverage:
                break
        return directory, name, chosen * len(plan_river.distinct_rivers(item["board"]))
    except Exception:  # noqa: BLE001
        return directory, name, None


def main():
    rate = float(next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--rate=")), "55"))
    # Hrubší vrstva = méně vybraných linek. Přepínač je tu pro jedinou otázku:
    # kolik by koupilo snížení pokrytí, kdyby se flopová EV měla dělat přibližně.
    coverage = float(next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--coverage=")), str(COVERAGE)))
    workers = int(next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--workers=")), "8"))
    night_minutes = 595

    # 1) Desky, které flopový pack dodává, a dosah jejich pravidel.
    reach_by_board = defaultdict(float)
    rules_by_board = defaultdict(int)
    for name in os.listdir(FLOP_PACKS):
        if not name.endswith(".json"):
            continue
        pack = json.load(open(os.path.join(FLOP_PACKS, name), encoding="utf8"))
        for rule in pack.get("rules", []):
            directory = rule.get("sourceDirectory")
            if not directory:
                continue
            reach_by_board[directory] += float(rule.get("spot", {}).get("reach", 1) or 0)
            rules_by_board[directory] += 1

    # 2) Turnové podhry každé desky z plánu desky.
    jobs = []
    boards_without_plan = 0
    for directory in reach_by_board:
        plan_path = os.path.join(WORK, directory, "plan.json")
        if not os.path.exists(plan_path):
            boards_without_plan += 1
            continue
        for item in json.load(open(plan_path, encoding="utf8")).get("items", []):
            jobs.append((directory, item, coverage))

    started = time.time()
    with ProcessPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(cost_of, jobs, chunksize=64))
    print(f"oceněno {len(results)} turnových podher pod {len(reach_by_board)} dodávanými deskami za {time.time() - started:.0f} s (pokrytí linek {coverage})")

    cost_by_board = defaultdict(int)
    layered_by_board = defaultdict(int)
    games_by_board = defaultdict(int)
    missing = 0
    for directory, _name, cost in results:
        games_by_board[directory] += 1
        if cost is None:
            missing += 1
        elif cost == 0:
            layered_by_board[directory] += 1
        else:
            cost_by_board[directory] += cost
    print(f"  desek bez plánu (rozklad je nemá): {boards_without_plan}; podher bez dumpu: {missing}")

    boards = sorted(reach_by_board, key=lambda b: reach_by_board[b], reverse=True)
    total_reach = sum(reach_by_board.values())
    done_now = [b for b in boards if games_by_board[b] > 0 and cost_by_board[b] == 0]
    print(f"  desek, které mají vrstvu pod každou turnovou podhrou už dnes: {len(done_now)}")
    total_cost = sum(cost_by_board.values())
    print(f"  riverových podher ke spočítání celkem: {total_cost:,} = {total_cost / rate / night_minutes:.1f} nocí při {rate:.0f}/min")
    print("")
    print("křivka: prvních N desek podle dosahu flopových pravidel")
    print("  desek   dosah %   podher       nocí")
    cum_cost, cum_reach = 0, 0.0
    marks = {10, 25, 50, 100, 150, 200, 238, 300, len(boards)}
    for index, board in enumerate(boards, start=1):
        cum_cost += cost_by_board[board]
        cum_reach += reach_by_board[board]
        if index in marks:
            print(f"  {index:5d}   {100 * cum_reach / total_reach:6.1f}   {cum_cost:9,}   {cum_cost / rate / night_minutes:6.1f}")
    print("")
    cheapest = sorted((b for b in boards if cost_by_board[b] > 0), key=lambda b: cost_by_board[b] / max(reach_by_board[b], 1e-9))[:5]
    print("nejlevnější dosah na podhru (deska, dosah, podher):")
    for board in cheapest:
        print(f"  {board:50s} {reach_by_board[board]:6.2f} {cost_by_board[board]:7,}")


if __name__ == "__main__":
    main()
