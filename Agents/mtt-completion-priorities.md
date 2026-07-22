# MTT Completion Priorities

Updated: 2026-07-22
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
10. Canonical flop cohorts and beta/growth coverage follow
    `Agents/mtt-board-coverage-beta-plan.md`; cosmetic suit permutations never
    become separate solves.

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
- TexasSolver evidence queue: phases `next` and `followup` are raw-complete
  (`72/72` each). The approved `owner-depth` phase is also raw-complete at
  `72/72`, covering nine new textures in each of eight underrepresented review
  families.
- Canonical board baseline was 40 unique rank boards and 350 family/board pairs.
  The audited 45-board `beta-min` source wave raised declared input coverage to
  85 unique boards and 395 family/board pairs, closing every six-per-cohort gap.
  It became active only after `owner-depth` completed and is now raw-complete at
  45/45; the worker exited `SUCCESS` with no recorded failure.
- The isolated 83-board beta-depth source wave passed its 83/83 scenario audit
  and reached 83/83 raw checkpoints. Declared input coverage is 168 unique
  boards and 478 family/board pairs with every cohort at twelve boards. The
  completed owner-authorized review-only solve does not satisfy poker review or
  production readiness.
- Cumulative reduced-tree extraction now observes all six derived memory-safe
  manifests. The final 2026-07-20 14:49 incremental snapshot contains 439 unique solved family/board
  pairs across 20 families and beta-depth is 83/83; 20/20 reports are valid, extraction failures are zero
  and 20/20 families meet the mechanical shape. Human review and production
  eligibility remain independently 0/20. Incremental staged accuracy now retains
  traceable exploitability for 403/439 approved boards across all 20 families;
  review-protocol warnings are down to 20 human caveat fields. The canonical
  owner dashboard separates 10 accuracy-complete from 10 partial families and
  exposes all 36 missing log filenames without inferring a poker decision. Its
  v2 decision export binds every family to a deterministic SHA-256 fingerprint
  of the exact source-safe review and accuracy files; changed evidence makes an
  earlier sign-off stale in the dashboard, both writers and protocol gate. The
  ten-minute cycle regenerates only the blank template after a successful
  dashboard build and reports its v2/20-of-20/zero-verdict health explicitly.
- Windows low-memory task: `PKRTrainer-TexasSolver-LowMemory` returned `SUCCESS`
  with no live worker or solver process after completing every authorized phase.
  It remains checkpoint-safe after sign-in and will not duplicate a live process.
- Every low-memory solver phase is `MEMORY_SAFE_REVIEW_ONLY`: raw exports may be audited
  and packaged for review, but cannot be automatically staged, normalized,
  merged or promoted to runtime content.
- Scoped core release gate: green; Full MTT NLHE remains intentionally red at 4/64.
- Current release regression is green at 152/152 Vitest files and 762/762 tests.
  Vitest is capped at four parent workers because CLI integration tests spawn
  their own Node/PowerShell children; this prevents resource-driven false
  timeouts while the guarded solver worker is installed.
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

Status: REVIEW-ONLY SOLVING COMPLETE / HUMAN REVIEW

- The first three manifests are raw-complete (`72/72` each), `beta-min` is
  45/45, `beta-depth` is 83/83 and growth is 98/98. All six approved manifests
  are now represented in the source-safe cumulative evidence.
  For its memory-safe tree, suppress unrelated older staging/draft artefacts and
  skip downstream pilot refresh; those checks belong only to comparable full-tree
  evidence.
- Promote no solver output beyond scoped pilot status without poker review and a provenance manifest.
- The 83-board `beta-depth` phase was audited 83/83, explicitly owner-authorized
  and completed at 83/83 through the checkpoint-aware review-only task. The
  completed 98/98 `growth` export remains
  review-only evidence and does not authorize normalization or promotion.

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
- The exact blank intake workbench now covers all seven pilots, 972 decisions and
  2,916 action-value slots. It is fingerprinted against current pilot structure,
  rejects partial/stale input and writes only a non-production candidate after
  an explicit confirmation token.

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
the ten-minute MTT cycle and served at
`http://127.0.0.1:5173/artifacts/texas-solver-review-protocol/viewer/index.html`.
Its readiness filter is read-only context and never selects a poker decision.
Process its four waves in order. Each downloaded JSON must pass the batch-writer
dry-run before the explicit confirmed write; the model must leave every verdict
pending until the project owner selects it.

