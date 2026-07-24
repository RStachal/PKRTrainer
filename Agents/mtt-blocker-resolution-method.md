# Method for the two remaining MTT content blockers

Updated: 2026-07-24
Status: ACTIVE METHOD

Two blockers stop the MTT beta from growing: four six-max CHIP_EV preflop packs
with zero records, and per-action EV that is `0/972` on the scoped FLOP pilots so
every EV bubble stays hidden. This document records what was measured about each
and the method that follows from it.

## Blocker A - per-action EV

### What was measured, not assumed

TexasSolver v0.2.0 cannot emit EV, and this was verified rather than inferred.

1. The committed dumps contain exactly two node kinds, `action_node` and
   `chance_node`, and the only per-hand payload is `strategy`, a frequency vector.
   There is no `ev`, `utility`, `payoff`, `terminal` or `showdown` key anywhere.
2. The command vocabulary in `parameters/sample_parameters/*.txt` has no EV or
   utility dump command; `dump_result` writes the strategy tree only.
3. A controlled probe re-solved `MTT9_50BB_BTN_BB_SRP K83r` with
   `set_dump_rounds 4` instead of `2`. The dump grew from about 25 MB to 2.24 GB
   and still contained only `action_node` and `chance_node`, with no terminal or
   EV keys. Depth changes the size of the strategy tree, not its content.

So the export format is a strategy dump at every depth. Nothing about how we call
the solver will produce EV.

### Why deriving EV ourselves is rejected

EV is mathematically derivable from a full-depth strategy tree: terminal payoffs
follow from board plus hole cards at showdown and from pot accounting on folds,
and values propagate up through the strategies. That is a real option in theory
and it fails on two practical grounds.

- Storage. One board needs a full-depth dump. The probe was 2.24 GB and had not
  finished. Across 439 boards this is on the order of a terabyte of intermediate
  data for a beta whose entire runtime bundle is 170 KB.
- Correctness risk. A hand-written EV engine with showdown evaluation, card
  removal and tree propagation is exactly the kind of component whose errors are
  silent. A wrong EV is worse than a hidden EV bubble, because the product's
  claim is that it recommends optimal play.

### The method

EV requires a solver that exports it. Concretely, in order of preference:

1. **Confirm the second solver first.** This also unblocks `XSOLVER-01`, the
   exact cross-solver comparison, so one decision closes two items. The owner
   must confirm GTO+ is installed and licensed, or name the available
   alternative. PioSolver, GTO+ and Simple Postflop all export per-action EV.
2. **Export one paired node before any bulk work.** Take one existing family,
   board and node already solved by TexasSolver, solve the identical spot in the
   second solver with the same ranges, tree, pot and effective stack, and export
   with EV included.
3. **Adapt, then compare.** Implement only that raw format's adapter and run
   `npm run range:cross-check-exact` against the TexasSolver canonical file. This
   validates that the second solver reproduces the strategy we already trust
   before its EV is imported anywhere.
4. **Ingest EV into the existing action-EV workbench.** The seven blank templates
   for 972 decisions and 2,916 action slots already exist and are current, so the
   EV values drop into a prepared structure rather than a new one.

Until step 1 is answered, no amount of local compute moves this blocker. The
right use of the machine is Blocker B.

## Blocker B - six-max preflop

### The shape of the gap

Each of the four packs is one CSV of 118,638 rows, which is
6 positions x 13 stacks x 9 action contexts x 169 hand classes. The nine contexts
each carry 13,182 rows:

`RFI`, `VS_OPEN`, `VS_LIMP`, `VS_3BET`, `VS_4BET`, `SQUEEZE`, `BVB`,
`PUSH_FOLD`, `VS_ALLIN`.

TexasSolver is postflop-only; it requires a board and cannot solve any of this.

### What is exactly computable without any external solver

`PUSH_FOLD` and `VS_ALLIN` are not strategy opinions. At chipEV they are a
Nash equilibrium over an all-in game with no postflop play, which is a closed,
exactly solvable problem:

- `VS_ALLIN` is a calling decision. Given the shover's range, a hand calls when
  its all-in equity times the final pot covers the cost to call. Pure equity
  arithmetic.
- `PUSH_FOLD` is a shoving decision whose value depends on the callers' ranges,
  which in turn depend on the shoving range. Iterating the two to a fixed point
  is the standard push-fold equilibrium computation.

This is the same mathematics as the classic push-fold charts, it is deterministic,
and it is verifiable against published equilibria. It is computation, not
invention, so it does not violate the rule against inferring poker decisions.

That covers 2 of 9 contexts, 26,364 of 118,638 rows per pack, about 22 percent -
and it is the part that decides the most MTT chips, because short-stack play is
where push-fold dominates.

### What still needs an external export

The other seven contexts involve postflop continuation: an `RFI` or `VS_3BET`
decision at 60BB is only correct relative to how the resulting pot plays out.
Those require a genuine preflop solver with postflop EV. No local computation
substitutes for that, and guessing them is exactly what the content contract
forbids.

### The method

1. **Build the push-fold equilibrium computation** as a versioned, tested script
   that emits the `PUSH_FOLD` and `VS_ALLIN` rows in the existing workbench
   schema. It must be fail-closed and write only those two contexts, leaving the
   other seven blank.
2. **Validate before promoting.** Check the output against known chipEV
   push-fold equilibria and for internal sanity: monotonicity in stack depth,
   nesting of calling ranges by position, and symmetry where the game is
   symmetric. Convergence and thresholds must be recorded as evidence, the same
   way solver accuracy is.
3. **Stage through the existing pipeline.** The rows go in through
   `mtt:sixmax-preflop-merge-chunk`, which already enforces immutable identities
   and fill-only semantics, then candidate validation and promotion. No new write
   path.
4. **The remaining seven contexts stay blank** and the packs stay unavailable
   until a real six-max preflop export arrives. A pack that is 22 percent filled
   must not be promoted as complete; partial content stays visibly unavailable.

### Owner input that unblocks the rest

One representative six-max preflop export of 10-100 rows is still the fastest
lever. It is enough to build the adapter for all four exports before the full
files exist, exactly as recorded in the 30-day plan.

## Machine time

The machine is free at roughly 30 percent utilisation. Blocker A cannot consume
it, because it is gated on a licensing answer rather than compute. Blocker B's
push-fold computation is arithmetic rather than tree search and needs minutes,
not nights.

The honest conclusion is that neither blocker is compute-bound. Background
solving is the right tool for board coverage and accuracy convergence, both of
which are currently complete, and it is the wrong tool for these two gaps.
