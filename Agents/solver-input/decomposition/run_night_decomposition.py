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
- Boards are taken shallowest-first. A 25BB board's subgames are far cheaper than
  a 100BB board's, so this gets more finished per hour early on, and the expensive
  families still get their turn on a night that runs long.
- It stops at the deadline rather than mid-board where it can, because a
  half-planned board is the one state that needs re-reading a 395 MB dump.
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

    # Shallowest first: a 25BB subgame is a fraction of a 100BB one, so more
    # boards finish per hour and the deep families still get a long night.
    def depth(key):
        match = re.search(r"MTT9_(\d+)BB", key[0])
        return int(match.group(1)) if match else 999

    ordered = sorted(boards, key=lambda k: (depth(k), k[0], k[1]))
    log(f"{len(ordered)} boards have a monolithic checkpoint; deadline {deadline:%H:%M}")

    done = skipped = failed = 0
    for family, board in ordered:
        if datetime.now() >= deadline:
            log("deadline reached; stopping between boards")
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
        log(f"  {after}/{planned} after {(time.time() - started) / 60:.1f} min")
        done += 1

    log(f"boards worked {done}, already complete {skipped}, failed {failed}")


if __name__ == "__main__":
    main()
