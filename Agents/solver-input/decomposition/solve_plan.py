"""Solve the turn subgames a plan lists, in parallel, and resumably.

Each item is an independent two-street solve of about 0.8 GB, so several run
side by side without approaching the memory ceiling that stops the monolithic
solves. Finished items are skipped on a second run, which matters because this is
meant to be left going overnight and interrupted freely.

The action set is the one the owner asked for and is deliberately richer than the
monolithic trees carry: on each street, for both positions, a small bet, a big
bet, a small raise, a big raise and a shove.

  python solve_plan.py <plan.json> <out-dir> [--workers=N] [--limit=N] [--passes=N] [--dry]
"""
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

SOLVER_ROOT = os.environ.get(
    "PKRTRAINER_TEXAS_SOLVER_ROOT",
    r"C:\Users\stachal\PKRTrainer\tools\TexasSolver-v0.2.0-Windows\TexasSolver-v0.2.0-Windows",
)

# Percentages of pot. Two bets and two raises per street, plus the shove that
# `allin` adds, which is what "malý bet, velký bet, raise malý, raise velký,
# shove" comes to.
BET_PCT = "33,75"
RAISE_PCT = "60,120"


def item_id(item):
    """Jméno souboru pro položku plánu, ať je z turnové nebo riverové vrstvy.

    Turnový plán nese kartu pod klíčem `turn`, riverový pod `river`. Tahle
    funkce četla jen `turn`, takže riverová fáze nočního běhu spadla na první
    položce s `KeyError: 'turn'` - byla zapojená, ale nikdy neprošla celou
    cestou. Ta chyba by se objevila až v noci a spolkla by okno.
    """
    line = "_".join(a.split()[0] + (a.split()[1].split(".")[0] if len(a.split()) > 1 else "") for a in item["line"])
    card = item.get("turn") or item.get("river")
    if card is None:
        raise SystemExit(f"položka plánu nemá kartu (ani turn, ani river): {sorted(item)}")
    return f"{line or 'ROOT'}__{card}"


def dump_rounds_for(board):
    """Kolik kol se má zapsat, podle toho, kolik karet už na stole leží.

    Změřeno na solveru, protože jeho `set_dump_rounds` neznamená "N kol odsud".
    Turnová podhra (čtyři karty) s jedničkou zapíše turnovou vrstvu; riverová
    podhra (pět karet) s toutéž jedničkou nezapíše **nic** - a neřekne to. Solve
    proběhne, konvergence se vypíše, návratový kód je nula a na disku není
    soubor. Zvenčí to vypadá jako "solver umřel na téhle větvi".

    S dvojkou vznikne 29 898 B; trojka i čtyřka dají bajt po bajtu totéž, protože
    po riveru už žádná ulice není. Bere se tedy nejmenší hodnota, která funguje.

    U turnu se dvojka vzít nesmí: tam by druhé kolo byla celá riverová vrstva,
    tedy stovky megabajtů na uzel, a to je přesně to, co dekompozice neukládá.
    """
    return 2 if len(board) >= 5 else 1


def write_param(item, param_path, dump_path):
    def spec(side):
        return ",".join(f"{n}:{w}" for n, w in sorted(item[side].items()))

    lines = [
        f"set_pot {item['pot']:.0f}",
        f"set_effective_stack {item['stack']:.0f}",
        f"set_board {','.join(item['board'])}",
        f"set_range_oop {spec('oop')}",
        f"set_range_ip {spec('ip')}",
    ]
    for street in ("turn", "river"):
        for side in ("oop", "ip"):
            lines += [
                f"set_bet_sizes {side},{street},bet,{BET_PCT}",
                f"set_bet_sizes {side},{street},raise,{RAISE_PCT}",
                f"set_bet_sizes {side},{street},allin",
            ]
    lines += [
        "set_allin_threshold 0.67",
        "build_tree",
        "set_thread_num 2",
        "set_accuracy 0.3",
        "set_max_iteration 200",
        "set_print_interval 50",
        "set_use_isomorphism 1",
        "start_solve",
        f"set_dump_rounds {dump_rounds_for(item['board'])}",
        f"dump_result {dump_path}",
    ]
    open(param_path, "w", newline="\n").write("\n".join(lines) + "\n")


