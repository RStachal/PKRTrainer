# MTT completion roadmap

Updated: 2026-07-29
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
| Boards on the reduced review-only tree | **46/577** (was 337) |
| Families still mixing two solver trees | **3** (was 5 when ambiguity was resolved) |
| Shipped rules carrying a known content risk | **3/19** (was 5) |

The beta is roughly half-built. The full library is at six percent, and nothing
in the current plan closes that inside the 30-day window; treating it as a
near-term target is the main way this project could mislead itself.

The tree numbers move as the queue drains, so they are the one row here worth
re-reading before any release decision: `npm run mtt:texas-solver-tree-provenance -- --summary`.

## Blocked, and on exactly what

Three items, and only two distinct inputs.

**B1. Six-max preflop packs (0/4).** Needs one representative six-max preflop
export of 10-100 rows to build the adapter, then the four full exports. The
workbenches, merge, staging and promotion path all exist and are waiting. A pack
needs all nine action contexts, so filling only the computable ones does not
release it.

Measured turnkey state: the intake batch reports 4/4 scaffolds current and
structurally safe, 474,552 workbench rows across the four packs, all blank and
waiting. The whole pipeline after the data - merge, stage, import, promote - is
built and tested. What is genuinely blocked is only mapping the owner's native
export columns onto the scaffold, which cannot be written without seeing one
sample. Both beta blockers, this and B2, are data-blocked, not code-blocked.

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

1. **Decide what to do about the last 52 boards.** They sit in three deep
   families and they do not fit on this machine. Measured 2026-07-29: the tree
   commits 25.9 GB at two threads and barely moves with the thread count, against
   about 20 GB of usable physical memory. Every failure traces to this - the
   access violations at fourteen threads, the guard killing nine-thread runs every
   fifteen minutes for six hours, and a two-thread run that paged so hard it never
   left iteration zero. There is no thread count and no window that fixes it.

   Earlier notes here blamed a "fixed 11 GB tree" and scheduling. That figure was
   a working set read under memory pressure, which falls as the machine gets
   worse; committed memory is the honest measure and it is more than twice that.

   Three ways forward, and this is an owner decision. The solver's scheduled task
   is disabled meanwhile, because leaving it on cost a full day of thrashing and
   produced nothing.

   **What the three families actually contain.** The queue is not an arbitrary 52
   boards; it is precisely the reduced-tree ones, plus six that missed the
   exploitability target.

   | Family | Boards | Full tree | Reduced | Queued |
   | --- | --- | --- | --- | --- |
   | MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR | 32 | 15 | 17 | 18 |
   | MTT9_110BB_CO_BTN_3BP_FACING_MIDHIGH | 25 | 6 | 19 | 19 |
   | MTT9_150BB_CO_BTN_3BP_HIGHSPR | 30 | 20 | 10 | 15 |
   | **Total** | **87** | **41** | **46** | **52** |

   **A. More RAM.** Needs about 30 GB usable to hold a 26 GB tree with headroom,
   so roughly a 48 GB machine. Nothing else changes and the queue drains as
   planned.

   **B. A coarser tree for these three families.** The lever is bet-size
   granularity, not action types. Dropping one of three OOP flop bet sizes and one
   of two river sizes leaves raise, donk and all-in intact on every street, so this
   is NOT the reduced review-only tree - that tree's defect is the ABSENCE of turn
   and river raise, donk and all-in, which is what makes an aggregate blend two
   different games. A coarser tree is the same game described less finely.

   The catch is that the whole family has to move, not just the queue: 87 boards
   rather than 52, because 41 already-solved boards would otherwise sit on a
   different tree from their own family. That trades 52 boards that cannot
   complete on this machine for 87 that can, and it leaves these three families
   coarser than the other seventeen - visible and defensible, since within-family
   uniformity is what an aggregate depends on.

   **C. Ship without them.** Costs 3 of 19 shipped rules, all already flagged
   at-risk for these same families, and leaves the deep-stack hole open. Cheapest
   now, and the one to take if the beta date matters more than the coverage.
2. **Rebuild.** `npm run mtt:post-resolve -- --write`. It holds back families that
   still mix trees, re-harvests any drifted villain bet, and reports what it
   refused. Clears the last three at-risk rules when the queue drains.
3. **Unblock B2**, then fill the seven prepared templates from the EV export. The
   whole path after that is built and tested: intake validates, the module builder
   overlays, and the buttons show EV. This is the single change that most improves
   what a player learns, because call and raise are often separated by a hair.
