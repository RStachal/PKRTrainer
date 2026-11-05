# PKRTrainer Product Architecture And MTT 30-Day Plan

Updated: 2026-07-22
Status: ACTIVE PRODUCT CONTRACT

## Objective

Finish a professional, repeatedly testable MTT trainer in 20-30 working days
without building an MTT-only dead end. The same application shell, canonical
content contracts, solver adapters, validation, runtime registry, review UX,
statistics and release pipeline must later support SNG and Cash. Strategic
recommendations remain variant-specific solver data and are never copied across
variants merely because their metadata looks similar.

This plan governs product architecture and delivery timing. Detailed mechanical
work remains ordered in `Agents/mtt-lean-execution-queue.md`; current MTT truth
and release scope remain in `Agents/mtt-completion-priorities.md`.

## Non-Negotiable Decisions

1. The reusable converter is a **solver-export adapter into canonical PKRTrainer
   content**, not an MTT-to-SNG/Cash strategy converter.
2. Shared code may normalize identities, actions, frequencies, per-action EV,
   provenance and review state. It may not infer missing poker decisions.
3. Every runtime question must resolve to a versioned pack and exact profile.
   No claimed solver-backed beta content may silently use heuristic fallback.
4. Frequencies and action EV are separate facts. Multiple actions within the EV
   equivalence threshold remain equally good and must be shown as such.
5. A playable beta is released in bounded, truthful increments. Unsupported
   combinations stay visibly unavailable rather than receiving synthetic data.
6. Every beta/release candidate ends with a reconciled FTP ZIP, manifest and
   SHA-256 after the release gates and browser QA pass.

## Architecture Boundary

| Layer | Shared contract | Variant-specific input |
| --- | --- | --- |
| Scenario identity | `TrainingProfile`, positions, street, stack, action node, board and action tree | MTT blind/ante and payout stage; SNG player/payout structure; Cash rake, straddle and stack rules |
| Solver adapter | Source parser -> canonical actions, combo weights, frequencies, EV and accuracy | One adapter per solver/export version |
| Content | `RangePack`, postflop strategy packs, action-EV sets, provenance and confidence | Reviewed strategy values for the exact profile only |
| Validation | Schema, semantic coverage, fingerprints, permissions, no-overlap and no-fallback gates | Required dimensions and legal production slots per variant |
| Runtime | Capability resolver, lazy registry, drill engine, HH/stats identities and entitlement checks | Variant provider selects legal packs and flows |
| UX | Profile selector, action controls, EV bubbles, range matrix, explanations, HH and statistics | Explanatory copy and controls for variant-specific dimensions |
| Delivery | Tests, browser QA, offline/precache, bundle budgets, FTP ZIP and manifest | Release scope and enabled content manifest |

The current code already has reusable `TrainingProfile`, `RangePack`, profile
guards, SNG/Cash preview packs, action-EV structures and a multi-variant pack
selector. The main MTT-specific boundary still to isolate after MTT v1 is the
production readiness/registry provider. Do not perform a broad rewrite during
the MTT deadline. New work must enter through canonical contracts, and the
provider extraction should happen only when the first SNG production pack is
ready to exercise it.

## Future Variant Rollout

The expected SNG/Cash acceleration path is:

1. Reuse the application shell, profile identity, actions, range/EV UI, drill
   engine, stats, HH, entitlement and release pipeline unchanged.
2. Implement a solver adapter that emits the same canonical preflop or postflop
   content contract used by MTT.
3. Add a variant provider defining legal dimensions, readiness and registry
   entries; do not add another hard-coded switch throughout the UI.
4. Run the same schema, semantic, cross-solver, browser and packaging gates.
5. Add only the genuinely new domain dimensions:
   - SNG: player count, payout structure, stack distribution, bubble/ICM state.
   - Cash: rake schedule/cap, straddle state, effective stacks and table format.
