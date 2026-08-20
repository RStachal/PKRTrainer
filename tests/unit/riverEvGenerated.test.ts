import { describe, expect, it } from "vitest";

import { decodeComboMask, evTableLength } from "../../src/core/evCodec";
import { riverEvManifest } from "../../src/data/ranges/riverEvManifest.generated";
import { readRiverEv, riverEvMatchesPack, type RiverEvPack } from "../../src/data/ranges/riverEvPack";
import { solvedRiverManifest } from "../../src/data/ranges/riverSolvedManifest.generated";
import type { RiverStrategyPack } from "../../src/data/ranges/riverSolvedRuntimeRegistry";

/**
 * Vygenerovaná EV proti vygenerované rodině.
 *
 * Syntetická data ověří čtečku, ale ne to, jestli si generátor a čtečka rozumí -
 * a právě tam vznikají tiché chyby: hodnoty seřazené jinak než bity masky,
 * tabulka přegenerovaná k jiné podobě packu, počet akcí posunutý o jednu. Nic z
 * toho není na datech vidět; pack i tabulka zůstanou tvarem v pořádku.
 *
 * Tenhle test proto sahá na to, co se dodává.
 */
const MODULE_BUDGET_BYTES = 512 * 1024;

async function loadPair(packId: string): Promise<{ pack: RiverStrategyPack; table: RiverEvPack }> {
  const packEntry = solvedRiverManifest.find((item) => item.packId === packId)!;
  const evEntry = riverEvManifest.find((item) => item.packId === packId)!;
  return { pack: await packEntry.load() as RiverStrategyPack, table: await evEntry.load() };
}

describe("vygenerovaná EV k vygenerované rodině", () => {
  it("manifest EV odkazuje jen na rodiny, které se dodávají", () => {
    for (const entry of riverEvManifest) {
      expect(
        solvedRiverManifest.some((pack) => pack.packId === entry.packId),
        `EV bez rodiny: ${entry.packId}`,
      ).toBe(true);
    }
  });

  for (const entry of riverEvManifest) {
    describe(entry.familyId, () => {
      it("otisk sedí na dodávanou podobu rodiny", async () => {
        // Přegenerovat jedno a druhé ne je nejsnazší způsob, jak hráči ukázat
        // čísla k jiné strategii. Runtime to pozná podle otisku, ale až za běhu;
        // tady se to pozná při sadě.
        const { pack, table } = await loadPair(entry.packId);
        expect(riverEvMatchesPack(table, pack)).toBe(true);
      });

      it("vejde se do rozpočtu líného chunku", async () => {
        const { table } = await loadPair(entry.packId);
        const bytes = Buffer.byteLength(JSON.stringify(table), "utf8");
        expect(bytes, `${(bytes / 1024).toFixed(1)} KiB`).toBeLessThanOrEqual(MODULE_BUDGET_BYTES);
      });

      it("každý řádek nese tolik hodnot, kolik má pravidlo akcí", async () => {
        const { pack, table } = await loadPair(entry.packId);
        let checked = 0;
        for (const [index, row] of table.rules.entries()) {
          if (row === null) continue;
          const actions = pack.rules[index]?.actions.length;
          expect(actions, `pravidlo ${index} chybí v rodině`).toBeGreaterThan(0);
          const combos = decodeComboMask(row.m, table.combos.length).length;
          // Nerovnost by znamenala posun o akci: EV složení u sázky.
          expect(evTableLength(row.v), `řádek ${index}`).toBe(combos * actions!);
          checked += 1;
        }
        expect(checked).toBeGreaterThan(0);
      });

      it("na ruku, kterou pravidlo řeší, vydá EV v rozumném rozsahu", async () => {
        const { pack, table } = await loadPair(entry.packId);
        const lookup = readRiverEv(table, (index) => pack.rules[index]?.actions.length);
        const index = table.rules.findIndex((row) => row !== null);
        const row = table.rules[index]!;
        const combos = decodeComboMask(row.m, table.combos.length);
        const values = lookup.forCombo(index, table.combos[combos[0]]);
        expect(values, "první kombinace prvního řádku nemá EV").toBeDefined();
        expect(values!.some((value) => value !== null)).toBe(true);
        // Rozsah je hrubý schválně: jde o to chytit záměnu jednotek. Kdyby se
        // někde vrátily žetony místo blindů, čísla vyskočí o řád.
        const stack = pack.rules[index].stackBB;
        for (const value of values!) {
          if (value === null) continue;
          expect(Math.abs(value), `EV ${value} BB proti hloubce ${stack} BB`)
            .toBeLessThanOrEqual(stack * 4);
        }
      });
    });
  }
});
