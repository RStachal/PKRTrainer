import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Position, StackBucket } from "../src/core/types";
import { createMttProductionLazyLoader } from "../src/data/ranges/mttProductionLazyLoader";
import { srpSolverInputRanges } from "../src/data/ranges/solverInputRanges";
import {
  CHECKPOINT_BASE, CHIPS_PER_BB, EXPANSION_PARAMS_DIR, OPEN_TO_BB, SRP_POT_BB, srpMonolithParams,
} from "./lib/srpMonolithParams.mts";

/**
 * Přesolvit rodinu s dnešními preflop ranžemi: parametry znovu, staré
 * checkpointy a rozklad stranou, noc udělá zbytek.
 *
 *   npm run mtt:resolve-stage -- --depth=25 --defender=BB            # co by se stalo
 *   npm run mtt:resolve-stage -- --family=MTT9_25BB_HJ_BB_SRP --write
 *   npm run mtt:resolve-stage -- --depth=25 --write                  # všech 29 rodin na 25 bb
 *
 * ## Proč to musí vzniknout
 *
 * Solver bere preflop ranže z produkčního packu (`shippedPack`), a ten byl do
 * 17. 9. 2026 snímek z 16. 7. (bod 257). Všech 29 rodin na 25 bb (348 desek,
 * dosolvených 14.-17. 9.) tak stojí na ranžích, které produkt už neučí: RFI
 * o 1-10 tříd, obrana o 4-15, BB proti otevření o 94 (na 25 bb se re-jamuje,
 * stromy počítají s dorovnáním). Vlastník 22. 9. 2026 rozhodl přesolvit
 * (rozhodnutí 10a): nejdřív čtyři rodiny s BB, pak zbylých 25.
 *
 * ## Co se stane a co ne
 *
 * Pro každou desku rodiny se z dnešních ranží vyrobí parametrový soubor pod
 * **stejným jménem** (noc je čte odsud v pořadí jména). Když se tělo neliší
 * od toho na disku, deska se nechá být - přesolvit totéž je zahozená noc.
 * Starý checkpoint a rozklad desky (`artifacts/decomposition/<rodina>__<deska>`)
 * se **přesunou** do `artifacts/resolve-backup/<datum>/`, ne smažou: noční
 * expanze bere jen desky bez checkpointu a rozklad jen desky bez plánu, takže
 * bez přesunu by se nepřesolvilo nic. Packy v `src/` zůstávají staré, dokud je
 * ranní cyklus nepřestaví z nových checkpointů (flop) a nového rozkladu (turn,
 * river, turnová EV) - to je den až dva na rodinu a v tu dobu hráč vidí starý
 * strom, ne díru.
 *
 * Nic se tu nesolví. Rozklad ve 21:00 ustoupí, když je nastagováno aspoň
 * osm desek bez checkpointu, expanze je vezme v pořadí jména souboru.
 */

const argv = process.argv.slice(2);
const write = argv.includes("--write");
const families = new Set(argv.filter((arg) => arg.startsWith("--family=")).map((arg) => arg.slice("--family=".length)));
const depth = argv.find((arg) => arg.startsWith("--depth="))?.slice("--depth=".length);
const defender = argv.find((arg) => arg.startsWith("--defender="))?.slice("--defender=".length);
const WORK = "artifacts/decomposition";
const today = new Date().toISOString().slice(0, 10);
const BACKUP = join("artifacts/resolve-backup", today);

const SEATS: readonly Position[] = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
const asToken = (seat: Position): string => seat.replace("+", "_");

function parseSrpFamily(familyId: string): { depth: number; opener: Position; defender: Position } | undefined {
  const match = /^MTT9_(\d+)BB_(.+)_SRP$/.exec(familyId);
  if (match === null) return undefined;
  const body = match[2];
  const byLongest = [...SEATS].sort((left, right) => asToken(right).length - asToken(left).length);
  const opener = byLongest.find((seat) => body.startsWith(`${asToken(seat)}_`));
  if (opener === undefined) return undefined;
  const rest = body.slice(asToken(opener).length + 1);
  const found = SEATS.find((seat) => asToken(seat) === rest);
  return found === undefined ? undefined : { depth: Number(match[1]), opener, defender: found };
}

if (!existsSync(EXPANSION_PARAMS_DIR)) {
  console.error(`Složka parametrů neexistuje: ${EXPANSION_PARAMS_DIR}`);
  process.exit(2);
}

// Produkční pack se registruje lazy loaderem; bez toho by `shippedPack` nenašel
// nic a ranže by byly undefined (bod 256, past CLI bez registrace).
await createMttProductionLazyLoader().loadAll();

interface BoardFile { family: string; board: string; name: string }
const boards: BoardFile[] = [];
for (const name of readdirSync(EXPANSION_PARAMS_DIR).sort()) {
  const match = /^\d+_(MTT9_\d+BB_.+_SRP)_([^_]+)\.txt$/.exec(name);
  if (match === null) continue;
  boards.push({ family: match[1], board: match[2], name });
}

const selected = boards.filter(({ family }) => {
  if (families.size > 0) return families.has(family);
  const parsed = parseSrpFamily(family);
  if (parsed === undefined) return false;
  if (depth !== undefined && String(parsed.depth) !== depth) return false;
  if (defender !== undefined && parsed.defender !== defender) return false;
  return depth !== undefined || defender !== undefined;
});

