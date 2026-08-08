"""Decompose as many solved boards as the night allows, board after board.

Every board with a monolithic checkpoint can have its turn nodes re-solved at the
richer action set - two bet sizes, two raise sizes and a shove on both streets -
because each subgame is under a gigabyte where the monolith needs 25.9 GB. There
are 577 such boards, so this is not a job that finishes; it is a job that makes
progress and stops when told.

  python run_night_decomposition.py [--until=HH:MM] [--workers=N] [--coverage=0.99]

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
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
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

    hour, minute = (int(x) for x in until.split(":"))
    deadline = datetime.now().replace(hour=hour, minute=minute, second=0, microsecond=0)
    if deadline <= datetime.now():
        deadline += timedelta(days=1)

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
                log(f"  plan failed: {result.stderr.strip().splitlines()[-1:] or result.stdout.strip()[-200:]}")
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


if __name__ == "__main__":
    main()
