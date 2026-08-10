"""Decompose as many solved boards as the night allows, board after board.

Every board with a monolithic checkpoint can have its turn nodes re-solved at the
richer action set - two bet sizes, two raise sizes and a shove on both streets -
because each subgame is under a gigabyte where the monolith needs 25.9 GB. There
are 577 such boards, so this is not a job that finishes; it is a job that makes
progress and stops when told.

  python run_night_decomposition.py [--until=HH:MM] [--workers=N] [--coverage=0.99]
                                    [--river-budget=N]

Design notes worth keeping:

- It is resumable at every level. A board whose plan and outputs already exist is
  skipped in seconds, so an interrupted night costs nothing but the board in
  flight.
- Half-finished boards are taken before anything else, then boards deepest-first. This was the other way until the first full
  night measured what shallowest-first produced: more boards, but over half their
  turn nodes offering only check-or-shove, because a low SPR leaves no room for a
  second sizing. Throughput was the wrong thing to maximise.
- It stops at the deadline rather than mid-board where it can, because a
  half-planned board is the one state that needs re-reading a 395 MB dump. It
  will not *start* a board it does not expect to finish in time, either, which is
  what `--until` originally failed to mean: gating only the start let a board
  begun nine minutes before the deadline run half an hour past it.

Stopping it early takes three steps, in order, because the children outlive the
parent on Windows: kill this driver, then the `solve_plan.py` it launched, then
`console_solver.exe`. Killing only the driver leaves solve_plan orphaned and still
spawning solvers, which looks exactly like solvers that refuse to die - taskkill
reports success on each one and the count stays where it was.
"""
import json
from collections import defaultdict
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))

# Nejdelší okno, které se ještě bere jako noční běh, v hodinách.
MAX_WINDOW_HOURS = 11
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUTPUT_BASE = os.path.join(REPO, "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver")
PARAM_ROOT = os.path.join(REPO, "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters")
WORK = os.path.join(REPO, "artifacts/decomposition")


def log(message: str) -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{stamp}] {message}", flush=True)


def board_parameter_files():
    """Every board that has a monolithic checkpoint, with the parameters it used."""
    found = {}
    for root, _dirs, files in os.walk(PARAM_ROOT):
        for name in files:
            if not name.endswith(".txt"):
                continue
            stem = re.sub(r"^\d+_", "", name[:-4])
            if "_" not in stem:
                continue
            family, board = stem.rsplit("_", 1)
            checkpoint = os.path.join(OUTPUT_BASE, family, "raw", f"pkrtrainer_{family}_{board}.json")
            if os.path.exists(checkpoint):
                found.setdefault((family, board), os.path.join(root, name))
    return found


def read_parameters(path: str):
    text = open(path, encoding="utf8", errors="replace").read()
    pot = re.search(r"set_pot\s+([\d.]+)", text)
    stack = re.search(r"set_effective_stack\s+([\d.]+)", text)
    board = re.search(r"set_board\s+([^\r\n]+)", text)
    if pot is None or stack is None or board is None:
        return None
    return float(pot.group(1)), float(stack.group(1)), board.group(1).strip()


