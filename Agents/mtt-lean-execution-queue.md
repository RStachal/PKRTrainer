# MTT Lean Execution Queue

Updated: 2026-07-22
Status: ACTIVE AFTER MTT_CORE_V1
Default execution setting: GPT-5.6 Terra, Medium reasoning

## Authority

This is the ordered execution queue for lower-cost AI work after the MTT Core
release. Read `Agents/mtt-completion-priorities.md` first. This file refines its
next actions; it does not widen the declared release scope or weaken any gate.
`Agents/mtt-autonomous-operating-plan.md` is the product-level authority and
defines the permanent solver-intake and sequential-completion lanes.
`Agents/mtt-parallel-agents.md` is the Windows runtime authority for the two
recurring background branches.
`Agents/mtt-action-ev-and-language-contract.md` is the authority for action EV,
equivalent optimal actions and EN/CZ behavior.
`Agents/mtt-board-coverage-beta-plan.md` is the authority for canonical flop
cohorts, beta coverage targets and future solver expansion.

Execution protocol:

1. After the session health check, select the first `READY_ONCE` task whose
   dependencies are done. Repeating checks are not queue candidates.
2. Work on one task at a time. TexasSolver is the only allowed parallel workload.
3. Run the listed evidence commands and record the result in this file.
4. Never create poker strategy values, review decisions or provenance facts.
5. Stop at `HUMAN_GATE` or `EXTERNAL_DATA` until the named input exists.
6. `next`, `followup`, `owner-depth`, `beta-min` and the owner-authorized
   `beta-depth` phase are raw-complete. The completed `growth` exports enter the intake cycle
   only through their `MEMORY_SAFE_REVIEW_ONLY` manifest; this does not authorize
   further growth solving, staging or normalization. Keep every unapproved wave
   outside the worker until its review boundary is explicitly decided.
7. Keep raw solver output local and ignored. Ship only reviewed source-safe artifacts.
8. `permission.json` records provenance/review rights; it is never a customer entitlement.
9. After recording a completed dependency, change only the next eligible
   `BLOCKED_BY` task to `READY_ONCE`. Never unlock a human or data gate.

## Reasonable Finish Line

The reasonable near-term MTT finish is:

- `MTT_CORE_V1` deployed and staging-smoked behind Basic Auth;
- the ordered TexasSolver queue completed and reduced to reviewed,
  explicitly scoped evidence decisions;
- no regression in the 4/4 production preflop profiles or seven FLOP pilots;
- unsupported six-max, DOLAR_EV and full postflop content remains visibly locked.

The 64-row Full MTT NLHE gate is a separate data program. It currently needs 60
exact `normalized.json` plus `permission.json` pairs. AI execution alone cannot
honestly complete it because four six-max CHIP_EV packs, eight DOLAR_EV packs and
48 full postflop packs lack reviewed strategy inputs.

## Model Routing

- `MECHANICAL`: GPT-5.6 Terra with Medium reasoning. Use this as the default.
- `REPEATABLE`: GPT-5.6 Luna with Low or Medium reasoning is acceptable when the
  task only runs commands, updates counts or applies an exact documented edit.
- `JUDGMENT`: GPT-5.6 Sol with High reasoning for architecture, unexplained gate
  failures, release-scope changes or cross-module implementation.
- `HUMAN_GATE`: project owner/poker reviewer. No model may substitute its own decision.

Escalate from Terra to Sol only after one focused reproduction and one documented
attempt fail, or when a task explicitly changes strategy meaning or release scope.

## Baseline

- `MTT_CORE_V1`: green, 4/4 scoped preflop, 7/7 scoped FLOP pilots.
- Full library: intentionally red, 4/64 production rows and 60 waiting rows.
- TexasSolver legacy large review batch: 72/72 raw boards complete across all
  12 families. No result has been promoted into runtime content without review.
- Resource-balanced queue: phases `next` and `followup` are raw-complete at
  `72/72`. The duplicate-safe `owner-depth` phase also reached `72/72`. The
  audited 45-board `beta-min` phase reached 45/45 under the same two-thread,
  `BelowNormal`, 35% free-memory guarded worker. The audited 83-board
  `beta-depth` wave also reached 83/83 as the fifth owner-authorized phase. Every phase remains
  `MEMORY_SAFE_REVIEW_ONLY`.
- Review protocol: 20 families need human review; 0 protocol-ready.
- Complete memory-safe intake: all six derived manifests are raw-complete, including the
  98-board growth evidence wrapper. The 2026-07-20 14:49 snapshot has 439
  unique family/board pairs, 20/20 valid cumulative reports and 20/20 mechanical
  family shapes. Approved per-board accuracy is now traceable for all 439/439
  boards; `OPS-56` closed its isolated recovery queue on 2026-07-22 after
  starting at 403/439 across 10 families. `OPS-57` then finalized the reviewer
  handoff, which reports `valid=True, current=True` at 439/439. These counts do
  not substitute for the 0/20 owner decisions, which remain the live blocker.
- Action-EV comparison: implementation complete, data not ready. Core preflop is
  `0/493818` complete decisions across `0/4` packs; scoped FLOP pilots are
  `0/972` across `0/7`. All seven blank FLOP intake templates are current at
  972 decisions and 2,916 action-value slots. Frequency-only solver output is
  excluded.
- TexasSolver v0.2.0 compatibility: the reduced-tree contract remains frozen even though
  its inherited `set_raise_limit 3` line is logged as unrecognized. The isolated
  next batch removes only that ignored directive; its resulting tree still uses
  the same console default until an owner-approved tree policy replaces it.
- Windows task: `PKRTrainer-TexasSolver-LowMemory`, AtLogOn, hidden,
  `IgnoreNew`, `StartWhenAvailable`; it resumes checkpoints and selects the
  next incomplete raw phase. After all raw phases complete, it recovers only
  missing approved per-board accuracy logs one checkpoint at a time. It never
  replaces canonical raw JSON, stages strategy or promotes production content.
- Separate mechanical task: `PKRTrainer-MTT-Task-Agent-10m`, AtLogOn, hidden,
  `IgnoreNew`; it runs safe status and intake work every 10 minutes without
  changing solver inputs, raw exports or runtime content.

## Phase OPS - Autonomous Solver Operation

### OPS-00 - Install restartable queue

Status: `DONE 2026-07-13`
Lane: `JUDGMENT`

Evidence:

```powershell
npm run mtt:texas-solver-low-memory-status
```

Acceptance: task state is `Running` or `Ready`; at most one owned
`console_solver.exe` is visible; the current active parameter is reported.

### OPS-01 - Prove reboot resume

Status: `WAITING_FOR_WINDOWS_RESTART`
Depends on: `OPS-00`
Lane: `REPEATABLE`

After the next normal Windows restart and sign-in, do not open VS Code first.
Wait two minutes, then run the `OPS-00` evidence command from any PowerShell.

Acceptance: the scheduled task has a new LastRunTime, one solver process is
active unless all phases are complete, and the newest worker log records either
a resume or an all-phases-complete result.

### OPS-02 - Session health check

Status: `REPEATING_CHECK`
Depends on: `OPS-00`
Lane: `REPEATABLE`

Last measured: 2026-07-20 14:49 local time. `next`, `followup` and `owner-depth`
are complete at 72/72, `beta-min` is 45/45, `growth` is 98/98 and `beta-depth`
is 83/83. The scheduled worker returned `SUCCESS` with no worker or solver process.
One historical native failure remains recorded and visible.

The current cumulative intake aggregates solved memory-safe checkpoints into 20
valid reports covering 439 unique family/board pairs. Extraction failures are
zero, and no strategy was staged or promoted.

Run once per AI work session, not in a tight loop:

```powershell
npm run mtt:texas-solver-low-memory-status
```

`mtt:texas-solver-background-status` also reports the active parameter file,
accumulated CPU time and working-set memory. A rising CPU time means a large
tree is still progressing even when the current board produces no new raw file.
Do not restart a live solver solely because its memory is high or its next
iteration is slow.
`mtt:texas-solver-low-memory-status` also reports any locally recorded native
solver failure by time, parameter, family and exit code. A recorded failure is
coverage evidence, not a reason to declare that board complete; the review-only
runner continues later parameters and the missing board remains visible.
When physical free memory is below 10%, do not start another solver process; the
status warning is informational and does not authorize an automatic stop of the
current owner-approved calculation.

If the task is `Ready`, a phase is incomplete and no solver process exists, run
`Start-ScheduledTask -TaskName PKRTrainer-TexasSolver-LowMemory` once. If it
stops again, inspect the newest `artifacts/texas-solver-low-memory/worker-*.log`
and escalate; do not repeatedly restart it.
If all raw phases and all approved accuracy logs are complete, do not restart
it; a successful no-op at sign-in is the intended behavior. While `OPS-56`
reports pending logs, starting the task resumes that isolated recovery queue.

To halt the current local queue deliberately without deleting raw checkpoints,
run `npm run mtt:texas-solver-low-memory-stop`. To also disable future sign-in
starts, run `npm run mtt:texas-solver-low-memory-uninstall` afterwards.

### OPS-03 - Keep batch scope explicit

Status: `ACTIVE_GUARDRAIL`
Lane: `REPEATABLE`

Only explicitly owner-authorized phases may enter the worker. Beta-depth received
that authorization on 2026-07-17 and may run after beta-min as review-only
evidence. Do not activate `growth` or another batch before its review boundary is
explicitly decided. Presence in a source manifest alone never activates a phase.
No memory-safe phase may stage, normalize, merge or promote strategy.
Acceptance: one solver phase runs at a time and every derived manifest retains
its `MEMORY_SAFE_REVIEW_ONLY` boundary.

### OPS-04 - Keep the recurring mechanical cycle active

Status: `ACTIVE 2026-07-14`
Depends on: `OPS-00`
Lane: `REPEATABLE`

Install under the actual signed-in Windows owner, then verify it records a new
cycle log after sign-in. Its work is limited to coverage status, canonical board
coverage, read-only reduced-tree evidence, the source-safe P1 intake packet and
a scoped Core gate when raw coverage changes. It never writes solver inputs;
`run-mtt-solver-batch-prep-cycle.ps1` is their sole generator and auditor.

```powershell
npm run mtt:autonomous-cycle-install
npm run mtt:autonomous-cycle-ensure
npm run mtt:autonomous-cycle-status
```

Use `install` to create or intentionally replace the schedule. Use the
idempotent `ensure` command for routine repair: it enables an existing disabled
task without rewriting its triggers, installs it only when missing and requests
one guarded cycle immediately so a re-enabled stale schedule catches up. Status
labels the task health and marks a cycle snapshot stale after three missed
windows, because live raw checkpoints can be newer than a resource-deferred
snapshot. The latest cycle outcome is printed from the newest log so a CPU/RAM
deferral is visible without opening artifacts manually.

To interrupt only a current cycle, use `npm run mtt:autonomous-cycle-stop`; to
remove future sign-in starts too, use `npm run mtt:autonomous-cycle-uninstall`.
Neither command is allowed to stop the solver or its watcher.

### OPS-13 - Run the owner-directed low-memory review queue

Status: `DONE 2026-07-16 - ALL APPROVED PHASES COMPLETE`
Lane: `REPEATABLE`

The former high-memory autostart queue is disabled. The low-memory task completed
all approved raw phases under the same resource guard. It remains installed for
restart-safe checkpoint verification and the isolated `OPS-56` accuracy-log
recovery; neither path promotes runtime strategy. Once raw coverage and approved
accuracy evidence are complete, repeated triggers exit successfully without
starting TexasSolver.

```powershell
npm run mtt:texas-solver-low-memory-status
```

To halt the current worker without deleting raw checkpoints, run
`npm run mtt:texas-solver-low-memory-stop`. To remove its future sign-in start,
run `npm run mtt:texas-solver-low-memory-uninstall`.

### OPS-32 - Deepen underrepresented owner-review families

Status: `DONE 2026-07-16 - 72/72`
Depends on: `OPS-31`
Lane: `REPEATABLE`

The source batch contains eight underrepresented families and nine new textures
per family, 72 unique family/board pairs total. The generator fails closed if a
pair already exists in any source coverage manifest. Scenario audit is 72/72
valid with 0 errors. The low-memory worker starts this phase only after confirming
both earlier phases are raw-complete and keeps incremental ingest coverage-only.

```powershell
npm run mtt:texas-solver-low-memory-install
npm run mtt:texas-solver-low-memory-status
```

Acceptance: met. One guarded worker completed `owner-depth` at 72/72 without
automatic staging or promotion; the next phase started only after this checkpoint.

### OPS-36 - Queue canonical beta-minimum board coverage

Status: `DONE 2026-07-16 - 45/45`
Depends on: `OPS-32`
Lane: `REPEATABLE`

The generator produced 45 globally new rank boards across all 14 canonical
cohorts and distributed them over the 20 existing families, 2-3 boards per
family. It rejected duplicate family/board pairs and the source batch passed its
45/45 scenario audit with 0 errors. This is declared input coverage only;
solving and owner review remain separate evidence gates. The low-memory worker
selected this phase only after `owner-depth` reached 72/72.
The same generator freezes disjoint future waves of 83 `beta-depth` and 98
`growth` boards. Beta-depth is now physically prepared and audited, but neither
future wave was part of the active Windows worker at completion of this task;
the later owner authorization is recorded in `OPS-41`.

```powershell
npm run mtt:texas-solver-large-flop-batch -- --preset=beta-min --summary
npm run mtt:texas-solver-board-catalog
```

### OPS-39 - Prepare beta-depth without activating it

Status: `DONE 2026-07-16`
Depends on: `OPS-36`
Lane: `REPEATABLE`

The isolated prep owner now generates and audits both the active-eligible
45-board beta-min wave and the frozen 83-board beta-depth wave. Status reports
physical input completeness separately from activation state. Beta-depth is
hard-labeled `FROZEN_PENDING_OWNER_REVIEW` and remains absent from the low-memory
worker phase list.

Acceptance: source generation produces 83/83 beta-depth parameter files with no
duplicate family/board pairs; scenario audit returns 83 valid files and 0
errors; the catalog reports 168 unique boards, 478 family/board pairs and zero
beta-depth cohort gap; a one-shot prep cycle exits 0 without changing the active
solver queue.

Evidence: PowerShell parser checks passed, the live prep cycle audited both
45 + 83 waves, focused board/solver/Windows automation tests passed 24/24 and
`npm run typecheck` passed while beta-min continued in the background.

### OPS-37 - Keep beta generation single-owner and fail-closed

Status: `DONE 2026-07-16`
Depends on: `OPS-36`
Lane: `JUDGMENT`

The ten-minute MTT cycle no longer regenerates or audits the same beta source
files as the isolated prep script. PowerShell helpers that return booleans,
processes or native exit codes suppress their log output before returning, so a
message cannot become an extra success-stream value and change control flow.

Acceptance: PowerShell parser checks pass, the isolated one-shot prep exits 0
with a 45/45 audit, the recurring MTT cycle exits 0, and focused autostart tests
lock both ownership and output-suppression contracts.

Evidence: all six edited PowerShell files parsed without errors; the one-shot
prep and recurring cycle exited 0; the 13-file focused MTT suite passed 86/86
tests and `npm run typecheck` passed while TexasSolver remained active.

### OPS-38 - Consume solved checkpoints cumulatively

Status: `DONE 2026-07-16`
Depends on: `OPS-37`
Lane: `JUDGMENT`

The recurring cycle unions solved board IDs per family across every
`MEMORY_SAFE_REVIEW_ONLY` phase. It includes already solved boards from a
partial family, validates the exact requested-board set before treating an
existing report as fresh, and rebuilds only a stale or incomplete report.

Acceptance: live beta coverage is reflected without waiting for the full
45-board wave; prior owner-depth boards remain present when the same family
receives beta boards; all reports stay read-only and production-ineligible.