4. **Unblock B1**, then promote the four six-max packs to reach preflop 8/8.
5. Repackage and re-verify the FTP artifact.

## Open items, and where they are written up

Everything below this line is a record of what was measured and what was done.
These are the ones still open:

| Item | State | Section |
| --- | --- | --- |
| 3 of 19 shipped rules from 2 tree-mixing families | waiting on the queue | The audit's blind spot |
| Same 2 families withheld by the accuracy grader | waiting on the queue | The mechanical acceptance gate |
| 1 shipped rule on a drifted villain bet | cosmetic; no size dominates there | Correction: the pin measurement |
| Six-max preflop 0/4, per-action EV 0/972 | data-blocked, plumbing done | Blocked, and on exactly what |
| BTN vs BB solved range narrower than CO vs BB | owner poker decision | Open question: solved ranges |
| Hand-line villain is not solver-backed | latent until turn pilots ship | Waiting trap |
| Turn pilot track is flop-only infrastructure | deliberately deferred | P3 |

Fixed and kept here only as the reasoning behind a guard: the line-mode
inversion, the statistics provenance gap, the preflop start guard, the facing-bet
lane naming, the fail-closed review, and the solver thread budget.

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

**P3. Turn pilots.** Turn is the largest untouched dimension and needs no external
input. This entry used to say the solver, schema, resolver and gates all already
exist. Checked: the schema and resolver do, and the turn resolver carries the
per-hand and provenance fixes with its own invariant tests. **The pilot track does
not.** `MttPostflopPilotScope` enumerates only flop scopes, the pilot gate takes a
`FlopProductionStrategyPack` and rejects anything whose street is not FLOP, and
the merge and module builders are shaped the same way.

So this is a real piece of infrastructure, not a wiring job, and building it
before any turn solve exists means writing a parallel pilot track with no data to
validate it against, while touching the gate that protects the flop content that
does ship. Worth doing when turn solves are close, not before.

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

Both remaining targets have now been worked through, and the audit did not stop
finding new defects - it found a fifth of exactly the same shape.

- **Preflop range-store path.** Clean. `rangePackProfileMismatchReasons` compares
  every dimension before a pack may be used, `startableMttPreflopRangePack` is the
  single door and requires production packs to be the exact one readiness names,
  and the per-pack runtime store rejects a lookup whose ante is not the pack's.
  That last guard covers only ante because ante is the only profile dimension a
  `RangeKey` carries; the rest are settled at selection.
- **Statistics rollups.** One defect, described below.

### The leak that was measured somewhere else

The dashboard's leak detection and its study plan grouped answers by context,
position and stack. None of those carries a training profile, and the store holds
every profile the player has ever used - ante on and off, regular and turbo,
nine-max and six-max, MTT and cash. So the percentage shown was an average across
tables the player was not sitting at, and the Train button next to it started a
drill in whichever profile happened to be loaded.

A player strong at the ante table and weak away from it was shown the average of
the two and sent to drill the strong one. `dominantAnte` is the tell: it took a
majority vote on the ante of the pooled records, which is a patch on the symptom
of mixing rather than a reason not to mix.

Same shape as the four before it - lanes keyed by rank instead of board, rule-wide
instead of per-hand recommendations, hero hands outside the solved range,
heuristic-versus-solver decided by matching free text. Each one grouped on a label
that looked like the identity and was not.

Fixed by scoping. The plan is measured inside exactly one profile and says which,
along with how many answers it set aside. Leak detection in the KPI panel takes
the same scope; the lifetime and recent figures beside it stay whole-store, since
"how am I doing" is a fair question to ask across every table. Where no caller
names a profile the plan follows the newest answer rather than falling back to
pooling, so the old behaviour is not reachable by omission.

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

## The paying subscriber got less than the free one

A hand line walks flop, turn and river. The scoped pilots are flop-only, and a
paying subscriber's runtime refuses the heuristic model - so the line could never
be generated for them. Verified by running it: a PRO_PLUS scoped-pilot runtime
throws on the turn, and the view showed a bare "unavailable".

A free preview user, whose runtime does allow the heuristic, gets a working line
on all three streets. The option was offered to both with no hint it could not
run for one of them.

Fixed by disabling the option, with its reason shown, whenever the runtime
refuses the heuristic and the profile is not production on all three streets.
The test asserts the underlying fact rather than the symptom, so if the pilots
ever gain turn and river it fails and says the option should return.

