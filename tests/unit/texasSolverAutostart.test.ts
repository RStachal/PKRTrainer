import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOLVER_DIR = resolve(
  ROOT,
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1",
);
const QUEUE_PATH = resolve(SOLVER_DIR, "texas-solver-autostart-queue.json");
const WORKER_PATH = resolve(SOLVER_DIR, "resume-texas-solver-queue.ps1");
const MANAGER_PATH = resolve(SOLVER_DIR, "manage-texas-solver-autostart.ps1");
const AUTONOMOUS_CYCLE_PATH = resolve(SOLVER_DIR, "run-mtt-autonomous-cycle.ps1");
const AUTONOMOUS_CYCLE_MANAGER_PATH = resolve(
  SOLVER_DIR,
  "manage-mtt-autonomous-cycle.ps1",
);
const SOLVER_BATCH_PREP_PATH = resolve(SOLVER_DIR, "run-mtt-solver-batch-prep-cycle.ps1");
const SOLVER_BATCH_PREP_MANAGER_PATH = resolve(SOLVER_DIR, "manage-mtt-solver-batch-prep.ps1");
const RUNNER_PATH = resolve(SOLVER_DIR, "run-console-selected.ps1");
const BACKGROUND_START_PATH = resolve(SOLVER_DIR, "start-background-solve.ps1");
const WATCHER_PATH = resolve(SOLVER_DIR, "watch-ingest-completed.ps1");
const LOW_MEMORY_WORKER_PATH = resolve(SOLVER_DIR, "run-texas-solver-low-memory.ps1");
const LOW_MEMORY_MANAGER_PATH = resolve(SOLVER_DIR, "manage-texas-solver-low-memory.ps1");
const LEAN_QUEUE_PATH = resolve(ROOT, "Agents/mtt-lean-execution-queue.md");
const PRIORITIES_PATH = resolve(ROOT, "Agents/mtt-completion-priorities.md");

const windowsIt = process.platform === "win32" ? it : it.skip;