Evidence: final beta intake produced 20 reports over 117 cumulative family/board
checkpoints. All 20 reports are valid, extraction failures are
zero, and focused autostart/extraction/viewer tests passed 18/18.

### OPS-40 - Close the approved solver queue at the review gate

Status: `DONE 2026-07-16`
Depends on: `OPS-38`, `OPS-39`
Lane: `JUDGMENT`

All four approved low-memory phases are raw-complete: `next`, `followup` and
`owner-depth` are 72/72, and `beta-min` is 45/45. The scheduled worker returned
`SUCCESS`, owns no process and recorded no solver failure. It did not select the
prepared beta-depth source wave because that wave is not in the worker phase
list.

Acceptance: the final recurring intake sees beta-min 45/45 and 20/20 complete
families, writes 20 valid cumulative reports over 117 checkpoints, records zero
extraction failures, keeps Core green and promotes no strategy.

Evidence: the 18:10 cycle exited 0; full regression passed 150/150 files and
747/747 tests. The next executable transition is human owner review, not another
automatic solver phase.

### OPS-41 - Activate owner-authorized beta-depth evidence

Status: `DONE 2026-07-20 - 83/83`
Depends on: `OPS-39`, `OPS-40`
Lane: `REPEATABLE`

The owner explicitly requested another background TexasSolver run. Add the
audited 83-board `beta-depth` supply as the fifth checkpoint-safe phase, use
three threads on the next worker, `BelowNormal` priority, CPU <= 40%, at least 35% free RAM and the
25% emergency stop. Observe every new checkpoint through cumulative
`MEMORY_SAFE_REVIEW_ONLY` intake. This work may improve the review packet but
never supplies a human verdict, production strategy or action EV.

Acceptance: the Windows task is enabled and running or waiting on its resource
guard; the derived 83-board manifest passes scenario audit; the recurring MTT
cycle includes it when present; no `normalized.json`, `permission.json` or
runtime strategy file is generated. Completed growth output remains an
explicitly bounded `MEMORY_SAFE_REVIEW_ONLY` intake item.

Evidence at 2026-07-20 14:49: beta-depth is 83/83 with all 20 families raw-complete.
Growth is independently raw-complete at 98/98. The final checkpoint refreshed
the changed cumulative family report; 20/20 reports cover 439 unique
family/board pairs. The worker returned `SUCCESS` with no live solver process,
and no strategy, permission or owner decision was generated.

### OPS-42 - Join all memory-safe evidence to mechanical review readiness

Status: `DONE 2026-07-17`
Depends on: `OPS-38`, `OPS-41`
Lane: `JUDGMENT`

The recurring cycle now consumes the derived `MEMORY_SAFE_REVIEW_ONLY` manifests
for `next` and `followup` as well as owner-depth, beta-min and beta-depth. This
restores 144 completed checkpoints that the source-manifest view could not
safely classify as reduced-tree evidence. A new source-safe report joins board
count, cohort diversity and largest-cohort share to the separate owner protocol.
It reports the next gate but never writes a poker verdict or promotion command.
Owner waves are ordered by current MTT Core pilot relationship before SPR
companions; unknown families fall back to deterministic alphabetical order.

Acceptance: a live cycle reads the derived manifests, unions duplicate family/board
pairs, emits JSON plus `MECHANICAL_READINESS.md`, retains 0/20 owner decisions,
keeps Core green and exposes no staging/normalization command. Focused readiness,
review-protocol and Windows automation tests pass.

### OPS-43 - Auto-refresh the canonical owner review dashboard

Status: `DONE 2026-07-17`
Depends on: `OPS-42`, `SOL-PRE-02`
Lane: `MECHANICAL`

Every ten-minute MTT cycle now rebuilds a separate owner workbench from only the
canonical full-tree review-report directory and the current four-wave packet.
The reduced-tree evidence viewer remains read-only and cannot expose owner
decision controls. The workbench joins only a validated
`REVIEW_ONLY_EVIDENCE_NOT_POKER_APPROVAL` snapshot and can filter `Shape ready`
from `Needs evidence`; neither state selects a verdict. Cycle status records the
owner dashboard path, update time and builder exit code.

Acceptance: the generated owner workbench contains exactly 20 unique families
in four five-family waves; the reduced-tree viewer still has no decision
controls; a live cycle exits 0 and reports the owner dashboard ready without
changing any review verdict or strategy file.

### OPS-44 - Keep development first while modestly tuning solver throughput

Status: `DONE 2026-07-17`
Depends on: `OPS-41`, `OPS-43`
Lane: `JUDGMENT`

The next low-memory worker defaults to three solver threads while retaining
`BelowNormal`, CPU <= 40%, at least 35% free RAM and the 25% emergency stop. The
active board is not interrupted, so the current worker may finish with its
loaded two-thread setting. MTT Node work keeps the same strict resource preflight.

Acceptance: thread tuning changes no tree shape or strategy data; a busy CPU
defers MTT automation without touching TexasSolver; the canonical dashboard
accepts only the explicit review-only readiness basis and shows 20 unique owner
families without preselecting a decision.

### OPS-46 - Self-heal and diagnose the recurring MTT agent

Status: `DONE 2026-07-20`
Depends on: `OPS-04`
Lane: `REPEATABLE`

The task manager now has an idempotent `Ensure` action. It enables an existing
disabled ten-minute task without replacing its triggers, installs a missing
task, and starts once when `-StartNow` is requested. The npm repair command uses
that guarded start so a re-enabled stale trigger catches up. Status exposes
enabled health, next run, latest logged outcome and snapshot age; a summary
older than three recurring windows is labeled `STALE` instead of being
presented as current solver truth.

Acceptance: `npm run mtt:autonomous-cycle-ensure` exits 0 for an already enabled
task, status reports `task health: ENABLED`, the old snapshot is visibly stale,
and focused Windows automation tests pass without starting or stopping
TexasSolver.

### OPS-47 - Refresh every solved review-only checkpoint without manual board lists

Status: `DONE 2026-07-20`
Depends on: `OPS-38`, `OPS-41`, `OPS-46`
Lane: `REPEATABLE`

One CLI now unions solved boards across all six approved derived memory-safe
manifests, validates the exact `MEMORY_SAFE_REVIEW_ONLY` profile and refreshes
only stale family reports. An exclusive PID lock serializes the solver watcher
and the ten-minute MTT cycle; stale locks recover automatically. Writes remain
limited to review evidence, its viewer and an atomic refresh report. The command
cannot write normalized strategy, owner decisions or runtime content.

The incremental watcher invokes this refresh immediately after changed
memory-safe coverage. The MTT cycle uses the same command before readiness and
owner-dashboard checks, replacing its private PowerShell board-union logic.

Acceptance: dry-run reports exact cumulative coverage without writing evidence;
a live watcher refresh exits 0; a concurrent live lock exits 0 without writes;
20/20 reports remain valid and production eligibility remains 0/20.

### OPS-48 - Advance reviewed six-max P1 exports independently

Status: `DONE 2026-07-20`
Depends on: `P1-PRE-02`, `SOL-PRE-02`
Lane: `MECHANICAL`

The four-pack candidate and staging CLIs now support an explicit
`--incremental` mode. An absent export or untouched blank scaffold remains
`WAITING`; a present partial/malformed export or candidate without a permission
manifest is `INVALID` and blocks writes. A canonical permission awaiting its
candidate remains `WAITING`. Every currently complete reviewed slot can advance
without waiting for the other three, while candidate and raw staging writes
retain their existing confirmation tokens and promotion remains a separate
gate.

Filtered intake-packet refreshes now remove stale generated folders only when
their ownership marker and exact generated file set match. Unknown folders and
owner-added files are preserved. Owned solver review requests also follow the
confirmed provenance rule: reviewer, rights owner, source location and runtime
redistribution stay recorded in the canonical manifest, while external evidence
references and duplicate candidate manifests are not required.

Acceptance: the live 90 MB four-scaffold workbench reports `0 ready / 4 waiting /
0 invalid` without writes; the live P1 packet folder contains exactly four
six-max slots; partial data fails closed; manual notes survive reconciliation;
focused tests and the complete MTT Core release gate pass.

### OPS-49 - Expose live intake independently from the deferred full cycle

Status: `DONE 2026-07-20`
Depends on: `OPS-46`, `OPS-47`
Lane: `REPEATABLE`

The locked review-only refresh report now records its schema version, scan time,
latest raw write observed and exact solved/expected coverage for every approved
manifest. The ten-minute task status renders this incremental report before the
heavier cycle snapshot, so CPU/RAM deferrals cannot hide newly ingested solver
checkpoints behind an old coverage count. The older full-cycle report remains
visible and explicitly stale when appropriate because it still owns the broader
P1, reviewer, readiness and Core gates.

Acceptance: live status distinguishes both snapshots, reports each current
manifest count and keeps the full-cycle stale warning; the refresh remains
review-only, writes no strategy or owner decision, and the complete MTT Core
release chain passes.

### OPS-50 - Reuse canonical six-max provenance during candidate staging

Status: `DONE 2026-07-20`
Depends on: `OPS-48`
Lane: `MECHANICAL`

The six-max candidate builder now reuses the four owner-confirmed canonical
`permission.json` manifests instead of requiring duplicate reviewer, rights and
source metadata. Read-only preflight uses the same effective confidence and
owned-export license class as an eventual write, removing false `LOW` and
unknown-license failures. Candidate creation still requires explicit
`MEDIUM|HIGH` confidence plus its confirmation token, writes only normalized
review data and cannot stage or promote production content.

The staging batch prefers the canonical manifest, falls back to a legacy
candidate manifest and sends the exact selected file through the existing full
validator before any write. A canonical manifest without normalized candidate
data is now correctly `WAITING`, not falsely reported missing or invalid.

Acceptance: live candidate and staging progress both report `0 ready / 4 waiting
/ 0 invalid`; every staging row reports `permission=CANONICAL` and only
`Candidate is missing.` Focused intake/staging/P1/metadata tests pass `18/18`,
typecheck passes, and the registry, source intake and scoped Core gates remain
green at 8 valid manifests, 0 ready raw imports and Core 4/4 plus 7/7.

### OPS-51 - Preserve per-board solver accuracy during incremental intake

Status: `DONE 2026-07-20`
Depends on: `OPS-47`
Lane: `REPEATABLE`

TexasSolver per-board console logs written by Windows are UTF-16LE. The staging
parser previously read them as UTF-8, silently losing current exploitability
evidence and leaving old family accuracy summaries behind. Staging now decodes
UTF-8, UTF-16LE and UTF-16BE logs explicitly and can reuse a fresh, validated
`MEMORY_SAFE_REVIEW_ONLY` cumulative report instead of reparsing tens of
gigabytes of raw solver JSON.

The locked cumulative refresh now updates stale `strategy-export.json` and
`accuracy-report.json` review metadata for every solved family. It verifies the
family, profile, production-false status, exact raw paths, empty blockers and
report freshness before writing. It cannot write owner decisions, normalized
strategy or production runtime content. The recurring task status exposes the
separate staged-accuracy count.

Acceptance: the first live pass refreshed 20/20 family summaries and recovered
traceable exploitability for 403/439 approved board reports across all 20
families; the immediate second pass planned and wrote zero files. Review
protocol accuracy warnings fell from 18 to zero while human caveat warnings and
all 20 owner poker decisions remain explicit gates. Focused regression passes
38/38 and typecheck passes; the scoped Core gate and production build pass.

### OPS-52 - Surface solver accuracy in the owner review dashboard

Status: `DONE 2026-07-20`
Depends on: `OPS-51`, `OWNER-REVIEW-06`
Lane: `MECHANICAL`

The canonical owner dashboard now joins each family with its approved staged
accuracy report. It shows parsed/expected logs, median and maximum
exploitability, per-board versus queue evidence and an exact expandable list of
missing log filenames. A dedicated accuracy filter separates complete,
partial, missing and unavailable families without selecting or recommending a
poker verdict.

Accuracy intake is fail-closed: only the exact approved memory-safe evidence
scope is accepted, counts and source classes must reconcile, values must be
finite and non-negative, and raw/missing filenames must be safe and unique.
Unscoped historical reports remain unavailable instead of inheriting current
approval.

Acceptance: the live 53-report dashboard exposes 403/439 traceable boards over
20 owner families, with 10 complete and 10 partial families and all 36 missing
log filenames visible. Owner decisions remain 0/20. Focused viewer, protocol,
readiness and Windows automation regression passes 25/25; typecheck, scoped
Core gate and production build pass.

### OPS-53 - Bind owner decisions to exact review evidence

Status: `DONE 2026-07-22`
Depends on: `OPS-52`, `OWNER-REVIEW-06`
Lane: `MECHANICAL`

Every owner decision is now bound to the exact source-safe family review
reports and approved accuracy report visible at review time. A deterministic
SHA-256 fingerprint covers file names and file bytes without reading or hashing
raw solver JSON. The dashboard exports decision schema v2 with that
fingerprint; the single-family writer, batch writer and review protocol all
recompute it immediately before accepting a sign-off.

Any later report or accuracy change makes the old decision stale and fail
closed. This safeguard records no verdict, does not promote strategy and does
not turn mechanical evidence into poker approval.

Acceptance: the live v2 template contains 20/20 valid evidence fingerprints and
zero decisions; the canonical dashboard still renders 53 reports, 403/439
traceable boards, 10 complete plus 10 partial families and 0/20 owner verdicts.
Dedicated stale-evidence regression is enforced in dashboard import, both
writers and protocol validation. Focused regression passes 24/24; typecheck,
scoped Core 4/4 plus 7/7 and the production build pass.

### OPS-54 - Refresh the blank owner template with the recurring cycle

Status: `DONE 2026-07-22`
Depends on: `OPS-04`, `OPS-53`
Lane: `REPEATABLE`

The ten-minute mechanical cycle now regenerates the blank owner decision
template only after the canonical dashboard succeeds. It writes exclusively to
`owner-review-decisions.template.json`; the separate file containing human
work is never touched. Cycle status validates and reports the exact v2 schema,
family count, fingerprint count, selected-decision count, timestamp and exit
code, so a stale or malformed template is visible without opening the JSON.

Acceptance: PowerShell parser checks pass for the runner and manager, Windows
automation regression passes 9/9, and a real resource-guarded cycle exits 0.
The live summary reports template ready, v2 schema, 20/20 fingerprints and zero
selected verdicts while owner review remains 0/20 and strategy promotion stays
disabled.

### OPS-55 - Rebaseline the full release after owner workflow hardening

Status: `DONE 2026-07-22`
Depends on: `OPS-53`, `OPS-54`
Lane: `REPEATABLE`

The complete regression and release integrity chain was rerun after evidence
binding and recurring template refresh. This validates the application runtime,
MTT intake and promotion guards, action-EV bubbles, mobile UI, owner workflow,
Windows automation and source-safe release tooling together rather than only
the focused changed files.

Acceptance: Vitest passes 152/152 files and 771/771 tests. Typecheck, registry
drift check, scoped Core 4/4 plus 7/7, production build, range verification,
precache integrity and bundle budget all pass. The verified remaining blockers
are data/human gates: four six-max CHIP_EV exports have zero normalized records,
owner review is 0/20 and exact action EV remains 0/493818 preflop plus 0/972
scoped FLOP decisions.

### OPS-56 - Recover missing approved solver accuracy logs

Status: `DONE 2026-07-22 - 439/439`
Depends on: `OPS-51`, `OPS-55`
Lane: `REPEATABLE`

The approved memory-safe raw union is complete, but 36 of its 439 board reports
lack a traceable per-board solver log. A fail-closed CLI now reconciles those
exact `missingLogs` rows against the six approved memory-safe source manifests
and builds a shrinking local queue of 36 exact parameters across 10 families.
The generated queue and manifest are ignored runtime checkpoints; the generator,
runner contract and tests are versioned.

