# MTT Autonomous Operating Plan

Updated: 2026-07-17
Status: ACTIVE

This is the sole operational sequence for turning the current scoped MTT core
into a professionally sellable product. `Agents/mtt-lean-execution-queue.md`
remains the detailed low-cost execution queue; this document decides priority,
release truth and the two permanent parallel lanes.
`Agents/mtt-board-coverage-beta-plan.md` defines canonical flop cohorts and the
non-blocking 6/12/20 board depth progression.

## Product Truth

The sellable release is **MTT ChipEV Core**:

- full-ring 9-max, CHIP_EV, preflop regular/turbo and ante ON/OFF: 4/4 legal
  production packs;
- seven explicitly scoped FLOP pilots, locked by entitlement and never described
  as a full postflop library;
- unsupported six-max, DOLAR_EV/ICM, TURN and RIVER must remain locked or visibly
  unavailable, never represented as purchased strategy content.

The 64-row full-library gate is a future data programme, not a release claim.
No model may invent range values, poker review decisions, provenance facts, or
reuse policies.

## Permanent Parallel Lanes

### Lane A - Autonomous Solver Evidence

The Windows AtLogOn queue, `PKRTrainer-TexasSolver-LowMemory`, owns five isolated
review-only phases. `next`, `followup` and the duplicate-safe `owner-depth` phase
are raw-complete at `72/72`; `beta-min` is raw-complete at `45/45` and
`beta-depth` at `83/83`. Each phase is
separate in parameters and coverage artifacts, and every existing checkpoint is
skipped on restart. The fifth phase was audited and explicitly authorized by the
owner for speculative background solving; completion does not change its
`MEMORY_SAFE_REVIEW_ONLY` status.

The hidden worker is currently idle after returning `SUCCESS`. Any future
explicitly authorized input uses three solver threads at `BelowNormal` priority,
starts only when the CPU/RAM guard permits it and never terminates an input that
is already solving. Its mutex and Task Scheduler `IgnoreNew` policy prevent
overlap after sign-in or a scheduled retry. Use
`npm run mtt:texas-solver-low-memory-status` before manual intervention. To stop
the current worker while retaining checkpoints use
`npm run mtt:texas-solver-low-memory-stop`; use
`npm run mtt:texas-solver-low-memory-uninstall` to disable future sign-in starts.

The queue is `MEMORY_SAFE_REVIEW_ONLY`: it produces raw solver evidence only.
No scheduled process may stage, normalize, merge or promote its output. Those
actions require the named owner review and the existing explicit write commands.

### Lane B - Sequential Product Completion

At each AI session run `OPS-02` from the lean queue, then take the first eligible
numbered step below. A lane-A completion may unlock a later Lane-B step, but it
does not interrupt the current step unless it exposes a production regression.

## Final Ordered Steps

1. **P0 - Keep the current sellable core green.** Run `mtt:core-release`, typecheck
   and the nearest tests after every code change. A core regression outranks all
   new scope work.
2. **P0 - Resolve candidate-pilot regressions fail-closed.** Complete on 2026-07-13:
   the SB vs BB OOP draft preserves five solver-dominant `CHECK` buckets instead of
   relabeling them as bets. Future regressions may fix only parser/mapping/runtime
   defects; never manufacture a strategy or promote an unreviewed candidate.
3. **P1 - Consume solved families continuously.** Inspect only complete or changed
   raw exports, refresh the source-safe review packet and log coverage. Retain raw
   JSON locally and ignored; never stage it mechanically.
4. **P1 - Complete the first two evidence phases. DONE 2026-07-16.** Both phases
   reached 72/72 raw checkpoints, are scenario-audited and remain review-only.
5. **P1 - Complete owner-depth evidence. DONE 2026-07-16.** All 72 unique
   prepared boards completed under the same guards. Eight eligible families now
   have complete read-only evidence reports; nothing was staged or promoted.
6. **P1 - Complete beta-min evidence. DONE 2026-07-16.** The audited 45-board
   wave reached 45/45 under the two-thread guard. Every changed checkpoint was
   consumed as review-only evidence.
