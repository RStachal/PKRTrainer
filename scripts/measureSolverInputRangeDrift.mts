import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Position, StackBucket } from "../src/core/types";
import { srpSolverInputRanges } from "../src/data/ranges/solverInputRanges.ts";
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";

/**
 * Sedí vstupní ranže solvu na produkční preflop ranže?
 *
 *   npm run mtt:solver-range-drift
 *
 * ## Proč to musí vzniknout
 *
 * Třetí čtení pilotů 14. 9. 2026 zamítlo BTN vs BB c-bet s tím, že range
 * **není otevírací range BTN**: chybí A9s az A7s, K9s az K6s a 22 az 44, ale
 * jsou tam K5s, K4s, 53s, 43s. Ověřeno v parametrech solvu
 * `MTT9_50BB_BTN_BB_SRP`: `set_range_ip` je přesně takhle. Ranže starších
 * rodin se psaly rukou v červenci (šablony dávek), kdežto od 20. 8. 2026 se
 * berou z produkčních preflop packů (`srpSolverInputRanges`). Pilot je
 * agregát těchto rodin, takže čtení nemohlo dopadnout jinak - a totéž stojí
 * pod flopovým, turnovým i riverovým packem té rodiny.
 *
 * Tenhle skript to změří pro všechny SRP rodiny s parametry na disku: kolik
 * tříd má solver navíc proti produkční range otvírače a obránce, kolik mu
 * chybí. Rodina s nulou oběma směry stojí na tom, co trenažér učí preflop;
 * rodina s desítkami tříd rozdílu stojí na něčem jiném.
 */

const PARAM_ROOT = "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters";
const SEATS: readonly Position[] = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
const asToken = (seat: Position) => seat.replace("+", "_");

function parseSrpFamily(familyId: string): { depth: number; opener: Position; defender: Position } | undefined {
  const match = /^MTT9_(\d+)BB_(.+?)_SRP(?:_.*)?$/.exec(familyId);
  if (match === null) return undefined;
  const body = match[2];
  const byLongest = [...SEATS].sort((left, right) => asToken(right).length - asToken(left).length);
  const opener = byLongest.find((seat) => body.startsWith(`${asToken(seat)}_`));
  if (opener === undefined) return undefined;
  const rest = body.slice(asToken(opener).length + 1);
  const defender = SEATS.find((seat) => asToken(seat) === rest);
  return defender === undefined ? undefined : { depth: Number(match[1]), opener, defender };
}

/** `AKo:0.25,AQs,KQ` na množinu tříd; `KQ` bez přípony je KQs i KQo. */
function classesOf(spec: string): Set<string> {
  const out = new Set<string>();
  for (const token of spec.split(",")) {
    const name = token.trim().split(":")[0];
    if (name === "") continue;
    if (/^[AKQJT98765432]{2}$/.test(name) && name[0] !== name[1]) {
      out.add(`${name}s`);
      out.add(`${name}o`);
    } else {
      out.add(name);
    }
  }
  return out;
}

/** Jeden parametrový soubor na rodinu: kterýkoli, ranže jsou v rodině stejné. */
function paramFileByFamily(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, name.name);
      if (name.isDirectory()) { walk(path); continue; }
      if (!name.name.endsWith(".txt")) continue;
      const stem = name.name.replace(/^\d+_/, "").replace(/\.txt$/, "");
      const match = /^(MTT9_\d+BB_.+?_(?:SRP|3BP)(?:_[A-Z]+)*)_[^_]+$/.exec(stem);
      if (match !== null && !out.has(match[1])) out.set(match[1], path);
    }
  };
  if (existsSync(PARAM_ROOT)) walk(PARAM_ROOT);
  return out;
}

await loadCompleteMttProductionRegistry();

const rows: { family: string; side: string; extra: string[]; missing: string[] }[] = [];
let skipped = 0;
for (const [family, path] of [...paramFileByFamily()].sort()) {
  const parsed = parseSrpFamily(family);
  if (parsed === undefined) { skipped += 1; continue; }
  const bucket = parsed.depth as StackBucket;
  const production = srpSolverInputRanges({ openerSeat: parsed.opener, defenderSeat: parsed.defender, bucket, ante: "OFF" });
  if (production === undefined) { skipped += 1; continue; }
  const text = readFileSync(path, "utf8");
  const ip = /set_range_ip\s+([^\r\n]+)/.exec(text)?.[1] ?? "";
  const oop = /set_range_oop\s+([^\r\n]+)/.exec(text)?.[1] ?? "";
  for (const [side, spec, expected] of [
    ["IP", ip, production.ip],
    ["OOP", oop, production.oop],
  ] as const) {
    const solver = classesOf(spec);
    const wanted = new Set(Object.keys(expected));
    const extra = [...solver].filter((c) => !wanted.has(c)).sort();
    const missing = [...wanted].filter((c) => !solver.has(c)).sort();
    rows.push({ family, side, extra, missing });
  }
}

console.log("Sedí vstupní ranže solvu na produkční preflop ranže?");
console.log("");
console.log(`rodin SRP s parametry: ${rows.length / 2}; přeskočeno (3BP, bez produkční range): ${skipped}`);
console.log("");
const drifted = rows.filter((row) => row.extra.length + row.missing.length > 0);
console.log(`stran s rozdílem: ${drifted.length} z ${rows.length}`);
console.log("");
console.log("rodina                                     strana  navíc  chybí  příklady");
for (const row of [...drifted].sort((l, r) => (r.extra.length + r.missing.length) - (l.extra.length + l.missing.length))) {
  const sample = [...row.extra.slice(0, 4).map((c) => `+${c}`), ...row.missing.slice(0, 4).map((c) => `-${c}`)].join(" ");
  console.log(`${row.family.padEnd(42)} ${row.side.padEnd(6)} ${String(row.extra.length).padStart(5)}  ${String(row.missing.length).padStart(5)}  ${sample}`);
}
const families = new Set(drifted.map((row) => row.family));
console.log("");
console.log(`rodin, které stojí na jiné range než produkce: ${families.size} z ${rows.length / 2}`);
