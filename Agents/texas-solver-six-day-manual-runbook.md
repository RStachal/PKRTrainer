# TexasSolver Six-Day Manual Runbook

Status at 2026-07-17:

- Beta-depth: 29/83 raw checkpoints complete; 54 remain.
- Growth reservoir: 98/98 scenarios audited with 0 errors.
- Manual reservoir total: 152 remaining boards.
- Every manual mode is `MEMORY_SAFE_REVIEW_ONLY`. It is solver evidence for
  review, not production strategy, normalized data or automatic promotion.
- All recurring PKRTrainer TexasSolver, MTT cycle and batch-prep tasks are
  disabled. Manual scripts do not re-enable scheduled jobs.

## Start Beta-Depth

From any PowerShell directory:

```powershell
& "C:\Users\stachal\PKRTrainer\PKRTrainer\Agents\solver-input\texas-solver\mtt-safe-flops-v1\start-texas-solver-day-40.ps1"
& "C:\Users\stachal\PKRTrainer\PKRTrainer\Agents\solver-input\texas-solver\mtt-safe-flops-v1\start-texas-solver-night-100.ps1"
```

The day mode uses 6/16 solver threads, `BelowNormal`, Balanced power and a
40% CPU start guard. The night mode uses 16/16 solver threads, `AboveNormal`
and High performance. It starts only with at least 15% free RAM and stops below
10% free RAM.

## Continue With Growth

After beta-depth is complete, select the prepared 98-board reservoir explicitly:

```powershell
& "C:\Users\stachal\PKRTrainer\PKRTrainer\Agents\solver-input\texas-solver\mtt-safe-flops-v1\start-texas-solver-day-40.ps1" -Wave growth
& "C:\Users\stachal\PKRTrainer\PKRTrainer\Agents\solver-input\texas-solver\mtt-safe-flops-v1\start-texas-solver-night-100.ps1" -Wave growth
```

Existing raw exports are skipped, so either script resumes from the first
missing board.

## Stop Correctly

Use this command for a background manual run:

```powershell
& "C:\Users\stachal\PKRTrainer\PKRTrainer\Agents\solver-input\texas-solver\mtt-safe-flops-v1\stop-texas-solver-all.ps1"
```

Do not rely on `Ctrl+C` after a manual start script returns, because the solver
continues in a hidden background process. `Ctrl+C` is only relevant when a
solver is attached to the current foreground console. It interrupts the active
board; completed raw exports remain preserved, but the interrupted board is not
committed and is retried on the next start. The stop script is the correct
command for background mode and also keeps recurring tasks disabled.