The low-memory worker enters this mode only after every raw phase is complete.
It solves one missing log, discards the duplicate solver-root dump, preserves the
existing canonical raw JSON and immediately refreshes staged accuracy before
selecting the next board. A mutex, active-solver check, CPU/RAM start gate and
emergency memory guard make Windows restart or interruption resumable without
duplicating a worker. This path cannot write review decisions, normalized
strategy, action EV or production approval.

Each new worker process also fingerprints the exact selected canonical raw JSON
with SHA-256, length and last-write time before solving and verifies all three
again before ingest. A mismatch fails the worker before staged accuracy can
advance. The prior worker was stopped cleanly between boards at 407/439; its
next scheduled/restart process loads the stronger invariant without repeating a
completed checkpoint.

The resumed guarded worker reached 426/439 on 2026-07-22 with 13 exact logs
remaining across five families. The incremental watcher staged each completed
accuracy log while the 439-board raw union stayed unchanged.

The same guarded worker closed the final 13 logs later on 2026-07-22 between
20:25 and 21:28 local time, across `MTT9_50BB_BTN_BB_SRP`,
`MTT9_50BB_CO_BB_SRP_CBET_MIDSPR`, `MTT9_50BB_SB_BB_SRP_OOP_CBET_MIDSPR`,
`MTT9_80BB_BTN_BB_SRP_HIGHSPR` and `MTT9_80BB_CO_BTN_3BP_MIDSPR`. Preparation
now reports valid 439/439 evidence, zero pending logs, zero recovery families,
zero recovery files and zero blockers, and every one of the 20 families
reconciles `expectedLogs == parsedLogs` with an empty `missingLogs` list. The
recovery queue and its manifest are therefore empty by design; the coverage
overview lists `coverage-accuracy-recovery-v1-manifest.json` as `WAITING 0/0`
for that reason and not because work is outstanding.

```powershell
npm run mtt:texas-solver-accuracy-recovery -- --summary
npm run mtt:texas-solver-low-memory-status
```

Acceptance: preparation reports valid 403/439 evidence, 36 pending logs, 10
families, 36 files and zero blockers; scenario audit passes 36/36. Completion
requires the same command to report 439/439 and zero pending logs, followed by a
green owner dashboard refresh whose evidence fingerprints intentionally change
and therefore still require fresh human review. Implementation baseline:
PowerShell parsing passes for all three changed scripts, focused regression is
31/31, full regression is 153/153 files and 775/775 tests, and typecheck,
registry drift, scoped Core, ranges, production build, precache and bundle
budget are green.

### OPS-57 - Finalize the complete accuracy reviewer handoff

Status: `DONE 2026-07-22`
Depends on: `OPS-56`, `OPS-54`
Lane: `REPEATABLE`

The ten-minute cycle can defer while TexasSolver holds memory, so staged
accuracy may advance while the owner dashboard and blank fingerprint template
remain on an older snapshot. A separate mutex-protected finalizer now closes
that gap. It is invoked automatically when recovery reaches zero pending logs,
or by the next scheduled worker if the prior process ended immediately after
its last ingest.

The finalizer first revalidates exact 439/439 recovery evidence and refuses to
run alongside `console_solver.exe`. It then refreshes the source-safe review
protocol, mechanical readiness, canonical owner dashboard and only the blank v2
owner template. It writes a local completion report binding the handoff to the
accuracy evidence timestamp. Status compares that timestamp and all counts, so
an older completion report is displayed as non-current rather than green.

```powershell
npm run mtt:texas-solver-accuracy-handoff -- -DryRun
npm run mtt:texas-solver-low-memory-status
```

Acceptance before completion: dry-run reports the exact parsed/pending counts
and writes no reviewer artifact. Acceptance after completion: status reports
`accuracy handoff: valid=True, current=True`, accuracy 439/439, blank owner
decisions 0/20 and a completion timestamp. No command in this task records a
poker verdict, normalized strategy, action EV or production approval.

Implementation baseline: PowerShell parsing passes for the finalizer, worker
and task manager; focused recovery/reviewer/Windows regression passes 43/43 and
the complete regression passes 153/153 files and 776/776 tests. Typecheck,
registry drift, scoped Core 4/4 plus 7/7, ranges, production build, precache and
bundle budget are green.

### OPS-58 - Keep blank action-EV intake synchronized

Status: `DONE 2026-07-22`
Depends on: `OPS-04`, `AEV-03A`
Lane: `MECHANICAL`

The ten-minute task now refreshes a stale postflop action-EV template only when
the existing document is provably blank: owner fields are empty, review remains
pending and every EV and threshold is null. A stale file containing any owner
work is protected, reported and left byte-for-byte untouched. This path cannot
write a candidate, solver value or production strategy.

```powershell
npm run mtt:postflop-action-ev-intake -- --all --write-template --refresh-blank-templates --output=artifacts/mtt-action-ev-intake/refresh-report.json --summary
npm run mtt:autonomous-cycle-status
```

Acceptance: the first live pass safely refreshed 7/7 stale blank templates for
972 decisions and 2,916 action slots; an immediate read-only repeat reported
blank 7/7, nonblank 0, zero stale, zero written and zero protected files. Focused
intake/Windows regression passes 17/17; the full regression passes 153/153 files and 778/778
tests. Typecheck, both PowerShell parser checks, registry drift, scoped Core 4/4
plus 7/7, ranges, production build, precache and bundle budget pass. The external
EV-data gate remains `0/972` until a reviewed solver export contains every
offered action value.

### OPS-59 - Keep six-max preflop workbench action-EV ready

Status: `DONE 2026-07-22`
Depends on: `OPS-48`, `AEV-03A`
Lane: `MECHANICAL`

The four 118,638-row six-max CSV workbenches predated the action-EV contract and
lacked `actionEvsBb` plus both threshold columns. A shared scaffold contract now
generates and inspects the exact row order, current and legacy headers and every
source-safe blank cell. The refresh path upgrades only a complete legacy file
proven untouched; any strategy, EV, reviewer, source, notes, truncation or
unknown structure protects the file. SHA-256 is rechecked before a backup-based
replacement. No strategy, EV, candidate or production module is generated.

```powershell
npm run mtt:sixmax-preflop-workbench-refresh
npm run mtt:autonomous-cycle-status
```

The ten-minute task runs the same guard and reports current, blank, nonblank,
action-EV-column and protected-stale counts. Live migration refreshed 4/4 blank
legacy files; an immediate repeat reported 4/4 current, 4/4 blank, 0 nonblank,
0 protected stale and 0 writes. Focused tests passed 29/29 and the full release
baseline passed 154/154 files and 785/785 tests, typecheck, both PowerShell
parser checks, registry drift, Core 4/4 plus 7/7, ranges, production build,
precache and bundle budget. Exact six-max strategy and EV data remain 0/4.

### OPS-60 - Measure progressive six-max intake without premature validation

Status: `DONE 2026-07-22`
Depends on: `OPS-59`
Lane: `MECHANICAL`

The shared scaffold inspection now distinguishes the first 11 immutable
identity columns from owner-editable strategy, action-EV, source, review and
notes fields. It reports exact complete/partial field-presence counts per pack
and across all four workbenches. Presence is observability only and never
certifies action syntax, EV correctness or poker review.

A full-size, structurally exact chunk with complete strict/lenient pairs stays
`WAITING` until all 118,638 rows are populated, so the recurring cycle does not
invoke the expensive candidate parser against every expected blank row. Any
immutable drift, truncation, one-sided strategy row or incomplete three-cell EV
set is `INVALID`; a complete workbench still has to pass the existing canonical
candidate validator.

```powershell
npm run mtt:sixmax-preflop-intake-progress
npm run mtt:autonomous-cycle-status
```

Acceptance: the live pass measured 4/4 measurable and structurally safe files,
474,552/474,552 rows, zero touched/strategy/EV/review rows, zero rewrites and
0/4/0 ready/waiting/invalid. A real full-size one-row progress fixture remained
`WAITING` at 1/118,638 without candidate validation. Full regression passed
154/154 files and 787/787 tests; typecheck, registry drift, scoped Core 4/4 plus
7/7, ranges, intake guard, production build, precache and bundle budget passed.

### OPS-61 - Separate RAM-guard stops from native solver failures

Status: `DONE 2026-07-22`
Depends on: `OPS-56`
Lane: `MECHANICAL`

The resource guard now appends a structured, parameter-bound event before it
terminates an owned `console_solver.exe` under emergency RAM pressure. The
runner correlates that event to the exact invocation and records either
`RESOURCE_GUARD_STOP` or `NATIVE_SOLVER_EXIT`; it never infers successful
accuracy and never replaces the canonical raw checkpoint.

Accuracy recovery compares structured stop counts around each one-board run. A
guarded stop exits the worker as a clean deferral, keeps the board pending and
lets the next scheduled trigger retry only after the normal CPU/RAM start gate.
A non-guard native exit remains a failure. Status also correlates legacy
failure timestamps with existing guard logs without rewriting historical
telemetry.

```powershell
npm run mtt:texas-solver-low-memory-status
```

Acceptance: live history now reports total 3, guarded 2, explicit native 0 and
legacy-unclassified 1; `K83r` matches the 6.4% free-RAM emergency stop exactly.
The refreshed worker is running the new scripts, waits at the 35% RAM gate and
the next pending item is `Q76mono`, proving no repeated-board loop. Four script
parsers, an accuracy list-only execution, typecheck and focused tests 14/14
passed. Recovery remains source-safe at 426/439 with 13 logs pending.

### OPS-62 - Merge reviewed six-max preflop chunks atomically

Status: `DONE 2026-07-22`
Depends on: `OPS-60`
Lane: `MECHANICAL_WITH_EXPLICIT_WRITE`

The four exact workbenches no longer require an operator to replace one full
118,638-row CSV in a single handoff. A reviewed subset with the exact current
header can be preflighted and merged by immutable decision identity. Strategy
columns form one atomic pair, action EV plus both thresholds form an independent
atomic triple and reviewer/date form a pair. Empty incoming cells preserve
existing work. Repeating identical data is a no-op; any conflicting populated
cell, duplicate key, partial group or changed immutable cell rejects the entire
merge.

```powershell
npm run mtt:sixmax-preflop-merge-chunk -- --pack-id=<packId> --chunk=<reviewed-chunk.csv> --summary
npm run mtt:sixmax-preflop-merge-chunk -- --pack-id=<packId> --chunk=<reviewed-chunk.csv> --write --confirm=MERGE_REVIEWED_MTT_SIXMAX_PREFLOP_CHUNK
```

Dry-run is mandatory operator practice. The write path rechecks the workbench
SHA-256 after preflight and uses backup-based replacement. It cannot create
strategy values, candidates, permissions or production content, and it does not
replace the canonical full-workbench candidate validator. Focused contract and
full-size CLI tests pass 12/12 plus typecheck. The live workbenches were not
modified and remain at the OPS-60 zero-content baseline until an owned reviewed
chunk actually exists. Full regression passes 155/155 files and 793/793 tests;
typecheck, registry drift, scoped Core 4/4 plus 7/7, ranges, raw intake guard,
production build, precache and bundle budget pass.

### OPS-63 - Freeze extensible beta architecture and exact solver comparison

Status: `DONE 2026-07-22`
Depends on: `OPS-62`
Lane: `MECHANICAL`

The active 20-30-working-day contract is
`Agents/product-architecture-mtt-30-day-plan.md`. Shared infrastructure converts
solver formats into canonical profile, strategy, EV, review and runtime
contracts; it never converts MTT poker decisions into SNG or Cash decisions.
The first SNG/Cash production adapter will reuse these boundaries and add only
its genuine payout/rake dimensions after MTT v1 stabilizes.

`PKRTRAINER_SOLVER_EXACT_NODE_V1` now binds both solvers to the same profile,
players and range SHA-256 values, board, pot, node path, action sizes and tree
SHA-256. The comparator verifies solve accuracy, combo weights, complete action
frequencies, optional per-action EV and EV-equivalent best-action sets. Any
setup drift fails before strategy numbers are compared.

```powershell
npm run range:cross-check-exact -- --left=<texas-canonical.json> --right=<other-canonical.json> --summary
```

The report is source-safe comparison evidence only: it generates no strategy,
permission, candidate or production write and cannot overwrite either private
input. Focused core/CLI tests pass 10/10; full regression passes 159/159 files
and 809/809 tests. The complete release integrity chain is green. Existing GTO+
input plans are present, but live verification remains 0/3 ready with nine
outputs missing.

### OPS-64 - Consolidate the playable-beta and FTP artifact gate

Status: `DONE 2026-07-22`
Depends on: `OPS-63`
Lane: `MECHANICAL`

Add one bounded `MTT_PLAYABLE_BETA` report that launches and truthfully labels
the exact promoted preflop plus reviewed FLOP content selected for beta. After
the existing release/browser chain passes against one commit, package `dist/`
and the selected FORPSI template into a deterministic FTP ZIP, reconcile every
entry by size and SHA-256 and write a manifest containing commit, scope, command
evidence and known limits. Never package raw solver or intake files.

Acceptance: repeated packaging of unchanged release inputs has identical file
membership and content hashes; any missing/extra/mismatched entry fails. The
operator receives ZIP path and SHA-256 before FTP upload.

Implemented as `mtt:playable-beta` and `mtt:ftp-package`. The beta gate keeps
the currently launchable Core separate from the frozen 8-profile target and
reports six-max, scoped FLOP and per-action-EV gaps without fallback. The ZIP
uses fixed metadata and sorted entries; it is expanded and reconciled by path,
size and SHA-256 before an atomic write. Confirmed writes require a clean commit
and rerun the complete unit/release/build/Chrome chain. The final milestone can
be enforced with `--require-target-complete`; its current 4/8 result correctly
blocks that mode. Focused gate/archive/core/exact-comparison regression passes
19/19, full regression passes 159/159 files and 809/809 tests, and a live
13-entry package dry run passes after excluding local-only hidden source maps.
Typecheck, registry, Core/beta, range/intake,
build, precache and budget gates pass. Self-hosted production Chrome E2E passes
desktop plus 360/390/412 px, offline/reload/resilience, 48 contrast checks and
service-worker rollback with zero browser errors. Its wrapper pins
`NODE_ENV=production`, keeping browser-tested and normal build hashes equal.

### OPS-65 - Replace the per-range human verdict with mechanical acceptance

Status: `DONE 2026-07-23`
Depends on: `OPS-56`, `OPS-57`
Lane: `MECHANICAL`

Owner decision of 2026-07-23: the professional-field beta distribution is the
poker review. Hand-judging all 20 families before beta is not an acceptable use
of the remaining schedule, so the per-range human verdict is no longer the gate.

The replacement is objective, not a bypass. `mtt:texas-solver-mechanical-acceptance`
grades each family only on evidence already on disk: structural completeness
(expected boards present, parseable, no missing per-board log, no invalid JSON)
and convergence, meaning every board's recorded exploitability is at or below the
solver's own pinned `set_accuracy` target. It never reads raw strategy JSON and
never infers a poker decision.

Accepted families are written as `scoped: beta-field-review` through the existing
audited `mtt:texas-solver-owner-review-batch` writer, so no new write path or
schema appears. Honesty is preserved in the record itself: the reviewer is the
non-human token `PKRTRAINER_MECHANICAL_ACCEPTANCE_V1` and every caveat states
that this is a mechanical solver-accuracy acceptance, not a human poker verdict,
and that poker correctness is validated by field distribution. A family with any
over-target or structurally incomplete board is written as `no` until it is
re-solved and re-graded, so the gate still refuses weak evidence.

```powershell
npm run mtt:texas-solver-mechanical-acceptance -- --summary
npm run mtt:texas-solver-mechanical-acceptance -- --out=<decisions.json> --summary
npm run mtt:texas-solver-owner-review-batch -- --decisions=<decisions.json> --write --confirm=RECORD_TEXAS_SOLVER_OWNER_REVIEW_BATCH
```

