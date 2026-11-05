"""Ocenit prioritní seznam turnové EV a seřadit ho podle dosahu za podhru.

  python price_river_layers.py [artifacts/decomposition/turn-ev-priority.json] [--workers=8]

## Proč to musí vzniknout

Seznam z `mtt:night-turn-ev --write` řadí podhry podle dosahu pravidel, která
hostí. Noc ho bere shora - a cena vrstvy se přitom liší až sedmkrát: riverová
vrstva má 13 az 259 podher podle toho, kolik linek plánovač vybere a kolik má
deska rozlišitelných riverových karet. Dosah na jednu podhru se tak mezi
vrstvami liší **třiatřicetkrát** (2,1 az 71 promile, změřeno 14. 9. 2026 na
noci 13./14.).

Změřeno simulací nad skutečným seznamem a rozpočtem té noci (24 242 podher):
pořadí podle dosahu dalo 223 vrstev a dosah 196,5; pořadí podle dosah/cena by
dalo 565 vrstev a dosah 352,4 - **o 79 % víc za stejnou noc**. Model ceny
seděl na noc přesně (223 vrstev, 24 242 podher, 196,52), takže simulace není
odhad, ale přepočet.

## Jak se cena počítá

Stejnými funkcemi jako `plan_river.py`, jen bez zápisu plánu: vybrané linky
(pokrytí 0,99) krát skupiny riverových karet. Plán se **nezapisuje** schválně -
existující `plan.json` bez jediné odsolvené podhry by detektor zastaralosti
turnové EV (`layersNewerThanTable`) vzal za novou vrstvu a ranní cyklus by
přestavěl všech 48 tabulek naprázdno.

Výsledek se zapíše zpět do téhož souboru: každý záznam dostane `cost`, pořadí
je podle `reach / cost` sestupně, záznamy bez ceny jdou na konec v původním
pořadí. Noční runner bere soubor tak, jak je.
"""
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import plan_river  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
WORK = os.path.join(REPO, "artifacts", "decomposition")
DEFAULT_PATH = os.path.join(WORK, "turn-ev-priority.json")
COVERAGE = 0.99


def board_of(directory, subgame):
    """Deska, pot a stack turnové podhry z plánu desky - to, co noc předává plánovači."""
    plan = json.load(open(os.path.join(WORK, directory, "plan.json"), encoding="utf8"))
    turn = subgame.rsplit("__", 1)[1]
    for item in plan.get("items", []):
        if item.get("turn") == turn:
            return item.get("board"), item.get("stack")
    return None, None


def cost_of(entry):
    """Kolik riverových podher by plánovač pro tuhle turnovou podhru vypsal."""
    directory, subgame = entry["directory"], entry["subgame"]
    dump_path = os.path.join(WORK, directory, subgame + ".json")
    try:
        board, stack = board_of(directory, subgame)
        if board is None or stack is None:
            return None
        dump = json.load(open(dump_path, encoding="utf8"))
        lines = plan_river.collect_lines(dump)
        if not lines:
            return None
        for line in lines:
            line["weight"] = plan_river.joint_reach(line["reach"])
        live = [line for line in lines if line["level"] < float(stack) - 0.5]
        live.sort(key=lambda line: line["weight"], reverse=True)
        total = sum(line["weight"] for line in live) or 1.0
        chosen, running = 0, 0.0
        for line in live:
            chosen += 1
            running += line["weight"]
            if running / total >= COVERAGE:
                break
        return chosen * len(plan_river.distinct_rivers(board))
    except Exception:  # noqa: BLE001 - podhra bez ceny jde na konec, ne do pádu
        return None


def price(path, workers):
    with open(path, encoding="utf8") as handle:
        document = json.load(handle)
    entries = document.get("entries", [])
    started = time.time()
    with ProcessPoolExecutor(max_workers=workers) as pool:
        costs = list(pool.map(cost_of, entries, chunksize=64))
    priced, unpriced = [], []
    for entry, cost in zip(entries, costs):
        if isinstance(cost, int) and cost > 0:
            entry["cost"] = cost
            priced.append(entry)
        else:
            entry.pop("cost", None)
            unpriced.append(entry)
    priced.sort(key=lambda entry: entry["reach"] / entry["cost"], reverse=True)
    document["entries"] = priced + unpriced
    document["pricedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    document["order"] = "reach/cost"
    with open(path, "w", encoding="utf8") as handle:
        handle.write(json.dumps(document, indent=1) + "\n")
    total_cost = sum(entry["cost"] for entry in priced)
    print(
        f"oceněno {len(priced)} z {len(entries)} podher za {time.time() - started:.0f} s;"
        f" bez ceny {len(unpriced)}; celkem {total_cost} riverových podher,"
        f" průměr {total_cost / max(1, len(priced)):.0f} na vrstvu; pořadí dosah/cena"
    )


def main():
    path = next((a for a in sys.argv[1:] if not a.startswith("--")), DEFAULT_PATH)
    workers = int(next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--workers=")), "8"))
    if not os.path.exists(path):
        raise SystemExit(f"prioritní seznam neexistuje: {path}")
    price(path, workers)


if __name__ == "__main__":
    main()