6. Promote only reviewed solver data for that variant. MTT chipEV ranges are not
   evidence for SNG ICM or raked Cash strategy.

This should reuse most engineering work while preserving poker correctness. It
cannot eliminate the solve/review time needed for new game economics.

## Playable Beta Scope

`MTT_PLAYABLE_BETA` is the practical 20-30-day target:

- Preflop: every promoted full-ring and six-max CHIP_EV regular/turbo ante ON/OFF
  profile in the frozen beta manifest; target is all eight exact profiles.
- Flop: all seven currently declared scoped solver pilots plus only additional
  families that pass exact source, accuracy and owner-review gates.
- Each offered action displays the reviewed strategy result; per-action EV
  bubbles appear only where a complete reviewed EV payload exists.
- Range matrix, action feedback, EN/CZ behavior, HH review, statistics,
  entitlement, reload and offline flows work against the same pack identity.
- No heuristic answer is presented as solver-backed and no pilot is described as
  full postflop coverage.
- Desktop and 360/390/412 px browser paths pass with no overlap, source leakage
  or runtime error.

`Full MTT NLHE` remains a later library milestone. Completing all 64 production
profiles and the full 48-profile postflop matrix is not a credible 30-day target
with the present external data and compute throughput. The beta must make its
frozen coverage obvious and professional rather than pretending that matrix is
already complete.

## 20-30 Working Day Sequence

| Working days | Deliverable | Exit gate |
| --- | --- | --- |
| 1-3 | Freeze this architecture, exact cross-solver contract, beta scope and current content truth | Generic exact-node comparator tested; no strategy write |
| 4-6 | Add one consolidated `MTT_PLAYABLE_BETA` gate and deterministic FTP packager/reconciler | Current production content launches, packages and reports exact limitations |
| 7-11 | Ingest and review four exact six-max CHIP_EV preflop exports incrementally | Each completed slot passes candidate, canonical permission, staging and promotion separately |
| 12-16 | Finish selected flop accuracy recovery, owner review and exact second-solver sample | Same ranges/tree/board/node fingerprints; combo strategy report; EV report where available |
| 17-20 | Product UX pass over preflop and flop | Correct ranges/actions, equivalent-EV feedback, EN/CZ, HH and stats verified end to end |
| 21-24 | Closed beta regression and mismatch repair | Deterministic spot suite, semantic pack tests and four viewport browser QA green |
| 25-27 | Release hardening | Registry, entitlement, offline, precache, bundle and source-free guards green |
| 28-30 | Buffer, final owner acceptance and FTP delivery | Clean commit, reconciled ZIP/manifest/SHA-256 and documented rollback |

The sequence is incremental: a green promoted slot enters the beta immediately
and is tested while the next slot is still being solved or reviewed.

Days 1-6 now have executable infrastructure. `mtt:playable-beta` reports the
frozen eight-profile target separately from the currently launchable subset.
`mtt:ftp-package` builds a fixed-metadata ZIP from deployable runtime files,
excludes local-only source maps, expands it in memory and reconciles every path,
byte length and SHA-256 before any write. A confirmed
write first reruns the full tests, registry/Core/beta/range gates, production
build, precache, bundle budget and a self-hosted Chrome preview E2E against a
clean commit.

## Critical Inputs And Schedule Risks

The date remains realistic only if these arrive early:

1. By working day 5: one representative raw six-max preflop solver export and
   then all four exact regular/turbo ante ON/OFF exports. A 10-100-row sample is
   enough to build the adapter before the full files finish.
2. By working day 8: access to a second postflop solver and one exact paired
   board/node export. The repository already has a GTO+ three-family/four-board
   input plan, but current readiness is `0/3` and nine expected outputs are
   missing.
3. Two short owner-review windows per week for explicit poker verdicts and
   caveats. Automation may prepare evidence but cannot select these decisions.
4. An EV-capable export if flop action-EV bubbles are part of the beta scope.
   Current TexasSolver dumps are frequency evidence only.