if (selected.length === 0) {
  console.error("Nic nevybráno: zadej --family=… (opakovatelně), nebo --depth=25 [--defender=BB].");
  process.exit(2);
}

interface Plan { file: BoardFile; body: string; changed: boolean; checkpoint: string; work: string }
const plans: Plan[] = [];
const skipped: string[] = [];
for (const file of selected) {
  const parsed = parseSrpFamily(file.family);
  if (parsed === undefined) { skipped.push(`${file.family}: není SRP dvojice`); continue; }
  const ranges = srpSolverInputRanges({
    openerSeat: parsed.opener, defenderSeat: parsed.defender, bucket: parsed.depth as StackBucket, ante: "OFF",
  });
  if (ranges === undefined) { skipped.push(`${file.family}: produkční pack nemá obě ranže`); continue; }
  const body = srpMonolithParams({
    familyId: file.family, boardId: file.board,
    potChips: Math.round(SRP_POT_BB * CHIPS_PER_BB),
    stackChips: Math.round((parsed.depth - OPEN_TO_BB) * CHIPS_PER_BB),
    oop: ranges.oop, ip: ranges.ip,
  });
  const onDisk = readFileSync(join(EXPANSION_PARAMS_DIR, file.name), "utf8").replace(/\r\n/g, "\n");
  plans.push({
    file,
    body,
    changed: body !== onDisk,
    checkpoint: join(CHECKPOINT_BASE, file.family, "raw", `pkrtrainer_${file.family}_${file.board}.json`),
    work: join(WORK, `${file.family}__${file.board}`),
  });
}

const byFamily = new Map<string, Plan[]>();
for (const plan of plans) byFamily.set(plan.file.family, [...(byFamily.get(plan.file.family) ?? []), plan]);
const changed = plans.filter((plan) => plan.changed);
const withCheckpoint = changed.filter((plan) => existsSync(plan.checkpoint)).length;
const withWork = changed.filter((plan) => existsSync(plan.work)).length;

console.log("Přesolvení rodin s dnešními preflop ranžemi");
console.log("");
console.log(`vybráno: ${byFamily.size} rodin, ${plans.length} desek; parametry se liší u ${changed.length} desek`);
for (const [family, list] of byFamily) {
  const differ = list.filter((plan) => plan.changed).length;
  console.log(`  ${family.padEnd(30)} ${String(list.length).padStart(3)} desek, liší se ${String(differ).padStart(3)}`);
}
console.log(`stranou půjde: ${withCheckpoint} checkpointů, ${withWork} rozkladů → ${BACKUP}`);
// Naměřeno 16./17. 9. 2026: monolit 7,6 min na desku (max 15,8); rozklad turnu 3,8 az 14,7 min.
console.log(`odhad: monolit ${changed.length} × 7,6 min ≈ ${(changed.length * 7.6 / 60).toFixed(1)} h, rozklad turnu k tomu ≈ ${(changed.length * 9 / 60).toFixed(1)} h`);
for (const line of skipped) console.log(`  vynecháno: ${line}`);

if (!write) {
  console.log("");
  console.log("Nic nezapsáno. Zápis: přidej --write");
} else if (changed.length === 0) {
  console.log("");
  console.log("Není co přesolvit: parametry sedí na dnešní ranže.");
} else {
  mkdirSync(BACKUP, { recursive: true });
  let movedCheckpoints = 0;
  let movedWork = 0;
  for (const plan of changed) {
    if (existsSync(plan.checkpoint)) {
      const target = join(BACKUP, "checkpoints", plan.file.family, `pkrtrainer_${plan.file.family}_${plan.file.board}.json`);
      mkdirSync(dirname(target), { recursive: true });
      renameSync(plan.checkpoint, target);
      movedCheckpoints += 1;
    }
    if (existsSync(plan.work)) {
      const target = join(BACKUP, "decomposition", `${plan.file.family}__${plan.file.board}`);
      mkdirSync(dirname(target), { recursive: true });
      renameSync(plan.work, target);
      movedWork += 1;
    }
    writeFileSync(join(EXPANSION_PARAMS_DIR, plan.file.name), plan.body, "utf8");
  }
  const manifestPath = join(BACKUP, "resolve-manifest.json");
  const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) as { boards: unknown[] } : { boards: [] };
  writeFileSync(manifestPath, `${JSON.stringify({
    stagedAt: new Date().toISOString(),
    reason: "rozhodnutí vlastníka 10a (22. 9. 2026): přesolvit 25bb rodiny s dnešními preflop ranžemi (bod 257)",
    boards: [...previous.boards, ...changed.map((plan) => ({ family: plan.file.family, board: plan.file.board, parameters: plan.file.name }))],
  }, null, 2)}\n`, "utf8");
  console.log("");
  console.log(`Zapsáno ${changed.length} parametrů, stranou ${movedCheckpoints} checkpointů a ${movedWork} rozkladů (${manifestPath}).`);
  console.log("Solve je noční monolitický běh (PKRTrainer-Night-Expansion); rozklad ve 21:00 ustoupí, když je desek aspoň 8.");
  console.log("Po dosolvení a rozkladu: npm run mtt:after-night -- --write --family=<rodina> (flop z checkpointů, turn a river z rozkladu).");
}
