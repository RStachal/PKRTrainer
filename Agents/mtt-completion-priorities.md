# MTT Completion Priorities

Updated: 2026-07-16
Status: ACTIVE EXECUTION CONTRACT
Core release state: COMPLETE 2026-07-10

## Authority

This file is the current operational source of truth for finishing the MTT part
of PKRTrainer. It supersedes the execution order in older roadmap sections of
`Agents/tasks.md`; those sections remain useful history. Safety, validation and
no-false-green rules in code still apply.

Work rules:

1. Work only on the highest unblocked priority in this file.
2. A tooling change is useful only when it removes or measures a named release blocker.
3. TexasSolver may run in parallel, but another solver loop must not displace a higher release blocker.
4. Every completed priority must record command evidence in the progress log below.
5. Never call scoped pilot coverage full postflop production coverage.
6. Never create strategic values merely to make a gate green.
7. Lower-cost execution follows `Agents/mtt-lean-execution-queue.md` and stops
   at its human/data gates.
8. Windows background operation follows `Agents/mtt-parallel-agents.md`; only
   its two active branches may own recurring solver or mechanical MTT work.
9. Alternative-action EV and EN/CZ behavior follows
   `Agents/mtt-action-ev-and-language-contract.md`; frequencies never substitute
   for action EV.

## Owner And Provenance Decisions

These decisions were explicitly confirmed by the project owner on 2026-07-10:

- Input type: own solver export.
- Right to distribute in the PKRTrainer runtime bundle: `POTVRZUJI`.
- Rights owner and poker reviewer: project owner/user.
- External evidence references: not required for the owned-export workflow.
- Reuse right: confirmed. Strategic reuse must still name the reused dimension
  and must not claim that two strategically different profiles are equivalent
  without an explicit mapping/review decision.
- `permission.json` is an internal provenance/review manifest. It is not a paid-user entitlement.

## Release Target

The shortest honest release target is `MTT_CORE_V1`:

- Production preflop: `FULL_RING_9`, `CHIP_EV`, `REGULAR` and `TURBO`, ante `ON/OFF`.
- Postflop: explicitly named, source-free FLOP solver pilots only.
- Runtime, HH review, stats, offline delivery and payment entitlement behavior
  must accurately distinguish production preflop from scoped postflop pilots.

The following remain outside `MTT_CORE_V1` and must stay locked/planned:

- production `SIX_MAX` preflop until a reviewed 6-max export or an explicitly
  approved table-format mapping exists;
- `DOLAR_EV`/ICM production data;
- full FLOP/TURN/RIVER production matrix;
- any claim of 48/48 postflop production or 9,600-target solver coverage.

This scope is a release decision, not a deletion of the long-term `Full MTT
NLHE` roadmap. The old 64-row gate remains the full-library gate.

## Current Truth

- Production registry: 4 generated full-ring preflop modules, 4 permission manifests, integrity valid.
- Remaining P1 full-matrix queue: 4 six-max CHIP_EV preflop slots.
- Scoped postflop suite: 7/7 READY, 19 rules, 972 range buckets.
- Full postflop production: 0/48 profiles; this is not the core-v1 release target.
- TexasSolver evidence queue: phases `next` and `followup` are both raw-complete
  (`72/72` each). The worker exits successfully with no solver process because
  every prepared checkpoint exists.
- Windows low-memory task: `PKRTrainer-TexasSolver-LowMemory` runs two solver
  threads at `BelowNormal`, starts only below the CPU/RAM guard, resumes after
  sign-in, and selects the first incomplete phase. It never interrupts an
  already solving board merely because the machine becomes busy.
- Both solver phases are `MEMORY_SAFE_REVIEW_ONLY`: raw exports may be audited
  and packaged for review, but cannot be automatically staged, normalized,
  merged or promoted to runtime content.
- Scoped core release gate: green; Full MTT NLHE remains intentionally red at 4/64.
- Action-EV comparison code is complete, but current reviewed content has no
  complete counterfactual EV payload: preflop `0/493818` decisions (`0/4`
  packs), scoped FLOP `0/972` decisions (`0/7` packs). Strategy frequencies are
  excluded from these counts.