If an input misses its date, continue UX, validation and release work, but move
that exact content profile out of the beta manifest rather than filling it with
guesses.

## Exact Two-Solver Method

Use `PKRTRAINER_SOLVER_EXACT_NODE_V1` for both adapters. A comparable pair must
share the exact profile, players, stack and range fingerprints, board, pot,
acting seat, node path, canonical actions/sizings, action-tree fingerprint and
variant-configuration fingerprint. That last fingerprint binds normalized
blinds/antes, payouts and all ICM stacks for SNG, or rake/cap/straddle rules for
Cash without hard-coding every future dimension into this schema. Both solves
must meet the same pinned exploitability target.

Preferred first postflop cross-check: the existing GTO+ lane, because its
families and source inputs are already present. This is an operational choice,
not permission to copy third-party data; the project owner must have the right
to run and use the second solver output.

```powershell
npm run range:cross-check-exact -- --left=<texas-canonical.json> --right=<gto-plus-canonical.json> --summary
```

Comparison order:

1. Fail before strategy comparison if any setup fingerprint differs.
2. Prefer full combo rows; hand-class aggregation is diagnostic only.
3. Compare range weights and complete action frequencies for every row.
4. Measure total-variation strategy distance and maximum action-frequency delta.
5. When both exports contain EV, compare every action EV and the set of actions
   within `equivalentEvThresholdBb` of the best EV. A different single dominant
   action is not automatically an error when the best-action sets overlap.
6. Review outliers by family, board texture, node and blocker class. Do not hide
   disagreement inside a global average.
7. Preserve input SHA-256, canonical setup SHA-256, solver versions, accuracy
   and the human disposition. A passing report is evidence, not promotion.

Initial review thresholds are 5 percentage points weighted mean strategy
distance, 15 points maximum row distance, 0.03 bb maximum action-EV delta,
0.01 bb EV equivalence and at most 5% of compared range weight with disjoint
best-action sets. These are triage defaults, not universal poker truth; freeze
any scenario-specific change in its manifest before solving both engines.

Use all combos for the four existing pilot boards when exports permit it. For a
larger library, stratify the sample across position, pot type, SPR, node and
board cohort instead of relying only on random hand classes.

## Beta And FTP Release Gate

No beta ZIP is final until all of the following pass against one commit:

1. typecheck, full tests, registry drift, scoped beta gate and range validation;
2. production build, precache integrity and bundle budgets;
3. desktop plus 360/390/412 px Chrome QA, reload and offline checks;
4. source-free/raw-intake guard and clean intended git scope;
5. ZIP contains exactly the deployable production `dist/` runtime files plus
   the tracked FORPSI template, with local-only source maps excluded;
6. archive entries reconcile one-for-one with source files by size and SHA-256;
7. manifest records commit, scope, commands, file hashes and known limitations;
8. final ZIP SHA-256 is reported to the owner before FTP upload.

Current incremental package dry run:

```powershell
npm run mtt:playable-beta -- --summary
npm run mtt:ftp-package -- --summary
```

Confirmed current-scope package (reruns the entire release chain):

```powershell
npm run mtt:ftp-package -- --write --confirm=PACKAGE_MTT_PLAYABLE_BETA --summary
```

For the final eight-profile milestone add `--require-target-complete`. That flag
currently fails truthfully until all four reviewed six-max packs are promoted.

The existing verified ZIPs remain historical snapshots. A new complete ZIP is
required after any application or bundled-content change selected for beta.

## Owner Input Needed

- Confirm whether GTO+ is installed/licensed and is the chosen second postflop
  solver. If not, name the available solver so only its adapter changes.
- Provide one small real six-max preflop export sample in the same format as the
  eventual four files.
- Confirm that `MTT_PLAYABLE_BETA` above is the intended 20-30-day milestone;
  the much larger `Full MTT NLHE` matrix remains a separately scheduled library.
