import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { decide, inSolverWindow, liveLocks } from "../../scripts/hooks/guardToolUse.mjs";

/**
 * Hook Claude Code, který vynucuje tvrdá pravidla práce na DrillEV
 * (majitel 4. 11. 2026): solver se z relace nespouští, v okně solveru neběží
 * těžká práce a během testů se nemění zdroje ani deník.
 */
const REPO = "C:\\Work\\DrillEV";
const bash = (command: string) => ({ tool_name: "Bash", tool_input: { command }, cwd: "C:\\Users\\stachal" });
const edit = (filePath: string) => ({ tool_name: "Edit", tool_input: { file_path: filePath } });
const noLocks = () => [];
const lock = () => [{ name: "vitest-1.lock", kind: "vitest", pid: 1 }];
// Středa 4. 11. 2026 v 10:00 a ve 21:00, sobota v poledne, pondělí 6:59 a 7:00.
const day = new Date(2026, 10, 4, 10, 0);
const night = new Date(2026, 10, 4, 21, 0);
const saturday = new Date(2026, 10, 7, 12, 0);

describe("solver se z relace nespouští", () => {
  it("spuštění solveru nebo nočního runneru zablokuje", () => {
    for (const command of [
      `cd /c/Work/DrillEV; & "C:/Users/stachal/PKRTrainer/tools/TexasSolver/console_solver.exe" -i x.txt`,
      "Start-Process -FilePath C:\\tools\\console_solver.exe -ArgumentList x",
      "cd /c/Work/DrillEV && python Agents/solver-input/decomposition/run_night_expansion.py --limit=1",
      "py run_night_decomposition.py --until=07:00",
      "Stop-Process -Name console_solver -Force",
      // Za heredocem se solver spustit smí jen tak, že ho hook uvidí.
      "cd /c/Work/DrillEV; cat <<'EOF' > plan.txt\nnic\nEOF\npython Agents/solver-input/decomposition/run_night_expansion.py",
    ]) {
      expect(decide(bash(command), { now: day, locks: noLocks, repo: REPO }).block, command).toBe(true);
    }
  });

  it("čtení a hledání projde, i když solver jmenuje", () => {
    for (const command of [
      "cd /c/Work/DrillEV; grep -rn console_solver scripts",
      "Get-Process console_solver -ErrorAction SilentlyContinue",
      "git log -S console_solver --oneline",
      "tasklist | findstr console_solver",
      `cd /c/Work/DrillEV/Agents/solver-input/decomposition && python -c "import run_night_decomposition as d"`,
    ]) {
      expect(decide(bash(command), { now: day, locks: noLocks, repo: REPO }).block, command).toBe(false);
    }
  });
});

describe("v okně solveru neběží těžká práce", () => {
  const heavy = [
    "cd /c/Work/DrillEV; npm run build",
    "cd /c/Work/DrillEV; npm test",
    "cd /c/Work/DrillEV; npx vitest run",
    "cd /c/Work/DrillEV; npx vitest run --reporter=dot",
    "cd /c/Work/DrillEV; npm run e2e:chrome:preview > artifacts/e2e.log 2>&1",
    "cd /c/Work/DrillEV; npm run verify:day",
    "cd /c/Work/DrillEV; npm run mtt:turn-pack -- --family=X --write",
    "cd /c/Work/DrillEV; node scripts/run-cli.mjs scripts/buildRiverStrategyPacks.mts --family=X",
  ];

  it("ve všední noc i o víkendu ji zablokuje, přes den ne", () => {
    for (const command of heavy) {
      expect(decide(bash(command), { now: night, locks: noLocks, repo: REPO }).block, command).toBe(true);
      expect(decide(bash(command), { now: saturday, locks: noLocks, repo: REPO }).block, command).toBe(true);
      expect(decide(bash(command), { now: day, locks: noLocks, repo: REPO }).block, command).toBe(false);
    }
  });

  it("hranice okna: pátek 20:00 až pondělí 7:00", () => {
    expect(inSolverWindow(new Date(2026, 10, 6, 19, 59))).toBe(false);
    expect(inSolverWindow(new Date(2026, 10, 6, 20, 0))).toBe(true);
    expect(inSolverWindow(new Date(2026, 10, 8, 15, 0))).toBe(true);
    expect(inSolverWindow(new Date(2026, 10, 9, 6, 59))).toBe(true);
    expect(inSolverWindow(new Date(2026, 10, 9, 7, 0))).toBe(false);
  });

  it("lehké příkazy, jiný projekt a výslovná výjimka majitele projdou", () => {
    for (const command of [
      "cd /c/Work/DrillEV; npx vitest run tests/unit/guardToolUse.test.ts",
      "cd /c/Work/DrillEV; npm run typecheck",
      "cd /c/Work/DrillEV; npm run mtt:agenda",
      "cd /c/Work/DrillEV; DRILLEV_ALLOW_NIGHT=1 npm run build",
      "cd /c/Projects/jine; npm run build",
    ]) {
      expect(decide(bash(command), { now: night, locks: noLocks, repo: REPO }).block, command).toBe(false);
    }
  });
});

