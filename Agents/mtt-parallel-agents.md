# MTT Parallel Background Agents

Updated: 2026-07-17
Status: ACTIVE

This is the operating contract for the two Windows background branches. Both
branches start after Windows sign-in. The MTT agent receives a recurring
10-minute trigger. Task Scheduler uses `IgnoreNew`, and each worker owns a named
mutex. Before its work begins, the MTT agent checks that the mutex is free; if
an earlier iteration is active, it exits and waits for the next scheduled window.

## Branch 1 - Resource-balanced TexasSolver

- Task: `PKRTrainer-TexasSolver-LowMemory`
- Worker: `run-texas-solver-low-memory.ps1`
- Scope: a five-phase checkpoint queue. `next` and `followup` are raw-complete
  at `72/72`; `owner-depth` also completed 72/72 across eight underrepresented
  review families. The final isolated `beta-min` phase adds 45 globally new rank
  boards across all 14 canonical cohorts, passed audit 45/45 with 0 errors and
  is now raw-complete. Existing checkpoints are skipped on restart.
- The fifth `beta-depth` supply contains 83/83 audited inputs and closes the
  twelve-board cohort target. The owner explicitly authorized it for guarded
  background solving on 2026-07-17. It is `AUTHORIZED_REVIEW_ONLY_WORKER_PHASE`,
  not reviewed strategy and not eligible for automatic promotion.
- Runtime limits: 2 solver threads, `BelowNormal` priority.
- Start guard: no new board starts unless total CPU is at most 40% and physical
  RAM has at least 35% free (at most 65% used).
- Emergency guard: after three 15-second samples below 25% free RAM, only the
  solver process owned by this worker is stopped. Completed raw checkpoints stay
  intact and the 15-minute trigger can resume the queue later.
- HIGH-SPR families use the same explicitly labeled `MEMORY_SAFE_REVIEW_ONLY`
  tree profile after full trees exceeded the RAM guard. They are review evidence,
  not full-tree production evidence.
- A native TexasSolver process failure is recorded locally with its parameter,
  raw export name and exit code. The review-only worker continues with later
  boards; the failed board remains missing and cannot be mistaken for coverage.
- An ingest watcher refreshes source-safe coverage and review artifacts for
  completed evidence. For `MEMORY_SAFE_REVIEW_ONLY` manifests it cannot stage,
  normalize, merge, mark poker review complete or promote runtime strategy. It
  records changed reduced-tree coverage once, suppresses unrelated historical
  staging/draft state and skips the downstream pilot refresh.
- The mechanical cycle aggregates every solved checkpoint from all five derived
  memory-safe manifests, including a partial family, into one cumulative report
  per family. The 2026-07-17 08:58 snapshot contains 272 physical checkpoints,
  269 unique family/board pairs, 20/20 valid reports and zero extraction failures.
  Its separate readiness matrix reports 12/20 mechanical shapes and 0/20 human
  owner decisions.

Controls:

```powershell
npm run mtt:texas-solver-low-memory-status
npm run mtt:texas-solver-low-memory-stop
npm run mtt:texas-solver-low-memory-install
npm run mtt:texas-solver-low-memory-uninstall
```

Solver-input ownership is separate from solving. The script
`run-mtt-solver-batch-prep-cycle.ps1` is the sole generator and scenario-auditor
for an approved beta source wave. Its `PKRTrainer-MTT-Solver-Batch-Prep` task is
currently disabled because all 128 beta-min and beta-depth source files passed
audit; the ten-minute MTT agent never writes or regenerates solver input.

## Branch 2 - Mechanical MTT Task Agent

- Task: `PKRTrainer-MTT-Task-Agent-10m`
- Worker: `run-mtt-autonomous-cycle.ps1 -Once -IntervalMinutes 10`
- Concurrency: every trigger performs a mutex preflight. A busy agent is never
  queued or duplicated; the next 10-minute trigger retries after the running
  iteration has released the mutex.
- Each run refreshes active solver coverage, records canonical declared board
  coverage, extracts read-only evidence for newly raw-complete reduced-tree
  families, and refreshes the four-slot six-max CHIP_EV intake packet,
  ready-intake validation, pilot-first owner waves and the source-safe 20-family
  mechanical readiness matrix. Their combined coverage signature, rather than a
  completed legacy manifest, decides when the scoped Core gate is rechecked.
- Start guard: each ten-minute run requires total CPU at most 40% and at least
  35% free physical RAM. A pressured run exits and waits for the next window.
- The scoped MTT Core gate runs when the observed solver coverage signature
  changes. Its persisted report feeds exact preflop and postflop action-EV
  readiness counts into `artifacts/mtt-autonomous-cycle/latest-cycle-summary.json`.
- The worker never creates poker strategy, signs human review, uploads FTP data
  or promotes an unreviewed pack.
- This is a deterministic PowerShell/Node agent. It does not invoke Codex, use
  AI credits or autonomously implement new application code.

Controls:

```powershell
npm run mtt:autonomous-cycle-status
npm run mtt:autonomous-cycle-stop
npm run mtt:autonomous-cycle-install
npm run mtt:autonomous-cycle-uninstall
```

## Current External And Human Gates

- Four exact six-max CHIP_EV `normalized.json` files remain external inputs;
  their four owner-confirmed `permission.json` manifests already exist.
- Twenty TexasSolver families remain `NEEDS_REVIEW`. Their current source-safe
  decision order is generated in
  `artifacts/texas-solver-review-protocol/packet/OWNER_REVIEW_WAVES.md`.
- Professional action-EV feedback needs a reviewed owned export with EV in BB
  for every offered action. Current TexasSolver frequency dumps do not satisfy
  that contract. Seven exact blank workbench templates are available under
  `artifacts/mtt-action-ev-intake/`; they cover 972 decisions and deliberately
  contain no EV values.
- The verified MTT Core FTP archive is ready, but upload and staging credentials
  remain owner-operated external state.

## Legacy Tasks

`PKRTrainer-TexasSolver-Autostart` is disabled. The isolated solver-batch prep
task is intentionally disabled after preparing the active source wave. The older protected
`PKRTrainer-MTT-Autonomous-Cycle` entry could not be disabled from the current
Windows token; its shared script defaults to one-shot mode and the same mutex,
so it cannot run a second concurrent MTT cycle.
