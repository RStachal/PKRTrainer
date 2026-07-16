# MTT Autonomous Operating Plan

Updated: 2026-07-16
Status: ACTIVE

This is the sole operational sequence for turning the current scoped MTT core
into a professionally sellable product. `Agents/mtt-lean-execution-queue.md`
remains the detailed low-cost execution queue; this document decides priority,
release truth and the two permanent parallel lanes.

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

The Windows AtLogOn queue, `PKRTrainer-TexasSolver-LowMemory`, owns two isolated
review-only phases. Both `next` and `followup` are raw-complete at `72/72`.
Each phase is separate in both parameters and coverage artifacts. With every
checkpoint present, a repeated start is a successful no-op rather than a reason
to create another batch.

The hidden worker uses two solver threads at `BelowNormal` priority. It starts a
new input only when the CPU/RAM guard permits it, but never terminates an input
that is already solving. Its mutex and Task Scheduler `IgnoreNew` policy prevent
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
4. **P1 - Complete the two-phase evidence queue. DONE 2026-07-16.** Both phases
   reached 72/72 raw checkpoints, are scenario-audited and remain review-only.
5. **P1 - Owner review waves.** Review the four prepared waves of five families in
   `interim-packet/MECHANICAL_AUDIT.md`. Record only supplied human decisions with
   `mtt:texas-solver-owner-review`; it defaults to dry-run and requires reviewer,
   date, usable decision, exact scope when applicable, caveats and an explicit
   write token. It cannot infer a poker verdict.
6. **P1 - Promote reviewed scoped evidence only.** For a reviewed usable family,
   validate its candidate, merge its exact pilot scope, inspect the diff and run
   pilot suite plus core release. No full-production flag is allowed here.
7. **P1 - Release MTT ChipEV Core staging.** Upload the verified core ZIP, configure
   Basic Auth, run browser/mobile/offline/HH/stats smoke and record deployed hash.
8. **P2 - Close six-max CHIP_EV preflop.** Permissions are staged. Obtain four exact
   reviewed six-max `normalized.json` exports, validate each slot, promote one,
   smoke it, then promote the remaining three. Full-ring mapping is forbidden.
9. **P2 - Add professional action-EV feedback data.** The code, validation, UI,
   stats and EN/CZ contract are complete. Obtain one reviewed owned export with
   counterfactual BB EV for every offered action, validate one pilot, then scale.
   Never treat TexasSolver strategy frequencies as EV.
10. **P3 - Commercial hardening.** Recheck entitlement boundaries, locked-content
   wording, purchase-state restoration, error handling, accessibility and mobile
   viewport coverage against the actually shipped core scope.
11. **P4 - DOLAR_EV/ICM product decision.** Either supply exact model assumptions
    and reviewed DOLAR_EV data, or explicitly keep it out of sale and UI selection.
    CHIP_EV reuse is forbidden.
12. **P5 - Fund and scope full postflop separately.** FLOP/TURN/RIVER production
    needs per-position, pot, node, SPR, texture and runout contracts. Existing
    pilots and the 72-board batch do not satisfy this release.
13. **P6 - Final commercial release.** Rebuild a timestamped FTP artifact only after
    runtime change, run scoped release chain, archive hashes/release notes and let
    the owner choose production publication.

## Current Measured State

- MTT Core release gate: green, 4/4 production preflop and 7 scoped pilots.
- Full MTT production matrix: 4/64; it is intentionally not the current sales claim.
- TexasSolver queue: `next` and `followup` are complete at 72/72. The task is
  Ready with last result SUCCESS; no solver process is expected until a new
  owner-approved phase exists.
- Review protocol: 20 families awaiting human poker review, 0 reviewed and 68
  concrete pending fields/evidence items; no automatic promotion.
- Candidate normalizer regression: resolved. The low-SPR SB vs BB source retained
  five exact `CHECK`-dominant buckets; the scoped pilot suite is now 7/7 READY.
  This remains review-only evidence and has not promoted runtime content.
- Six-max P1: four `permission.json` manifests staged, four exact
  `normalized.json` files still required. The regenerable source-safe intake
  packet is `npm run mtt:p1-intake-packets`.
- Action-EV comparison: implementation complete, current content data incomplete
  at preflop 0/493818 and scoped FLOP 0/972 decisions. Frequencies are excluded.
- Commercial browser smoke: passed on 2026-07-16 against the actual production
  build at desktop plus 360/390/412 px mobile viewports, including scoped FLOP,
  hand-history, stats, reload, offline, storage resilience, contrast and service
  worker rollback. The synthetic fixture test now uses disjoint fixture IDs.
- Regression baseline: 147 files and 721 tests passed on 2026-07-16, followed by
  typecheck, production build, precache, bundle budget and Chrome E2E.

## Robot Routine

1. Verify Lane A task, solver process and watcher process once per session.
2. Keep `PKRTrainer-MTT-Task-Agent-10m` installed for the signed-in Windows
   owner. Every 10 minutes it records TexasSolver coverage, regenerates the
    source-safe P1 packet, dry-validates any newly present P1 six-max export,
    refreshes the source-safe TexasSolver review packet and runs the scoped Core
    gate when board coverage or a family's latest raw-export write changes.
   It never starts or stops TexasSolver, stages raw exports, promotes runtime
   content, creates range data or substitutes for owner poker review.
3. The two solver manifests are already prepared. Do not create a third phase
   until both have completed their review lifecycle or the owner changes scope.
4. Read `mtt:texas-solver-low-memory-status`; act only on a new complete export
   or a gate change.
5. Execute one eligible Lane-B step completely, including its focused verification.
6. Update this document, the lean queue and release notes with measured evidence.
7. Stop at `HUMAN_GATE` or `EXTERNAL_DATA`, but continue with unrelated eligible
   mechanical work. Never start a duplicate worker or an unreviewed promotion.

### Recurring Mechanical Cycle

```powershell
npm run mtt:autonomous-cycle-install
npm run mtt:autonomous-cycle-status
```

It starts after Windows sign-in and uses a local mutex to avoid concurrent cycles.
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
