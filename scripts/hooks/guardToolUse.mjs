#!/usr/bin/env node
/**
 * Hook `PreToolUse` Claude Code pro práci na DrillEV: tvrdá pravidla vynucuje
 * nástroj, ne text v instrukcích.
 *
 * Majitel 4. 11. 2026 nad článkem o jednom agentovi („Tvrdá pravidla vynuťte
 * v nástroji. Prompt je doporučení a model ho občas obejde."): tři pravidla,
 * která do té doby stála jen v `CLAUDE.md`, `AGENTS.md` a skills.
 *
 * 1. **Solver se z relace nespouští.** `console_solver`, noční runnery
 *    (`run_night_expansion.py`, `run_night_decomposition.py`) a `solve_plan.py`
 *    patří nočním úlohám Plánovače; čtecí příkazy (grep, Get-Process…) projdou.
 * 2. **V okně solveru žádná těžká práce:** po-pá 20:00-07:00 a celý víkend
 *    (majitel 2. 11. 2026) neběží build, E2E, `verify:*`, celá sada testů ani
 *    generování packů. Výjimku dá majitel výslovně: `DRILLEV_ALLOW_NIGHT=1`
 *    v příkazu.
 * 3. **Zatímco běží testy, se nemění zdroje ani deník.** Sada a `verify:day`
 *    zapisují zámek do `artifacts/locks/` (`tests/suiteLock.ts`,
 *    `scripts/verifyDay.mts`); zápis do `src/`, `scripts/`, `tests/`, deníku
 *    a konfigurace se po dobu živého zámku odmítne. Hlídají se nástroje Edit
 *    a Write a shellové příkazy se zjevným zápisem do těch cest; skript
 *    spuštěný přes `python soubor.py` hook nepřečte.
 *
 * Hook je v uživatelském nastavení (`~/.claude/settings.json`), protože relace
 * se spouští z `C:\Users\stachal`, ne z repozitáře; mimo DrillEV nedělá nic.
 * Vnitřní chyba hook nezastaví práci (vrátí 0): rozbitý hlídač nesmí
 * zablokovat všechno ve všech projektech.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Kořen repozitáře podle umístění skriptu (`scripts/hooks` -> dvě patra nahoru). */
export const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const LOCK_DIR = join(REPO, "artifacts", "locks");

/** Zámek starší než tohle se bere za zapomenutý, i když jeho PID mezitím někdo dostal. */
const LOCK_MAX_AGE_MS = 3 * 60 * 60 * 1000;

const normalize = (text) => String(text ?? "").replace(/\\/g, "/").toLowerCase();

/** Tvary cesty k repozitáři, jak je píše Git Bash, PowerShell i Node. */
function repoForms(repo) {
  const forward = normalize(repo).replace(/\/+$/, "");
  const forms = [forward];
  const drive = /^([a-z]):\/(.*)$/.exec(forward);
  if (drive) forms.push(`/${drive[1]}/${drive[2]}`);
  return forms;
}

function mentionsRepo(text, repo) {
  const normalized = normalize(text);
  return repoForms(repo).some((form) => normalized.includes(form));
}

/** Cesta souboru relativně ke kořeni repozitáře, nebo `undefined` mimo něj. */
function repoRelative(filePath, repo) {
  const normalized = normalize(filePath);
  for (const form of repoForms(repo)) {
    if (normalized.startsWith(`${form}/`)) return normalized.slice(form.length + 1);
  }
  return undefined;
}

/** Části příkazu oddělené `;`, `&&`, `||`, `|` a koncem řádku. */
function segments(command) {
  return String(command ?? "").split(/;|&&|\|\||\||\r?\n/).map((part) => part.trim()).filter(Boolean);
}

