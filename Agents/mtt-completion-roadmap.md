# MTT completion roadmap

Updated: 2026-07-24
Status: ACTIVE PLAN

Two things this document keeps apart, because mixing them has repeatedly made
progress look better than it is: what finishes the **playable beta**, and what
finishes the **full MTT library**. It also separates work that is genuinely
blocked on an external input from work that can run beside it, so a wait never
costs a day.

## Verified state

Measured, not estimated:

| Dimension | State |
| --- | --- |
| Full library rows | **4/64** production, 52 preview, 8 blocked |
| Beta preflop profiles | **4/8** (six-max 0/4) |
| Beta flop pilots | **7/7** ready |
| Per-action EV, flop pilots | **0/972** |
| Per-action EV, preflop | **0/329212** |
| Postflop production matrix | **0/48** rows, 0/9600 targets |
| Turn / River content | **0** of everything |
| Boards on the reduced review-only tree | **337/577** |

The beta is roughly half-built. The full library is at six percent, and nothing
in the current plan closes that inside the 30-day window; treating it as a
near-term target is the main way this project could mislead itself.

## Blocked, and on exactly what

Three items, and only two distinct inputs.

**B1. Six-max preflop packs (0/4).** Needs one representative six-max preflop
export of 10-100 rows to build the adapter, then the four full exports. The
workbenches, merge, staging and promotion path all exist and are waiting. A pack
needs all nine action contexts, so filling only the computable ones does not
release it.

**B2. Per-action EV (0/972).** Measured: TexasSolver cannot emit EV at any dump
depth - a `set_dump_rounds 4` probe grew the file to 2.24 GB and still contained
only `action_node` and `chance_node`. Needs an EV-capable solver. GTO+ is owned
and its socket confirmed live on port 55143, but connections are refused pending
the documented `tmp/customconnect.txt` override, which requires one elevated
command.

Only the EV *numbers* are now blocked; the plumbing that carries them to the
buttons is complete and tested end to end. The intake validates an owned EV
export into a candidate pack, the pilot module builder overlays that candidate
onto the strategy pilot, the scoped-pilot runtime resolver is the flop resolver
and so surfaces `actionEvs`, and the buttons reveal them. Today the builder
reports 0/972 EV buckets; the moment an EV-capable solve fills the templates, the
same pipeline lights the buttons up with no further code.

**B3. Cross-solver comparison.** Same input as B2; answering B2 answers this.

Everything else below is unblocked.

## Critical path to the playable beta

1. **Weekend re-solve to a uniform tree** (in flight). 337 boards move off the
   reduced review-only tree so no aggregated rule mixes two different games.
2. **Post-resolve rebuild.** `npm run mtt:post-resolve -- --write` rebuilds
   evidence, drafts, merged pilots and modules with the four pipeline traps
   handled.
3. **Unblock B2**, then fill the seven prepared templates from the EV export. The
   whole path after that is built and tested: intake validates, the module builder
   overlays, and the buttons show EV. This is the single change that most improves
   what a player learns, because call and raise are often separated by a hair.
4. **Unblock B1**, then promote the four six-max packs to reach preflop 8/8.
5. Repackage and re-verify the FTP artifact.

## Parallel work while blocked

Ordered by value, all independent of B1 and B2.

**P1. Close the deep-stack hole.** Single-raised spots at the 125BB and 150BB
buckets land at SPR 20.8 and 25.0, outside every pilot band, so they resolve to
the public heuristic model with no solver backing. Either solve a deep SRP family
or stop offering those buckets for postflop training.

Partly addressed: the player is now told. `postflopSprCoverage` derives the
covered bands from the shipped pilots, and when a paying player selects a depth
past them the runtime warns plainly and points to a shallower stack instead of
showing the "pilot is active" notice and then refusing the spot. Actually closing
the hole - solving a deep SRP family - still needs solver time.

**P2. Fix the three-bet SPR mismatch.** An 18BB three-bet pot makes short stacks
very shallow: the 5BB bucket shows SPR 0.3 against a solve at 1.8, and six of
thirteen buckets are off by 1.5x or more. Options are narrowing the bands,
solving more SPR points, or restricting which buckets offer three-bet postflop.
This is a poker decision, not a mechanical one.

Partly addressed: the trainer no longer hides this from the player. Each family's
solved SPR is recovered and carried into the recommendation, `assessSprFidelity`
grades the distance, and the postflop view warns when a shown spot sits far from
the solve (see OPS-73 follow-up). The player is told, but closing the gap in the
content itself remains the owner decision above.

**P3. Turn pilots.** Turn is the largest untouched dimension and needs no
external input - the solver, schema, resolver and gates all already exist, and
the turn resolver already carries the per-hand and provenance fixes. This is the
biggest available content expansion.

**P4. Continue the correctness audit.** Four defects of the same shape were found
in one day, each resting on an incidental property rather than a structural one:
lanes by rank instead of board, rule-wide instead of per-hand recommendations,
hero hands outside the solved range, and heuristic-versus-solver decided by
matching free text.

Since then the four unaudited areas have been worked through:

- **Turn and river resolvers.** Both carry all five flop fixes; the gap was that
  their tests locked none of them, so a regression would have passed CI once
  content is added. Three invariants ported to each and proven non-vacuous by
  mutation.
