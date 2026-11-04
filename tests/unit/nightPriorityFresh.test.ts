import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Čerstvost porady (`_priority_is_fresh` v `run_night_decomposition.py`).
 *
 * Hranice noci stála do 4. 11. 2026 natvrdo na 20:45 ze starého okna 21-7,
 * zatímco brána wrapperů se 2. 11. posunula na 19:55. Tik ve 20:00 pak vzal
 * poradu z minulého večera za dnešní a expanze s rozkladem jely naráz
 * (deník 335).
 */
const DIR = resolve("Agents/solver-input/decomposition");

function python(): string | undefined {
  for (const candidate of ["python3", "python"]) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  return undefined;
}

/** `[zapsáno, teď]` v místním čase -> výsledek `_priority_is_fresh(teď)`. */
function fresh(cases: Array<[string, string]>): boolean[] {
  const interpreter = python();
  if (interpreter === undefined) return [];
  const run = spawnSync(interpreter, ["-c", [
    "import json, os, sys, tempfile",
    "from datetime import datetime",
    `sys.path.insert(0, ${JSON.stringify(DIR)})`,
    "import run_night_decomposition as d",
    "d.NIGHT_PRIORITY = os.path.join(tempfile.mkdtemp(), 'tonight.json')",
    "open(d.NIGHT_PRIORITY, 'w', encoding='utf8').write('{}')",
    "out = []",
    `for written, now in ${JSON.stringify(cases)}:`,
    "    stamp = datetime.fromisoformat(written).timestamp()",
    "    os.utime(d.NIGHT_PRIORITY, (stamp, stamp))",
    "    out.append(d._priority_is_fresh(datetime.fromisoformat(now)))",
    "print(json.dumps(out))",
  ].join("\n")], { encoding: "utf8" });
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout) as boolean[];
}

describe("porada je z téhle noci", () => {
  it("tik ve 20:00 nevezme poradu z minulého večera (noc 3.-4. 11. 2026)", () => {
    if (python() === undefined) return;
    expect(fresh([["2026-11-02T20:49:00", "2026-11-03T20:00:13"]])).toEqual([false]);
  });

  it("porada z téhle noci platí do rána i přes půlnoc", () => {
    if (python() === undefined) return;
    expect(fresh([
      ["2026-11-03T19:56:00", "2026-11-03T20:30:00"],
      ["2026-11-03T20:04:00", "2026-11-03T23:00:00"],
      ["2026-11-03T20:04:00", "2026-11-04T02:00:00"],
      ["2026-11-03T20:04:00", "2026-11-04T06:44:00"],
    ])).toEqual([true, true, true, true]);
  });

  it("ruční porada přes den ani včerejší noc další noc neplatí", () => {
    if (python() === undefined) return;
    expect(fresh([
      ["2026-11-03T15:00:00", "2026-11-03T20:00:00"],
      ["2026-11-03T20:04:00", "2026-11-04T19:56:00"],
    ])).toEqual([false, false]);
  });

  it("hranice je spodní okraj brány ve wrapperech", () => {
    const gate = readFileSync("scripts/scheduled/lib-night-window.ps1", "utf8")
      .match(/\$time -ge \[TimeSpan\]"(\d\d:\d\d):00"/)?.[1];
    const boundary = readFileSync(resolve(DIR, "run_night_decomposition.py"), "utf8")
      .match(/^NIGHT_BOUNDARY = "(\d\d:\d\d)"/m)?.[1];
    expect(gate).toMatch(/^\d\d:\d\d$/);
    expect(boundary).toBe(gate);
  });
});