The same investigation found the catch around spot and line generation was bare,
turning every failure into "no content for this spot". A genuine defect would
have reached players as a complaint about thin coverage and never as a bug. Only
the missing-strategy refusal is handled now.

## Statistics could not tell solver progress from heuristic progress

The dashboard's "By production status" breakdown decided what counted as
production from `confidence`, a quality label the pack author sets, rather than
from provenance - and the result record did not store provenance at all.

It came out right only by coincidence: all three public heuristic packs carry LOW
confidence today. Raising one to MEDIUM, a plausible edit if that model improved,
would have started counting heuristic answers as PRODUCTION in a player's own
statistics.

Provenance is now stored and carried into analytics, and decides
solver-versus-not while confidence only grades solver-backed content. Heuristic
answers get their own bucket, because heuristic-versus-solver is a difference in
kind rather than degree. Records written earlier keep their old classification -
reinterpreting history on a guess would silently rewrite a player's past.

Preflop has no equivalent gap: its content is a production or preview pack
identified by pack id, and there is no heuristic preflop model.

## Preflop audited: the core is sound, the gate was implicit

The postflop pilots have had far more scrutiny than the preflop packs, which is
backwards - preflop is the production content and what most players use most. So
it was audited with the same lens. The core holds up:

- `lenient` and `strict` are documented and correctly wired: strict is what is
  recommended, lenient is what also grades correct.
- A hand absent from a record defaults to fold, which is right for preflop, and
  the pack audit already rejects empty strict or lenient cells - so a truncated
  range cannot silently teach folding everything.
- The action tree is total and offers FOLD everywhere except a big blind facing
  limps, where it offers LIMP and the default correctly becomes a check. The
  final `offeredKinds[0]` fallback is unreachable, so an unrecorded hand can
  never default to an aggressive action.

One thing was not sound. The postflop path refuses a profile it cannot serve
explicitly, on `canStartTraining`; **the preflop path never checks it**. What kept
six-max - which has no data at all - out of a paying player's hands was a local
helper in `main.ts` returning undefined. An invariant held by one function's
internals, stated nowhere and tested nowhere.

The rule now lives in the data layer as `startableMttPreflopRangePack`, with a
test sweeping all eight preflop profiles: any profile whose capability says it
cannot start training must not obtain a pack. Written over every combination
rather than the one unfinished today, so finishing six-max cannot quietly make
another combination startable without data.

## Every known content problem lands on the same five rules

Three separate defects were found in the shipped flop pilots - families mixing
two solver trees, families the accuracy grader withheld, and facing-bet rules
pinned to a villain bet size the solver rarely makes. Mapped onto the 19 shipped
rules they do not spread out. They stack:

| Shipped rule | Mixed tree | Withheld | Rare villain bet |
| --- | --- | --- | --- |
| `mtt9_150bb_co_btn_3bp_highspr-check-aggregate` | yes | yes | yes |
| `mtt9_150bb_co_btn_3bp_highspr-check-bet_39-aggregate` | yes | yes | yes |
| `mtt9_100bb_sb_bb_srp_oop_cbet_highspr-root-aggregate` | yes | yes | - |
| `mtt9_100bb_btn_bb_srp_facing_highspr-check-bet_17-aggregate` | yes | - | yes |
| `mtt9_50bb_btn_bb_srp_facing_midspr-check-bet_17-aggregate` | yes | - | yes |

**Fourteen of the nineteen rules carry none of them.** Every affected rule has the
mixed tree; withheld and rare-bet are strict subsets of it.

The overlap of "rare villain bet" with "mixed tree" is exact across the
facing-bet rules, which is probably not coincidence: the reduced tree has no turn
or river raises, so it distorts which flop bet size looks best, and the size was
picked on that distorted data. Recorded as a hypothesis, not a measurement.

The practical consequence is that one action clears all five: finish the queued
re-solve for those families, then rebuild - the rebuild now also re-ranks the
villain bet size by measured frequency. Until then both guards and the beta gate
name them.

## The mechanical acceptance gate is not a gate

Found while integrating the weekend re-solve. `mtt:texas-solver-mechanical-acceptance`
grades every family against the 0.5 exploitability target and withholds the ones
that fail. On the refreshed evidence it withheld two:

| Family | Why |
| --- | --- |
| `MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR` | board 883r at 4.2263 |
| `MTT9_150BB_CO_BTN_3BP_HIGHSPR` | five boards between 0.50 and 1.10 |

The other eighteen are at or under target, the worst at 0.4994.