# Strop na jednu podhru, ve vteřinách, a kolik z něj smí přetéct za deadline.
#
# Půlhodina sama o sobě mez okna nedrží: `solve_one` odmítne *začít* po
# deadlinu, jenže co už běží, doběhne - a při osmi jádrech je to osm podher,
# každá až třicet minut po konci okna. Noc z 24. na 25. 8. přetáhla o 66 minut.
#
# Ořez na `deadline + 4 min` znamená, že se běh zastaví sám a čistě; rodičovský
# kill v `run_night_decomposition.py` přijde na `deadline + 5 min` a je jen
# záložní. Zabít rozdělaný solve je bezpečné: píše se do `.part` a pod finální
# jméno jde až ověřený výsledek, takže useknutá podhra se nepočítá za hotovou.
ITEM_TIMEOUT_SECONDS = 1800.0
ITEM_GRACE_SECONDS = 240.0


def item_timeout(deadline, now=None):
    """Kolik vteřin smí jedna podhra běžet, aby okno přetekla nejvýš o grace."""
    if deadline is None:
        return ITEM_TIMEOUT_SECONDS
    current = time.time() if now is None else now
    return max(60.0, min(ITEM_TIMEOUT_SECONDS, deadline - current + ITEM_GRACE_SECONDS))


def solve_one(item, out_dir, dry, deadline=None):
    name = item_id(item)
    # Konec okna se musí hlídat tady, ne jen mezi vrstvami.
    #
    # Noční běh dosud odhadoval délku další vrstvy z těch předchozích a podle
    # toho se rozhodoval, jestli ji začít. 19.8. to selhalo: vrstva o 333
    # podhrách začala v 07:13, historicky největší trvala 8,8 minuty, zbývalo 47
    # - a běžela 78 minut, protože pár podher spadlo do třicetiminutového
    # timeoutu a `--passes=4` je zkusilo znovu. Osm jader tím drželo stroj
    # hodinu a půl do pracovního dne.
    #
    # Odhad se nedá spravit lepším odhadem. Tohle je tvrdá mez: po deadlinu se
    # další podhra nezačne, rozdělaná se dopočítá a fáze doběhne sama.
    if deadline is not None and time.time() >= deadline:
        return name, "deadline", 0.0, ""
    dump_path = os.path.join(out_dir, f"{name}.json")
    # Solver zapisuje vedle a pod finální jméno to jde až ověřené.
    #
    # Dosud psal rovnou do `<name>.json` a hotovost se poznávala podle "soubor
    # existuje a není prázdný". Jenže tenhle běh se ukončuje zvenčí pořád: v
    # deadlinu, po timeoutu, po zabití driveru, a nově i když dojde místo na
    # disku. Useknutý zápis pak existuje, není prázdný - a počítá se jako hotová
    # podhra. Deska se tím uzavře jako kompletní, na review bráně projde a chyba
    # vyjde najevo až u generátoru packů, tedy o týdny později a na jiném místě.
    #
    # `.part` nekončí na `.json`, takže ho žádné počítání hotových podher nevidí.
    part_path = f"{dump_path}.part"
    param_path = os.path.join(out_dir, f"{name}.txt")
    if os.path.exists(dump_path) and os.path.getsize(dump_path) > 0:
        return name, "skip", 0.0, ""
    write_param(item, param_path, part_path)
    if dry:
        return name, "planned", 0.0, ""

    started = time.time()
    try:
        result = subprocess.run(
            [os.path.join(SOLVER_ROOT, "console_solver.exe"), "-i", param_path],
            cwd=SOLVER_ROOT, capture_output=True, text=True,
            timeout=item_timeout(deadline),
        )
    except subprocess.TimeoutExpired:
        return name, "timeout", time.time() - started, ""
    elapsed = time.time() - started

    exploitability = ""
    for line in reversed(result.stdout.replace("\r", "\n").split("\n")):
        if "Total exploitability" in line:
            exploitability = line.strip().split()[-2]
            break
    if not os.path.exists(part_path):
        # The solver dies silently on some trees. Say so rather than leaving a
        # gap that looks like it was never planned.
        return name, f"FAILED exit={result.returncode}", elapsed, exploitability
    try:
        json.load(open(part_path, encoding="utf8"))
    except Exception:
        # Rozparsovat se to musí tady, protože tohle je jediné místo, kde se ještě
        # ví, že soubor právě vznikl. Stojí to jednotky milisekund proti solvu,
        # který trvá minuty.
        os.remove(part_path)
        return name, f"TRUNCATED exit={result.returncode}", elapsed, exploitability
    os.replace(part_path, dump_path)
    return name, "solved", elapsed, exploitability