describe("TexasSolver Windows autostart queue", () => {
  it("pins the current large review batch to one restartable 72-board queue item", () => {
    const queue = JSON.parse(readFileSync(QUEUE_PATH, "utf8")) as {
      schemaVersion: number;
      items: Array<{
        enabled: boolean;
        expectedBoards: number;
        manifest: string;
        parameterRoot: string;
      }>;
    };
    expect(queue.schemaVersion).toBe(1);
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({ enabled: true, expectedBoards: 72 });
    expect(existsSync(resolve(ROOT, queue.items[0].manifest))).toBe(true);
    expect(existsSync(resolve(ROOT, queue.items[0].parameterRoot))).toBe(true);
  });

  windowsIt("dry-runs the queue without starting TexasSolver", () => {
    const output = runPowerShell(WORKER_PATH, "-DryRun");
    expect(output).toContain("mtt-large-flop-review-autostart-v1");
    expect(output).toMatch(/large-flop-review-v1: solved=\d+\/72/);
    expect(output).toContain("parameterRoot=");
  });

  windowsIt("dry-runs a hidden idempotent AtLogOn scheduled task", () => {
    const output = runPowerShell(MANAGER_PATH, "-Action", "Install", "-DryRun");
    const stopOutput = runPowerShell(MANAGER_PATH, "-Action", "Stop", "-DryRun");
    expect(output).toContain("PKRTrainer-TexasSolver-Autostart");
    expect(output).toContain("-WindowStyle Hidden");
    expect(stopOutput).toContain("Dry run stop: task=PKRTrainer-TexasSolver-Autostart");

    const manager = readFileSync(MANAGER_PATH, "utf8");
    expect(manager).toContain('ValidateSet("Install", "Status", "Stop", "Uninstall")');
    expect(manager).toContain("-AtLogOn");
    expect(manager).toContain("-MultipleInstances IgnoreNew");
    expect(manager).toContain("-StartWhenAvailable");
    expect(manager).toContain("RUNNING (raw task code");
    expect(manager).toContain("Get-ManagedQueueWorkers");
    expect(manager).toContain("Get-ManagedWatchers");
    expect(manager).toContain("Stop-ScheduledTask");
  });

  windowsIt("dry-runs the separate recurring MTT mechanical cycle", () => {
    const output = runPowerShell(
      AUTONOMOUS_CYCLE_MANAGER_PATH,
      "-Action",
      "Install",
      "-DryRun",
    );
    const cycle = readFileSync(AUTONOMOUS_CYCLE_PATH, "utf8");
    const manager = readFileSync(AUTONOMOUS_CYCLE_MANAGER_PATH, "utf8");

    expect(output).toContain("PKRTrainer-MTT-Task-Agent-10m");
    expect(output).toContain("-WindowStyle Hidden");
    expect(cycle).toContain("PKRTrainerMttAutonomousCycleV1");
    expect(cycle).toContain("$IntervalMinutes = 10");
    expect(cycle).toContain("Preflight found an active MTT autonomous cycle");
    expect(cycle).toContain("next scheduled 10-minute window");
    expect(cycle).toContain("mtt:p1-intake-packets");
    expect(cycle).toContain("P1 ready intake validation");
    expect(cycle).toContain("mtt:validate-ready-intake");
    expect(cycle).toContain("--priority=P1_PREFLOP_CHIP_EV");
    expect(cycle).toContain("TexasSolver review packet");
    expect(cycle).toContain("mtt:texas-solver-review-protocol");
    expect(cycle).toContain("TexasSolver owner review dashboard");
    expect(cycle).toContain('"--reviews-dir=$CanonicalReviewReportsDir"');
    expect(cycle).toContain('"--waves=$OwnerReviewWavesPath"');
    expect(cycle).toContain('"--readiness=$ReviewReadinessReportPath"');
    expect(cycle).toContain('"--output=$OwnerReviewViewerPath"');
    expect(cycle).toContain("Only canonical full-tree reports are selectable for owner approval");
    expect(cycle).toContain("Mechanical readiness failed; canonical owner dashboard was not refreshed.");
    expect(cycle.indexOf("TexasSolver mechanical review readiness")).toBeLessThan(cycle.indexOf("TexasSolver owner review dashboard"));
    expect(cycle).toContain("mtt:core-release");
    expect(cycle).toContain("Should-DeferForResourcePressure");
    expect(cycle).toContain("$MinimumFreeMemoryPercent = 35");
    expect(cycle).toContain("$MaximumCpuPercent = 40");
    expect(cycle).toContain("deferring Node-based MTT work without touching TexasSolver");
    expect(cycle).toContain("Once mode; cycle deferred for resource pressure.");
    expect(cycle).toMatch(/Resource pressure[^\r\n]*\| Out-Null/);
    expect(cycle).toContain("LatestRawWrites");
    expect(cycle).toContain("coverage-low-memory-flop-review-v1-manifest.json");
    expect(cycle).toContain("coverage-low-memory-followup-flop-review-v1-manifest.json");
    expect(cycle).toContain("coverage-low-memory-owner-depth-flop-review-v1-manifest.json");
    expect(cycle).toContain("coverage-low-memory-beta-min-board-review-v1-manifest.json");
    expect(cycle).toContain("coverage-low-memory-beta-depth-board-review-v1-manifest.json");
    expect(cycle).toContain("$OptionalGeneratedManifestNames");
    expect(cycle).not.toContain('".\\Agents\\solver-input\\texas-solver\\mtt-safe-flops-v1\\coverage-next-flop-review-v1-manifest.json"');
    expect(cycle).not.toContain('".\\Agents\\solver-input\\texas-solver\\mtt-safe-flops-v1\\coverage-followup-flop-review-v1-manifest.json"');
    expect(cycle).toContain("foreach ($coverageManifestPath in $ManifestPaths)");
    expect(cycle).toContain("$statuses.Count -eq $ManifestPaths.Count");
    expect(cycle).toContain("latest-cycle-summary.json");
    expect(cycle).toContain("Write-LatestCycleSummary $statuses $signature");
    expect(cycle).toContain("Update-ReviewOnlyEvidence $statuses");
    expect(cycle).toContain("--review-only-tree-profile=MEMORY_SAFE_REVIEW_ONLY");
    expect(cycle).toContain('"mtt:texas-solver-board-catalog"');
    expect(cycle).toContain("board-catalog-latest.json");
    expect(cycle).toContain("solver-batch prep task");
    expect(cycle).not.toContain('"--preset=beta-min"');
    expect(cycle).not.toContain("coverage-beta-min-board-review-v1-manifest.json");
    expect(cycle).toContain("boardCatalog = $BoardCatalog");
    expect(manager).toContain("Declared board catalog:");
    expect(cycle).toContain("$row.solvedBoards");
    expect(cycle).toContain("$familyIds = @($evidenceRows");
    expect(cycle).toContain("$existingReport.requestedBoards");
    expect(cycle).toContain("TexasSolver cumulative review-only evidence");
    expect(cycle).toContain("--boards=$($boards -join ',')");
    expect(cycle).toContain("review-only evidence viewer");
    expect(cycle).toContain("reviewOnlyEvidence = $ReviewOnlyEvidence");
    expect(cycle).toContain("reviewReadiness = $ReviewReadiness");
    expect(cycle).toContain('"mtt:texas-solver-review-readiness"');
    expect(cycle).toContain("MECHANICAL_READINESS.md");
    expect(cycle).toContain("Get-P1Summary $p1PacketExit $p1ReadyExit");
    expect(cycle).toContain("Get-ReviewSummary $reviewExit $reviewViewerExit");
    expect(cycle).toContain("Get-CoreSummary $coreGateEvaluated $coreExit $signaturePersisted");
    expect(cycle).toContain("core-gate-latest.json");
    expect(cycle).toContain("postflopCompleteDecisions");
    expect(cycle).toContain('"--output=$CoreGateReportPath"');
    expect(cycle).toContain("last-coverage-signature.txt");
    expect(cycle).toContain("Persisted successful coverage signature for the next scheduled cycle.");
    expect(cycle).toContain("Core gate failed; coverage signature was not persisted");
    expect(cycle).toContain("Write-CycleLog \"${Label}: npm $($Arguments -join ' ')\" | Out-Null");
    expect(cycle).toContain("return $exitCode");
    expect(cycle).toContain("watcher remains the sole ingest owner");
    expect(cycle).not.toContain("mtt:texas-solver-ingest-completed");
    expect(cycle).not.toContain("mtt:promote-ready");
    expect(manager).toContain('TaskName = "PKRTrainer-MTT-Task-Agent-10m"');
    expect(manager).toContain("-AtLogOn");
    expect(manager).toContain("-RepetitionInterval (New-TimeSpan -Minutes $RepetitionMinutes)");
    expect(manager).toContain("-Once -IntervalMinutes $RepetitionMinutes");
    expect(manager).toContain("-MinimumFreeMemoryPercent $MinimumFreeMemoryPercent -MaximumCpuPercent $MaximumCpuPercent");
    expect(manager).toContain("-MultipleInstances IgnoreNew");
    expect(manager).toContain("Show-LatestCycleSummary");
    expect(manager).toContain("coverage snapshot:");
    expect(manager).toContain("P1 intake:");
    expect(manager).toContain("TexasSolver review:");
    expect(manager).toContain("TexasSolver owner dashboard:");
    expect(manager).toContain("Review-only evidence:");
    expect(manager).toContain("Mechanical readiness:");
    expect(manager).toContain("Core gate:");

    const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["mtt:autonomous-cycle-install"]).toContain(
      "manage-mtt-autonomous-cycle.ps1 -Action Install -StartNow",
    );
    expect(packageJson.scripts["mtt:autonomous-cycle-status"]).toContain("-Action Status");
    expect(packageJson.scripts["mtt:autonomous-cycle-stop"]).toContain("-Action Stop");
    expect(packageJson.scripts["mtt:autonomous-cycle-uninstall"]).toContain("-Action Uninstall");
  });

  windowsIt("dry-runs the isolated beta-minimum and review-only beta-depth preparation task", () => {
    const output = runPowerShell(
      SOLVER_BATCH_PREP_MANAGER_PATH,
      "-Action",
      "Install",
      "-DryRun",
    );
    const prep = readFileSync(SOLVER_BATCH_PREP_PATH, "utf8");
    const manager = readFileSync(SOLVER_BATCH_PREP_MANAGER_PATH, "utf8");

    expect(output).toContain("PKRTrainer-MTT-Solver-Batch-Prep");
    expect(prep).toContain("PKRTrainerMttSolverBatchPrepV1");
    expect(prep).toContain("--preset=beta-min");
    expect(prep).toContain("--preset=beta-depth");
    expect(prep).toContain("coverage-beta-depth-board-review-v1-manifest.json");
    expect(prep).toContain("mtt:texas-solver-scenario-audit");
    expect(prep).toContain("Should-DeferForLowMemory");
    expect(prep).toContain("deferring next-batch preparation without touching TexasSolver");
    expect(prep).toMatch(/deferring next-batch preparation[^\r\n]*\| Out-Null/);
    expect(prep).toContain("may solve beta-depth after beta-minimum only as MEMORY_SAFE_REVIEW_ONLY evidence");
    expect(prep).toContain("owner review still gates every production use");
    expect(prep).not.toContain("run-console-selected.ps1");
    expect(prep).not.toContain("mtt:texas-solver-autostart");
    expect(manager).toContain('TaskName = "PKRTrainer-MTT-Solver-Batch-Prep"');
    expect(manager).toContain("owner-authorized 83-board beta-depth");
    expect(manager).toContain("Show-PreparedWaveStatus");
    expect(manager).toContain("APPROVED_WORKER_PHASE");
    expect(manager).toContain("AUTHORIZED_REVIEW_ONLY_WORKER_PHASE");

    const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["mtt:solver-batch-prep-install"]).toContain("-Action Install -StartNow");
    expect(packageJson.scripts["mtt:solver-batch-prep-status"]).toContain("-Action Status");
  });

  it("guards against duplicate workers and false solver success", () => {
    const worker = readFileSync(WORKER_PATH, "utf8");
    const runner = readFileSync(RUNNER_PATH, "utf8");
    const watcher = readFileSync(WATCHER_PATH, "utf8");
    expect(worker).toContain("PKRTrainerTexasSolverQueueV1");
    expect(worker).toContain("WaitOne(0, $false)");
    expect(worker).toContain("Start-IncrementalIngestWatcher");
    expect(worker).toContain("watch-ingest-completed.ps1");
    expect(worker).toContain("& $Runner -ParameterRoot $parameterRoot -Limit ([int]$item.limit) 2>&1 |");
    expect(worker).toContain("ForEach-Object { Write-QueueLog ([string]$_) }");
    expect(worker).toContain('"-MaxMinutes", "10080"');
    expect(runner).toContain("TexasSolver exited with code $solverExitCode");
    expect(runner).toContain("PKRTRAINER_SOLVER_FAILED parameter=$($file.Name) raw=$DumpName exit=$ExitCode");
    expect(runner).toContain("$ContinueOnSolverFailure");
    expect(runner).toContain("continuing with the next parameter");
    expect(runner).toContain("Wait-ForStartResources");
    expect(runner).toContain("$MaximumCpuPercent = 100");
    expect(runner).toContain("Win32_PerfFormattedData_PerfOS_Processor");
    expect(runner).toContain("Set-ProcessPriority");
    expect(runner).toContain('[string]$ProcessPriority = "Normal"');
    expect(runner).toContain("[System.Diagnostics.ProcessPriorityClass]$Priority");
    expect(runner).toContain("continuing with inherited priority");
    expect(runner).toContain("waiting before the next TexasSolver parameter");
    expect(runner).toContain("Refusing to remove stale dump outside TexasSolver root");
    expect(runner).toContain("PKRTRAINER_SOLVER_BEGIN parameter=$($file.Name) raw=$dumpName");
    expect(runner).toContain("PKRTRAINER_SOLVER_END parameter=$($file.Name) raw=$dumpName exit=0");
    expect(watcher).toContain('"--packet-dir=$ReviewPacketDir"');
    expect(watcher).toContain('"--output=$ReviewProtocolReportPath"');
    expect(watcher).toContain("ScenarioAuditReportPath");
    expect(watcher).toContain("LastProcessedCoverageSignature");
    expect(watcher).toContain("LatestRawWrites");
    expect(watcher).toContain("Write-PartialCoverageCheckpoints");
    expect(watcher).toContain("artifacts\\texas-solver-partial-checkpoints");
    expect(watcher).toContain("Writing read-only partial checkpoint");
    expect(watcher).toContain("MEMORY_SAFE_REVIEW_ONLY manifest: partial checkpoints are disabled");
    expect(watcher).toContain("checkpoints never create review notes, normalized drafts, or runtime data.");
    expect(watcher).toContain('npm run mtt:texas-solver-review -- "--family=$familyId" "--output=$checkpointPath" --summary');
    expect(watcher).toContain("Should-DeferForLowMemory");
    expect(watcher).toContain("[int]$MinimumFreeMemoryPercent = 10");
    expect(watcher).toContain("watcher threshold {2}%");
    expect(watcher).toContain("deferring coverage polling without touching TexasSolver");
    expect(watcher).toMatch(/watcher threshold[^\r\n]*\| Out-Null/);
    expect(watcher).toContain("No coverage change; skipping redundant ingest and pilot refresh.");
    expect(watcher).toContain("Coverage changed; running source-safe ingest and review checks.");
    expect(watcher).toContain("recording MEMORY_SAFE_REVIEW_ONLY evidence without downstream staging or pilot refresh");
    expect(watcher).toContain("review protocol and pilot refresh are intentionally skipped for this reduced tree");
    expect(watcher).toContain("Processing did not complete cleanly; coverage will be retried.");
    expect(watcher).toContain("mtt:texas-solver-scenario-audit -- --manifest");
    expect(watcher).toContain("scenario audit exit code");
    expect(watcher).toContain("coverage status exit code=$CoverageStatusExitCode or output missing; coverage will be retried.");
    expect(watcher).toContain("PilotSuiteReportPath");
    expect(watcher).toContain("mtt:postflop-pilot-suite -- --output");
    expect(watcher).toContain("safe ingestion continues");
  });

  windowsIt("dry-runs the guarded overnight maximum-performance wrapper", () => {
    const parameterRoot = resolve(
      SOLVER_DIR,
      "parameters/pkrtrainer_mtt_next_flop_review_v1",
    );
    const output = runPowerShell(
      BACKGROUND_START_PATH,
      "-ParameterRoot",
      parameterRoot,
      "-MinimumFreeMemoryPercent",
      "10",
      "-MaximumCpuPercent",
      "100",
      "-ProcessPriority",
      "AboveNormal",
      "-StopBelowFreeMemoryPercent",
      "10",
      "-ContinueOnSolverFailure",
      "-DryRun",
    );
    const wrapper = readFileSync(BACKGROUND_START_PATH, "utf8");
    const guard = readFileSync(
      resolve(SOLVER_DIR, "watch-texas-solver-resource-guard.ps1"),
      "utf8",
    );
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(output).toContain("Start limits: CPU <= 100%, free RAM >= 10%");
    expect(output).toContain("Process priority: AboveNormal");
    expect(output).toContain("Continue on solver failure: True");
    expect(output).toContain("Emergency RAM guard: stop below 10% free RAM");
    expect(wrapper).toContain('"-OwnerProcessId"');
    expect(wrapper).toContain("watch-texas-solver-resource-guard.ps1");
    expect(wrapper).toContain("-ContinueOnSolverFailure");
    expect(guard).toContain("Resource guard remains active");
    expect(guard).toContain("Emergency stops=$EmergencyStops");
    expect(packageJson.scripts["mtt:texas-solver-overnight"]).toContain(
      "-ProcessPriority AboveNormal",
    );
    expect(packageJson.scripts["mtt:texas-solver-overnight"]).toContain(
      "-StopBelowFreeMemoryPercent 10",
    );
  });

  windowsIt("dry-runs a separate constrained low-memory solver worker", () => {
    const output = runPowerShell(LOW_MEMORY_MANAGER_PATH, "-Action", "Install", "-DryRun");
    const worker = readFileSync(LOW_MEMORY_WORKER_PATH, "utf8");
    expect(output).toContain("PKRTrainer-TexasSolver-LowMemory");
    expect(worker).toContain("$MinimumFreeMemoryPercent = 35");
    expect(worker).toContain("$MaximumCpuPercent = 40");
    expect(worker).toContain("-MaximumCpuPercent $MaximumCpuPercent");
    expect(worker).toContain("$ThreadCount = 3");
    expect(worker).toContain('$TreeProfile = "MEMORY_SAFE_REVIEW_ONLY"');
    expect(worker).toContain("set_bet_sizes $1,flop,bet,33");
    expect(worker).toContain("set_bet_sizes $1,$2,bet,50");
    expect(worker).toContain("(turn|river),(raise|donk|allin)");
    expect(worker).toContain("set_max_iteration 100");
    expect(worker).toContain("not comparable to a full-tree production solve");
    expect(worker).toContain("-ProcessPriority BelowNormal");
    expect(worker).toContain("Expected $expectedFileCount resource-balanced parameter files");
    expect(worker).toContain("PKRTrainerTexasSolverLowMemoryV1");
    expect(worker).toContain("Leaving it untouched");
    expect(worker).toContain("Started solver resource guard PID");
    expect(worker).toMatch(/Started solver resource guard PID[^\r\n]*\| Out-Null/);
    expect(worker).toContain("$StopBelowFreeMemoryPercent = 25");
    expect(readFileSync(LOW_MEMORY_MANAGER_PATH, "utf8")).toContain(
      "-RepetitionInterval (New-TimeSpan -Minutes $RepetitionMinutes)",
    );
    expect(readFileSync(LOW_MEMORY_MANAGER_PATH, "utf8")).toContain(
      "repeated triggers are ignored while the worker owns the queue",
    );
    expect(readFileSync(LOW_MEMORY_MANAGER_PATH, "utf8")).toContain("Get-LatestSolverActivity");
    expect(readFileSync(LOW_MEMORY_MANAGER_PATH, "utf8")).toContain("Get-SolverFailureSummary");
    expect(readFileSync(LOW_MEMORY_MANAGER_PATH, "utf8")).toContain("solver-failures.ndjson");
    expect(readFileSync(LOW_MEMORY_MANAGER_PATH, "utf8")).toContain("solver failures: none recorded");
    expect(worker).toContain("A PowerShell script with only checkpoint skips can leave LASTEXITCODE unset.");
    expect(worker).toContain("solver-failures.ndjson");
    expect(worker).toContain("-ContinueOnSolverFailure -FailureReportPath $FailureReportPath");
    expect(worker).toContain("$runnerExitCode = if ($null -eq $LASTEXITCODE) { 0 }");
    expect(worker).toContain("coverage-followup-flop-review-v1-manifest.json");
    expect(worker).toContain("coverage-owner-depth-flop-review-v1-manifest.json");
    expect(worker).toContain("coverage-beta-min-board-review-v1-manifest.json");
    expect(worker).toContain("coverage-beta-depth-board-review-v1-manifest.json");
    expect(worker).toContain('Name = "next"');
    expect(worker).toContain('Name = "followup"');
    expect(worker).toContain('Name = "owner-depth"');
    expect(worker).toContain('Name = "beta-min"');
    expect(worker).toContain('Name = "beta-depth"');
    expect(worker).toContain("Families = $OwnerDepthFamilies");
    expect(worker).toContain("Families = $AllReviewFamilies");
    expect(worker).toContain("$ActiveFamilies = @($ActivePhase.Families)");
    expect(worker).toContain("--manifest $manifestRelative --summary");
    expect(worker).toContain("MTT9_110BB_CO_BTN_3BP_FACING_MIDHIGH");
    expect(worker).toContain("Test-PhaseRawComplete");
    expect(worker).toContain("Phase '$($phase.Name)' has all raw checkpoints; selecting the next phase.");
    expect(worker).toMatch(/has all raw checkpoints; selecting the next phase[^\r\n]*\| Out-Null/);
    expect(worker).toContain("if (-not (Test-PhaseRawComplete $phase)) { return $phase }");
    expect(worker).toContain("return $Phases[-1]");
    expect(worker).toContain("foreach ($phase in $Phases)");
    expect(worker).toContain("Build-LowMemoryBatch $phase");
    expect(worker).toContain("generatedAt = $sourceGeneratedAt");

    const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["mtt:texas-solver-low-memory-install"]).toContain("-Action Install -StartNow");
    expect(packageJson.scripts["mtt:texas-solver-low-memory-stop"]).toContain("-Action Stop");
  });

  it("routes lower-cost work through explicit human and external-data gates", () => {
    const leanQueue = readFileSync(LEAN_QUEUE_PATH, "utf8");
    const priorities = readFileSync(PRIORITIES_PATH, "utf8");
    const manifest = readFileSync(
      resolve(SOLVER_DIR, "coverage-large-flop-review-v1-manifest.json"),
      "utf8",
    );
    expect(priorities).toContain("Agents/mtt-lean-execution-queue.md");
    expect(leanQueue).toContain("Status: `HUMAN_GATE`");
    expect(leanQueue).toContain("Status: `EXTERNAL_DATA`");
    expect(leanQueue).toContain("owner-depth");
    expect(manifest).toContain("npm run mtt:texas-solver-autostart-install");
    expect(manifest).not.toContain("Preflop production intake remains the release-critical MTT blocker");
  });
});

function runPowerShell(script: string, ...args: string[]): string {
  return execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...args],
    { cwd: ROOT, encoding: "utf8", timeout: 30_000 },
  );
}