The decision was written into `review-notes.md` and a decisions JSON, and nothing
read either back. Neither is version controlled, so the verdict existed only on
the machine that produced it. Withheld content reached the shipped packs by
default rather than by decision.

`guard:withheld-families` in the rebuild pipeline now enforces it, mapping every
shipped pilot rule back to its family. Running it named **two** families, not the
one first recorded here:

- `MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR`, supplying the SB pack's HIGH band.
- `MTT9_150BB_CO_BTN_3BP_HIGHSPR`, reaching **both** the 3bet c-bet and the 3bet
  facing-bet packs. This is the worse case, because it is also the family the
  partial-resolve guard holds back for mixing two trees - so its shipped content
  is the old pre-rebuild build *and* below the accuracy bar.

The guard is a check, not a filter: dropping a withheld family would punch a hole
in a pilot's SPR coverage, which is worse than shipping slightly unconverged
content. The solver is re-solving exactly these boards now. What has changed is
that the rebuild reports failure until they converge or someone decides to ship
them anyway.

## The audit's blind spot was hiding three mixed families

The provenance audit classified boards by matching root bet sizes against
parameter sets. That test could never work: the full and reduced trees are
**identical at the flop root** and diverge only at turn and river, so any board
whose root fits both sets came back AMBIGUOUS. That was 226 of 577 boards.

An earlier note here guessed, from dump file sizes, that those were probably not
secretly reduced. That guess was **wrong**. Reading the boards themselves showed
32 of them are reduced-tree solves, and they were concealing three tree-mixing
families from the guard built to catch precisely that:

| Family | Truth | Audit saw | Guard |
| --- | --- | --- | --- |
| `MTT9_50BB_BTN_BB_SRP_FACING_MIDSPR` | 20 reduced / 4 full | all ambiguous | missed |
| `MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR` | 12 reduced / 12 full | all ambiguous | missed |
| `MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR` | 17 reduced / 15 full | reduced only, no full | missed |

The guard tests `fullTree > 0 && reducedTree > 0`, so a family whose full boards
all hid under "ambiguous" never tripped it. All three feed shipped pilot rules:
**three of the thirteen rules a paying player trains against are aggregates
mixing two different games.** And because the batch selector only ever picked
boards it knew were reduced, those 32 would never have been re-solved - the
uniform-tree goal was unreachable by construction.

Fixed by resolving ambiguity structurally. A full parameter set declares
`set_bet_sizes oop,turn,donk`; a reduced one does not, so the solver emits that
turn node with `CHECK` as its only legal action, and a full tree never produces a
single-action node. Validated against all 351 boards the root test was confident
about with zero disagreements, and it does not false-fire on the shallowest
family. Verdicts are cached on size and mtime, so the warm pass is six seconds.

Through the chain: reduced boards 46 to 78, ambiguous 226 to 0, mixing families 2
to 5, re-solve queue 52 to 83. The solver picks up the hidden boards on its next
tick, and the affected rules should be rebuilt once it does.

`guard:mixed-tree-content` now names which shipped rules are affected, because
holding a family back from the next rebuild does nothing about the content it
already contributed. Four families reach **five of the thirteen** shipped rules:
BTN facing-bet MID and HIGH, SB c-bet HIGH, and 3bet c-bet plus 3bet facing-bet
HIGH.

## The facing-bet lanes described a move the player cannot make

The three range lanes - value, bluff, check - are named for a betting node. Six
of the nineteen shipped rules are facing-bet nodes, where the legal actions are
FOLD, CALL and RAISE, and the player was shown a lane headed "Check".

The lane also holds both the calls and the folds, which facing a bet is the whole
decision. Measured across the shipped facing-bet packs, the split inside that one
lane swings completely:

| Rule | Calls | Folds |
| --- | --- | --- |
| `mtt9_100bb_btn_bb_srp_facing_highspr` | 31 | 1 |
| `mtt9_70bb_co_btn_3bp_facing_midspr` | 35 | 1 |
| `mtt9_45bb_co_btn_3bp_facing_lowspr` | 1 | 3 |

Same colour, opposite meaning, and the range matrix carried no action at all, so
nothing anywhere distinguished them. Fixed by making the lane wording follow the
node - value raise, bluff raise, call or fold - and by carrying the solved
per-hand action into each matrix cell. Betting-node wording is unchanged.

Splitting CHECK into CALL and FOLD would be the deeper fix, but it is a schema
change reaching packs, resolvers and every generated module. Worth doing when the
lane vocabulary is next revisited.