def main():
    plan_path, out_dir = sys.argv[1], sys.argv[2]
    # Absolutní, protože solver běží s `cwd` ve svém vlastním adresáři.
    #
    # Relativní cesta se u něj vyhodnotí proti kořeni solveru, kde nic z tohohle
    # neleží. `-i` pak ukazuje na neexistující soubor a `dump_result` do
    # neexistujícího adresáře - a solver v obou případech mlčí: nic nevypíše,
    # vrátí nulu a nezapíše soubor. Zvenčí to vypadá jako "solver umřel na téhle
    # větvi", což je hláška o pár řádků níž, takže se pak hledá vada ve stromě
    # místo v cestě. Stálo to jednu vrstvu odsolvovanou dvakrát.
    #
    # Noční běh si absolutní cesty skládá sám, takže tohle chrání ruční spuštění.
    out_dir = os.path.abspath(out_dir)
    workers = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--workers=")), 4))
    limit = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--limit=")), 0))
    dry = "--dry" in sys.argv
    max_passes = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--passes=")), 4))
    # Epocha, ne HH:MM: volající už deadline zná a překlad na místní čas by tady
    # jen přidal druhé místo, kde se dá splést půlnoc.
    deadline = float(next((a.split("=")[1] for a in sys.argv if a.startswith("--deadline=")), 0)) or None

    plan = json.load(open(plan_path, encoding="utf8"))
    items = plan["items"][:limit] if limit else plan["items"]
    os.makedirs(out_dir, exist_ok=True)
    print(f"{len(items)} subgames, {workers} at a time, into {out_dir}")

    started = time.time()
    # The solver dies at random on some trees - the same node fails on one run and
    # solves on the next, and the exit code is 4294967295, an access violation. It
    # is not memory: these hold about a quarter of a gigabyte each. So a failure is
    # retried rather than reported, and each pass narrows the gap. On the reference
    # board this went 173 of 182, then 180, then all 182.
    attempt = 0
    while True:
        attempt += 1
        done = failed = skipped = expired = 0
        failures = []
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for name, status, elapsed, expl in pool.map(
                lambda i: solve_one(i, out_dir, dry, deadline), items
            ):
                if status == "solved":
                    done += 1
                elif status == "skip":
                    skipped += 1
                elif status == "deadline":
                    # Nedokončené kvůli konci okna, ne kvůli vadě. Kdyby se to
                    # počítalo mezi selhání, `failed > 0` by spustilo další
                    # průchod a mez by neplatila.
                    expired += 1
                elif status != "planned":
                    failed += 1
                    failures.append(name)
                if (done + failed) % 10 == 0 and status == "solved":
                    rate = (time.time() - started) / max(done, 1)
                    left = (len(items) - done - skipped - failed) * rate / max(workers, 1)
                    print(f"  {done} solved, {failed} failed, {skipped} skipped"
                          f"   last {elapsed:.0f}s expl={expl}   ~{left/60:.0f} min left")

        print(f"pass {attempt}: solved {done}, failed {failed}, skipped {skipped}"
              + (f", {expired} po deadlinu" if expired else ""))
        if expired:
            print("konec okna: další průchod se nezačíná")
            break
        if dry or failed == 0 or done == 0 or attempt >= max_passes:
            # done == 0 means the pass achieved nothing, so another would not either.
            if failed:
                print(f"\nstill failing after {attempt} pass(es):")
                for name in failures:
                    print(f"  {name}")
            break

    print(f"\nelapsed {(time.time() - started)/60:.1f} min over {attempt} pass(es)")


if __name__ == "__main__":
    main()