Acceptance: the live grading is 17 accepted and 3 withheld over 13 over-target
boards. The review protocol moved from 0/20 protocol-ready to 20/20 with 17
production eligible, 3 reviewed-not-usable and zero blockers. Focused tests pass
9/9 across mechanical acceptance and the re-solve batch.

### OPS-66 - Re-solve boards that missed the solver accuracy target

Status: `DONE 2026-07-23`
Depends on: `OPS-65`
Lane: `REPEATABLE`

The 439/439 recovery proved every approved board has a traceable log; it did not
prove every board converged. Thirteen boards across three families sit above the
pinned 0.5 target, from 0.5139 up to 10.4251 on `MTT9_50BB_BTN_BB_SRP K83r`,
which also carries a recorded RAM-guard stop. These under-converged results came
from the reduced-budget memory-safe recovery path.

`mtt:texas-solver-accuracy-resolve-batch` stages the repair without inventing
solver input. For each over-target board it copies the exact authoritative
full-tree parameter file, explicitly excluding the reduced-tree low-memory sets,
and raises only `set_max_iteration`. The dump filename is preserved so a
completed re-solve replaces the same canonical raw checkpoint through the normal
ingest path. A test locks the invariant that nothing but the iteration line may
differ from the authoritative source.

```powershell
npm run mtt:texas-solver-accuracy-resolve-batch -- --summary
npm run mtt:texas-solver-accuracy-resolve-batch -- --write --summary
npm run mtt:texas-solver-mechanical-acceptance -- --summary
```

The batch manifest is intentionally named `accuracy-resolve-v1-manifest.json` and
not `coverage-*-manifest.json`. The expansion batch builders scan every
`coverage-*-manifest.json` to reject duplicate family/board work, and this repair
batch legitimately re-declares already-covered boards. Naming it as coverage made
the owner-depth, beta-min, beta-depth and growth presets fail closed with
duplicate blockers. A repair manifest is not a coverage declaration, so it stays
outside that scan by name rather than by weakening the duplicate guard.

Operational warning: the queue runner skips existing outputs unless `-Force`, and
`-Force` deletes the canonical raw checkpoint before solving. Always back the
selected checkpoints up first. A first launch on 2026-07-23 failed on a relative
log path that resolved against the solver root after the runner's own
`Push-Location`, and it had already removed the `822tt` checkpoint; the backup
restored it byte-identically by SHA-256. Use absolute paths for `-FailureReportPath`
and any tee target.

First live result on 2026-07-23 proved the loop end to end.
`MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR 822tt` re-solved from 1.0611 to 0.4468 and
converged at iteration 321 of the raised 600 budget, taking about 72 minutes. A
review-only evidence refresh then made the mechanical assessment drop it from the
over-target set automatically, 13 to 12, with no human verdict anywhere in the
path. The earlier concern that deep-stack high-SPR trees might not reach 0.5 at
all is therefore not supported; the budget, not the spot, was the limit.

The full batch finished the same evening. All 13 boards converged into the
0.40-0.50 band: `K83r` fell from 10.4251 to 0.4354, `883r` from 3.5639 to 0.4865,
`QJ2tt` from 2.0304 to 0.4716. A review-only evidence refresh and a re-run of the
mechanical acceptance then reported 20 accepted, 0 withheld and 0 over-target
boards; the three families withheld earlier flipped from `no` to
`scoped: beta-field-review` automatically, and the review protocol moved to 20/20
protocol-ready with 20 production eligible and zero blockers. The scheduled
overnight task was deleted as redundant once the foreground run completed.

Interrupting the batch has one evidence side effect worth knowing. Accuracy is
parsed from solver logs, not from the raw checkpoint, so a killed mid-board run
leaves an aborted log whose exploitability is worse than the restored checkpoint
deserves. `832r` showed 2.5768 against its true 0.9816 after one such stop. The
inconsistency is self-healing because that board is still queued, but never read
an interrupted board's accuracy as final.

Completion criterion met: the mechanical assessment reports 20 accepted and zero
over-target boards, so every approved board now has both a traceable log and a
converged solve.

### OPS-67 - Make lane coverage a pack requirement, not a per-rule one

Status: `DONE 2026-07-23`
Depends on: `OPS-65`
Lane: `MECHANICAL`

Four of the seven scoped flop pilots were `INVALID` while the beta gate still
reported `7/7`, because the beta counts pilot definitions and the suite validates
the current draft candidates. Each invalid pilot reported one rule missing its
BLUFF lane plus a `runtime resolver returned no recommendation` error for all
three SPR bands.

Those were one defect, not two. `createFlopProductionStrategyResolver` returns
null for every input when the pack fails validation, so a single rule missing one
lane silently disabled the entire pack at runtime.

The missing lane is genuine solver output, not a bug. The lane heuristic in
`buildTexasSolverNormalizedDraft.mts` classifies a betting hand as VALUE when it
is a pair or starts with A/K/Q/J/T and BLUFF otherwise. In the current converged
`MTT9_20BB_BTN_BB_SRP_LOWSPR` solve the whole betting range is pairs and
broadway, with suited connectors checking, which is ordinary poker below SPR 3.
The classifier code did not change between the shipped module and the newer
draft; only the solver data did. Requiring a BLUFF lane in every rule would have
forced a bluff lane to be invented where the solver has none, which the content
contract forbids.

Lane coverage therefore moved from per-rule to per-pack in both
`flopProductionStrategyPack.ts` and `mttPostflopPilotGate.ts`. A rule must still
declare at least one lane and its buckets, and the pack as a whole must still
demonstrate VALUE, BLUFF and CHECK.

```powershell
npm run mtt:postflop-pilot-suite -- --summary
npm run mtt:postflop-pilot-modules -- --write
```

Acceptance: the pilot suite moved from 3 ready / 4 invalid to 7/7 ready with zero
invalid. Regenerating the modules resolved a real drift: the shipped modules were
built 2026-07-09 while their drafts were rebuilt 2026-07-15, so four modules
carried superseded lane assignments and any regeneration would previously have
produced an invalid pack. The regenerated modules now match their drafts exactly.
Focused pack, gate, resolver, readiness and view regression passes 85/85.

### OPS-68 - Classify VALUE and BLUFF against the board

Status: `DONE 2026-07-23`
Depends on: `OPS-67`
Lane: `MECHANICAL`

The solver-content importer decided a hand's lane from the hand alone: a betting
hand was VALUE when it was a pair or started with A/K/Q/J/T, and BLUFF
otherwise. That is not a poker judgement. On `A72r` it taught `QJo` as value
because of the queen, on `K83r` it taught `A2s` as value because of the ace, and
it promoted any underpair that bets. VALUE versus BLUFF is a hand-versus-board
question, and the product's whole claim is that it recommends optimal play, so
the label has to be right.

The board-aware classifier the range matrix already uses now decides it. Because
that logic is shared poker knowledge rather than presentation, `classifyFlopHand`
and the lane mapping moved from `src/ui/postflopRangeMatrixView.ts` into
`src/core/flopHandCategory.ts`; the view re-exports them so both the matrix a
player sees and the imported content agree by construction.

A hand that puts money in is VALUE only when it is a made hand - set or better,
straight, two pair, overpair or top pair. Everything else that bets is pressure,
which is what BLUFF means. Hands that do not bet stay in the CHECK lane. A rule
aggregates several flops, so VALUE additionally requires the hand to be made on a
strict majority of them; an even split stays BLUFF.

```powershell
npm run mtt:texas-solver-review -- --family=<id> --node-history=<CHECK|ROOT> --write
npm run mtt:texas-solver-normalize-draft -- --review <review.json> --pot-type=<...> --action-node=<...> --position-pattern=<...> --spr-min=<n> --spr-max=<n> --output-dir <dir> --write
npm run mtt:texas-solver-pilot-refresh -- --skip-viewer --summary
npm run mtt:postflop-pilot-modules -- --write
```

Two pipeline facts surfaced while applying it. `mtt:texas-solver-ingest-completed`
is change-driven and rebuilds only coverage-v2 families, so the other ten
per-family drafts had to be regenerated explicitly from their reviews, which live
beside the raw exports as `strategy-export.<node>.review.json` rather than under
`artifacts/.../reviews/`. The pilot refresh workflow also has no merge step for
`SB_vs_BB_SRP_OOP_FLOP_CBET`, so that scope must be merged by hand or its pilot
silently keeps stale content.

Regenerating also exposed an unrelated fragility: the card-removal sample took
the first aggregated board, and a trips board such as `5s 5h 5d` leaves the
aggregated range hand `55` with no combos at all. The sample board is now chosen
so every range hand keeps at least one combo, falling back to the first board for
determinism.

Acceptance: the five c-bet pilots now label by board; no low ace bets as VALUE in
them any more, and lane mixes shifted accordingly, for example UTG vs BB moving to
`BLUFF 30 / VALUE 6` because that node bets its entire range. The pilot suite
stays 7/7 with 19 rules and 972 buckets, core release and playable beta stay
valid, typecheck passes and focused regression is 67/67.

Closed for the c-bet pilots here; the facing-bet pilots are finished in OPS-69.

### OPS-69 - Extend board-aware lanes to the facing-bet pilots

Status: `DONE 2026-07-23`
Depends on: `OPS-68`
Lane: `MECHANICAL`

The board-aware classifier from OPS-68 fixed the lane logic in the importer, but
the two FLOP_FACING_BET pilots still shipped rank-based lanes because their
drafts come from the facing-bet harvester rather than the ingest path, so nothing
had regenerated them. Their RAISE ranges taught low aces and broadway as value:
`A4s`, `A5s`, `K7s`, `J8s` and even `22` raising were all labelled VALUE.

The harvester picks a "best" bet-size node automatically, and its default run
chose `BET_600`, a degenerate overbet whose response is almost all fold. The fix
is to pin the exact villain c-bet node per family with `--bet-actions` rather than
let auto-selection pick, then regenerate each SPR band and re-merge.

```powershell
npm run mtt:texas-solver-facing-bet-candidates -- --family=<FAM> --source-node=CHECK --bet-actions=<BET_X> --pot-type=<...> --position-pattern=<...> --scope=<...> --spr-min=<n> --spr-max=<n> --write --summary
npm run mtt:texas-solver-merge-pilot-drafts -- --scope=<...> --write --summary
npm run mtt:postflop-pilot-modules -- --write
```

`BTN_vs_BB_SRP_FLOP_FACING_BET` is fully board-aware: all three SPR bands
regenerated cleanly against `CHECK>BET_17`, and no low ace bets as value any more
(the only ace left in a value RAISE is `AA`, a real overpair). The RAISE mixes
shifted heavily toward BLUFF, for example the low band to `VALUE 4 / BLUFF 25`.

`BTN_vs_CO_3BP_FLOP_FACING_BET` is fixed for its LOW and MID bands (`CHECK>BET_52`)
but its HIGH band could not be regenerated. That family's raw exports were
re-solved with inconsistent bet trees across boards - some boards offer
`BET 39/79`, others `BET 52` - so no single small-bet node exists on every board
and the review is all-or-nothing per node. The HIGH band therefore keeps its
earlier rank-based content (`A7s` still labelled a value raise) until that family
is re-solved with one uniform bet tree. This is not a regression: the runtime
selects a rule per SPR band, so the LOW and MID bands now teach correct lanes.

Acceptance: the pilot suite stays 7/7 with 19 rules and 972 buckets, core release
and playable beta stay valid, typecheck passes and focused regression is green.
Five of the six facing-bet SPR bands are board-aware; the sixth is documented as
blocked on a uniform re-solve of `MTT9_150BB_CO_BTN_3BP_HIGHSPR`.

### OPS-70 - Recommend the hero hand's action, not the rule-wide action

Status: `DONE 2026-07-23`
Depends on: `OPS-68`
Lane: `MECHANICAL`

A more serious correctness defect than the lanes sat one layer deeper. The drill
deals the hero a random hand on a random board, but the flop production resolver
returned `rule.recommendedAction` - the rule's single most-common action - for
every hand when no per-hand action EV was present, which is always for the
current pilots. It computed the hero's own bucket but ignored its action in the
top-level recommendation.

So a player dealt a check-lane air hand on an ace-high board in the BTN vs BB
c-bet spot was told the correct answer was BET_SMALL and marked wrong for
checking, while the range matrix beside it showed that same hand checking. The
grade contradicted the display, and the product's core promise is that it
recommends optimal play.

The fix returns the matched hero bucket's action - highest-EV when that bucket
carries complete action EV, otherwise its dominant action - and only falls back
to the rule action for a hand outside the rule's range. The same one-line defect
existed in the turn and river resolvers and was fixed identically.

The runtime smoke check had encoded the bug as an invariant: it asserted
`recommendation.action === rule.recommendedAction`. That assertion is wrong now
that the runtime answers per hand, so it was changed to expect the sampled hand's
own bucket action.

Acceptance: a live check over the BTN vs BB c-bet pilot shows 150/150 buckets now
recommend the hand's own action, including all 21 check-lane hands returning
CHECK where they previously returned BET_SMALL. The pilot suite stays 7/7 with
972 buckets, core release and playable beta stay valid, typecheck passes and the
focused postflop resolver, scoring, runtime, readiness and view regression is
green.

### OPS-71 - Recover which tree profile actually produced each solved board

Status: `DONE 2026-07-24` (audit); follow-up decision is owner input
Depends on: `OPS-69`
Lane: `MECHANICAL`

The facing-bet high band could not be regenerated because
`MTT9_150BB_CO_BTN_3BP_HIGHSPR` had no single small-bet node present on every
board. The cause turned out to be bigger than one family: the authoritative full
tree and the memory-safe reduced tree write the same canonical raw checkpoint
path, so a family's `raw/` directory can hold a mix, and nothing in the raw file
records which parameter set produced it.

That distinction matters. The content contract treats the reduced tree as
review-only: it may be audited and packaged for review but is not meant to be
normalized and promoted into runtime content. Without provenance there was no way
to say how much pilot content rests on it.

`mtt:texas-solver-tree-provenance` recovers the missing provenance. It reads only
the first bytes of each raw file to get the root action list, then matches the
root bet sizes against every parameter set that could have solved that family.
Each set is evaluated with its own pot, which matters because `safe_flops_v1`
uses pot 57 where the review waves use 50, so the same 50 percent bet lands on 29
chips rather than 25. When a full and a reduced set predict the same bet the
board is reported as ambiguous rather than guessed.

```powershell
npm run mtt:texas-solver-tree-provenance -- --summary
npm run mtt:texas-solver-tree-provenance -- --family=<FAMILY> --json
```

Measured over 577 boards in 20 families: 117 full tree, 337 reduced tree,
123 ambiguous, 0 unknown. Twelve of the twenty families mix both profiles and
none is entirely reduced. So a clear majority of the boards behind the scoped
pilots come from the reduced review-only tree.

This is disclosed rather than hidden - the pilots are labelled scoped, report
`fullProductionReady: false`, and the beta gate states they are not complete
postflop coverage - but the specific rule about review-only data not becoming
runtime content is in tension with it. Resolving that is an owner decision, not a
mechanical one:

- accept reduced-tree solves inside scoped pilots and state it explicitly in the
  pilot provenance and caveats, or
- re-solve the reduced boards at full tree, which is a large compute commitment
  at roughly 337 boards.

Focused regression for the audit is 5/5. The audit is read-only and never writes
or modifies solver data.

### OPS-72 - Deal the hero from the range the pack actually solved

Status: `DONE 2026-07-24`
Depends on: `OPS-70`
Lane: `MECHANICAL`

`generatePostflopSpot` dealt the hero two cards from the full deck, independently
of the spot. On the BTN vs BB single-raised c-bet pilot the solved range covers
50 hand classes, which is 252 of 1326 combinations, so **81 percent of spots put
the hero on a hand the preflop raiser would never hold there**.

