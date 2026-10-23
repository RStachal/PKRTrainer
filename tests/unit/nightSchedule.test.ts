import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rozvrh noci: kdy smí solver běžet a kdy má skončit.
 *
 * Od 15. 10. 2026 je stroj na 100 % po-pá 21-7 a celý víkend (majitel). Konec
 * okna proto počítá wrapper (`Get-NightDeadline`) a předává runneru absolutně
 * (`parse_until`), protože o víkendu okno přesahuje den. Víkendový režim se
 * zapíná jen s víkendovým rozvrhem v Plánovači; bez něj se má všechno chovat
 * přesně jako dřív - a právě to drží první sada.
 *
 * Testy spouští **skutečný** kód: PowerShell knihovnu wrapperů a Python runner.
 * Napodobenina by prošla i tehdy, kdyby se originál rozešel.
 */

const LIB = resolve("scripts/scheduled/lib-night-window.ps1");
const RUNNER = "Agents/solver-input/decomposition/run_night_decomposition.py";
const onWindows = process.platform === "win32";

function powershell(body: string): string {
  const script = `. '${LIB}'\n${body}`;
  const out = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
  });
  expect(out.status, out.stderr).toBe(0);
  return out.stdout.trim();
}

const deadline = (now: string, weekend: boolean): string => powershell(
  `Get-NightDeadline -Weekend $${weekend} -Now ([datetime]'${now}')`,
);

describe.skipIf(!onWindows)("konec okna (Get-NightDeadline)", () => {
  it("bez víkendového rozvrhu je to vždycky nejbližší 07:00 - jako dřív", () => {
    expect(deadline("2026-10-19T21:01", false)).toBe("2026-10-20T07:00");
    expect(deadline("2026-10-23T21:01", false)).toBe("2026-10-24T07:00");
    expect(deadline("2026-10-24T21:01", false)).toBe("2026-10-25T07:00");
  });

  it("s rozvrhem končí páteční noc v sobotu v 07:00 - sobotní ráno patří plnému cyklu", () => {
    expect(deadline("2026-10-23T21:01", true)).toBe("2026-10-24T07:00");
  });

  it("s rozvrhem jede solver od soboty po cyklu až do pondělní sedmé", () => {
    expect(deadline("2026-10-24T12:00", true)).toBe("2026-10-26T07:00");
    expect(deadline("2026-10-24T21:01", true)).toBe("2026-10-26T07:00");
    expect(deadline("2026-10-25T03:00", true)).toBe("2026-10-26T07:00");
  });

  it("ve všední noc s rozvrhem nic nemění", () => {
    expect(deadline("2026-10-21T21:01", true)).toBe("2026-10-22T07:00");
  });
});

describe.skipIf(!onWindows)("brána okna (Test-NightWindow) a zámek plného cyklu", () => {
  const window = (now: string, weekend: boolean, repo: string): string => powershell(
    `Test-NightWindow -Log '${join(repo, "night.log")}' -Weekend $${weekend} -Repo '${repo}' -Now ([datetime]'${now}')`,
  );
  const repoWith = (files: Record<string, string>): string => {
    const repo = mkdtempSync(join(tmpdir(), "night-window-"));
    powershell([
      `New-Item -ItemType Directory -Path '${join(repo, "artifacts")}' -Force | Out-Null`,
      ...Object.entries(files).map(([name, value]) => (
        `Set-Content -Path '${join(repo, "artifacts", name)}' -Value '${value}' -Encoding ascii`
      )),
    ].join("\n"));
    return repo;
  };

  it("noc pouští vždycky, den ve všední den nikdy", () => {
    const repo = repoWith({});
    expect(window("2026-10-21T22:00", false, repo)).toBe("True");
    expect(window("2026-10-21T12:00", true, repo)).toBe("False");
  });

  it("víkend přes den jen s rozvrhem; v neděli bez podmínek", () => {
    const repo = repoWith({});
    expect(window("2026-10-25T12:00", false, repo)).toBe("False");
    expect(window("2026-10-25T12:00", true, repo)).toBe("True");
  });

  it("v sobotu solver počká na plný cyklus - nejdéle do desíti, když se nespustí", () => {
    const repo = repoWith({});
    expect(window("2026-10-24T08:00", true, repo)).toBe("False");
    expect(window("2026-10-24T11:00", true, repo)).toBe("True");
  });

  it("zámek s mrtvým PID neblokuje, solver jede", () => {
    const repo = repoWith({ "pack-cycle.lock": "999999" });
    expect(powershell(`Test-PackCycleRunning -Repo '${repo}'`)).toBe("False");
  });
});

describe("parse_until v runneru", () => {
  function python(): string | undefined {
    for (const candidate of ["python3", "python"]) {
      const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
      if (probe.status === 0) return candidate;
    }
    return undefined;
  }

  it("HH:MM je nejbližší takový čas, datum je přesný okamžik", () => {
    const interpreter = python();
    if (interpreter === undefined) return;
    const out = spawnSync(interpreter, ["-c", [
      "import importlib.util, sys",
      `sys.path.insert(0, ${JSON.stringify(resolve("Agents/solver-input/decomposition"))})`,
      `spec = importlib.util.spec_from_file_location('rnd', ${JSON.stringify(RUNNER)})`,
      "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
      "from datetime import datetime",
      "friday = datetime(2026, 10, 23, 21, 1)",
      "print(m.parse_until('07:00', friday))",
      "print(m.parse_until('2026-10-26T07:00', friday))",
      "print(m.MAX_ABSOLUTE_WINDOW_HOURS >= 58)",
    ].join("\n")], { encoding: "utf8" });
    expect(out.status, out.stderr).toBe(0);
    expect(out.stdout.trim().split(/\r?\n/)).toEqual([
      "(datetime.datetime(2026, 10, 24, 7, 0), False)",
      "(datetime.datetime(2026, 10, 26, 7, 0), True)",
      "True",
    ]);
  });
});