7. **P1 - Compute beta-depth evidence. DONE 2026-07-20.** The owner-authorized
   audited wave reached 83/83 and every checkpoint entered cumulative review-only
   evidence. The worker returned `SUCCESS`; no output became production strategy
   or proof of review. `growth` remains outside the worker.
8. **P1 - Owner review waves.** Review the four prepared waves of five families in
   `artifacts/texas-solver-review-protocol/viewer/index.html`; the ten-minute
   cycle refreshes it from canonical full-tree reports only. Record only supplied
   human decisions with
   `mtt:texas-solver-owner-review`; it defaults to dry-run and requires reviewer,
   date, usable decision, exact scope when applicable, caveats and an explicit
   write token. It cannot infer a poker verdict.
9. **P1 - Promote reviewed scoped evidence only.** For a reviewed usable family,
   validate its candidate, merge its exact pilot scope, inspect the diff and run
   pilot suite plus core release. No full-production flag is allowed here.
10. **P1 - Release MTT ChipEV Core staging.** Upload the verified core ZIP, configure
   Basic Auth, run browser/mobile/offline/HH/stats smoke and record deployed hash.
11. **P2 - Close six-max CHIP_EV preflop.** Permissions are staged. Obtain four exact
   reviewed six-max `normalized.json` exports, validate each slot, promote one,
   smoke it, then promote the remaining three. Full-ring mapping is forbidden.
12. **P2 - Add professional action-EV feedback data.** The code, validation, UI,
   stats and EN/CZ contract are complete. Obtain one reviewed owned export with
   counterfactual BB EV for every offered action, validate one pilot, then scale.
   Never treat TexasSolver strategy frequencies as EV.
13. **P3 - Commercial hardening.** Recheck entitlement boundaries, locked-content
   wording, purchase-state restoration, error handling, accessibility and mobile
   viewport coverage against the actually shipped core scope.
14. **P4 - DOLAR_EV/ICM product decision.** Either supply exact model assumptions
    and reviewed DOLAR_EV data, or explicitly keep it out of sale and UI selection.
    CHIP_EV reuse is forbidden.
15. **P5 - Fund and scope full postflop separately.** FLOP/TURN/RIVER production
    needs per-position, pot, node, SPR, texture and runout contracts. Existing
    pilots and the 72-board batch do not satisfy this release.
16. **P6 - Final commercial release.** Rebuild a timestamped FTP artifact only after
    runtime change, run scoped release chain, archive hashes/release notes and let
    the owner choose production publication.

## Current Measured State

- MTT Core release gate: green, 4/4 production preflop and 7 scoped pilots.
- Full MTT production matrix: 4/64; it is intentionally not the current sales claim.
- TexasSolver queue: `next`, `followup` and `owner-depth` are complete at 72/72,
  `beta-min` at 45/45 and `beta-depth` at 83/83. The worker returned `SUCCESS`
  with no live solver process. One historical retried native failure remains in
  local telemetry, but no authorized checkpoint is missing.
- Completed review-only supply: the disjoint beta-depth wave passed 83/83 scenario
  audit and raw coverage. Declared source coverage is 168 unique boards and 478
  family/board pairs, all 14 cohorts at the twelve-board target. These resulting
  checkpoints are not reviewed or production strategy.
- Cumulative reduced-tree intake at 14:49 on 2026-07-20: all six derived manifests
  are raw-complete and produce 439 unique family/board checkpoints across 20
  valid read-only reports with zero extraction failures. The source-safe
  mechanical gate is 20/20 family shapes; owner review remains separately 0/20.
- Review protocol: 20 families awaiting human poker review, 0 reviewed and 68
  concrete pending fields/evidence items; no automatic promotion.
- Owner workbench: the recurring cycle refreshes the canonical 20-family,
  four-wave dashboard at `artifacts/texas-solver-review-protocol/viewer/index.html`.
  Its decision controls are never populated from reduced-tree evidence. A
  fail-closed filter exposes `Shape ready` versus `Needs evidence` only as
  review-order context. Decision schema v2 binds each exported verdict to the
  exact source-safe family reports and accuracy report; any later evidence
  change invalidates the old sign-off in the dashboard, writers and protocol.
