# MTT Lean Execution Queue

Updated: 2026-07-16
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

Execution protocol:

1. After the session health check, select the first `READY_ONCE` task whose
   dependencies are done. Repeating checks are not queue candidates.
2. Work on one task at a time. TexasSolver is the only allowed parallel workload.
3. Run the listed evidence commands and record the result in this file.
4. Never create poker strategy values, review decisions or provenance facts.
5. Stop at `HUMAN_GATE` or `EXTERNAL_DATA` until the named input exists.
6. Do not create a third solver phase before the two prepared phases complete
   their review lifecycle or the owner changes scope.
7. Keep raw solver output local and ignored. Ship only reviewed source-safe artifacts.
8. `permission.json` records provenance/review rights; it is never a customer entitlement.
9. After recording a completed dependency, change only the next eligible
   `BLOCKED_BY` task to `READY_ONCE`. Never unlock a human or data gate.

## Reasonable Finish Line

The reasonable near-term MTT finish is:

- `MTT_CORE_V1` deployed and staging-smoked behind Basic Auth;
- the current two-phase TexasSolver queue completed and reduced to reviewed,
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
- Resource-balanced queue: phases `next` and `followup` are both raw-complete at
  `72/72`. With no pending checkpoint, the scheduled worker exits successfully
  and no `console_solver` process is expected. Both phases used two solver
  threads, `BelowNormal`,
  a 35% free-physical-memory start guard and `MEMORY_SAFE_REVIEW_ONLY` trees.
- Review protocol: 20 families need human review; 0 protocol-ready.
- Action-EV comparison: implementation complete, data not ready. Core preflop is
  `0/493818` complete decisions across `0/4` packs; scoped FLOP pilots are
  `0/972` across `0/7`. Frequency-only solver output is excluded.
- TexasSolver v0.2.0 compatibility: the active queue remains frozen even though
  its inherited `set_raise_limit 3` line is logged as unrecognized. The isolated
  next batch removes only that ignored directive; its resulting tree still uses
  the same console default until an owner-approved tree policy replaces it.
- Windows task: `PKRTrainer-TexasSolver-LowMemory`, AtLogOn, hidden,
  `IgnoreNew`, `StartWhenAvailable`; it resumes checkpoints and selects the
  next incomplete phase without automatic staging or promotion.
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
active unless both phases are complete, and the newest worker log records either
a resume or an all-phases-complete result.

### OPS-02 - Session health check

Status: `REPEATING_CHECK`
Depends on: `OPS-00`
Lane: `REPEATABLE`

Last measured: 2026-07-16 local time, phases `next` and `followup` are complete
at 72/72. The task is `Ready`, its last result is `SUCCESS (0)`, and no solver
process is expected while every prepared checkpoint exists.

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
If both phases are complete, do not restart it; a successful no-op at sign-in is
the intended behavior.

To halt the current local queue deliberately without deleting raw checkpoints,
run `npm run mtt:texas-solver-low-memory-stop`. To also disable future sign-in
starts, run `npm run mtt:texas-solver-low-memory-uninstall` afterwards.

### OPS-03 - Keep batch scope frozen

Status: `ACTIVE_GUARDRAIL`
Lane: `REPEATABLE`

Do not add a third batch while either prepared phase is partial. The worker may
advance from `next` to the already prepared `followup` phase, but it may not
stage, normalize, merge or promote either phase automatically.
Acceptance: exactly the two approved manifests are selectable and both retain
their `MEMORY_SAFE_REVIEW_ONLY` boundary.

### OPS-04 - Keep the recurring mechanical cycle active

Status: `ACTIVE 2026-07-14`
Depends on: `OPS-00`
Lane: `REPEATABLE`

Install under the actual signed-in Windows owner, then verify it records a new
cycle log after sign-in. Its work is intentionally limited to coverage status,
the source-safe P1 intake packet and a scoped Core gate when coverage changes.

```powershell
npm run mtt:autonomous-cycle-install
npm run mtt:autonomous-cycle-status
```

To interrupt only a current cycle, use `npm run mtt:autonomous-cycle-stop`; to
remove future sign-in starts too, use `npm run mtt:autonomous-cycle-uninstall`.
Neither command is allowed to stop the solver or its watcher.

### OPS-13 - Run the owner-directed two-phase low-memory review queue

Status: `RAW_COMPLETE 2026-07-16`
Lane: `REPEATABLE`

The former high-memory autostart queue is disabled. The low-memory task completed
both prepared phases under the same resource guard. It remains installed for
restart-safe status/no-op behavior and does not promote runtime strategy.

```powershell
npm run mtt:texas-solver-low-memory-status
```

To halt the current worker without deleting raw checkpoints, run
`npm run mtt:texas-solver-low-memory-stop`. To remove its future sign-in start,
run `npm run mtt:texas-solver-low-memory-uninstall`.

## Phase DEP - Core Deployment Closeout

### DEP-00 - Preserve verified FTP artifact

Status: `DONE 2026-07-10`
Lane: `REPEATABLE`

Artifact:
`deploy/pkrtrainer-ftp-20260710-144407-4773268-mtt-core-v1.zip`

SHA-256:
`65FC0E2641BE638474CC673D483CB953FE184845D0925A42A65575867B746E7B`

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
