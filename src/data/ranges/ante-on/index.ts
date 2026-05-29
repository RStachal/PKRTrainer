/**
 * Referenční ranges — varianta **ante-on** (Big_blind_ante aktivní).
 *
 * Tento modul je data (žádná logika ani I/O): exportuje hotový `RangeFile`
 * sestavený generátorem `buildAnteRangeFile`. Při zapnutém ante jsou ranges
 * mírně širší (ante přidává mrtvé peníze do potu — Req 5.2). Strategie je cEV
 * bez ICM (Req 4.9).
 *
 * Data jsou indexovaná podle Pozice × Hloubkový_koš × akční kontext (Req 4.2).
 * Agregaci přes varianty a vynucení celkové integrity řeší `ranges/index.ts`
 * (task 5.3); lookup API `ranges/../rangeStore.ts` (task 5.4).
 *
 * _Requirements: 4.1, 4.2, 4.9, 5.2_
 */

import type { RangeFile } from "../schema";
import { buildAnteRangeFile } from "../strategy";

/** Verze datové sady ante-on (pro budoucí migrace dat). */
export const ANTE_ON_VERSION = "1.0.0";

/** Kompletní `RangeFile` pro hru s ante (ante-on). */
export const anteOnRanges: RangeFile = buildAnteRangeFile("ON", ANTE_ON_VERSION);

export default anteOnRanges;
