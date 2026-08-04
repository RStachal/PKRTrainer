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
    line = "_".join(a.split()[0] + (a.split()[1].split(".")[0] if len(a.split()) > 1 else "") for a in item["line"])
    return f"{line or 'ROOT'}__{item['turn']}"


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
        # Round 1 only. Round 2 writes the whole river layer, which is hundreds of
        # megabytes per node and is not what anything downstream reads.
        "set_dump_rounds 1",
        f"dump_result {dump_path}",
    ]
    open(param_path, "w", newline="\n").write("\n".join(lines) + "\n")


def solve_one(item, out_dir, dry):
    name = item_id(item)
    dump_path = os.path.join(out_dir, f"{name}.json")
    param_path = os.path.join(out_dir, f"{name}.txt")
    if os.path.exists(dump_path) and os.path.getsize(dump_path) > 0:
        return name, "skip", 0.0, ""
    write_param(item, param_path, dump_path)
    if dry:
        return name, "planned", 0.0, ""

    started = time.time()
    try:
        result = subprocess.run(
            [os.path.join(SOLVER_ROOT, "console_solver.exe"), "-i", param_path],
            cwd=SOLVER_ROOT, capture_output=True, text=True, timeout=1800,
        )
    except subprocess.TimeoutExpired:
        return name, "timeout", time.time() - started, ""
    elapsed = time.time() - started

    exploitability = ""
    for line in reversed(result.stdout.replace("\r", "\n").split("\n")):
        if "Total exploitability" in line:
            exploitability = line.strip().split()[-2]
            break
    if not os.path.exists(dump_path):
        # The solver dies silently on some trees. Say so rather than leaving a
        # gap that looks like it was never planned.
        return name, f"FAILED exit={result.returncode}", elapsed, exploitability
    return name, "solved", elapsed, exploitability


def main():
    plan_path, out_dir = sys.argv[1], sys.argv[2]
    workers = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--workers=")), 4))
    limit = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--limit=")), 0))
    dry = "--dry" in sys.argv
    max_passes = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--passes=")), 4))

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
        done = failed = skipped = 0
        failures = []
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for name, status, elapsed, expl in pool.map(lambda i: solve_one(i, out_dir, dry), items):
                if status == "solved":
                    done += 1
                elif status == "skip":
                    skipped += 1
                elif status != "planned":
                    failed += 1
                    failures.append(name)
                if (done + failed) % 10 == 0 and status == "solved":
                    rate = (time.time() - started) / max(done, 1)
                    left = (len(items) - done - skipped - failed) * rate / max(workers, 1)
                    print(f"  {done} solved, {failed} failed, {skipped} skipped"
                          f"   last {elapsed:.0f}s expl={expl}   ~{left/60:.0f} min left")

        print(f"pass {attempt}: solved {done}, failed {failed}, skipped {skipped}")
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