Those hands match no range bucket, so `heroRangeBucket` is undefined and the
recommendation falls back to the rule-wide action. The per-hand fix in OPS-70
therefore only reached the 19 percent of spots that happened to be in range; for
the rest the trainer was still grading an impossible hand against a rule average.

The fix probes the pack with the dealt hand - rule selection does not depend on
the hero hand - and re-deals only when that hand is out of range. Concrete
combinations are enumerated rather than picking a hand class first, so pairs keep
six combinations against a suited hand's four and board cards stay unavailable.

Spots with no pack range, such as the public heuristic model, keep the plain deal
untouched, which was deliberate: an earlier attempt reordered dealing for every
spot and changed seeded output everywhere, breaking three unrelated view tests
for no benefit.

```powershell
npm run mtt:postflop-pilot-suite -- --summary
```

Acceptance: over 300 generated spots on the live BTN vs BB c-bet pilot, hands in
the solved range went from 19 percent to 100 percent and every spot now resolves
to its own hero bucket. Focused resolver, view, line-simulator and HH regression
is 51/51 plus 12/12 on the resolver suite, and typecheck passes.

### XSOLVER-01 - Produce the first exact paired second-solver export

Status: `EXTERNAL_DATA`
Depends on: `OPS-63`
Lane: `HUMAN_AND_SOLVER_GATE`

Required owner input: confirm GTO+ is installed/licensed or name the available
alternative. Solve one existing family/board/node with the exact canonical
ranges and tree used by TexasSolver, meet the pinned accuracy target and provide
the export. Then implement only that raw-format adapter and run the exact
comparison over all available combos. A random hand-class report cannot satisfy
this gate.

## Phase DEP - Core Deployment Closeout

### DEP-00 - Preserve verified FTP artifact

Status: `DONE 2026-07-16`
Lane: `REPEATABLE`

Artifact:
`deploy/pkrtrainer-ftp-20260716-172634-9b81ae29-mtt-core-solver-beta.zip`

SHA-256:
`568A11EDF85B687C7AAAEA834910E64A2955983E099CCF1E14887F5FC99E0FFE`

Source commit: `9b81ae29`. Archive reconciliation passed 22/22 files with
0 missing, 0 extra and 0 hash mismatches. Earlier verified archives remain
preserved under `deploy/`.

Do not rebuild it unless application code or bundled runtime content changes.

### DEP-01 - Upload and configure staging

Status: `EXTERNAL_DATA`
Depends on: `DEP-00`
Lane: `HUMAN_GATE`

Required input: selected FORPSI webroot, FTP access and the real absolute
`AuthUserFile` path. Upload the unpacked ZIP, adapt `.htaccess.example`, create
the password file outside the public webroot and enable Basic Auth.

Acceptance: HTTPS returns 401 without credentials and 200 with credentials;
`index.html`, lazy MTT chunks, service worker and manifest return 200.

### DEP-02 - Staging smoke

Status: `BLOCKED_BY DEP-01`
Lane: `MECHANICAL`

Test regular/turbo with ante ON/OFF, one answer and persisted stats, one scoped
FLOP pilot, HH import, reload and offline reopen. Check 360/390/412 px and desktop.

Acceptance: no console error, no source/internal pack ID in visible UI and the
scope label remains `MTT ChipEV Core` plus scoped FLOP pilots.

### DEP-03 - Record deployed revision

Status: `BLOCKED_BY DEP-02`
Lane: `REPEATABLE`

Record URL, timestamp, ZIP hash and staging-smoke result in release notes. Do not
record credentials or the password-file contents.

## Phase SOL - Complete And Reduce Solver Evidence

### SOL-PRE-00 - Generate interim review packet

Status: `DONE 2026-07-13`
Depends on: `OPS-00`
Lane: `MECHANICAL`

Prepare the already staged 20 families while the solver handles the remaining
boards:

```powershell
npm run mtt:texas-solver-review-protocol -- --packet-dir=artifacts/texas-solver-review-protocol/interim-packet
```

The command is expected to remain red because human review is missing.
Acceptance: packet covers 20 families, contains source-safe checklists and does
not contain raw combo-level solver JSON.

### SOL-PRE-01 - Audit interim packet completeness

Status: `DONE 2026-07-13`
Lane: `MECHANICAL`

Check each family for checklist, node history, position identity, stack/SPR,
board count, accuracy fields and current pilot mapping. Record missing metadata
without editing strategy values or marking a family reviewed.

### SOL-PRE-02 - Build owner review waves

Status: `DONE 2026-07-13`
Lane: `MECHANICAL`

Group the 20 families into waves of at most five, ordered by direct relevance to
the seven existing pilot nodes. Put incomplete or duplicate families last.
Acceptance: every family appears once and each wave links its exact checklist.

Refresh (2026-07-15): the generated packet now contains
`OWNER_REVIEW_WAVES.md`, four deterministic logistical waves of five families.
The order carries no poker-quality, evidence-strength or promotion implication;
each family links to its exact packet checklist.

### SOL-PRE-03 - Review first owner wave

Status: `HUMAN_GATE`
Depends on: `SOL-PRE-02`
Lane: `HUMAN_GATE`

The project owner supplies usable yes/no/scope decisions for the first wave.
The lower-cost model may write those supplied decisions into the templates but
must not make the poker judgment.

Owner workbench (2026-07-16):

```powershell
npm run mtt:autonomous-cycle-status
Start-Process "http://127.0.0.1:5173/artifacts/texas-solver-review-protocol/viewer/index.html"
```

The viewer starts on the first pending five-family wave, restores its local
draft, accepts a previously downloaded decision JSON and exports the exact
batch-writer schema. It never selects a verdict or edits review notes. Run the
downloaded wave through dry-run before the explicit write:

```powershell
npm run mtt:texas-solver-owner-review-batch -- --decisions="$HOME\Downloads\owner-review-decisions-wave-1.json"
npm run mtt:texas-solver-owner-review-batch -- --decisions="$HOME\Downloads\owner-review-decisions-wave-1.json" --write --confirm=RECORD_TEXAS_SOLVER_OWNER_REVIEW_BATCH
npm run mtt:texas-solver-review-protocol -- --packet-dir=artifacts/texas-solver-review-protocol/packet --summary
```

Advance to the next wave only after the refreshed protocol shows the prior
five explicit owner decisions. A missing dev server does not change the gate;
the generated `artifacts/texas-solver-review-protocol/viewer/index.html` may
also be opened directly.

### SOL-00 - Monitor current family

Status: `REPEATING_CHECK`
Depends on: `OPS-00`
Lane: `REPEATABLE`

```powershell
npm run mtt:texas-solver-background-status -- --manifest ".\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-large-flop-review-v1-manifest.json" --summary
```

Update only the numeric progress line in the priority document when it changes.

### SOL-01 - Reach complete raw coverage

Status: `DONE 2026-07-15`
Depends on: `OPS-00`
Lane: `AUTOMATIC`

Acceptance: large batch is 72/72 and aggregate overview is 165/165. The worker
must stop after completion; it must not generate a new batch.

Evidence: large review manifest is `72/72`; the isolated low-memory manifest is
also `18/18`. Both workers retain raw JSON only as review evidence.

### SOL-02 - Verify completed-family ingest

Status: `ACTIVE_GUARDRAIL`
Lane: `REPEATABLE`

```powershell
npm run mtt:texas-solver-ingest-completed -- --manifest ".\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-large-flop-review-v1-manifest.json" --summary
```

Acceptance: command is idempotent, no raw file is copied into tracked runtime
code, and queue state records `ingestedBoards: 72`.

Latest result (2026-07-15): all raw-complete families were already staged or
reviewed, so no raw result was copied into runtime code. Candidate refreshes
remain fail-closed where a pilot gate is invalid; this task is not a promotion.

### SOL-03 - Re-audit all 72 scenarios

Status: `DONE 2026-07-15`
Lane: `REPEATABLE`

```powershell
npm run mtt:texas-solver-scenario-audit -- --manifest ".\Agents\solver-input\texas-solver\mtt-safe-flops-v1\coverage-large-flop-review-v1-manifest.json" --summary
```

Acceptance: 72 valid scenarios, zero errors. Warnings must be listed, not hidden.

Evidence: `72/72` valid, `0` errors, `144` warnings recorded without suppression.

### SOL-04 - Generate fresh review packet

Status: `DONE 2026-07-15`
Lane: `MECHANICAL`

```powershell
npm run mtt:texas-solver-review-protocol -- --packet-dir=artifacts/texas-solver-review-protocol/packet
```

Acceptance: packet lists every staged family and no raw combo-level solver JSON.

Evidence: packet contains 20 families. It is intentionally not protocol-ready:
all 20 remain `NEEDS_REVIEW`, with 68 explicit blockers and 38 warnings.

### SOL-05 - Mechanical packet audit

Status: `DONE 2026-07-15`
Lane: `MECHANICAL`

For each family verify checklist presence, expected board count, decision node,
position identity, stack/SPR band and accuracy evidence fields. Mark missing data
as blockers. Do not decide whether a strategy is poker-correct.

Evidence: fresh packet has 20/20 `REVIEW_CHECKLIST.md` files and every checklist
contains the files, accuracy evidence, required review fields, poker checklist
and current-blockers sections. The audit records 68 blockers and 38 warnings;
it does not resolve any poker decision.

### SOL-06 - Poker review

Status: `HUMAN_GATE`
Depends on: `SOL-05`
Lane: `HUMAN_GATE`

The project owner reviews strategy matrices and fills `review-notes.md` with
status, reviewer, date, usable yes/no, exact scope and caveats. AI may format the
supplied decision but may not infer it.

### SOL-07 - Validate signed review protocol

Status: `BLOCKED_BY SOL-06`
Lane: `MECHANICAL`

```powershell
npm run mtt:texas-solver-review-protocol -- --summary
```

Acceptance: every intended family is `REVIEWED_SCOPED`,
`REVIEWED_PRODUCTION` or explicitly `REVIEWED_NOT_USABLE`; zero ambiguous
`NEEDS_REVIEW` remains in the selected release set.

### SOL-08 - Decide evidence yield before another batch

Status: `BLOCKED_BY SOL-07`
Lane: `JUDGMENT`

Compare reviewed usable families against the seven existing pilot nodes. Start a
new solver batch only if it closes a named runtime coverage gap. More texture
samples without a target gap are not sufficient justification.

## Phase PILOT - Integrate Reviewed Scoped Output

### PILOT-00 - Build candidate normalized drafts

Status: `BLOCKED_BY SOL-07`
Lane: `MECHANICAL`

Run `mtt:texas-solver-normalize-draft` only for families marked usable in an
exact scoped node. Candidate files remain under `artifacts/`.

### PILOT-01 - Validate provenance candidates

Status: `BLOCKED_BY PILOT-00`
Lane: `MECHANICAL`

Use the owner-confirmed owned-export rules. External evidence references remain
optional for this branch, but reviewer, rights owner, distribution and reuse
dimensions must be explicit.

### PILOT-02 - Merge reviewed pilot drafts

Status: `BLOCKED_BY PILOT-01`
Lane: `MECHANICAL`

```powershell
npm run mtt:texas-solver-merge-pilot-drafts
npm run mtt:postflop-pilot-modules -- --write
```

Inspect the diff. No full-production flag may be introduced by a scoped merge.

### PILOT-03 - Run scoped pilot gates

Status: `BLOCKED_BY PILOT-02`
Lane: `MECHANICAL`

```powershell
npm run mtt:postflop-pilot-suite
npm run mtt:core-release
npx vitest run tests/unit/mttPostflopPilotRuntime.test.ts tests/unit/mttPostflopPilotGate.test.ts --reporter=dot
```

Acceptance: pilot suite and core release stay green; full postflop remains false.

### PILOT-04 - Browser regression

Status: `BLOCKED_BY PILOT-03`
Lane: `MECHANICAL`

Run Chrome desktop/mobile, HH, stats, reload/offline and source-free UI checks.
Acceptance: no visible scope inflation and zero console errors.

### PILOT-05 - Rebuild delivery after runtime change

Status: `BLOCKED_BY PILOT-04`
Lane: `MECHANICAL`

Run `release:mtt-core`, produce a new uniquely timestamped FTP ZIP, verify every
archive entry and record SHA-256. Never overwrite the verified 2026-07-10 ZIP.

## Phase SIX - Optional Six-Max CHIP_EV Expansion

### SIX-00 - Obtain exact owned export

Status: `EXTERNAL_DATA`
Lane: `HUMAN_GATE`

Required input: real reviewed six-max CHIP_EV preflop data for regular/turbo and
ante ON/OFF, or an explicit owner-approved mapping policy. Full-ring table-format
reuse is not approved and must not be inferred.

Provenance manifests for all four exact slots were staged on 2026-07-13 from the
owner's confirmed owned-export and runtime-distribution rights. `normalized.json`
remains the only missing input for each slot; a permission manifest never grants
permission to invent its strategy values.

### SIX-01 - Stage four exact slot pairs

Status: `BLOCKED_BY SIX-00`
Lane: `MECHANICAL`

Use the generated packets under `artifacts/mtt-next-action/p1-preflop-chip-ev/`
(`npm run mtt:p1-intake-packets`). Each slot needs exact `normalized.json` and
`permission.json` in its canonical raw folder. For an owned six-max solver
export, the packet now includes its exact CSV-draft and reviewed-staging command;
it must never be used to invent missing hand decisions.

### SIX-02 - Validate every six-max slot

Status: `BLOCKED_BY SIX-01`
Lane: `MECHANICAL`

Run the packet's single-slot validate, build dry-run, ready validation and
promotion dry-run. Stop on the first error; never repair strategy values.

### SIX-03 - Promote one pilot slot

Status: `BLOCKED_BY SIX-02`
Lane: `MECHANICAL`

Promote only the first fully valid slot, refresh the registry and run targeted
runtime/UI tests. Review generated module size and identity before scaling.

### SIX-04 - Promote remaining three slots

Status: `BLOCKED_BY SIX-03`
Lane: `MECHANICAL`

Repeat the exact validated path. Acceptance: CHIP_EV preflop is 8/8 without a
candidate fallback; regular/turbo differences match the approved policy.

### SIX-05 - Full CHIP_EV matrix smoke

Status: `BLOCKED_BY SIX-04`
Lane: `MECHANICAL`

Exercise 2 formats x 2 speeds x 2 ante states, start/answer/stats/reload and
mobile widths. Then decide whether this becomes a new release scope.

## Phase AEV - Alternative-Action EV Feedback

### AEV-00 - Implement complete action-EV contract

Status: `DONE 2026-07-16`
Lane: `JUDGMENT`

The preflop and postflop models accept solver EV in BB for every action offered
at the exact node. Validation rejects partial, duplicate, illegal and non-finite
sets. Scoring accepts every equivalent-best action and persists EV loss when the
complete payload exists.

### AEV-01 - Implement result and language UX

Status: `DONE 2026-07-16`
Depends on: `AEV-00`
Lane: `JUDGMENT`

After an answer, display all offered action values, selected action, best actions
and EV delta. Without a complete reviewed payload, display an explicit
unavailable state. EN is fully English; CZ keeps controls/poker terms in English
and localizes explanatory copy.

Postflop stats bridge v5 stores outcome, chosen EV, best EV, EV loss and all
equivalent-best actions as one complete result. Legacy v4 outcome/loss records
remain readable. A positive schema-valid browser fixture covers UI, local
persistence and JSON transfer without being counted as production EV data.

### AEV-02 - Measure release EV readiness

Status: `DONE 2026-07-16`
Depends on: `AEV-00`
Lane: `MECHANICAL`

```powershell
npm run mtt:core-release -- --summary
```

Measured baseline: preflop `0/493818` decisions (`0/4` packs), scoped FLOP
`0/972` decisions (`0/7` packs), comparison ready false. The existing scoped
Core strategy gate remains green and includes this limitation as a warning.