def main():
    until = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--until=")), "08:45")
    workers = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--workers=")), "8")
    coverage = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--coverage=")), "0.99")
    # Riverová vrstva je vypnutá, dokud se nezadá rozpočet. Zapnutá naslepo by
    # spolkla celé okno turnové fázi, a nedokončený turn blokuje review bránu.
    river_budget = int(next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--river-budget=")), "0"))

    hour, minute = (int(x) for x in until.split(":"))
    deadline = datetime.now().replace(hour=hour, minute=minute, second=0, microsecond=0)
    if deadline <= datetime.now():
        deadline += timedelta(days=1)

    # Okno se nesmí natáhnout na celý den.
    #
    # `--until=07:00` spuštěné ve 21:00 dá deset hodin, ale spuštěné v 08:00 dá
    # dvacet tři - a běh pak drží osm jader přes celou pracovní dobu. Přesně to
    # se stalo: log má poslední zápisy v 08:19, hodinu po zamýšleném konci, a
    # kontrola deadlinu u každé desky proti tomu nepomůže, protože deadline sám
    # byl špatně. Solvení patří do noci; spuštění mimo ni je skoro vždy omyl.
    window_hours = (deadline - datetime.now()).total_seconds() / 3600
    if window_hours > MAX_WINDOW_HOURS and "--force" not in sys.argv:
        log(
            f"okno by trvalo {window_hours:.1f} h (do {deadline:%d.%m. %H:%M}), což je víc než "
            f"{MAX_WINDOW_HOURS} h - běh se pravděpodobně spouští mimo noční okno. "
            "Buď spusť po 21:00, nebo přidej --force."
        )
        return

    os.makedirs(WORK, exist_ok=True)
    boards = board_parameter_files()

    def depth(key):
        match = re.search(r"MTT9_(\d+)BB", key[0])
        return int(match.group(1)) if match else 999

    # Deepest first, reversing the original choice on evidence. Shallowest-first
    # finished more boards per hour, and the first full night showed why that was
    # the wrong thing to maximise: of the 22,842 subgames it produced, 12,397 turn
    # nodes offered only two actions. At 20 to 35BB a flop bet and call leaves an
    # SPR under one, so nothing fits between a small bet and the stack and the tree
    # collapses to check-or-shove. Those nodes are correct and nearly free of
    # information. The ones worth having - two bet sizes, two raise sizes, a shove
    # that is a real choice - exist only where the stack is deep, and those were
    # exactly the boards the old ordering left until last.
    def partially_done(key):
        """How far a board already is: 0 untouched, 1 finished, between if partial.

        A board left half solved is wasted work until it is finished, and
        finishing it costs less than starting a fresh one. It also unblocks the
        review gate at family level: MTT9_40BB_UTG_BB_SRP sat at 2,010 of 2,152
        subgames because a single board stopped at 38 of 180, and one incomplete
        board blocks the whole family whatever the other twelve did.
        """
        out_dir = os.path.join(WORK, f"{key[0]}__{key[1]}")
        plan_path = os.path.join(out_dir, "plan.json")
        if not os.path.exists(plan_path):
            return 0.0
        try:
            planned = len(json.load(open(plan_path, encoding="utf8"))["items"])
        except Exception:
            return 0.0
        if planned == 0:
            return 0.0
        solved = len([f for f in os.listdir(out_dir)
                      if f.endswith(".json") and f != "plan.json"])
        return solved / planned

    def priority(key):
        progress = partially_done(key)
        # Started but unfinished goes first, least-finished within that, then the
        # deepest untouched boards as before. A finished board sorts with the
        # untouched ones and is skipped seconds later either way.
        started = 0 < progress < 1
        return (0 if started else 1, progress if started else 0, -depth(key), key[0], key[1])

    ordered = sorted(boards, key=priority)
    log(f"{len(ordered)} boards have a monolithic checkpoint; deadline {deadline:%H:%M}")

    done = skipped = failed = 0
    # How long a board has been taking, so the deadline can mean what it says.
    # `--until` used to gate only the start of a board, and a board is 20 to 30
    # minutes: a board begun at 07:51 ran until past 08:20, holding eight cores
    # through the first half hour of the working day. Now a board is only started
    # if it is expected to finish in time, using the measured duration of the
    # boards already done this run rather than a guess.
    board_minutes = []
    for family, board in ordered:
        remaining = (deadline - datetime.now()).total_seconds() / 60
        if remaining <= 0:
            log("deadline reached; stopping between boards")
            break
        if board_minutes:
            expected = max(board_minutes)
            if expected > remaining:
                log(
                    f"stopping {remaining:.0f} min before the deadline: the next board "
                    f"needs about {expected:.0f} min and would overrun it"
                )
                break

        out_dir = os.path.join(WORK, f"{family}__{board}")
        plan_path = os.path.join(out_dir, "plan.json")
        os.makedirs(out_dir, exist_ok=True)

        parameters = read_parameters(boards[(family, board)])
        if parameters is None:
            log(f"SKIP {family} {board}: cannot read pot/stack/board")
            skipped += 1
            continue
        pot, stack, board_cards = parameters

        if not os.path.exists(plan_path):
            checkpoint = os.path.join(OUTPUT_BASE, family, "raw", f"pkrtrainer_{family}_{board}.json")
            log(f"planning {family} {board} ({board_cards}, pot {pot:.0f}, stack {stack:.0f})")
            result = subprocess.run(
                [sys.executable, os.path.join(HERE, "plan_board.py"),
                 checkpoint, board_cards, str(pot), str(stack), plan_path, coverage],
                capture_output=True, text=True,
            )
            if result.returncode != 0 or not os.path.exists(plan_path):
                # Návratový kód a obě roury, ne jen poslední řádek stderru.
                #
                # Původní hlášení tisklo `stderr.splitlines()[-1:] or stdout[-200:]`,
                # což pro proces zabitý bez výstupu vypsalo prázdný seznam - a
                # jedna noc tak spálila 119 desek na řádcích "plan failed: " bez
                # jediného vodítka. Plánovač přitom na týchž datech ručně projde,
                # takže příčina byla v prostředí a přesně to zahozený návratový
                # kód říct uměl.
                detail = (result.stderr.strip() or result.stdout.strip() or "žádný výstup")
                if not os.path.exists(checkpoint):
                    detail = f"chybí checkpoint {checkpoint}"
                elif result.returncode == 0:
                    detail = f"plán se nezapsal do {plan_path}; {detail}"
                log(f"  plan failed (rc={result.returncode}): {detail[-400:]}")
                failed += 1
                continue

        planned = len(json.load(open(plan_path, encoding="utf8"))["items"])
        solved = len([f for f in os.listdir(out_dir) if f.endswith(".json") and f != "plan.json"])
        if solved >= planned:
            skipped += 1
            continue

        log(f"solving {family} {board}: {planned - solved} of {planned} subgames left")
        started = time.time()
        subprocess.run(
            [sys.executable, os.path.join(HERE, "solve_plan.py"),
             plan_path, out_dir, f"--workers={workers}"],
            capture_output=True, text=True,
        )
        after = len([f for f in os.listdir(out_dir) if f.endswith(".json") and f != "plan.json"])
        minutes = (time.time() - started) / 60
        log(f"  {after}/{planned} after {minutes:.1f} min")
        board_minutes.append(minutes)
        done += 1

    log(f"boards worked {done}, already complete {skipped}, failed {failed}")

    if river_budget > 0:
        run_river_phase(deadline, workers, coverage, river_budget)


def turn_subgames_by_reach(limit):
    """Vyřešené turnové podhry, od nejčastěji dosahovaných.

    River nejde plánovat plošně. Z jedné turnové podhry vyjde kolem 111 riverových
    a turnových je přes dva tisíce - to je čtvrt milionu solvů, tedy ne noc, ale
    měsíce. Reach je přitom v plánech zapsaný, takže výběr nemusí nic hádat: bere
    se shora a končí se u rozpočtu.
    """
    rows = []
    for name in os.listdir(WORK):
        directory = os.path.join(WORK, name)
        plan_path = os.path.join(directory, "plan.json")
        if not os.path.isdir(directory) or not os.path.exists(plan_path):
            continue
        try:
            plan = json.load(open(plan_path, encoding="utf8"))
        except Exception:
            continue
        for item in plan.get("items", []):
            subgame = os.path.join(directory, subgame_file_name(item))
            if not os.path.exists(subgame):
                continue
            rows.append({
                "path": subgame,
                "directory": directory,
                "board": ",".join(item.get("board", [])),
                "pot": item.get("pot", plan.get("pot", 0)),
                "stack": item.get("stack", plan.get("stack", 0)),
                "reach": item.get("reach", 0),
            })
    # Uvnitř desky podle reach, mezi deskami střídavě.
    #
    # Samotné řazení podle reach vybere prvních pět podher z jedné desky a jedné
    # linky - liší se jen turnovou kartou - protože reach je vlastnost linky, ne
    # karty. Riverová vrstva na jedné desce ale neučí nic, co by se nedalo naučit
    # z jedné z nich. Stejná chyba a stejná oprava jako u rozpočtu turnových
    # pravidel: brát po jedné z každé desky, dokud rozpočet vydrží.
    by_directory = defaultdict(list)
    for row in rows:
        by_directory[row["directory"]].append(row)
    for bucket in by_directory.values():
        bucket.sort(key=lambda row: row["reach"], reverse=True)

    queues = sorted(by_directory.values(), key=lambda bucket: bucket[0]["reach"], reverse=True)
    picked = []
    index = 0
    while len(picked) < limit:
        placed = 0
        for bucket in queues:
            if index >= len(bucket):
                continue
            if len(picked) >= limit:
                break
            picked.append(bucket[index])
            placed += 1
        if placed == 0:
            break
        index += 1
    return picked


def subgame_file_name(item):
    """Jak solve_plan pojmenoval soubor pro tuhle položku plánu."""
    parts = []
    for action in item.get("line", []):
        action = action.strip()
        head = action.split()[0].upper()
        if head in ("BET", "RAISE", "ALLIN", "ALL_IN"):
            parts.append(f"{head}{round(float(action.split()[1]))}")
        else:
            parts.append(head)
    return "__".join(["_".join(parts), item["turn"]]) + ".json"


def run_river_phase(deadline, workers, coverage, budget):
    """Riverová vrstva pro nejčastěji dosahované turny, dokud vydrží okno.

    Běží až po turnové fázi schválně. Nedokončený turn blokuje celou rodinu na
    review bráně, kdežto chybějící river zatím neblokuje nic - takže dokud turn
    není hotový, je river ta levnější věc, kterou lze odložit.
    """
    log(f"river phase: rozpočet {budget} turnových podher")
    picked = turn_subgames_by_reach(budget)
    log(f"  {len(picked)} podher vybráno podle reach")
    done = 0
    for row in picked:
        remaining = (deadline - datetime.now()).total_seconds() / 60
        if remaining <= 0:
            log("  deadline reached; stopping river phase")
            break
        out_dir = os.path.join(row["directory"], "river", os.path.basename(row["path"])[:-5])
        plan_path = os.path.join(out_dir, "plan.json")
        os.makedirs(out_dir, exist_ok=True)
        if not os.path.exists(plan_path):
            result = subprocess.run(
                [sys.executable, os.path.join(HERE, "plan_river.py"),
                 row["path"], row["board"], str(row["pot"]), str(row["stack"]),
                 plan_path, str(coverage)],
                capture_output=True, text=True,
            )
            if result.returncode != 0 or not os.path.exists(plan_path):
                log(f"  SKIP {out_dir}: plánování selhalo")
                continue
        planned = len(json.load(open(plan_path, encoding="utf8")).get("items", []))
        solved = len([f for f in os.listdir(out_dir) if f.endswith(".json") and f != "plan.json"])
        if solved >= planned:
            continue
        log(f"  solving river {os.path.basename(out_dir)}: {planned - solved} z {planned}")
        subprocess.run(
            [sys.executable, os.path.join(HERE, "solve_plan.py"),
             plan_path, out_dir, f"--workers={workers}"],
            capture_output=True, text=True,
        )
        done += 1
    log(f"river phase: {done} turnových podher dostalo riverovou vrstvu")


if __name__ == "__main__":
    main()