/** První slovo části bez úvodních přiřazení proměnných (`FOO=1 npm run x`). */
function firstWord(segment) {
  const words = segment.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, "").split(/\s+/);
  return (words[0] ?? "").replace(/^["'&]+/, "").toLowerCase();
}

const SOLVER = /console_solver|run_night_(?:expansion|decomposition)\.py|solve_plan\.py/i;

/** Příkazy, které solver nespustí, jen o něm čtou nebo ho hledají. */
const READERS = new Set([
  "grep", "rg", "egrep", "fgrep", "cat", "head", "tail", "less", "more", "ls", "dir",
  "find", "wc", "echo", "printf", "sed", "awk", "type", "findstr", "sort", "uniq", "cut",
  "tr", "column", "jq", "stat", "file", "du", "git", "test", "select-string", "get-content",
  "get-childitem", "get-item", "get-process", "get-ciminstance", "get-wmiobject", "tasklist",
  "where-object", "select-object", "foreach-object", "measure-object", "sort-object",
  "format-table", "format-list", "out-string", "write-output", "get-scheduledtask",
  "get-scheduledtaskinfo", "schtasks",
]);

const HEAVY = [
  /\bnpm(?:\.cmd)?\s+(?:run\s+)?(?:build|test)(?![\w:-])/,
  /\bnpm(?:\.cmd)?\s+run\s+(?:e2e:[\w:-]+|verify:[\w:-]+|bundle:budget|ui:tour)/,
  /\bnpm(?:\.cmd)?\s+run\s+mtt:(?:turn-pack|river-pack|flop-pack|after-night|turn-ev-pack|turn-ev-build-probe)(?![\w-])/,
  /\bvite(?:\.js)?\s+build\b/,
  /\bvitest(?:\.mjs)?(?:\s+run)?(?=\s*(?:$|[;&|]|--))/,
  /run-cli\.mjs\s+scripts\/(?:build(?:turn|river|flop)strategypacks|runafternight|runchrome(?:preview|productionfixture)?e2e|verifyday|buildturnevpacks)\.mts/,
];

/** Okno solveru: po-pá 20:00-07:00 a celý víkend (majitel 2. 11. 2026). */
export function inSolverWindow(now) {
  const day = now.getDay();
  if (day === 0 || day === 6) return true;
  const hour = now.getHours();
  return hour >= 20 || hour < 7;
}

/** Cesty, na které se při běžících testech nesahá (relativně ke kořeni, malými). */
function protectedPath(relative) {
  return /^(?:src|scripts|tests)\//.test(relative)
    // Dokumenty v kořeni Agents (deník, plány); data noci pod nimi ne.
    || /^agents\/[^/]+\.md$/.test(relative)
    || relative === "package.json"
    || relative === "index.html"
    || /^vite\.config\.[cm]?[jt]s$/.test(relative)
    || /^tsconfig[\w.-]*\.json$/.test(relative);
}

/** Chráněná cesta, jak ji píše příkaz (relativně ke kořeni i celá). */
const PROTECTED = String.raw`(?:src|scripts|tests)/|agents/[^/\s"']+\.md|package\.json|vite\.config|tsconfig`;
/** Sloveso, které mění soubory; zápis je to až s chráněnou cestou v témže příkazu. */
const SHELL_WRITE_VERB = /\bsed\s+-i|\btee\b|(?:^|[\s;&|])(?:cp|mv|rm)\s|\bgit\s+(?:checkout|restore|stash|apply|reset)\b|set-content|add-content|out-file|copy-item|move-item|remove-item|new-item/i;
const PROTECTED_IN_COMMAND = new RegExp(String.raw`(?:^|[\s"'=/])(?:${PROTECTED})`, "i");
/** Přesměrování přímo do chráněné cesty (`> src/x.ts`); log do artifacts projde. */
const REDIRECT_INTO_PROTECTED = new RegExp(String.raw`>>?\s*["']?(?:[^\s"';&|]*/)?(?:${PROTECTED})`, "i");

/** Živé zámky sady testů: soubor existuje, PID žije a zámek není prastarý. */
export function liveLocks(lockDir = LOCK_DIR, now = Date.now()) {
  if (!existsSync(lockDir)) return [];
  const locks = [];
  for (const name of readdirSync(lockDir)) {
    if (!name.endsWith(".lock")) continue;
    const path = join(lockDir, name);
    try {
      const lock = JSON.parse(readFileSync(path, "utf8"));
      if (now - statSync(path).mtimeMs > LOCK_MAX_AGE_MS) continue;
      process.kill(Number(lock.pid), 0);
      locks.push({ name, ...lock });
    } catch {
      // mrtvý proces, rozbitý nebo právě mazaný zámek: neplatí
    }
  }
  return locks;
}

/**
 * Rozhodnutí nad vstupem hooku. Čisté kvůli testům: čas a zámky přicházejí
 * zvenku. Vrací `{ block: false }`, nebo `{ block: true, reason }`.
 */
export function decide(input, { now = new Date(), locks = () => liveLocks(), repo = REPO } = {}) {
  const tool = String(input?.tool_name ?? "");
  const toolInput = input?.tool_input ?? {};

  if (tool === "Bash" || tool === "PowerShell") {
    const command = String(toolInput.command ?? "");
    for (const segment of segments(command)) {
      if (SOLVER.test(segment) && !READERS.has(firstWord(segment))) {
        return {
          block: true,
          reason: "DrillEV: solver se z relace nespouští - patří nočním úlohám Plánovače "
            + "(console_solver, run_night_*.py, solve_plan.py). Frontu noci mění skill drillev-davka.",
        };
      }
    }
    const inRepo = mentionsRepo(command, repo) || repoRelative(input?.cwd ?? "", repo) !== undefined
      || normalize(input?.cwd ?? "") === repoForms(repo)[0];
    if (!inRepo) return { block: false };
    const lowered = normalize(command);
    if (inSolverWindow(now) && !command.includes("DRILLEV_ALLOW_NIGHT=1")
      && HEAVY.some((pattern) => pattern.test(lowered))) {
      return {
        block: true,
        reason: "DrillEV: okno solveru (po-pá 20:00-07:00, víkend celý) - build, E2E, verify, celá sada "
          + "testů ani generování packů teď neběží, stroj patří solveru. Výjimku dává jen majitel "
          + "(DRILLEV_ALLOW_NIGHT=1 v příkazu).",
      };
    }
    const writes = (SHELL_WRITE_VERB.test(lowered) && PROTECTED_IN_COMMAND.test(lowered))
      || REDIRECT_INTO_PROTECTED.test(lowered);
    const active = writes ? locks() : [];
    if (active.length > 0) {
      return {
        block: true,
        reason: `DrillEV: běží testy (${active.map((lock) => `${lock.kind} PID ${lock.pid}`).join(", ")}) - `
          + "zdroje, testy ani deník se teď nemění, výsledky by neplatily. Počkej na konec běhu.",
      };
    }
    return { block: false };
  }

  if (tool === "Edit" || tool === "Write" || tool === "NotebookEdit" || tool === "MultiEdit") {
    const relative = repoRelative(toolInput.file_path ?? toolInput.notebook_path ?? "", repo);
    if (relative === undefined || !protectedPath(relative)) return { block: false };
    const active = locks();
    if (active.length > 0) {
      return {
        block: true,
        reason: `DrillEV: běží testy (${active.map((lock) => `${lock.kind} PID ${lock.pid}`).join(", ")}) - `
          + `${relative} se teď nemění, výsledky by neplatily. Počkej na konec běhu.`,
      };
    }
  }
  return { block: false };
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const verdict = decide(JSON.parse(raw || "{}"));
  if (verdict.block) {
    process.stderr.write(`${verdict.reason}\n`);
    process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch((error) => {
    // Rozbitý hlídač nesmí zastavit práci ve všech projektech.
    process.stderr.write(`guardToolUse: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(0);
  });
}