### AEV-03 - Obtain one EV-enabled owned export

Status: `EXTERNAL_DATA`
Depends on: `AEV-02`
Lane: `HUMAN_GATE`

Required input: one reviewed export containing counterfactual BB EV for every
action offered at one exact preflop or postflop node, plus explicit equivalence
and acceptable-loss thresholds. Current TexasSolver `dump_result` data contains
strategy frequencies but no validated action-EV field; do not derive EV from it.

Exact blank workbench:

```powershell
npm run mtt:postflop-action-ev-intake -- --all --write-template --refresh-blank-templates --summary
```

It covers seven pilots, 972 decisions and 2,916 action values. The templates
contain no EV; AEV-03 remains an external-data gate. Re-running this command
preserves any existing file. Intentional replacement additionally requires
`--overwrite-template` and confirmation token
`OVERWRITE_MTT_POSTFLOP_ACTION_EV_TEMPLATE`.

The recurring source-safe refresh uses `--refresh-blank-templates`: it may
replace only a structurally stale document with empty owner fields, null
thresholds and null action EV. Any human work makes the file protected and the
cycle fail closed.

### AEV-03A - Prepare fail-closed FLOP action-EV intake

Status: `DONE 2026-07-16`
Depends on: `AEV-02`
Lane: `JUDGMENT`

The intake binds every row to the current pilot fingerprint, exact rule, bucket
and ordered legal actions. It rejects partial, stale, duplicate, non-finite or
unreviewed input. A valid completed export writes only an unpromoted normalized
candidate and source-safe audit sidecar after the explicit confirmation token.

### AEV-04 - Validate and promote one EV pilot

Status: `BLOCKED_BY AEV-03`
Lane: `MECHANICAL`

Import the exact payload, require complete action coverage and zero validation
errors, then test recommendation reconciliation, equivalent-best grading,
stats, EN/CZ output, bundle size and browser memory before promotion.

### AEV-05 - Expand EV payloads

Status: `BLOCKED_BY AEV-04_AND_EXTERNAL_DATA`
Lane: `MECHANICAL`

Apply the verified path to the four Core preflop packs, the four pending six-max
packs and the seven scoped FLOP pilots only as exact reviewed EV exports arrive.
Never make completion percentages green with frequency or heuristic values.

## Phase EV - DOLAR_EV/ICM Decision

### EV-00 - Product and strategy decision

Status: `HUMAN_GATE`
Lane: `HUMAN_GATE`

Choose either: provide exact DOLAR_EV/ICM strategy inputs and tournament-model
assumptions, or keep DOLAR_EV outside the release. CHIP_EV reuse is forbidden.

### EV-01 - Import eight DOLAR_EV packs

Status: `BLOCKED_BY EV-00_AND_EXTERNAL_DATA`
Lane: `MECHANICAL`

If data is provided, follow the same per-slot validate/dry-run/promote workflow.
If excluded, update UI, entitlements and release notes so the option cannot be
mistaken for purchased content.

## Phase FULL - Full Postflop Program

### FULL-00 - Scope decision

Status: `HUMAN_GATE_AFTER CORE/PILOT RELEASE`
Lane: `JUDGMENT`

The 48-profile FLOP/TURN/RIVER production matrix is not part of the reasonable
near-term finish. Start it only as a separately named funded release with exact
position, pot, node, SPR, texture and runout coverage contracts.

### FULL-01 - Do not extrapolate pilots

Status: `ACTIVE_GUARDRAIL`
Lane: `REPEATABLE`

Seven scoped FLOP pilots and the 72-board review batch never satisfy 48/48 full
postflop production. TURN and RIVER need dedicated solver trees and review.

## Phase FINAL - Verification And Handoff

### FINAL-00 - Focused verification after each change

Status: `REPEATING_CHECK`
Lane: `MECHANICAL`

Run typecheck plus tests nearest the changed module. Do not run the five-minute
full suite for documentation-only status updates.

### FINAL-01 - Full scoped release chain

Status: `READY_WHEN_RUNTIME_CHANGES`
Lane: `MECHANICAL`

```powershell
npm run release:mtt-core
npm run e2e:chrome:preview
```

Acceptance: all steps pass and full-library incompleteness remains explicit.

### FINAL-02 - Update canonical truth

Status: `READY_AFTER_MILESTONE`
Lane: `REPEATABLE`

Update only `Agents/mtt-completion-priorities.md`, this queue and the relevant
release notes with measured evidence. Do not copy historical TODO text forward.

### FINAL-03 - Commit or publish

Status: `HUMAN_GATE`
Lane: `HUMAN_GATE`

The owner chooses commit scope, remote publication and production deployment.
Never include ignored raw solver output, credentials or unrelated legacy edits.

## Prompt For The Lower-Cost Run

Use this exact handoff prompt after changing models:

> Read `Agents/mtt-completion-priorities.md` and
> `Agents/mtt-lean-execution-queue.md`. Run `OPS-02`, then select the first
> unblocked `READY_ONCE` task. If none exists, report the current waiting gates
> and stop. Execute only that task through its acceptance checks, update its
> status/evidence, keep TexasSolver running, and stop at any `HUMAN_GATE` or
> `EXTERNAL_DATA` requirement without inventing inputs.

## Evidence Log