## Priority Order

### P0 - Restore Truthful Gates

Status: COMPLETED 2026-07-10

- Load the generated production registry before every MTT report is built.
- Make completion, blockers, intake, slots, range verification and registry
  integrity agree on the same four current production profiles.
- Align owned-export provenance validation and documentation with the owner
  decisions above; do not require external evidence references for that branch.
- Acceptance: focused CLI tests pass and the full completion report shows 4
  production rows, not 0.

### P1 - Freeze And Automate MTT_CORE_V1

Status: COMPLETED 2026-07-10

- Add one machine-readable core release gate instead of weakening the 64-row full-library gate.
- Require 4/4 scoped preflop production rows, registry integrity, 7/7 pilot
  catalog readiness, source-free UI checks, runtime smoke and entitlement separation.
- Make UI/release copy say `MTT ChipEV Core` and `scoped solver pilots` where relevant.
- Acceptance: the core gate exits 0 while the full-library gate remains honestly red.

### P2 - Core Runtime And User-Flow QA

Status: COMPLETED 2026-07-10

- Verify all four preflop profiles can start, answer and persist stats with the
  canonical production pack identity.
- Verify each entitled postflop pilot starts through `SCOPED_PILOT`, never as full production.
- Verify HH review, dashboard, reload and offline reopen preserve the same scope and identity.
- Run desktop plus 360/390/412 px browser smoke without source/internal ID leakage.

### P3 - Delivery Performance

Status: COMPLETED 2026-07-10

- Measure the four large generated preflop chunks and ensure they remain lazy.
- Pass build, precache integrity and bundle budget; split data only if measured gates require it.
- Avoid rerunning every slow MTT CLI in separate processes when one consolidated gate can reuse loaded data.

### P4 - Solver Evidence Expansion

Status: RAW COVERAGE COMPLETE / HUMAN REVIEW

- Both prepared manifests are raw-complete (`72/72` each). Inspect only
  complete raw exports and refresh the existing review-only workflow.
- Promote no solver output beyond scoped pilot status without poker review and a provenance manifest.
- Do not restart the completed queue merely because no `console_solver` process
  is visible. Start another batch only after the existing evidence yield and
  owner-review decisions are recorded.

### P4.1 - Professional Action-EV Feedback

Status: IMPLEMENTATION COMPLETE / EXTERNAL EV DATA

- Every offered action now has a typed solver-EV contract in BB; complete data
  accepts all equivalent-best actions and persists EV loss in stats.
- Preflop and postflop UI show all action values after an answer, or an explicit
  unavailable state when the reviewed export is incomplete.
- The release report measures actual complete EV decisions independently from
  strategy readiness and never counts frequencies as EV.
- EN renders everything in English. CZ keeps poker controls and terminology in
  English while explanations and feedback are Czech.
- Remaining blocker: an owned reviewed exporter payload with counterfactual EV
  for every offered action. Current TexasSolver dumps contain frequencies but
  no validated action-EV field consumed by this pipeline.

### P5 - Full MTT NLHE Library

Status: DEFERRED AFTER CORE V1

- Import real six-max preflop data.
- Decide and source DOLAR_EV/ICM strategy.
- Build reviewed full FLOP, TURN and RIVER production coverage.
- Re-enable the 64/64 and 48/48 gates as release blockers only for a release
  explicitly named `Full MTT NLHE`.

## Core Definition Of Done

`MTT_CORE_V1` is complete only when all of these are true:

- the dedicated core release gate is green;
- production preflop is 4/4 for the declared scope;
- postflop is labelled and gated as seven scoped FLOP pilots;
- unsupported six-max, DOLAR_EV, TURN and RIVER choices cannot be mistaken for purchased full content;
- typecheck, focused tests, production build, range verification, source-free UI guard and bundle checks pass;
- release notes state the exact scope and known limits;
- no raw private solver output or user secrets are added to git.

## Next Exact Action

Complete the four exact owned six-max CHIP_EV `normalized.json` exports, then
run the batch candidate and batch-stage commands with their explicit write
tokens. In parallel, allow the owner-directed solver evidence to proceed through
the mechanical packet audit and owner review. Execute subsequent work strictly
from `Agents/mtt-lean-execution-queue.md`; do not promote any result or reopen
full-library intake without its named human/data gate.