## Correction: the facing-bet pin measurement was made on bad data

An earlier version of this section claimed three of six shipped facing-bet rules
put the player against a bet the solver rarely makes, the worst at 4 percent
against a real main size of 41. **That measurement was taken on reduced-tree
review data and is wrong as stated.**

The irony is that the same section hypothesised why: the reduced tree has no turn
or river raises, so it distorts which flop bet size looks best. It does - and the
frequencies computed from it were distorted the same way.

Re-measured after the rebuild, on full-tree data:

| Shipped rule | Pin | Its frequency | Villain's top bet |
| --- | --- | --- | --- |
| 25BB BTN LOW | BET_17 | 28.3% | same |
| 50BB BTN MID | BET_17 | 28.1% | same |
| 70BB 3bet MID | BET_52 | 28.6% | same |
| 45BB 3bet LOW | BET_52 | 20.7% | same |
| 100BB BTN HIGH | BET_17 | 14.1% | BET_25 at 17.8% |
| 150BB 3bet HIGH | BET_39 | 4.1% | BET_52 at 40.7% |

Four of six pins are the most-used size. One shipped rule genuinely disagrees on
clean data - 100BB BTN HIGH, and by a modest 3.7 points between two sizes the
solver both uses often. The 150BB row still cannot be judged: that family still
mixes trees, so its frequencies come from the same blend the correction is about.

The clearest remaining case is not shipped: MTT9_80BB_CO_BTN_3BP_MIDSPR is pinned
to BET_600, used 0.9 percent - the degenerate overbet the pinning was introduced
to avoid in the first place.

The ranking fix stands and is what prevents that: candidates are ranked by
measured villain frequency after gate validity, with lane and bucket counts kept
as tie-breakers. Verified working - on 50BB BTN MID it chose BET_17 at 28.1
percent over BET_25 at 22.6, where the old lane-count rule would have been
decided by a tie.

It now reaches the content. Rather than removing the pin wholesale - which would
re-pin every family, including those whose boards still span both trees - the
pipeline re-harvests a family when, and only when, its pin has stopped being the
villain's most-used bet. Everything else keeps its pin, since re-harvesting costs
a draft per candidate size.

Judging drift from the plan's own pin rather than from a shipped rule id changed
the answer: a family that is rebuilt but ships nothing was invisible to the
rule-id version, and that is where the worst pin was - 80BB 3bet MID at BET_600,
used 0.9 percent. Two families now re-harvest on the next rebuild, that one and
100BB BTN HIGH.

`guard:facing-bet-pin-drift` reports the state of every pin each run, and the
release gate discloses any shipped drift, so this cannot go quiet again.

### Not every drift is the same size of problem

The one remaining shipped drift is 100BB BTN HIGH, and measuring it properly
changes what to do about it. The villain checks 50.8 percent there and splits the
rest three ways - BET_25 at 17.8, BET_38 at 17.3, BET_17 at 14.1 - so the pinned
size carries 29 percent of their betting against a top of 36. Re-pinning raises
the number and leaves the spot as it was.

That is a different thing from a pin on a genuinely rare branch, which is what
80BB 3bet MID at 0.9 percent was, and reporting them identically makes a cosmetic
change look like a correctness win. The drift row now carries the top bet's share
of the villain's betting and whether that share is a majority, and the release
limit says so. The re-harvest still happens on the next rebuild; it is not a
reason to hold anything.

## Waiting trap: the villain in a hand line is not solver-backed

None of the seven shipped pilots carries an `opponentPolicy`, so in line mode the
villain always falls through to the built-in default response. The hero's
recommendation is solver-backed; the opponent's behaviour is not.

Not a live defect. Line mode is disabled for paid pilot subscribers, production
postflop does not exist, and the preview users who can run a line get a heuristic
hero as well - so provenance is uniform and nothing is mislabelled.

It becomes one the moment turn and river pilots arrive and line mode is re-enabled
for paying players: they would practise a solver line against an opponent who is
not one, with nothing saying so. Either the packs need an opponent policy or the
line has to declare whose behaviour is modelled. Recorded now so it is not
discovered by a professional in the field.

## Hand-history review now fails closed

With no range record for a spot, the parser synthesised a recommendation - the
default action, a fold - shaped exactly like a real one, so nothing downstream
could tell "fold is right here" from "we have no data, so we said fold". The same
defect that was fixed on the postflop side.