describe("během testů se nemění zdroje ani deník", () => {
  it("Edit a Write do zdrojů, testů a deníku zablokuje, jen když zámek žije", () => {
    for (const path of [
      "C:\\Work\\DrillEV\\src\\main.ts",
      "C:/Work/DrillEV/scripts/verifyDay.mts",
      "C:\\Work\\DrillEV\\tests\\unit\\x.test.ts",
      "C:\\Work\\DrillEV\\Agents\\MTT_AUTONOMY.md",
      "C:\\Work\\DrillEV\\vite.config.ts",
    ]) {
      expect(decide(edit(path), { now: day, locks: lock, repo: REPO }).block, path).toBe(true);
      expect(decide(edit(path), { now: day, locks: noLocks, repo: REPO }).block, path).toBe(false);
    }
  });

  it("logy, data noci a soubory mimo repozitář jsou volné i při zámku", () => {
    for (const path of [
      "C:\\Work\\DrillEV\\artifacts\\verify.log",
      "C:\\Work\\DrillEV\\Agents\\solver-input\\decomposition\\notes.md",
      "C:\\Users\\stachal\\AppData\\Local\\Temp\\x.py",
    ]) {
      expect(decide(edit(path), { now: day, locks: lock, repo: REPO }).block, path).toBe(false);
    }
  });

  it("shellový zápis do chráněné cesty zablokuje, čtení a log do artifacts ne", () => {
    const blocked = [
      "cd /c/Work/DrillEV; sed -i 's/a/b/' src/main.ts",
      "cd /c/Work/DrillEV; echo x > src/a.ts",
      "cd /c/Work/DrillEV; git checkout -- tests/unit/x.test.ts",
    ];
    const free = [
      "cd /c/Work/DrillEV; tail -5 artifacts/verify-day.log",
      "cd /c/Work/DrillEV; grep -n foo scripts/verifyDay.mts",
      "cd /c/Work/DrillEV; node scripts/run-cli.mjs scripts/checkBundleBudget.mts > artifacts/budget.log 2>&1",
    ];
    for (const command of blocked) {
      expect(decide(bash(command), { now: day, locks: lock, repo: REPO }).block, command).toBe(true);
    }
    for (const command of free) {
      expect(decide(bash(command), { now: day, locks: lock, repo: REPO }).block, command).toBe(false);
    }
  });

  it("zámek platí jen se živým procesem", () => {
    const directory = mkdtempSync(join(tmpdir(), "suite-lock-"));
    writeFileSync(join(directory, "vitest-live.lock"), JSON.stringify({ kind: "vitest", pid: process.pid }), "utf8");
    writeFileSync(join(directory, "vitest-dead.lock"), JSON.stringify({ kind: "vitest", pid: 999999 }), "utf8");
    writeFileSync(join(directory, "broken.lock"), "{ nejde", "utf8");
    expect(liveLocks(directory).map((found) => found.name)).toEqual(["vitest-live.lock"]);
  });
});

describe("hook, jak ho volá Claude Code", () => {
  const script = resolve("scripts/hooks/guardToolUse.mjs");
  const run = (input: unknown) => spawnSync(process.execPath, [script], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });

  it("zablokuje kódem 2 a důvod pošle na stderr", () => {
    const result = run(bash("Start-Process C:\\tools\\console_solver.exe"));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("solver se z relace nespouští");
  });

  it("povolené volání projde kódem 0 a rozbitý vstup práci nezastaví", () => {
    expect(run(bash("ls")).status).toBe(0);
    const broken = spawnSync(process.execPath, [script], { input: "{ nejde", encoding: "utf8" });
    expect(broken.status).toBe(0);
  });
});
