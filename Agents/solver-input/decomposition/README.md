# Decomposition prototypes

Three scripts used to test whether the deep postflop solves can be split into
turn subgames rather than solved whole. They are prototypes kept because they
produced the measurements in `Agents/mtt-completion-roadmap.md`, not a finished
pipeline.

- `extract_subgame.py` - pull a turn node out of a monolithic dump: the weighted
  ranges arriving for both players, and the strategy the monolith plays there,
  which is the answer a re-solve has to match.
- `build_and_compare.py` - solve that node on its own with the same action set,
  then score it against the monolith per hand class, weighted by how often each
  class actually arrives.
- `compare_ranges.py` - compare the ranges a cheap flop pass delivers to a node
  against the ranges the monolith carries there. This is what showed the cheap
  pass abandons slowplays.

Two facts worth keeping for whoever picks this up.

The solver takes a four-card board and weighted ranges (`AA:1.0,KK:0.5`), which
is what makes a turn subgame expressible at all. Both were tested.

A flop pass only needs `set_dump_rounds 1`. Round 2 on a flop solve writes the
whole turn layer, which is hundreds of megabytes and was what made several runs
appear to fail without an error - the solve had finished and the dump had not.
Reach probabilities into the turn need only the flop strategies, so round 1 is
enough.

## The pipeline

Three steps, all resumable, none of which ever runs a large solve.

- `plan_board.py` - read a monolithic solve, rank the flop lines by how often play
  reaches them, and write a work list of turn subgames to a coverage target.
- `solve_plan.py` - solve those subgames in parallel with the owner's action set:
  small bet, big bet, small raise, big raise and a shove, both positions, on turn
  and river. Skips work already done, so it can be interrupted freely.
- `summarise_run.py` - report what exists, what converged and what is missing.

### Why it is affordable

A board has 63 flop lines reaching a turn and 49 turn cards. Two facts cut that
from a day to under two hours.

Turn cards that differ only by a relabelling of unseen suits give the same subgame,
so 49 collapse to 26.

And the mass is not spread evenly across lines. On the measured board four lines
carry 90 percent of it and seven carry 99, because the rest are raise wars nobody
reaches. Solving in reach order to a stated coverage target means 7 lines and 182
subgames instead of 63 and 1638.

| coverage of live mass | lines | subgames |
| --- | --- | --- |
| 90% | 4 | 104 |
| 95% | 5 | 130 |
| 99% | 7 | 182 |

### Measured cost

Six concurrent subgames hold **1.6 GB between them**, about 0.26 GB each, against
25.9 GB for the monolith that cannot run at all. The limit is CPU, not memory:
six workers at two threads each already use twelve of sixteen cores.

Throughput on the reference board is roughly **1.5 subgames a minute**, so about
two hours for a board at 99 percent coverage. That is slower than the first
estimate from a single cheap node, because the deeper lines carry bigger pots and
cost more.

An obvious improvement nobody has made yet: the iteration budget is currently the
same for every node, though their reach spans four orders of magnitude. Scaling
iterations by reach would cut the tail sharply.

### What has and has not been validated

The method was checked against a monolithic solve on a matched action set and
reproduced it to 0.0709 weighted total variation while converging further -
0.296 percent exploitability against 0.481. See the roadmap entry.

Production runs deliberately use a *richer* action set than the monolith, so they
are not expected to match it and agreement with it is not the test. What is
checked per run is that every planned node exists and converged.

### One board, end to end

Board 433r, 99 percent coverage, six workers:

| | |
| --- | --- |
| subgames | 182 of 182 |
| wall time | ~40 minutes over three passes |
| memory | 1.6 GB for six concurrent, ~0.26 GB each |
| output | 128 MB, 0.71 MB per node |

The 40 minutes is the honest figure and it is not what the first run suggested.
Extrapolating from the first nineteen nodes gave two hours, because the deepest
line - check-check, full stack behind - is planned first and is by far the
slowest. The tail is much quicker.

**Those three passes were not the solver's fault.** The losses - 173 of 182, then
180, then 182 - were `PKRTrainer-Solver-CpuWindow` stopping every `console_solver`
on the machine every fifteen minutes, because its policy is computed for the
monolithic 24 GB tree and it did not distinguish our subgames from its own worker's
solve. The log names the counts: six stopped at 09:23, six at 09:37, two at 10:07.
A force-stopped process exits with 0xFFFFFFFF, which is what an access violation
returns, so it read as a flaky solver.

Fixed in `apply-solver-cpu-window.ps1`: the applier now claims a solve only while
its own worker task is `Running`, not merely installed. The retry loop stays, since
a long unattended run should survive an interruption whatever caused it, but it
should no longer have anything to do.

At this rate the 52 queued boards are about 35 hours - one or two nights - with no
solve ever exceeding a gigabyte.