No live defect: the app sets `requireLoadedStrategy`, so a missing record already
produced an honest error. But the *default* was the unsafe one, so the guarantee
rested on every caller remembering a flag. Flipped to fail closed; nothing
depended on the synthesised fold.

Checked and deliberately left alone: the postflop bridge falls back to a default
pot and a 40BB stack, which would pick a rule from invented numbers. It is
unreachable - a street's financial state is created at the FLOP/TURN/RIVER marker
rather than at the first bet, and the bridge only runs for streets with a board.

## More threads was making the solver crash, not go faster

Checking on the background solver found three consecutive workers with zero
boards finished between them, and the process gone entirely by one of the
fifteen-minute checks.

The day/night policy scaled threads with cores, on the assumption that more
threads means more throughput. On the deep families left in the queue that is
false, and expensively so:

| Threads | Peak working set | Free RAM | Outcome |
| --- | --- | --- | --- |
| 6 | ~15 GB | comfortable | ran for hours |
| 14 | **24.3 GB** of 31.2 | under 4 GB | crashed, nothing finished in 3 h |

At fourteen threads commit reached 43.9 GB, deep into the page file, and the
solver died with an access violation. The historical crash exit codes recorded in
`failures.jsonl` are the same access violation, so this had been happening for
days without anyone connecting it to thread count.

Thread count is now bounded by a memory budget as well as by cores, written as a
reserve rather than a fraction: whatever the solver does not take has to hold the
operating system, a test run, and the headroom a large allocation needs. On this
machine that gives 11 night threads and an estimated 18.7 GB peak.

The lesson generalises past this setting. A knob that reads as "how much machine
may it use" was really two knobs, and only one of them was safe to turn up.

## Solver CPU policy

The machine is shared with development, so the solver takes a share that depends
on the clock rather than a fixed one:

| Window | Cores | Threads | Priority |
| --- | --- | --- | --- |
| 09:00-20:59 | yields the machine | - | - |
| 21:00-08:59 | 15 of 16 | 9 | Normal |

Both numbers moved once the memory cost was measured properly, and the day one
moved to nothing. Cost is a fixed base plus a per-thread increment - about 11 GB
for the tree plus 0.9 GB per thread, from 16.8 GB at six threads and 24.3 GB at
fourteen - so on a 31.2 GB machine the night budget is nine threads, not fourteen.

The day cap was worse than wrong, it was incoherent. A core percentage assumed the
solver could always share the machine if it took fewer cores, but cutting threads
does not free the fixed base: six day threads still cost 16.4 GB, which is most of
what a build and test run needs. That is why three consecutive daytime workers
produced zero boards in three hours while free memory fell to 0.4 GB. So the day
budget is computed against a development reserve, and when nothing useful is left
the worker skips the tick and the applier stops any solver instead of throttling
one that cannot help. The yield is derived from memory rather than written in as a
rule about this machine: given headroom the same arithmetic keeps it solving.

A timer applies it every fifteen minutes, because a deep board runs over an hour
and a process started in the day would otherwise hold the day cap all night.
There is also a floor: under 3 GB free the solver is stopped rather than left to
die with an access violation, which loses the same one board and nothing else.

A person can claim the machine without touching the schedule - editing the night
hours to express a temporary fact leaves an edit that outlives its reason:

    npm run mtt:solver-follow   # follow development activity (recommended)
    npm run mtt:solver-day      # solver yields the machine
    npm run mtt:solver-night    # solver takes it
    npm run mtt:solver-auto     # back to the clock

`follow` is the one to leave on. Assistant credit cannot be observed from this
machine, so instead of guessing at it the policy reads whether anyone is
developing: the newest write under `src`, `tests`, `scripts`, `package.json` and
the git index. Thirty idle minutes and the solver takes the full machine; the
moment work resumes it yields. Artifacts and solver-input are excluded, since the
solver writes there constantly and would otherwise read as development.

Switching is not instant, by design: up to the threshold plus one 15-minute tick
to take over, and up to one tick to yield. `mtt:solver-cpu-window` reports the
idle minutes, so the state is never a mystery.

The claim is persisted and re-applied by the timer, so it survives restarts, and
`mtt:solver-cpu-window` names any claim in force with the way to clear it.
Threads are part of the policy, since affinity alone does not raise utilisation -
six threads pinned to fifteen cores still do six cores of work - and because
thread count cannot be changed on a live process, a window change restarts the
worker. That discards the board in flight, which the checkpoint backup makes
safe, and costs at most one board twice a day.

    npm run mtt:solver-cpu-window     # what the policy is now, and whether the timer is installed

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
