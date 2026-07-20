# MTT Canonical Board Coverage Plan

Updated: 2026-07-17
Status: BETA-MIN COMPLETE / DEPTH AUTHORIZED REVIEW-ONLY / GROWTH FROZEN
Authority: board selection, solver expansion and exact-board EV scope

## Decision

The board constants previously visible in one batch generator are not the full
set of boards the trainer can display. They are representative TexasSolver
inputs. Before this expansion, the source manifests contained 40 unique flop
rank boards and 350 unique family/board pairs. The 30-board list was therefore
a subset, but that distribution was too shallow and uneven for the long-term
product.
The isolated `beta-min` wave has added exactly 45 new rank boards, taking
declared global coverage to 85 unique boards and 395 family/board pairs. Every
cohort now has at least six beta representatives without crossing every board
with every family. Its source batch passed 45/45 scenario audit with 0 errors;
solver completion and owner review are still separate.

Board growth now has one canonical source:

- `src/core/texasSolverBoardCatalog.ts` pins all 40 existing physical boards;
- every supported board ID is classified into exactly one strategic cohort;
- solver generators resolve board IDs through this catalog instead of private maps;
- `npm run mtt:texas-solver-board-catalog` measures manifest coverage and gaps.

The catalog reports `DECLARED_SOURCE_MANIFESTS_NOT_SOLVE_COMPLETION`. A board in
that report is prepared input, not proof that TexasSolver finished it or that
the owner reviewed it. Raw completion and review remain separate gates.

## Four Separate Layers

1. **Runtime board universe**
   The trainer may generate any legal flop. It is not limited to the canonical
   solver board list.
2. **Canonical solver evidence**
   Rank structure and suit texture select a representative exact solve. A suit
   permutation may share evidence only when card removal and ranges remain
   isomorphic.
3. **Cohort strategy**
   Reviewed exact solves may support a texture-level training rule. This is an
   aggregate strategy abstraction, not an exact-board EV claim.
4. **Exact action EV**
   EV appears only when a reviewed counterfactual export contains every legal
   action for that exact decision. Strategy frequencies never become invented EV.

## Cohorts And Targets

The catalog uses 14 mutually exclusive flop cohorts:

1. A-high dry rainbow
2. A-high dynamic or two-tone
3. K/Q/J-high dry rainbow
4. K/Q/J-high dynamic or two-tone
5. T/9-high dry rainbow
6. T/9-high dynamic or two-tone
7. 8-high and lower dry rainbow
8. 8-high and lower dynamic or two-tone
9. T-high and higher monotone
10. 9-high and lower monotone
11. T-paired and higher rainbow
12. 9-paired and lower rainbow
13. paired two-tone
14. flopped trips

Targets apply to the global canonical board library, not to a blind Cartesian
product of every board with every family:

| Stage | Target | Release meaning |
| --- | ---: | --- |
| Beta minimum | 6 rank boards per cohort | Balanced calibration set; beta may ship after family gates and review pass. |
| Beta depth | 12 rank boards per cohort | Requested 10-20 variant depth; continues in the background after beta. |
| Growth | 20 rank boards per cohort | Long-term evidence library. Low dry rainbow and trips stop at their complete 13-rank-board universes. |

The generator exposes the stages as disjoint waves: 45 new boards for
`beta-min`, another 83 for `beta-depth`, and another 98 for `growth`. The
83-board beta-depth source wave is now generated and passed its 83/83 scenario
audit with 0 errors. It raises declared coverage to 168 unique boards and 478
family/board pairs, with all 14 cohorts at the twelve-board depth target. The
owner explicitly authorized this beta-depth supply for speculative background
solving on 2026-07-17, and it reached 83/83 raw checkpoints on 2026-07-20.
`growth` remains outside every active worker.

TexasSolver `set_use_isomorphism 1` remains enabled inside each solve. It saves
work across equivalent suit runouts in that tree; it does not make A72 and K83
the same strategic rank board.

## Beta Family Gate