The current owner-review entry point is generated by
`npm run mtt:texas-solver-viewer` and served at
`http://127.0.0.1:5173/artifacts/texas-solver-review-integration/viewer/index.html`.
Process its four waves in order. Each downloaded JSON must pass the batch-writer
dry-run before the explicit confirmed write; the model must leave every verdict
pending until the project owner selects it.

For professional EV comparison, obtain one EV-enabled owned solver pilot export
under `Agents/mtt-action-ev-and-language-contract.md`. Do not restart or reinterpret
the frequency-only TexasSolver queue as an EV source.

## Progress Log

| Date | Priority | Result | Evidence |
| --- | --- | --- | --- |
| 2026-07-16 | Release | Post-commit permission guard and Core gate green | Guard permits only exact source-safe permission manifests for legal slots; full regression 148 files / 729 tests, registry, Core, ranges, build, precache and budget passed |
| 2026-07-16 | Owner review | Five-family review workflow hardened | Viewer defaults to the first pending wave, counts 20 unique families instead of 53 node reports, persists/imports batch-compatible drafts and fails closed on malformed decisions; no poker verdict inferred |
| 2026-07-10 | Baseline | Full-ring P1 intake promoted | 4 modules, 4 manifests, registry integrity valid |
| 2026-07-10 | Baseline | Scoped FLOP pilot suite ready | 7/7 READY, 19 rules, 972 buckets |
| 2026-07-13 | P0 | SB vs BB source-fidelity regression resolved | Five solver-dominant CHECK buckets preserved by the draft normalizer; merged pilot and watcher suite remain 7/7 READY without runtime promotion |
| 2026-07-13 | P1 | Six-max CHIP_EV intake packet refreshed | Four canonical source-safe packets list only their missing exact `normalized.json`; all four owner-confirmed `permission.json` manifests are present |
| 2026-07-13 | Ops | Explicit local queue stop control verified | `mtt:texas-solver-autostart-stop` dry-run recognizes only the queue worker, its child processes and the repository watcher; raw checkpoints are preserved |
| 2026-07-13 | P0 | Intake diagnostics aligned with staged provenance | Global intake is 60 missing `normalized.json` and 56 missing `permission.json`; registry integrity sees 8 source-safe manifests and remains valid |
| 2026-07-13 | P0 | Source-safe MTT handoff refreshed | 26/26 expected artifacts generated, no missing artifact; release stays correctly blocked by full production coverage, full postflop coverage and Android/acceptance gates |
| 2026-07-10 | P0 | Truthful gates restored | completion 4/64; blockers/intake 60 pending; 57 focused CLI tests passed |
| 2026-07-10 | P0 | Owned-export provenance aligned | evidence refs optional; 4 source-free manifests trackable; turbo reuse audit 2/2 comparable |
| 2026-07-10 | P0 | Production modules compacted | source size reduced from about 31.6 MB to 3.3 MB; completion runtime about 40 s to 10 s |
| 2026-07-10 | P1 | Scoped release contract automated | `mtt:core-release` green: preflop 4/4, permissions 4/4, pilots 7/7, full library honestly 4/64 |
| 2026-07-10 | P1 | UI and release copy aligned | `MTT ChipEV Core` shown before lazy load; regular/turbo production pack identities persist in runtime stats |
| 2026-07-10 | P2 | Browser smoke | desktop plus 360/390/412 px pass; regular/turbo start, answer and stats pass; 0 console errors/source leaks |
| 2026-07-10 | P2 | Entitlement and offline E2E | all 7 pilot resolvers pass for PRO_PLUS; Chrome HH/stats/reload/offline, 200% zoom, storage/quota resilience, 48 contrast checks and SW rollback pass |
| 2026-07-10 | P3 | Runtime encoding and delivery | preflop chunks reduced to 31-34 KiB raw; precache/bundle gates pass; verified FTP ZIP produced |
| 2026-07-10 | P3 | Full scoped release chain | `release:mtt-core` passed: typecheck, 135 test files/664 tests, registry, core gate, ranges, build, precache and bundle budget |
| 2026-07-10 | P3 | FTP artifact reconciled | current `dist` matches package 21/21 files with 0 hash differences; ZIP has 22 entries and SHA-256 `65FC0E2641BE638474CC673D483CB953FE184845D0925A42A65575867B746E7B` |
| 2026-07-13 | P4 | Solver queue baseline | 8/9 manifests complete, aggregate 133/165; large batch 40/72 with 32 pending |
| 2026-07-13 | P4 | Windows restart automation | hidden AtLogOn scheduled task installed; mutex, IgnoreNew, checkpoints, failure restart and stale-dump guard verified; solver resumed on PID 27832 |
| 2026-07-13 | Control | Lean execution queue | ordered mechanical, human-review and external-data tasks recorded in `Agents/mtt-lean-execution-queue.md` |
| 2026-07-14 | P2 | Actual Core browser regression | production build passed Chrome E2E on desktop plus 360/390/412 px: scoped FLOP, HH, stats, reload, offline, 200% zoom, storage/quota resilience, 48 contrast checks and service-worker rollback |
| 2026-07-14 | P2 | Production fixture regression | real Core preflop plus isolated synthetic FLOP/TURN/RIVER production slots passed lazy-chunk, postflop, HH, stats, offline, resilience, contrast and service-worker checks; registry restored and clean |
| 2026-07-14 | Control | Long-running solver intake | active watcher replaced without stopping solver; it polls for up to seven days and runs idempotent intake only when coverage changes |
| 2026-07-14 | P0 | Full regression baseline | `npm test` passed: 136 files / 670 tests while the active TexasSolver process and AtLogOn queue remained live |
| 2026-07-14 | Control | Change-driven intake retry | watcher skips unchanged coverage and retries it after a technical ingest, final-audit or pilot-suite failure; raw checkpoints and review fail-closed behavior remain intact |
| 2026-07-14 | P1 | Source-safe handoff refreshed | 26 expected artifacts present; the P1 packet has exactly 4 missing six-max CHIP_EV normalized exports and no missing permission manifests |
| 2026-07-14 | P1 | Solver status fidelity | SB vs BB OOP root reviews and `-ROOT` drafts now report as present; no false CHECK-review or redundant merge action remains in coverage status |
| 2026-07-14 | Control | Raw-export freshness | change-driven watcher signature includes the latest raw write per family, so corrected/repeated exports re-enter source-safe intake without requiring a board-count change |
| 2026-07-15 | P4 | Low-memory solver branch | `PKRTrainer-TexasSolver-LowMemory` installed and started: 18 LOW-SPR boards, 4 threads, `BelowNormal`, 35% free-memory guard; legacy 72-board autostart disabled after raw completion |
| 2026-07-15 | P4 | Raw solver evidence complete | large scenario audit `72/72` valid with 0 errors; low-memory batch `18/18` valid; fresh review packet and its mechanical audit cover 20 `NEEDS_REVIEW` families and 68 explicit blockers without runtime promotion |
| 2026-07-16 | P1 | Six-max batch intake and stage automation | All four owned-export slots now preflight as one atomic batch; candidate creation and raw staging remain blocked until each exact reviewed export is supplied and an explicit write token is given |
| 2026-07-16 | P4 | Two-phase low-memory solver queue | `next` and `followup` both reached 72/72 raw checkpoints; the scheduled worker exits SUCCESS with no solver process because the prepared queue is complete, and no output was automatically promoted |
| 2026-07-16 | P4.1 | Multi-action EV and EN/CZ contract | Typed preflop/postflop EV ingestion, fail-closed validation, equivalent-best scoring, all-action result UI, persistence and hybrid language mode implemented; Core report measures 0/493818 preflop and 0/972 scoped FLOP EV decisions without treating frequencies as EV |
| 2026-07-16 | Verification | Full regression and browser release QA | 147 Vitest files / 721 tests, typecheck, production build, precache, bundle budget and Chrome E2E on desktop plus 360/390/412 px passed; 0 browser errors and 48 contrast checks passed |