- Candidate normalizer regression: resolved. The low-SPR SB vs BB source retained
  five exact `CHECK`-dominant buckets; the scoped pilot suite is now 7/7 READY.
  This remains review-only evidence and has not promoted runtime content.
- Six-max P1: four `permission.json` manifests staged, four exact
  `normalized.json` files still required. The regenerable source-safe intake
  packet is `npm run mtt:p1-intake-packets`.
- Action-EV comparison: implementation complete, current content data incomplete
  at preflop 0/493818 and scoped FLOP 0/972 decisions. Seven blank fingerprinted
  intake templates cover all 972 FLOP decisions; frequencies are excluded.
- Commercial browser smoke: passed on 2026-07-16 against the actual production
  build at desktop plus 360/390/412 px mobile viewports, including scoped FLOP,
  hand-history, stats, reload, offline, storage resilience, contrast and service
  worker rollback. The synthetic fixture test now uses disjoint fixture IDs.
- Regression baseline: 150 files and 746 tests passed on 2026-07-16, followed by
  typecheck, production build, precache integrity and bundle budget. The latest
  browser E2E baseline remains the earlier same-day four-viewport pass.

## Robot Routine

1. Verify Lane A task, solver process and watcher process once per session.
2. Keep `PKRTrainer-MTT-Task-Agent-10m` installed for the signed-in Windows
   owner. Every 10 minutes it records TexasSolver coverage, regenerates the
   source-safe P1 packet, dry-validates any newly present P1 six-max export,
   records canonical board coverage, refreshes cumulative evidence from all six
   derived memory-safe manifests, writes the mechanical review-readiness matrix
   and the source-safe review packet, and runs the scoped Core gate when raw
   coverage changes.
   Its latest summary retains the exact Core action-EV readiness counts. A
   `MEMORY_SAFE_REVIEW_ONLY` watcher uses the same PID-locked cumulative refresh
   without downstream pilot refresh or exposure of unrelated historical staged
   artefacts. This lets new boards enter review evidence before the next full
   cycle while serializing report writes.
   It never starts or stops TexasSolver, stages raw exports, promotes runtime
   content, creates range data, writes solver input or substitutes for owner
   poker review. `run-mtt-solver-batch-prep-cycle.ps1` is the sole writer and
   auditor of the beta-min and beta-depth source waves; its scheduled task
   remains disabled after all 128 source inputs passed audit.
3. All five authorized worker phases are complete. Keep `growth` outside every
   Windows worker until its review boundary is explicitly decided; do not start
   another solver wave merely because the task remains installed.
4. Read `mtt:texas-solver-low-memory-status`; act only on a new complete export
   or a gate change.
5. Execute one eligible Lane-B step completely, including its focused verification.
6. Update this document, the lean queue and release notes with measured evidence.
7. Stop at `HUMAN_GATE` or `EXTERNAL_DATA`, but continue with unrelated eligible
   mechanical work. Never start a duplicate worker or an unreviewed promotion.

### Recurring Mechanical Cycle

```powershell
npm run mtt:autonomous-cycle-install
npm run mtt:autonomous-cycle-ensure
npm run mtt:autonomous-cycle-status
```

It starts after Windows sign-in and uses a local mutex to avoid concurrent cycles.
Use `ensure` for routine health repair: it enables a disabled existing task
without replacing its triggers, installs it only when missing and requests one
guarded catch-up cycle. Status prints
the enabled state, next run, latest logged outcome and snapshot age; `STALE`
means resource guards deferred recent cycles and live solver coverage must be
checked separately.
`last result: 267009` (`0x00041301`) is the normal Task Scheduler state while
the long-running cycle is active, not a failed run. Start the existing task when
needed; do not reinstall it merely because it is already running.
To pause a currently running cycle while retaining its next-sign-in task, run
`npm run mtt:autonomous-cycle-stop`. To remove future automatic starts too, run
`npm run mtt:autonomous-cycle-uninstall`. Neither command touches TexasSolver,
its watcher, raw exports or solver checkpoints.

## Escalation

- Use Terra Medium for routine implementation and verification.
- Use Sol High for scope/design decisions, unexplained release regressions or
  cross-module runtime changes.
- Human owner alone decides poker correctness, source rights beyond the confirmed
  owned-export rule, pricing, publication and production deployment.
