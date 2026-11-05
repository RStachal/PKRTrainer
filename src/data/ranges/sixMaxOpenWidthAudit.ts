import { ALL_HAND_CLASSES } from "../../core/poker";
import type { AnteMode, Position } from "../../core/types";
import type { BlindSpeed } from "../../core/trainingProfile";
import type { RangePack, RangePackRecord } from "./rangePack";
import { mttSixMaxDerivedRangePack } from "./mttPreflopRangePacks";
import {
  SIX_MAX_OPEN_WIDTH_REFERENCES,
  type SixMaxOpenWidthReference,
} from "./sixMaxOpenWidthReference";

/**
 * Kontrola odvozeného šestistolového packu proti vnějšímu měřítku.
 *
 * Odvození přeznačí devítistolový záznam na sedačku se stejným počtem soupeřů
 * za sebou. Je vnitřně konzistentní, ale to o jeho správnosti neříká nic —
 * jediné, s čím ho repozitář uměl porovnat, byl zdroj, ze kterého vznikl.
 *
 * Tahle kontrola porovnává šířky otevíracích rangí s publikovanými hodnotami.
 * Neříká, že je pack správný; říká, jestli není mimo. To je slabší tvrzení a
 * přesně to, co jde s veřejnými souhrny poctivě udělat.
 */

const COMBOS = (handClass: string): number => (
  handClass.length === 2 ? 6 : handClass.endsWith("s") ? 4 : 12
);

const TOTAL_COMBOS = ALL_HAND_CLASSES.reduce((sum, hand) => sum + COMBOS(hand), 0);

/** Klíče, které v tabulkách znamenají „otevírám". */
function isOpenAction(key: string): boolean {
  return key === "RAISE" || key === "ALLIN" || key.startsWith("OPEN");
}

/** Podíl kombinací, které daný záznam otevírá, v procentech. */
export function openWidthPct(record: RangePackRecord): number {
  let combos = 0;
  for (const [hand, keys] of Object.entries(record.strict)) {
    if (keys.some(isOpenAction)) combos += COMBOS(hand);
  }
  return (combos / TOTAL_COMBOS) * 100;
}

export interface SixMaxOpenWidthFinding {
  stackBB: number;
  position: Position;
  actualPct: number;
  minPct: number;
  maxPct: number;
  /** O kolik bodů je mimo pásmo; nula, když je uvnitř. */
  deviationPct: number;
  inBand: boolean;
}

export interface SixMaxOpenWidthAudit {
  packId: string;
  findings: readonly SixMaxOpenWidthFinding[];
  /** Sedačky mimo pásmo, seřazené od nejhorší. */
  outOfBand: readonly SixMaxOpenWidthFinding[];
  /** Průměrná odchylka od nejbližší meze, v bodech. */
  meanDeviationPct: number;
}

/**
 * Kolik bodů se připočte k horní mezi, když pack hraje s ante.
 *
 * Publikovaná pásma jsou bez ante. Ante zlepšuje pot odds otevírajícího, takže
 * se otevírá šířeji - a pack s ante, který se do bezantového pásma vejde, by byl
 * spíš podezřelý než v pořádku. Tři body jsou konzervativní odhad; bez měřených
 * antových šestistolových frekvencí je to volba, ne odvozené číslo, a je tady
 * napsaná proto, aby ji šlo najít a přepsat.
 */
const ANTE_WIDTH_ALLOWANCE_PCT = 3;

export function auditSixMaxOpenWidths(
  pack: RangePack,
  references: readonly SixMaxOpenWidthReference[] = SIX_MAX_OPEN_WIDTH_REFERENCES,
): SixMaxOpenWidthAudit {
  const findings: SixMaxOpenWidthFinding[] = [];
  const anteAllowance = pack.dimensions.ante === "ON" ? ANTE_WIDTH_ALLOWANCE_PCT : 0;

  for (const reference of references) {
    for (const band of reference.bands) {
      const record = pack.records.find((candidate) => (
        candidate.context === "RFI" &&
        candidate.position === band.position &&
        candidate.bucket === reference.stackBB
      ));
      // Hloubka, kterou pack nezná, není nález — pásmo pokrývá víc hloubek, než
      // kolik jich měřená data mají, a hlásit chybějící řádek jako odchylku by
      // mísilo dvě různé věci.
      if (record === undefined) continue;

      const actualPct = openWidthPct(record);
      const maxPct = band.maxPct + anteAllowance;
      const deviationPct = actualPct < band.minPct
        ? band.minPct - actualPct
        : actualPct > maxPct ? actualPct - maxPct : 0;
      findings.push({
        stackBB: reference.stackBB,
        position: band.position,
        actualPct: Math.round(actualPct * 10) / 10,
        minPct: band.minPct,
        maxPct,
        deviationPct: Math.round(deviationPct * 10) / 10,
        inBand: deviationPct === 0,
      });
    }
  }

  const outOfBand = findings
    .filter((finding) => !finding.inBand)
    .sort((left, right) => right.deviationPct - left.deviationPct);
  const meanDeviationPct = findings.length === 0
    ? 0
    : Math.round((findings.reduce((sum, f) => sum + f.deviationPct, 0) / findings.length) * 100) / 100;

  return { packId: pack.id, findings, outOfBand, meanDeviationPct };
}

export function auditAllSixMaxDerivedPacks(): SixMaxOpenWidthAudit[] {
  const audits: SixMaxOpenWidthAudit[] = [];
  for (const blindSpeed of ["REGULAR"] as const satisfies readonly BlindSpeed[]) {
    for (const ante of ["OFF", "ON"] as const satisfies readonly AnteMode[]) {
      audits.push(auditSixMaxOpenWidths(mttSixMaxDerivedRangePack(blindSpeed, ante)));
    }
  }
  return audits;
}

export function renderSixMaxOpenWidthReport(audits: readonly SixMaxOpenWidthAudit[]): string {
  const lines: string[] = ["Šestistolové otevírací šířky proti veřejnému pásmu", ""];
  for (const audit of audits) {
    lines.push(`${audit.packId}  průměrná odchylka ${audit.meanDeviationPct} b.`);
    for (const finding of audit.findings) {
      const mark = finding.inBand ? "ok  " : "MIMO";
      lines.push(
        `  ${mark} ${finding.position.padEnd(4)} ${String(finding.stackBB).padStart(3)}BB  ` +
        `${finding.actualPct.toFixed(1)}%  pásmo ${finding.minPct}-${finding.maxPct}%` +
        (finding.inBand ? "" : `  (o ${finding.deviationPct.toFixed(1)} b. mimo)`),
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
