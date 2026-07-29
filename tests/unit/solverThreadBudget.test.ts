import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The night thread count is the one number that decides whether an unattended
// solver produces boards or an access violation. Fourteen threads on the deep
// families peaked at 24.3 GB of 31.2 GB, left under 4 GB free and finished
// nothing in three hours; the first version of this budget used a flat
// per-thread rate, under-counted the fixed tree cost, and is what allowed it.
//
// Nothing in TypeScript reads this policy, so the test drives the PowerShell
// directly. That is the point: the failure it guards is not in the app.

const policyScript = path.resolve(
  __dirname,
  "../../Agents/solver-input/texas-solver/mtt-safe-flops-v1/solver-cpu-window.ps1",
);

const runnable = process.platform === "win32" && existsSync(policyScript);

function threadBudget(totalGb: number, coreThreads: number): number {
  const command = [
    `. '${policyScript}';`,
    `Get-SolverThreadBudget -CoreThreads ${coreThreads} -TotalGb ${totalGb}`,
  ].join(" ");
  const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
  });
  return Number.parseInt(out.trim(), 10);
}

function dayPolicy(totalGb: number): { Threads: number; Run: boolean; Window: string } {
  const command = [
    `. '${policyScript}';`,
    `Get-SolverCpuPolicy -TotalGb ${totalGb} -Now ([DateTime]'2026-07-29T11:00:00')`,
    `| Select-Object Window,Threads,Run | ConvertTo-Json -Compress`,
  ].join(" ");
  const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
  });
  return JSON.parse(out.trim());
}

// The measured cost model the budget is derived from. Kept here rather than
// imported so a change to the constants has to be argued for in two places.
const BASE_GB = 11;
const PER_THREAD_GB = 0.9;
const RESERVE_GB = 12;

const predictedPeakGb = (threads: number) => BASE_GB + PER_THREAD_GB * threads;

describe.runIf(runnable)("solver thread budget", () => {
  it("leaves the reserve intact on every machine size, which is the whole job", () => {
    for (const totalGb of [24, 31.2, 32, 48, 64, 128]) {
      const threads = threadBudget(totalGb, 32);
      expect(predictedPeakGb(threads) + RESERVE_GB, `${totalGb} GB machine`).toBeLessThanOrEqual(totalGb);
    }
  });

  it("refuses the thread count that actually crashed this machine", () => {
    // 31.2 GB is what this machine reports. Fourteen threads is what died.
    expect(threadBudget(31.2, 15)).toBeLessThan(14);
  });

  it("never hands back more threads than there are cores to run them", () => {
    // A large machine must not be told to run 128 threads on 6 cores: memory is
    // the cap being added here, not the only cap.
    expect(threadBudget(512, 6)).toBe(6);
  });

  it("still returns a usable thread on a machine too small for the reserve", () => {
    // Returning zero or a negative would make the worker start the solver with
    // --threads 0, which is worse than one slow thread.
    expect(threadBudget(16, 8)).toBeGreaterThanOrEqual(1);
  });

  it("yields the whole machine when a solve cannot fit beside development", () => {
    // Throttling does not free the fixed tree cost, so on a machine this size
    // the honest answer is to stop. Cutting threads was the old answer and it
    // produced zero boards in three hours while endangering the build.
    const policy = dayPolicy(31.2);
    expect(policy.Window).toBe("DAY");
    expect(policy.Run).toBe(false);
  });

  it("keeps solving through the day on a machine with room for both", () => {
    // The yield is derived from memory, not written into the policy as a rule
    // about this machine. Given headroom, the same arithmetic keeps it running.
    const policy = dayPolicy(64);
    expect(policy.Run).toBe(true);
    expect(policy.Threads).toBeGreaterThanOrEqual(2);
  });

  it("grows with memory rather than sitting at a constant", () => {
    // Guards the opposite mistake: a budget so conservative it ignores the
    // hardware would quietly halve throughput on the night window.
    expect(threadBudget(64, 32)).toBeGreaterThan(threadBudget(32, 32));
  });
});