Do not wait for 20 boards in every family. A beta family is eligible only when:

1. its exact position, ranges, pot type, stack and action node are reviewed;
2. it has at least 12 exact rank-board solves spanning at least 6 applicable cohorts;
3. no one cohort supplies more than half of its reviewed board evidence;
4. its normalized aggregate passes card-removal, overlap and runtime gates;
5. its UI exposes source quality honestly;
6. exact action EV remains hidden for decisions without complete EV input.

This gate makes the 478 declared family/board pairs useful without pretending
that all 14 cohorts must be crossed with all 20 families before beta.

Current declaration audit: `20/20` families already meet the 12-board,
6-cohort and no-majority shape. This is good scheduling coverage, not owner
approval and not exact action-EV readiness.

Final beta-depth measurement: `owner-depth`, `beta-min` and `beta-depth` are
raw-complete at 72/72, 45/45 and 83/83 respectively. The beta-depth wave was
computed with the guarded reduced tree and remains discardable review evidence.
The 2026-07-20 intake includes all six derived memory-safe manifests and 439
unique family/board checkpoints across 20 valid read-only reports; 20/20
families meet the mechanical shape threshold, owner review is 0/20, and nothing
was promoted.

## Ordered Solver Routine

1. Preserve the completed 72/72 `owner-depth` checkpoints and their read-only
   evidence reports.
2. Preserve the completed 45-board `BETA_MIN` wave, then let the explicitly
   authorized 83-board `BETA_DEPTH` phase run under the same review-only guard.
   Source files are owned solely by the isolated prep script; the recurring MTT
   cycle only observes coverage and never rewrites them.
3. Solve one checkpoint-safe board at a time under the existing CPU/RAM guard.
4. Refresh read-only review evidence for each newly raw-complete family.
5. Complete owner review over the accumulated family evidence; never promote
   `MEMORY_SAFE_REVIEW_ONLY` output automatically.
6. Freeze the first beta when the family gate and owner review pass. Beta-depth
   solving is complete; activate any future growth solving only after its own
   explicit review boundary and owner authorization.

The isolated prep agent owns deterministic generation and scenario audit for
both beta-min and beta-depth. Preparing a wave never activates it by itself. The
2026-07-17 owner instruction separately authorized beta-depth computation, so
`run-texas-solver-low-memory.ps1` now selects it only after every earlier phase
is raw-complete.

## UI Contract

- Action EV is hidden before the answer.
- After the answer, every legal action with complete EV data shows its absolute
  BB value and a relative comparison meter directly inside the action button.
- More than one action may be marked equivalent-best; all equivalent-best
  actions use the same full meter rather than a false visual ranking.
- Missing or partial EV data reveals no per-action EV graphic.
- An unseen exact board may use a reviewed cohort strategy, but it may not show
  an exact EV inherited from another rank board.

## Commands

```powershell
npm run mtt:texas-solver-board-catalog
npm run mtt:texas-solver-board-catalog -- --json
npm run mtt:texas-solver-large-flop-batch -- --preset=beta-min --summary
npm run mtt:texas-solver-large-flop-batch -- --preset=beta-depth --summary
npm run mtt:texas-solver-large-flop-batch -- --preset=growth --summary
npm run mtt:texas-solver-low-memory-status
npm run mtt:texas-solver-scenario-audit -- --manifest <manifest> --summary
```

## Non-Negotiable Guards

- Never multiply solves by cosmetic suit permutations.
- Never infer one rank board's exact EV from another rank board.
- Never promote `MEMORY_SAFE_REVIEW_ONLY` output into production strategy.
- Never make beta wait for the long-term growth target.
- Never activate `BETA_MIN` while `owner-depth` is running; preparation and
  scenario audit may run in parallel because they do not start TexasSolver.
- `BETA_DEPTH` may run before owner review only after explicit owner
  authorization and only as `MEMORY_SAFE_REVIEW_ONLY` evidence. Never activate
  `GROWTH` before the beta-depth review boundary is explicitly decided.
