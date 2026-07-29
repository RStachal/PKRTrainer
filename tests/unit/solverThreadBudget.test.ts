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

function threadBudget(availableGb: number, coreThreads: number): number {
  const command = [
    `. '${policyScript}';`,
    `Get-SolverThreadBudget -CoreThreads ${coreThreads} -AvailableGb ${availableGb}`,
  ].join(" ");
  const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
  });
  return Number.parseInt(out.trim(), 10);
}

function dayPolicy(availableGb: number): { Threads: number; Run: boolean; Window: string } {
  const command = [
    `. '${policyScript}';`,
    `Get-SolverCpuPolicy -AvailableGb ${availableGb} -Now ([DateTime]'2026-07-29T11:00:00')`,
    `| Select-Object Window,Threads,Run | ConvertTo-Json -Compress`,
  ].join(" ");
  const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
  });
  return JSON.parse(out.trim());
}

// The measured cost model the budget is derived from. Kept here rather than
// imported so a change to the constants has to be argued for in two places.
// Committed memory, not working set: a paged-out solver reports a small working
// set precisely when it is the thing exhausting the machine, which is how two
// earlier versions of this budget came to be wrong.
const BASE_GB = 24;
const PER_THREAD_GB = 0.9;
const RESERVE_GB = 3;

const predictedPeakGb = (threads: number) => BASE_GB + PER_THREAD_GB * threads;

describe.runIf(runnable)("solver thread budget", () => {
  it("leaves the reserve intact on every machine size, which is the whole job", () => {
    for (const availableGb of [28, 32, 48, 64, 128]) {
      const threads = threadBudget(availableGb, 32);
      expect(predictedPeakGb(threads) + RESERVE_GB, `${availableGb} GB available`).toBeLessThanOrEqual(availableGb);
    }
  });

  it("refuses the thread counts that actually failed on this machine", () => {
    // Every failure happened on a machine with about 19.9 GB of usable physical
    // memory: fourteen threads died with an access violation, nine were killed by
    // the low-memory guard every fifteen minutes for six hours without finishing
    // a board, and two paged so hard the solve never left iteration zero.
    // Committed cost is 25.9 GB at two threads, so none of them ever fitted.
    expect(threadBudget(19.9, 15)).toBeLessThan(2);
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

  it("keeps the solver running through the day when the tree does fit", () => {
    // Between 9:00 and 21:00 the solver is a background job, not stopped - given
    // a machine with room for it beside the development reserve.
    const policy = dayPolicy(40);
    expect(policy.Window).toBe("DAY");
    expect(policy.Run).toBe(true);
    expect(policy.Threads).toBeGreaterThanOrEqual(1);
    expect(predictedPeakGb(policy.Threads)).toBeLessThanOrEqual(40 - 6);
  });

  it("refuses to admit a solve this machine would only page", () => {
    // 19.9 GB usable against a 24 GB tree. Throttling cannot free the base, so
    // there is nothing to throttle to; admitting it produced six hours of a
    // start-thrash-kill loop that finished nothing.
    expect(dayPolicy(19.9).Run).toBe(false);
  });

  it("grows with memory rather than sitting at a constant", () => {
    // Guards the opposite mistake: a budget so conservative it ignores the
    // hardware would quietly halve throughput on the night window.
    expect(threadBudget(64, 32)).toBeGreaterThan(threadBudget(32, 32));
  });
});