| Date | Task | Result | Evidence |
| --- | --- | --- | --- |
| 2026-07-13 | OPS-00 | DONE | Task Scheduler running; hidden AtLogOn action; solver PID 27832 resumed 40/72 |
| 2026-07-13 | OPS-03 | ACTIVE | one enabled queue item, 72 expected boards, 32 pending at creation |
| 2026-07-13 | Baseline | DONE | core gate 4/4 + 7/7; full library 4/64; review protocol 0/20 ready |
| 2026-07-13 | SOL-PRE-00 | DONE | Interim source-safe packet generated: 20 families, 20 checklists, no raw combo JSON; protocol red as expected pending human review. |
| 2026-07-13 | SOL-PRE-01 | DONE | Mechanical audit: 20/20 canonical family directories, review notes and accuracy reports referenced and present; 0/20 reviewed or production-eligible. |
| 2026-07-13 | SOL-PRE-02 | DONE | Four owner waves of five recorded in `artifacts/texas-solver-review-protocol/interim-packet/MECHANICAL_AUDIT.md`; every family appears exactly once. |
| 2026-07-13 | SIX-00 | PARTIAL | Staged source-free `permission.json` for all four six-max CHIP_EV slots from owner-confirmed rights; 4 exact reviewed `normalized.json` inputs remain external-data gates. |
| 2026-07-13 | Autonomous routine | ACTIVE | Hidden five-minute watcher ingests completed families only when coverage changes, refreshes the source-safe review packet and records pilot-suite state without production promotion. At 72/72 it also persists the scenario audit before final staging. |
| 2026-07-13 | SOL-POST-02 | DONE | Fixed the SB vs BB low-SPR normalizer to preserve five solver-dominant CHECK buckets; merged pilot gate and suite are 7/7 READY, with no runtime promotion. |
| 2026-07-13 | P1-PRE-00 | DONE | Added `mtt:p1-intake-packets`, the canonical source-safe packet generator for the four pending six-max CHIP_EV slots; it cannot create range data or alter readiness. |
| 2026-07-13 | OPS-04 | DONE | Added and dry-run verified `mtt:texas-solver-autostart-stop`; it targets only the current queue process tree and repository watcher, preserves raw checkpoints and leaves future autostart under separate owner control. |
| 2026-07-13 | P0-DIAG-01 | DONE | Reconciled active test baselines with staged ownership manifests: global 60 normalized / 56 permission gaps, P1 4 normalized / 0 permission gaps, registry 8 manifests; 25 focused intake/registry tests passed. |
| 2026-07-13 | P0-HANDOFF-01 | DONE | Regenerated `artifacts/mtt-handoff-report.json`: 26 expected artifacts present, report valid, release correctly remains not ready with five release-blocking gates. |
| 2026-07-14 | OPS-05 | DONE | Watcher now skips unchanged coverage, detects newer raw exports even at the same board count, and retries the same coverage after a technical ingest, final-audit or pilot-suite failure; smoke test and focused autostart tests passed without stopping the solver. |
| 2026-07-14 | P0-REG-01 | DONE | Full regression passed: 136 test files and 670 tests. Scoped Core remains 4/4 preflop plus 7/7 FLOP pilots; full-library gate remains intentionally red. |
| 2026-07-14 | P0-HANDOFF-02 | DONE | Refreshed `artifacts/mtt-handoff-report.json`: all 26 expected artifacts exist; five expected release blocks remain. Canonical P1 packet confirms 4 missing six-max CHIP_EV `normalized.json` and 0 missing `permission.json`. |
| 2026-07-14 | SOL-STATUS-01 | DONE | Coverage status now recognizes SB vs BB OOP c-bet root reviews and `-ROOT` drafts, retains the legacy boolean for consumers, and stops emitting a false CHECK-review or already-merged BTN-vs-BB action. |
| 2026-07-14 | OPS-06 | DONE | Coverage signature now includes each family's latest raw write, so an updated solver export re-enters intake even when the solved-board count is unchanged; watcher restart and six focused regression tests passed. |
| 2026-07-14 | OPS-07 | ACTIVE | Added the separate 10-minute `PKRTrainer-MTT-Autonomous-Cycle`: safe coverage status, source-safe P1 packet refresh and Core gate on board-count or latest-raw-write change. Its first live run passed P1 intake and Core gate; `0x00041301` is its normal running state. Registration must run under the actual Windows owner because the agent sandbox cannot access Scheduled Tasks. |
| 2026-07-14 | OPS-08 | ACTIVE | Installed `PKRTrainer-MTT-Solver-Batch-Prep`, a separate 30-minute AtLogOn loop. It maintains and audits an isolated next 72-board TexasSolver batch from existing validated templates, without modifying the active queue or starting TexasSolver. First live run: 72/72 valid, 0 errors. |
| 2026-07-14 | SOL-REVIEW-03 | DONE | Review-protocol parser now keeps empty checklist fields empty rather than borrowing the next label. The recurring MTT cycle refreshes the source-safe review packet every ten minutes, so owner review edits are reflected without waiting for a new raw export. Focused protocol/autostart tests and Core gate passed. |
| 2026-07-14 | OPS-09 | DONE | Future Windows solver runs emit exact `PKRTRAINER_SOLVER_BEGIN/END` queue markers. The queue captures runner stdout/stderr into its local log; review staging accepts queue-log exploitability only when one complete segment binds the same parameter and raw export at BEGIN/END with `exit=0`. The currently active pre-marker runner remains review-only without that evidence. The watcher now reserves 10% free physical memory for heavy Node ingest, without stopping TexasSolver. |
| 2026-07-14 | OPS-10 | DONE | Hardened review staging so mismatched BEGIN/END raw markers are rejected and multi-board families retain per-board evidence without a false family-wide exploitability value. Focused TexasSolver staging/autostart suite passed 15/15 and `npm run typecheck` passed while the active solver remained running. |
| 2026-07-14 | SOL-REVIEW-04 | DONE | Review protocol now requires explicit parsed solver evidence rather than trusting an accuracy-source string. It accepts traceable per-board queue evidence without inventing a family-wide exploitability value, while preserving legacy one-board reports. Focused protocol/staging/autostart suite passed 21/21 and `npm run typecheck` passed. |
| 2026-07-14 | OPS-11 | DONE | Controlled solver pause preserved 61/72 raw checkpoints and freed 74.4% RAM for integration. Review protocol/staging/autostart suite passed 22/22; typecheck, production build and MTT Core gate passed. Source-safe review packet refreshed at 20 human-review gates; P1 packet confirms exactly 4 missing six-max CHIP_EV `normalized.json` and 0 missing permissions. Queue resumed on PID 30928, immediately logging the exact KQ5 `PKRTRAINER_SOLVER_BEGIN` marker. |
| 2026-07-14 | DEP-04 | DONE | Current `dist` hashes match all 21 runtime files in the verified `MTT_CORE_V1` FTP artifact. The only extra artifact file is the expected `.htaccess.example`; no runtime change exists, so no redundant FTP ZIP was created. |
| 2026-07-14 | SOL-REVIEW-05 | DONE | All 20 currently solved TexasSolver families are source-safe staged: every family has raw exports plus `strategy-export.json` and `accuracy-report.json`. The active SB/BB high-SPR family remains incomplete at 5 raw boards while KQ5 solves, so it is excluded from candidate promotion until all expected boards arrive and owner review is recorded. |
| 2026-07-14 | OPS-12 | DONE | Live KQ5 solve kept the same PID/start time and 8 threads while `console_solver` plus its queue parent were raised from `BelowNormal` to `Normal`. Windows switched from Balanced to High performance. `run-console-selected.ps1` now sets its queue process to `Normal` before future child solvers start, with a non-fatal warning fallback. |
| 2026-07-15 | SOL-REVIEW-06 | DONE | Review protocol packet now generates `OWNER_REVIEW_WAVES.md`: four source-safe logistical waves of five current families, each with status/blocker/warning counts and no implied poker ranking. Focused review/autostart tests passed 15/15; typecheck passed. |
| 2026-07-15 | OPS-13 | ACTIVE | Two recurring Windows branches installed: a 48-board LOW/MID-SPR TexasSolver worker at 4/16 threads with start limits of CPU <= 40% and RAM <= 65% used (at least 35% free), plus a one-shot mechanical MTT task agent every 10 minutes under the same limits. Each MTT trigger performs a mutex preflight; a running iteration is not duplicated or queued, and the next 10-minute window retries. Legacy full-solver and batch-prep tasks are disabled. |
| 2026-07-15 | REVIEW-UX-01 | DONE | Rebuilt the source-safe TexasSolver review viewer with family/status filtering, pending/ready/blocker summary and compact review surfaces. Its focused CLI regression test passed; the refreshed local viewer contains 53 review reports and no raw combo JSON. |
| 2026-07-15 | P1-PIPE-01 | DONE | Revalidated the six-max CHIP_EV intake pipeline: all four permissions are ready, the ten-minute agent rechecks ready intake, and the reviewed CSV-to-candidate-to-staging route is covered by focused tests. The remaining external input is exactly four reviewed normalized.json strategy exports; no placeholder was created. |
| 2026-07-15 | RELEASE-UX-01 | DONE | Typecheck, scoped Core gate and production build passed. Focused reviewer, review-protocol, extraction, P1 staging and ready-intake tests passed 23/23. |
| 2026-07-15 | OWNER-REVIEW-01 | DONE | Added `--write-review-templates` to the TexasSolver review protocol. It appends only missing blank owner-decision fields to existing review notes and never changes `Status`, reviewer identity, date, scope or strategy. Applied to 8 legacy family notes; protocol remains correctly waiting for 20 human decisions. |
| 2026-07-15 | RELEASE-E2E-01 | DONE | Fresh production build passed the full Chrome E2E suite against Vite preview: desktop plus 360/390/412 mobile, production preflop, postflop, HH review, stats, reload/offline, resilience, 48 contrast checks and service-worker rollback all passed with zero browser errors. |
| 2026-07-15 | RELEASE-E2E-02 | DONE | Added `e2e:chrome:preview`, a self-contained production build/isolated preview/Chrome E2E command. It passed end-to-end and cleans up its temporary preview process; `e2e:chrome` remains available for an explicit external URL. |
| 2026-07-15 | RELEASE-CORE-01 | DONE | Full `release:mtt-core` chain passed: typecheck, 140 Vitest files / 687 tests, registry check, scoped Core gate, range verification, production build, precache integrity and bundle budget. MTT_CORE_V1 remains correctly scoped at 4/4 preflop plus 7/7 FLOP pilots; full library stays explicitly incomplete at 4/64. |
| 2026-07-15 | OWNER-REVIEW-02 | DONE | Added an explicit dry-run-first `mtt:texas-solver-owner-review` writer for a human decision in one existing family note. It requires reviewer/date/decision/caveats, requires scope for yes/scoped and an explicit write token; it cannot infer a poker verdict or write strategy data. |
| 2026-07-15 | OPS-14 | DONE | Measured two consecutive low-memory guard stops at 4 solver threads (13.3% and 22.4% free RAM). The scheduled worker now defaults to 2 threads; the 25% emergency guard remains unchanged. Ingest now accepts a written review-only pilot merge as a normal non-production outcome while retaining failures for every other command. |
| 2026-07-15 | OPS-15 | DONE | The repeated 2-thread failure (19.8% free RAM) showed tree width, not CPU parallelism, was the constraint. The remaining low-memory parameters now use the explicitly labeled `MEMORY_SAFE_REVIEW_ONLY` tree profile with reduced sizing branches and 100 iterations. These solver exports are not full-tree comparable and remain review-only. |
| 2026-07-15 | OPS-16 | DONE | Live memory sampling confirmed the new profile remains active after 45 seconds at about 1.28 GB solver working set with 47.3% RAM free. Added regression assertions for the reduced flop/turn/river sizing transformations. |
| 2026-07-15 | OPS-17 | DONE | Prevented mixed-tree automation: a `MEMORY_SAFE_REVIEW_ONLY` manifest now records coverage only and disables partial checkpoints, automatic staging, normalization and pilot merge. Its raw exports remain available only for explicit human review. |
| 2026-07-15 | OPS-18 | DONE | Coverage status now exposes `reviewOnlyTreeProfile` and removes downstream staging commands for memory-safe manifests. Regression coverage verifies the same behavior; live batch reached 46/48 boards with 7/8 families raw-complete. |
| 2026-07-15 | OPS-19 | DONE | The constrained TexasSolver batch completed 48/48 boards and exited successfully. Its eight completed families remain explicitly `MEMORY_SAFE_REVIEW_ONLY`, so ingest recorded coverage without staging any of them. Full `release:mtt-core` also passed: 141 Vitest files / 692 tests, registry check, Core gate, range verification, build, precache and bundle budget. |
| 2026-07-15 | P1-PRE-02 | READY_FOR_OWNER_INPUT | Created four exact six-max CHIP_EV CSV scaffolds under `artifacts/mtt-p1-sixmax-workbench/`; each has 118,638 required decision slots and deliberately contains no strategy values. P1 remains 0/4 ready until owned solver values are supplied and reviewed. |
| 2026-07-15 | OWNER-REVIEW-03 | READY_FOR_OWNER_INPUT | Added batch owner-review workflow and generated `artifacts/texas-solver-review-protocol/owner-review-decisions.json` for all 20 existing families. Blank rows remain untouched; selected decisions require reviewer, date, caveats, scope for yes/scoped and an explicit write token. Focused CLI tests (6/6) and typecheck passed. |
| 2026-07-15 | P1-PRE-03 | DONE | Added `mtt:sixmax-preflop-intake-batch`: it preflights all four exact six-max CSVs before writing any candidates, reports incomplete scaffolds with bounded actionable errors, and never stages or promotes raw intake. Focused batch/P1 tests (3/3) and typecheck passed. |
| 2026-07-15 | P1-PRE-04 | DONE | Hardened the four-pack intake write: it now requires explicit MEDIUM/HIGH reviewer confidence, verifies each generated candidate is production-valid, and writes a source-safe `BATCH_REPORT.md`. It remains all-four preflight fail-closed and cannot promote raw intake. Focused batch/P1 tests (4/4) and typecheck passed. |
| 2026-07-15 | OWNER-REVIEW-04 | DONE | Added an owner-decision workbench to the local source-safe TexasSolver viewer. It groups the current reports into unique families and exports/copies only the validated JSON contract for the explicit batch review writer; it cannot edit review notes, raw solver data or production ranges. Viewer rebuilt for 53 reports; focused viewer/owner-writer tests (4/4) and typecheck passed. |
| 2026-07-16 | OPS-20 | ACTIVE | Restarted the resource-balanced Windows solver worker on the complete 72-board next-review manifest. It skips 54 checkpoints and solves the remaining 18 HIGH-SPR boards at two threads/BelowNormal with CPU<=40%, RAM>=35% start and RAM<25% emergency guards. The entire manifest is explicitly `MEMORY_SAFE_REVIEW_ONLY`; automatic staging and promotion remain disabled. |
| 2026-07-16 | P1-PRE-05 | DONE | Added `mtt:sixmax-preflop-stage-batch`: it preflights all four candidate+permission pairs before any raw write, then stages the set only with a batch confirmation token. Promotion remains separate. Focused intake/staging tests (5/5) and typecheck passed. |
| 2026-07-16 | OPS-21 | ACTIVE | Prepared and audited a distinct 72-board follow-up texture batch across the same 12 validated families. The resource-balanced worker now uses a two-phase checkpoint-aware queue: it completes the current 18 remaining next-review boards, then selects follow-up on the next scheduled cycle under the same two-thread/RAM guard and `MEMORY_SAFE_REVIEW_ONLY` boundary. Scenario audit 72/72 valid, focused solver tests 14/14 and typecheck passed. |
| 2026-07-16 | OPS-22 | DONE | Low-memory solver status now reports the latest worker log and current `PKRTRAINER_SOLVER_BEGIN` parameter, so progress can be checked without parsing a large console log. Live status reports `MTT9_80BB_BTN_BB_SRP_HIGHSPR / 883r`; focused autostart tests passed 8/8. |
| 2026-07-16 | OPS-23 | ACTIVE | Current two-phase coverage check: `next` reached 60/72 and low-memory coverage reports the same count; 12 HIGH-SPR inputs remain before the audited 72-board follow-up phase. Review protocol is correctly still 0/20 human decisions with 68 blockers and 38 warnings; no strategy was promoted. |
| 2026-07-16 | P1-PRE-06 | VERIFIED_BLOCKED | Atomic intake and stage dry runs were executed against the four canonical six-max workbench folders. Each scaffold remains intentionally incomplete with no strategy values; no candidate, raw staging or promotion was written. |
| 2026-07-16 | P1-PRE-07 | DONE | The six-max candidate and stage batch CLIs now accept a read-only `--summary` flag for recurring automation. Their fail-closed behavior and explicit write tokens are unchanged; focused tests passed 5/5 and typecheck passed. |
| 2026-07-16 | OPS-24 | DONE | Corrected the ten-minute MTT agent to observe the active `next` and prepared `followup` manifests as one combined coverage signature. It no longer uses the completed legacy manifest to decide Core-gate refreshes; it remains source-safe and cannot stage or promote evidence. Safety-run syntax check, focused autostart tests 8/8 and typecheck passed. |
| 2026-07-16 | OPS-25 | DONE | Added a compact source-safe cycle snapshot to `mtt:autonomous-cycle-status`. A live guarded cycle verified `next` 65/72 with 10/12 raw-complete families and `followup` 15/72; Core stayed green and no solver evidence was staged or promoted. |
| 2026-07-16 | OPS-26 | DONE | Persisted the combined coverage signature only after a successful Core gate, so independent ten-minute PowerShell invocations skip redundant Core checks and retry automatically after a gate failure. A live cycle recorded `next` 66/72, focused autostart tests 8/8 and typecheck passed. |
| 2026-07-16 | OPS-27 | DONE | Expanded the source-safe cycle snapshot to include compact P1 intake, review-protocol and Core-gate state. Live status now reports `next` 68/72, P1 0/4 ready with four missing normalized exports, review 0/20 with 68 blockers, and a successful persisted Core gate; no strategy data or review decision was written. |
| 2026-07-16 | RELEASE-CORE-02 | DONE | Fresh production build passed. Focused release bundle, Core-release, release-gates and Windows-autostart suites passed 19/19; the Core gate remains green at 4/4 preflop and 7/7 scoped FLOP pilots while the full 4/64 library stays explicitly incomplete. |
| 2026-07-16 | OPS-28 | SUPERSEDED_BY_OPS-31 | Restarted the stopped low-memory task without reinstalling it. It resumed checkpoints, completed `next` at 72/72 and selected `followup` automatically; source scenario audit is 72/72 valid with 0 errors. At that checkpoint follow-up was 25/72, review-only, and no evidence was staged or promoted. |
| 2026-07-16 | OPS-29 | DONE | Hardened the console runner against a native TexasSolver process failure: it records a local parameter/raw/exit-code failure event and, only for the memory-safe review queue, continues with later boards. A retry of the observed `742r` board completed and the worker advanced; failure evidence remains empty. Focused autostart tests and typecheck passed. |
| 2026-07-16 | OPS-30 | DONE | Low-memory task status now reports source-safe failure telemetry: recorded count plus latest time, parameter, family and exit code. It reported no failures while the live worker continued. Focused autostart tests and typecheck passed. |
| 2026-07-16 | OPS-31 | DONE | Both resource-balanced phases are raw-complete at next 72/72 and followup 72/72. The scheduled task is Ready with last result SUCCESS, no worker/solver process and no recorded failure; its log confirms both phases were skipped as complete. No evidence was automatically staged or promoted. |
| 2026-07-16 | AEV-02 | DONE | Core release reporting measures action-EV readiness independently from strategy: preflop 0/493818 decisions and scoped FLOP 0/972, with frequencies explicitly excluded. Full regression passed 147 files / 721 tests; build, precache, bundle budget and four-viewport Chrome E2E passed with zero browser errors. |
| 2026-07-16 | AEV-UX-01 | DONE | Fixed postflop stats bridge v5 to retain chosen/best EV and equivalent-best actions atomically while accepting legacy v4 records. Focused persistence/transfer tests passed 20/20; positive EV production-fixture E2E and four-viewport EN/CZ preview E2E passed; full regression passed 147 files / 723 tests. Synthetic fixture values are test-only and production EV coverage remains zero. |
| 2026-07-16 | OWNER-REVIEW-05 | DONE | Made the 20-family owner gate wave-driven in the source-safe viewer: first pending wave is selected automatically, unique-family metrics replace report counts, drafts persist locally, prior JSON can be imported, and exported JSON plus copied PowerShell commands match the dry-run-first batch writer. Malformed batch entries and duplicate wave assignments fail closed. Focused viewer/writer tests execute the embedded browser script and passed 6/6; typecheck passed. Human poker verdicts remain 0/20 and were not inferred. |
| 2026-07-16 | RELEASE-CORE-03 | DONE | Fixed the post-commit intake guard to allow only exact `permission.json` provenance manifests for registered production packs or named legal intake slots while continuing to reject tracked strategy files. The guard is green with 10 source-safe tracked files and no `normalized.json`. Full regression passed 148 files / 729 tests; registry check, Core 4/4 plus 7/7 gate, range verification, production build, precache integrity and bundle budget all passed. Six-max strategy and action-EV coverage remain truthfully zero. |
| 2026-07-16 | OPS-32 | DONE | The duplicate-safe 72-board `owner-depth` phase passed its 72/72 scenario audit and reached 72/72 raw checkpoints at 16:46. Its watcher remained coverage-only under `MEMORY_SAFE_REVIEW_ONLY`; nothing was staged or promoted automatically. |
| 2026-07-16 | AEV-03A | DONE | Added exact fingerprinted action-EV intake for all seven FLOP pilots: 972 decisions and 2,916 action slots. It rejects stale, partial, duplicate, non-finite or unreviewed input and writes only an unpromoted candidate plus audit sidecar after explicit confirmation. Existing workbench files are preserved unless a separate overwrite token is supplied. Preserve-on-rerun and malformed-input cases are included in the green 150-file regression. |
| 2026-07-16 | OPS-33 | DONE | Isolated reduced-tree coverage from historical staging/draft aliases and skipped downstream pilot refresh for `MEMORY_SAFE_REVIEW_ONLY`; successful raw checkpoints no longer repeat because an expected pilot gate is red. The recurring Core report now stores exact preflop/postflop action-EV readiness in `latest-cycle-summary.json`. Parser checks, focused automation tests and the live 15/45 cycle passed. |
| 2026-07-16 | OPS-34 | DONE | Hardened action-EV workbench writes: preservation now validates the complete immutable pilot/row/action structure, malformed work remains untouched but stale, extensionless candidates receive a distinct `.report.json` sidecar, candidate/report paths cannot overwrite the reviewed input, and the audit SHA-256 covers the exact candidate bytes on disk. Focused and broad regressions passed. |
| 2026-07-16 | OPS-35 | DONE | Replaced eight private TexasSolver board maps with one pinned 40-board catalog and a deterministic 14-cohort planner. The report separates 6-per-cohort beta minimum, 12-per-cohort beta depth and 20-per-cohort growth, while preserving every legacy physical board and labeling manifest counts as declared input rather than solved evidence. The 45-file beta-min audit and broad regression passed. |
| 2026-07-16 | AEV-UX-02 | DONE | Action EV renders as an absolute BB value plus a normalized comparison meter inside every legal action button after grading. Equivalent-best and chosen states remain independent; incomplete EV sets still reveal nothing. Positive production-fixture E2E passed on FLOP/TURN/RIVER with zero browser errors and 12 contrast checks. |
| 2026-07-16 | TABLE-UX-01 | DONE | Corrected rail/felt stacking in both table renderers and upgraded seat hierarchy with active/folded status, stack chips, clearer hero/villain treatment and stable compact geometry. Production preview E2E passed desktop plus 360/390/412 px with zero browser errors and 48 contrast checks. |
| 2026-07-16 | OPS-36 | DONE | Generated and solved 45/45 disjoint `beta-min` parameters after a 45/45 source audit with 0 errors. The guarded worker exited `SUCCESS` with no failure; solved and owner-reviewed coverage remain separate gates. |
| 2026-07-16 | OPS-37 | DONE | Removed beta source generation/audit from the ten-minute read-only MTT cycle so the isolated prep script is the sole writer. Suppressed log output inside PowerShell value-returning helpers to prevent false low-memory deferrals and false command failures. Six PowerShell parser checks, one-shot prep, recurring cycle, 86 focused tests and typecheck passed. |
| 2026-07-16 | OPS-38 | DONE | Replaced per-phase report overwrites with cumulative per-family board unions and included solved checkpoints from partial families. Final beta intake produced 20 valid reports over 117 family/board pairs with 0 extraction failures; focused extraction/viewer/autostart tests passed 18/18. |
| 2026-07-16 | RELEASE-CORE-04 | DONE | Current broad regression passed 150/150 files and 747/747 tests, typecheck and scoped Core gate. Core remains 4/4 preflop plus 7/7 FLOP pilots; exact action-EV data remains honestly incomplete. |
| 2026-07-16 | RELEASE-FTP-01 | DONE | Built the clean `9b81ae29` MTT Core solver-beta FTP archive after browser QA. ZIP reconciliation passed 22/22 files with 0 missing, 0 extra and 0 hash mismatches; SHA-256 is `568A11EDF85B687C7AAAEA834910E64A2955983E099CCF1E14887F5FC99E0FFE`. |
| 2026-07-16 | OPS-39 | DONE | Prepared the disjoint 83-file beta-depth source wave without adding it to the worker. Scenario audit passed 83/83 with 0 errors; the catalog now reports 168 unique boards, 478 family/board pairs and zero twelve-board cohort gap. Prep status labels it `FROZEN_PENDING_OWNER_REVIEW`; parser checks, a live 45 + 83 one-shot prep, focused tests 24/24 and typecheck passed while beta-min kept solving. |
| 2026-07-16 | OPS-40 | DONE | Closed the approved solver queue at beta-min 45/45. The worker returned `SUCCESS` with no active process or recorded failure; final intake produced 20/20 valid cumulative reports over 117 checkpoints, Core stayed green and frozen beta-depth was not activated. Full regression passed 150 files / 747 tests. |
| 2026-07-20 | OPS-41 | DONE | The owner-authorized guarded beta-depth wave reached 83/83 with all 20 families raw-complete. Final cumulative intake is valid over 439 family/board checkpoints, the scheduled worker returned `SUCCESS` with no live solver process, and automatic normalization/promotion remained disabled. |
| 2026-07-17 | OPS-42 | DONE | Switched recurring intake from the two unlabeled source manifests to all five derived memory-safe manifests, restoring 144 completed review-only checkpoints to cumulative evidence. The live cycle observed 272/344 physical and 269 unique family/board pairs, wrote 20/20 valid reports and measured 12/20 mechanical shapes while owner review remained 0/20. Pilot-first reviewer waves, 42/42 related tests, typecheck and Core passed. |
| 2026-07-17 | OPS-43 | DONE | The ten-minute cycle now rebuilds a dedicated canonical owner dashboard separately from the reduced-tree evidence viewer. A live cycle exited 0 at beta-depth 24/83, the owner workbench contained exactly 20 families in four waves, focused tests passed 12/12 and typecheck passed; no owner verdict or strategy data was inferred. |
| 2026-07-17 | OPS-44 | DONE | Prepared a conservative three-thread `BelowNormal` profile for the next worker without interrupting the active board. The owner dashboard now joins fail-closed mechanical context and filters 15 shape-ready from 5 evidence-pending families. Reviewer/readiness/protocol/Windows tests passed 24/24 and typecheck passed; a live attempt correctly deferred at 46% CPU against the 40% development guard. |
| 2026-07-20 | OPS-45 | DONE | Low-memory task status now distinguishes a live solver from a worker waiting on its resource gate and reports current CPU, free RAM and solver PIDs. Live status truthfully showed `WAITING_FOR_RESOURCES (RAM)`, no solver PID, CPU 40% and free RAM 9%; autostart tests 9/9 and typecheck passed. |
| 2026-07-20 | OPS-46 | DONE | Added idempotent repair for the ten-minute MTT task plus enabled/next-run/latest-outcome/snapshot-freshness diagnostics. The real task was repaired from Disabled to Ready, then confirmed enabled with a future trigger. Incremental review-only intake refreshed four changed families through the latest `J88r` checkpoint: beta-depth reached 49/83 and cumulative valid evidence reached 405 unique family/board pairs without staging or promotion. |
| 2026-07-20 | OPS-47 | DONE | Replaced manual and cycle-private board unions with the locked `mtt:texas-solver-review-only-refresh` path shared by the incremental watcher and ten-minute cycle. The live watcher was replaced without touching the active solver and immediately confirmed beta-depth 59/83 with 415 unique family/board pairs; 20/20 reports and 20/20 mechanical shapes are valid, owner/production remain 0/20, and no strategy was staged or promoted. Related regression passed 28/28, typecheck, production build and scoped Core gate passed. |
| 2026-07-20 | OPS-48 | DONE | Added fail-closed incremental candidate/staging for the four six-max P1 exports, reconciled the live filtered packet folder to exactly four current six-max slots while preserving owner files, and aligned owned-export review requests with the confirmed no-external-evidence rule. The live 90 MB blank workbench reports 0 ready, 4 waiting and 0 invalid in 4.7 seconds; no candidate, raw intake, owner decision or production strategy was written. |
| 2026-07-20 | OPS-49 | DONE | Split live review-only intake truth from the resource-gated full-cycle snapshot. Status now shows timestamped cumulative evidence and exact per-manifest coverage even while the ten-minute cycle defers; it tracked beta-depth through 81/83 and then final 83/83 with 439 cumulative family/board checkpoints while the correctly stale full snapshot still showed 65/83. Focused tests passed 12/12 and the complete release passed 152 files / 762 tests, registry, Core, ranges, build, precache and budget without staging or promotion. |
| 2026-07-20 | OPS-50 | DONE | Removed the false duplicate-permission blocker from six-max P1 intake. All four owner-confirmed canonical manifests are reused and fully validated during staging; read-only preflight now uses the eventual owned-export license and confidence. Live candidate/staging progress is 0 ready, 4 waiting, 0 invalid and each row waits only for `normalized.candidate.json`; 18/18 focused tests, typecheck, registry, intake guard and Core 4/4 plus 7/7 passed. |
| 2026-07-20 | OPS-52 | DONE | Canonical owner dashboard joins only approved staged accuracy context and exposes 403/439 boards, 10 complete plus 10 partial families and the exact 36 missing log names. Filters and summaries remain descriptive and never choose a poker verdict; owner review remains 0/20. Malformed counts, sources, values and filenames fail closed. Focused tests passed 25/25; typecheck, scoped Core and production build passed. |
| 2026-07-22 | OPS-53 | DONE | Bound every owner decision to a deterministic SHA-256 fingerprint of the exact source-safe family review reports and accuracy report. Dashboard schema v2, single and batch writers, and protocol validation reject stale evidence without inferring a verdict. The live template has 20/20 valid fingerprints and 0 decisions; dashboard remains 53 reports, 403/439 boards and owner 0/20. Focused tests passed 24/24; typecheck, scoped Core 4/4 plus 7/7 and production build passed. |
| 2026-07-22 | OPS-54 | DONE | The ten-minute cycle now regenerates only the blank v2 owner template after a successful canonical dashboard refresh and exposes schema, fingerprint, verdict, timestamp and exit health in task status. A real cycle exited 0 and reported template ready with 20/20 fingerprints and 0 selected decisions. PowerShell parser checks and Windows automation tests passed 9/9; no human decision or strategy file was written. |
| 2026-07-22 | OPS-55 | DONE | Rebaselined the full product after owner workflow hardening: 152/152 Vitest files and 771/771 tests passed, followed by typecheck, registry drift, scoped Core 4/4 plus 7/7, build, ranges, precache and bundle budget. Remaining red states are explicit external data/human gates: six-max 0 records, owner 0/20 and action EV 0/493818 preflop plus 0/972 scoped FLOP. |
| 2026-07-22 | OPS-56 | DONE | Prepared a fail-closed, restart-safe queue for exactly 36 missing approved per-board accuracy logs across 10 families. It solves one log at a time, preserves all 439 canonical raw checkpoints, refreshes staged accuracy after every success and cannot write poker review or production strategy. Initial preparation and scenario audit were valid at 403/439; the guarded worker then advanced 403 to 407 to 426 and closed the final 13 logs by 21:28 local. Recovery now reports valid 439/439, 0 pending, 0 recovery families, 0 recovery files and 0 blockers, with all 20 families reconciling `expectedLogs == parsedLogs`. Full regression passed 153 files / 775 tests plus the complete release integrity chain. |
| 2026-07-22 | OPS-57 | DONE | Added per-board canonical raw SHA-256/length/time invariants and a mutex-protected finalizer that refreshes protocol, readiness, owner dashboard and only the blank v2 fingerprint template after accuracy reaches 439/439. The live dry-run correctly waited at 407/439 with no reviewer write; the finalizer then ran at 21:28:38 local once recovery hit 439/439, and status now reports `accuracy handoff: valid=True, current=True`, accuracy 439/439 and blank owner decisions 0/20. Parser and focused regression passed; the full baseline is 153/153 files and 776/776 tests plus the complete green release integrity chain. |
| 2026-07-22 | OPS-58 | DONE | Added fail-closed refresh for stale but provably blank postflop action-EV templates and exposed its status through the ten-minute task. The live pass refreshed all 7 blank templates covering 972 decisions and 2,916 action slots; an immediate repeat reported blank 7/7, nonblank 0 and zero writes. Edited or EV-bearing templates remain protected and make blank readiness false, candidate and promotion commands are absent, final focused tests passed 17/17 and the full 153-file / 778-test release integrity chain passed. |
| 2026-07-22 | OPS-59 | DONE | Upgraded the four exact 118,638-row six-max preflop workbenches from the legacy header to the current optional action-EV columns using a full-structure, fail-closed blank invariant. The first live pass refreshed 4/4 and the repeat wrote 0; current/blank/action-EV columns are 4/4, nonblank/protected stale are 0 and generated values remain none. The ten-minute task now keeps and reports this state. Focused tests passed 29/29; full release passed 154/154 files, 785/785 tests and the complete integrity chain. |
| 2026-07-22 | OPS-60 | DONE | Added source-safe partial-progress observability for all four six-max preflop workbenches and separated editable owner fields from the immutable 118,638-row scaffold structure. A whole-row chunk now remains `WAITING` without invoking full candidate validation; changed structure, one-sided strategy or partial EV remains `INVALID`. The live pass measured 474,552/474,552 rows, 4/4 structurally safe, 0 touched and 0/4/0 ready/waiting/invalid without writing strategy or EV. The recurring task exposes the same strategy, EV and review counters. Full release passed 154/154 files and 787/787 tests plus the integrity chain. |
| 2026-07-22 | OPS-61 | DONE | Classified solver termination causes end to end. Future guard events bind RAM, PID and parameter before termination; runner telemetry distinguishes guarded stops from native exits, and accuracy recovery defers cleanly for the next resource-safe trigger. Live legacy correlation identifies 2/3 exits as guard stops, with 1 unclassified historical exit and no explicit native exit. The new worker waits at the RAM gate with 13 logs pending and `Q76mono` next; focused tests passed 14/14. |
| 2026-07-22 | OPS-62 | DONE | Added dry-run-first atomic merging for reviewed six-max preflop subsets. Exact immutable identities, complete strategy/EV/review field groups, fill-only semantics, idempotence, conflict-wide rejection, pre-write SHA-256 and backup replacement are enforced. The command generates no poker values or production artifacts; full regression passed 155/155 files and 793/793 tests plus the complete integrity chain, and live blank workbenches were not touched. |
| 2026-07-22 | OPS-63 | DONE | Froze the reusable MTT-to-SNG/Cash architecture boundary and 20-30-day playable-beta sequence without authorizing cross-variant strategy reuse. Added an exact solver-neutral node contract and comparator for setup/range/tree/economics fingerprints, a shared accuracy target, combo frequencies, per-action EV and range-weighted equivalent best-action sets. It cannot promote or overwrite private inputs; focused tests passed 10/10 and full regression passed 159/159 files and 809/809 tests. GTO+ remains an honest external gate at 0/3 ready with nine outputs missing. |
| 2026-07-22 | OPS-64 | DONE | Added one source-free `MTT_PLAYABLE_BETA_V1` gate: current Core is a launchable increment at 4/8 preflop, six-max 0/4 and scoped FLOP 7/7 while full-target mode remains blocked. Added a fixed-metadata FTP ZIP builder with path/size/SHA-256 reconciliation, source-map exclusion, atomic writes, clean-commit enforcement and a full test/release/build/self-hosted Chrome chain before confirmed output. Full regression passed 159/159 files and 809/809 tests; all release gates and four-viewport production Chrome QA passed with zero browser errors. The preview wrapper pins production environment so its asset hashes match the normal build; the live dry run reconciled 13 deployable entries. |
| 2026-07-23 | OPS-68 | DONE | Made VALUE/BLUFF a hand-versus-board judgement instead of a rank guess. The importer previously called any betting pair or A/K/Q/J/T-high hand VALUE, teaching `QJo` on `A72r` and `A2s` on `K83r` as value bets. `classifyFlopHand` moved from the range-matrix view into `src/core/flopHandCategory.ts` so the matrix and imported content share one definition; a betting hand is VALUE only when made, and only on a strict majority of the boards a rule aggregates. Five c-bet pilots regenerated, suite stays 7/7 at 972 buckets, focused regression 67/67. The two facing-bet pilots still need their own harvest and keep rank-based lanes. |
| 2026-07-23 | OPS-67 | DONE | Moved flop range-lane coverage from a per-rule to a per-pack requirement in both the pack validator and the pilot gate. One rule missing its BLUFF lane previously made the resolver return null for the whole pack, disabling all three SPR bands at runtime. The missing lane is genuine converged solver output below SPR 3, where the observed c-bet range is pairs and broadway only, so demanding it per rule would have forced an invented bluff lane. The pilot suite moved from 3 ready / 4 invalid to 7/7, and regenerating the modules closed a real 2026-07-09 module vs 2026-07-15 draft drift. Focused regression 85/85. |
| 2026-07-23 | OPS-65 | DONE | Replaced the per-range human poker verdict with mechanical acceptance after the owner decided the professional-field beta is the review. Grading uses only on-disk evidence: structural completeness plus every board at or below the pinned `set_accuracy` target. Results are written through the existing audited batch writer with the non-human reviewer token `PKRTRAINER_MECHANICAL_ACCEPTANCE_V1` and caveats stating it is not a human poker verdict. Live grading 17 accepted / 3 withheld; review protocol moved 0/20 to 20/20 protocol-ready with 17 production eligible and zero blockers. Focused tests 9/9. |
| 2026-07-23 | OPS-66 | ACTIVE | Staged a targeted re-solve for the 13 boards above the 0.5 exploitability target across 3 families. Each parameter is copied verbatim from its authoritative full-tree source with only `set_max_iteration` raised, reduced-tree low-memory sets excluded, and the dump filename preserved so the same canonical checkpoint is replaced. All 13 checkpoints were SHA-256 backed up first, which proved necessary when a first launch failed on a relative log path after the runner's `Push-Location` and had already removed `822tt`; it was restored byte-identically. The repair manifest is named outside the `coverage-*-manifest.json` scan because it re-declares already-covered boards; naming it as coverage made four expansion presets fail closed on duplicate blockers. |
| 2026-07-20 | OPS-51 | DONE | Fixed UTF-16LE TexasSolver log intake and added a fast fail-closed staging refresh over already validated cumulative reports. The live pass refreshed 20/20 family summaries and recovered traceable exploitability for 403/439 approved boards across all 20 families; an immediate repeat wrote nothing. Protocol warnings fell from 38 to 20, leaving only human caveats and owner verdicts. Focused tests passed 38/38; typecheck, scoped Core and production build passed. |
| 2026-07-20 | RELEASE-FTP-03 | DONE | Packaged source commit `c44efebdad96` after the complete 152-file / 762-test MTT Core release gate and four-viewport Chrome QA as `deploy/pkrtrainer-ftp-20260720-141237-c44efebdad96-mtt-core-p1-incremental.zip`. Portable forward-slash ZIP reconciliation passed 22/22 files with 0 missing, 0 extra and 0 hash mismatches; SHA-256 is `2374090EBAB10A4E2E38D9CD04D03C4457E0C6E561561F01C7A18093CC192F67`. |
| 2026-07-20 | OWNER-REVIEW-06 | DONE | Owner dashboard progress now counts only export-valid decisions, marks missing reviewer/date/scope/caveats, and focuses the next incomplete visible row without selecting a poker verdict. Current dashboard regenerated over 53 reports with 20/20 mechanical family context and 0 preselected decisions. Focused reviewer/writer/autostart tests passed 17/17, typecheck passed, and browser QA removed the 390px global horizontal overflow. |
| 2026-07-20 | RELEASE-I18N-01 | DONE | Global runtime and asynchronous errors now follow the live EN/CZ catalog, while range metadata uses the stable poker label `ante ON/OFF`. Vitest parent concurrency is capped at four to prevent nested CLI processes from timing out under solver/development memory pressure. Stable full regression passed 151/151 files and 753/753 tests; registry, scoped Core, ranges, production build, precache and bundle budget all passed. Production Chrome E2E passed desktop plus 360/390/412 px with zero browser errors and 48 contrast checks. |
| 2026-07-20 | RELEASE-FTP-02 | DONE | Packaged the verified production output with the tracked `deploy/forpsi/.htaccess.example` staging template as `deploy/pkrtrainer-ftp-20260720-124211-25ee34a01488-mtt-core-i18n-final.zip`. ZIP reconciliation passed 22/22 files with 0 missing, 0 extra and 0 hash mismatches; SHA-256 is `D85B7AA2B6578C8979871A5D9FD697FAB7928AD694DC195ABC2A9E2CB58616E5`. |