For professional EV comparison, obtain one EV-enabled owned solver pilot export
under `Agents/mtt-action-ev-and-language-contract.md`. Do not restart or reinterpret
the frequency-only TexasSolver queue as an EV source.

```powershell
npm run mtt:postflop-action-ev-intake -- --all --write-template --summary
```

## Progress Log

| Date | Priority | Result | Evidence |
| --- | --- | --- | --- |
| 2026-07-22 | P4 / Owner workflow automation | Blank decision template stays synchronized | The recurring cycle refreshes the template only after the canonical dashboard succeeds and never touches the separate human decision file. Status exposes schema, 20/20 fingerprint coverage, zero selected verdicts, timestamp and exit code. PowerShell parser checks and Windows automation tests passed 9/9; a real guarded cycle exited 0 with owner review still 0/20 |
| 2026-07-22 | P4 / Owner evidence binding | Old sign-offs cannot survive changed evidence | Decision schema v2 fingerprints the exact source-safe family reports and accuracy report. Dashboard import, single and batch writers, and protocol validation all fail closed on stale evidence without selecting a verdict. The live template has 20/20 valid fingerprints and zero decisions; dashboard remains 53 reports, 403/439 boards, 10 complete plus 10 partial and owner 0/20. Focused tests passed 24/24; typecheck, scoped Core and production build passed |
| 2026-07-20 | P4 / Owner accuracy workflow | Approved accuracy is visible at the human gate | The canonical 53-report dashboard joins approved staged evidence across 20 owner families: 403/439 boards, 10 complete and 10 partial families, with all 36 missing log filenames expandable and filterable. It never selects or recommends a verdict; owner decisions remain 0/20. Malformed approved reports fail closed. Focused tests passed 25/25; typecheck, scoped Core and production build passed |
| 2026-07-20 | P4 / Solver accuracy intake | UTF-16 per-board evidence is retained incrementally | The locked refresh reused validated cumulative reports to update 20/20 staging summaries without reparsing raw solver JSON. Traceable exploitability is now present for 403/439 approved boards across all 20 families; the immediate repeat wrote zero files. Review warnings fell from 38 to 20, leaving only human caveats and owner verdicts. Focused tests passed 38/38; typecheck, scoped Core and production build passed |
| 2026-07-20 | P1 / Canonical provenance handoff | Duplicate permission intake removed | Candidate generation reuses the four owner-confirmed canonical permission manifests and preflights with the eventual owned-export license/confidence. Live candidate and staging progress is 0 ready, 4 waiting, 0 invalid; every stage row reports `permission=CANONICAL` and waits only for the normalized candidate. Focused tests passed 18/18; typecheck, registry, source intake and Core 4/4 plus 7/7 passed. Confirmation tokens, full staging validation and separate promotion remain mandatory |
| 2026-07-20 | P4 / Live intake status | Incremental truth no longer waits for the heavy cycle | The locked refresh report now includes scan/raw timestamps and exact counts for all six manifests. It tracked beta-depth beyond the stale 65/83 full-cycle snapshot and confirmed final 83/83 plus 439 cumulative checkpoints. Focused tests passed 12/12 and the full 152-file / 762-test Core release chain passed without strategy or owner-decision writes |
| 2026-07-20 | P1 / Incremental six-max intake | Each reviewed export can advance independently | Candidate and staging batch tools now support explicit fail-closed incremental mode: absent/blank inputs wait, partial inputs fail, writes keep confirmation tokens and promotion stays separate. Live workbench: 0 ready, 4 waiting, 0 invalid; filtered packet folder: exactly four current six-max slots. Reviewer, owner, source location and runtime permission are already recorded in the canonical manifests; no duplicate manifest or external evidence reference is required |
| 2026-07-20 | Release | Verified incremental P1 FTP artifact | Source commit `c44efebdad96` passed 152/152 test files and 762/762 tests, MTT Core 4/4 plus 7/7, production build/precache/budget and Chrome desktop plus 360/390/412 px. `deploy/pkrtrainer-ftp-20260720-141237-c44efebdad96-mtt-core-p1-incremental.zip` uses portable forward-slash entries and reconciled 22/22 with no differences; SHA-256 `2374090EBAB10A4E2E38D9CD04D03C4457E0C6E561561F01C7A18093CC192F67` |
| 2026-07-20 | P4 / Incremental intake | Shared locked review-only refresh | The solver watcher and ten-minute cycle now call one PID-locked CLI that unions all six approved memory-safe manifests and refreshes only stale family reports. The watcher was hot-replaced without touching the active solver and confirmed beta-depth 59/83 with 415 unique family/board pairs; evidence and mechanical readiness remain valid 20/20 while owner protocol and production eligibility remain 0/20. Dry-run, live watcher, 28/28 related tests, typecheck, production build and scoped Core gate passed without strategy promotion |
| 2026-07-20 | P4 / Automation | Live checkpoint intake and recurring-task repair | The idempotent `mtt:autonomous-cycle-ensure` command repaired the disabled ten-minute task to Ready and now reports enabled health, next run, latest logged outcome and stale snapshot age. Beta-depth resumed from 42/83 to 49/83; four changed review-only family reports through `J88r` were refreshed to 405 unique family/board pairs, 20/20 valid evidence and 20/20 mechanical readiness. No strategy was staged or promoted |
| 2026-07-20 | Release | Verified EN/CZ FTP artifact | Source commit `25ee34a01488` packaged with the tracked `deploy/forpsi/.htaccess.example` staging template as `deploy/pkrtrainer-ftp-20260720-124211-25ee34a01488-mtt-core-i18n-final.zip`; reconciliation passed 22/22 with 0 missing, 0 extra and 0 hash mismatches. SHA-256 `D85B7AA2B6578C8979871A5D9FD697FAB7928AD694DC195ABC2A9E2CB58616E5` |
| 2026-07-20 | P4.1 / Verification | EN/CZ error handling and resource-stable release regression | Global runtime and asynchronous failures now use the live EN/CZ catalog; range metadata keeps the poker term `ante ON/OFF`. Four-worker Vitest passed 151/151 files and 753/753 tests; registry, Core 4/4 plus 7/7, ranges, build, precache and bundle budget passed. Production Chrome E2E passed desktop plus 360/390/412 px with zero browser errors and 48 contrast checks. The low-memory worker remains active but truthfully waits with no solver PID while CPU/RAM guards are not met |
| 2026-07-20 | P4 | Current solver and intake truth | Beta-depth completed 83/83, growth is 98/98, and cumulative readiness is 20/20 valid plus 20/20 mechanical over 439 unique family/board pairs. The worker returned `SUCCESS` with no live solver process; owner protocol and production eligibility remain independently 0/20 |
| 2026-07-20 | Owner review | Export-valid progress and mobile QA | Dashboard counts only complete decisions, highlights missing required metadata and focuses the next incomplete row without choosing a verdict. It regenerated over 53 reports with 20 owner rows, 20/20 mechanical context and zero preselected decisions; focused tests, typecheck and 390px browser containment passed |
| 2026-07-17 | P4 | Complete memory-safe intake and review-readiness matrix | The cycle now consumes all five derived manifests rather than mislabeling the first two source manifests. A live cycle observed 272/344 physical and 269 unique family/board checkpoints, produced 20/20 valid reports, measured 12/20 mechanical family shapes, kept owner review at 0/20 and Core green |
| 2026-07-17 | P4 | Beta-depth computation authorized | Owner instruction activates the audited 83-board supply only as guarded `MEMORY_SAFE_REVIEW_ONLY` evidence. Owner poker review and explicit promotion remain unchanged gates; `growth` stays frozen |
| 2026-07-16 | P4 | Owner-depth evidence phase complete | Duplicate-safe 72-board batch passed 72/72 scenario audit and reached 72/72 raw checkpoints at 16:46, two threads and `MEMORY_SAFE_REVIEW_ONLY` |
| 2026-07-16 | P4 | Canonical beta-minimum solving complete | Source generation and hardened audit passed 45/45 with 0 errors; the guarded worker completed 45/45, exited `SUCCESS` and recorded no solver failure |
| 2026-07-16 | P4 | Frozen beta-depth supply ready | The disjoint 83-file wave passed 83/83 scenario audit with 0 errors and raises declared coverage to 168 boards / 478 family-board pairs with all 14 cohorts at twelve boards; status remains `FROZEN_PENDING_OWNER_REVIEW` |
| 2026-07-16 | P4 | Incremental cumulative review-only intake | Every solved checkpoint is unioned per family across memory-safe phases. Final beta-min intake produced 117 board checkpoints across 20 families; 20/20 reports are valid, 0 extraction failures and no production promotion |
| 2026-07-16 | Verification | Current broad MTT release regression | 150/150 Vitest files and 747/747 tests, typecheck and scoped Core 4/4 preflop plus 7/7 FLOP pilots passed; exact action EV remains truthfully 0/493818 preflop and 0/972 FLOP |
| 2026-07-16 | Release | Current verified FTP artifact | Clean commit `9b81ae29` packaged after desktop/mobile and positive action-EV fixture browser QA; ZIP reconciliation passed 22/22 with SHA-256 `568A11EDF85B687C7AAAEA834910E64A2955983E099CCF1E14887F5FC99E0FFE` |
| 2026-07-16 | Control | Single beta input owner and PowerShell value safety | The ten-minute MTT cycle is read-only for solver inputs; the isolated prep script is their sole generator/auditor. Boolean and native-exit helpers suppress log output so a successful resource check or command cannot be coerced into a false deferral/failure; parser, live one-shot cycles, 86 focused tests and typecheck passed |
| 2026-07-16 | P4.1 | Exact action-EV intake ready | Seven blank fingerprinted templates cover 972 decisions / 2,916 action slots; complete-candidate and fail-closed regression tests passed 3/3 |
| 2026-07-16 | Control | Memory-safe watcher isolation | Reduced-tree coverage now hides unrelated historical staging/draft aliases, records changed raw coverage once and skips downstream review/pilot refresh; the autonomous Core report persists exact action-EV readiness counts |
| 2026-07-16 | P4.2 | Action-EV intake write safety | Existing workbenches now require the complete immutable pilot structure to count as current; malformed files remain untouched and fail closed. Candidate and audit paths are distinct even without a `.json` suffix, and neither may overwrite the reviewed input |
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
| 2026-07-14 | Control | Change-driven intake retry | watcher skips unchanged coverage and retries after a technical ingest or final-audit failure; a downstream pilot blocker remains fail-closed but does not reprocess the same successful raw checkpoint |
| 2026-07-14 | P1 | Source-safe handoff refreshed | 26 expected artifacts present; the P1 packet has exactly 4 missing six-max CHIP_EV normalized exports and no missing permission manifests |
| 2026-07-14 | P1 | Solver status fidelity | SB vs BB OOP root reviews and `-ROOT` drafts now report as present; no false CHECK-review or redundant merge action remains in coverage status |
| 2026-07-14 | Control | Raw-export freshness | change-driven watcher signature includes the latest raw write per family, so corrected/repeated exports re-enter source-safe intake without requiring a board-count change |
| 2026-07-15 | P4 | Low-memory solver branch | `PKRTrainer-TexasSolver-LowMemory` installed and started: 18 LOW-SPR boards, 4 threads, `BelowNormal`, 35% free-memory guard; legacy 72-board autostart disabled after raw completion |
| 2026-07-15 | P4 | Raw solver evidence complete | large scenario audit `72/72` valid with 0 errors; low-memory batch `18/18` valid; fresh review packet and its mechanical audit cover 20 `NEEDS_REVIEW` families and 68 explicit blockers without runtime promotion |
| 2026-07-16 | P1 | Six-max batch intake and stage automation | All four owned-export slots now preflight as one atomic batch; candidate creation and raw staging remain blocked until each exact reviewed export is supplied and an explicit write token is given |
| 2026-07-16 | P4 | Two-phase low-memory solver queue | `next` and `followup` both reached 72/72 raw checkpoints; the scheduled worker exits SUCCESS with no solver process because the prepared queue is complete, and no output was automatically promoted |
| 2026-07-16 | P4.1 | Multi-action EV and EN/CZ contract | Typed preflop/postflop EV ingestion, fail-closed validation, equivalent-best scoring, all-action result UI, persistence and hybrid language mode implemented; Core report measures 0/493818 preflop and 0/972 scoped FLOP EV decisions without treating frequencies as EV |
| 2026-07-16 | Verification | Full regression and browser release QA | 147 Vitest files / 721 tests, typecheck, production build, precache, bundle budget and Chrome E2E on desktop plus 360/390/412 px passed; 0 browser errors and 48 contrast checks passed |
