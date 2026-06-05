/**
 * Referenční ranges — varianta **ante-off** (Big_blind_ante vypnuté).
 *
 * Tento modul je data (žádná logika ani I/O): exportuje hotový `RangeFile`
 * sestavený generátorem `buildAnteRangeFile`. Bez ante je pot menší, break-even
 * body jsou přísnější a ranges jsou proto užší než ante-on varianta (Req 5.3).
 * Strategie je cEV bez ICM (Req 4.9).
 *
 * Data jsou indexovaná podle Pozice × Hloubkový_koš × akční kontext (Req 4.2).
 * Agregaci přes varianty a vynucení celkové integrity řeší `ranges/index.ts`
 * (task 5.3); lookup API `ranges/../rangeStore.ts` (task 5.4).
 *
 * _Requirements: 4.1, 4.2, 4.9, 5.3_
 */

import type { RangeFile } from "../schema";
import { createLazyRangeFile } from "../lazyRangeFile";
import { buildAnteRangeFile } from "../strategy";

/** Verze datové sady ante-off (pro budoucí migrace dat). */
export const ANTE_OFF_VERSION = "1.0.0";

/** Kompletní `RangeFile` pro hru bez ante (ante-off). */
export const anteOffRanges: RangeFile = createLazyRangeFile(
  "OFF",
  ANTE_OFF_VERSION,
  () => buildAnteRangeFile("OFF", ANTE_OFF_VERSION).entries,
);

export default anteOffRanges;