- **Entitlement gating.** The paid tier serves no heuristic content: production,
  scoped-pilot and locked-pilot runtimes all set `allowFallback: false` and wire
  no heuristic resolver. A test now sweeps the paid resolver across every pilot
  rule and asserts each answer is solver-backed, rather than only checking the
  flag.
- **Scoring and EV-equivalence.** Clean. An action grades correct when it is BEST
  or within the equivalence threshold of best, so call and raise a hair apart are
  both correct, and the displayed recommendation is kept consistent with the
  highest-EV action. This is the well-built part, not a defect.
- **Hand-history review.** A replayed hand cannot be re-dealt into range, so an
  out-of-range hand is refused and labelled heuristic rather than passed off as a
  solver answer; the app path is production-only with `allowFallback: false`.
  Already covered by the provenance test.

The audit has stopped finding new defects. Remaining lower-value targets are the
statistics rollups and the preflop range-store path.

**P5. Expand board coverage.** Measured: cutting a family from 31 to 24 boards
changes the recommended action for 10.7 percent of hand classes, and to 12 boards
for 31.9 percent. Aggregates are therefore sensitive to board count, which argues
for more boards per family, not fewer.

**P6. Six-max push/fold and vs-allin contexts.** Two of the nine contexts are a
closed chipEV all-in Nash equilibrium: computable exactly, verifiable against
published equilibria, 26,364 of 118,638 rows per pack. It does not release the
pack on its own, so this is preparation rather than a deliverable, and it is only
worth doing if B1 stays blocked for a long time or if the eventual export omits
those contexts.

## What the weekend re-solve will actually deliver

Measured from the running batch, not projected from the plan:

| Quantity | Measured |
| --- | --- |
| Time per board | ~1600 s median, ~27 minutes |
| Final exploitability | 0.47% and 0.82% on the two finished boards |
| Remaining work | 335 boards, ~148 h, about 6.2 days |
| Weekend window | ~59 h |
| **Expected complete by Monday** | **~13 of 18 families** |

Quality is on target. Throughput was not, until the queue order was fixed.

The queue is grouped by family - 18 families in 18 contiguous runs - so a partial
weekend yields whole families rather than fragments of all of them. It was also
supposed to run the cheapest families first, and its comment said so, but the
sort underneath ordered families alphabetically. Alphabetically 100BB, 110BB and
150BB all precede 20BB, so the queue front-loaded its most expensive work.

The cost of that was measured on the running batch: one board written in two and
a half hours, and the next still unconverged after 82 minutes. After reordering,
the first family averaged **24.5 seconds per board** and reached the accuracy
target - a difference of roughly two hundred times, consistent with the earlier
calibration of 25 s per board around SPR 2 against 572 s around SPR 13.

Rough projection at the new order: families 1 to 4 in about an hour, 5 to 8 in
about four, 9 to 13 in about a day, leaving the five deepest families for the
following week. That is roughly 13 complete families over a weekend, against 2
under the old order.

This pairs with the partial-resolve guard in `mtt:post-resolve`, which rebuilds
only families that are whole. The number of complete families, not the number of
boards, is what decides how much Monday can actually use.

Beware the log format when checking progress: TexasSolver prints `time used:`
and `Total exploitability` at every progress checkpoint, not once per board.
Counting those lines overstates completed boards by more than twenty times and
makes converging boards look like failures. A board ends where the cumulative
time resets.

## Open question: how wide the solved ranges are

Measured across all 19 pilot rules, the solved hero range covers on average
**21.4 percent** of the 1326 combinations. Most values are plausible for their
spot:

| Pilot | Coverage | Plausible for the spot? |
| --- | --- | --- |
| UTG vs BB SRP | 14.8% | yes, UTG opens roughly this wide |
| CO vs BB SRP | 24.9% | yes |
| BTN vs CO 3bet pot | 13.1% | yes, a 3bet-pot continuing range is narrow |
| SB vs BB OOP | 36.0% | yes |
| **BTN vs BB SRP** | **19.0%** | **no** |

The button is the widest opening seat, so its range must be wider than the
cutoff's, and here it is narrower. Both rules are the same shape - preflop raiser
versus big blind in a single-raised pot - so the comparison is like for like.
That points at the range in the solve inputs for `MTT9_*_BTN_BB_SRP`, not at the
pipeline.

This matters more since the trainer now deals the hero only from the solved
range: whatever that range is, it is exactly what a player practises. It is a
poker judgement about solve inputs rather than a mechanical defect, so it is
recorded rather than changed. Confirming or correcting it is an owner decision,
and re-solving those families would be the follow-up.

## What full library completion would actually take

Not a 30-day target, and worth stating plainly so it is never promised. The
matrix is 48 postflop profile rows across three streets and 50 position patterns,
9600 targets, currently zero. Each production row needs comprehensive coverage
rather than a scoped pilot: every pot type, position, SPR band, texture and lane.
Reaching it is a solver-time problem measured in weeks, and the measured curve is
steep - 25 seconds per board at SPR 2 against 572 seconds at SPR 13 without even
converging.

The honest sequence is: finish the beta, ship it to the professional field, then
decide whether the full matrix is worth the compute given what the field reports.
