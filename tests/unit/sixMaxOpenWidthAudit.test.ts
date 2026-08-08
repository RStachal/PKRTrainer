import { describe, expect, it } from "vitest";

import {
  auditAllSixMaxDerivedPacks,
  auditSixMaxOpenWidths,
  openWidthPct,
} from "../../src/data/ranges/sixMaxOpenWidthAudit";
import { mttSixMaxDerivedRangePack } from "../../src/data/ranges/mttPreflopRangePacks";
import { SIX_MAX_OPEN_WIDTH_REFERENCES } from "../../src/data/ranges/sixMaxOpenWidthReference";

/**
 * Šestistolový pack je odvozený a do teď se neměl s čím porovnat.
 *
 * Odvození přeznačí devítistolový záznam na sedačku se stejným počtem soupeřů za
 * sebou. Vnitřně konzistentní být může a přesto být mimo - a jediné, s čím ho
 * repozitář uměl srovnat, byl zdroj, ze kterého vznikl. Kontrolu proti veřejně
 * uváděným frekvencím hlídají tyhle testy, aby se odvození nemohlo posunout,
 * aniž by si toho někdo všiml.
 */
describe("šestistolové otevírací šířky", () => {
  it("drží každou sedačku uvnitř veřejně uváděného pásma", () => {
    for (const audit of auditAllSixMaxDerivedPacks()) {
      expect(audit.findings.length).toBeGreaterThan(0);
      expect(audit.outOfBand.map((finding) => (
        `${finding.position} ${finding.stackBB}BB ${finding.actualPct}% mimo ${finding.minPct}-${finding.maxPct}%`
      ))).toEqual([]);
    }
  });

  it("zachovává pořadí sedaček: čím blíž buttonu, tím šířeji", () => {
    // Tohle pásmo samo o sobě neuhlídá - do pásma se vejde i pack, který otevírá
    // z UTG šířeji než z cutoffu. Poziční pořadí je vlastnost, kterou odvození
    // buď má, nebo je celé špatně.
    const pack = mttSixMaxDerivedRangePack("REGULAR", "OFF");
    for (const bucket of [40, 100]) {
      const width = (position: string) => {
        const record = pack.records.find((candidate) => (
          candidate.context === "RFI" && candidate.position === position && candidate.bucket === bucket
        ));
        return record ? openWidthPct(record) : undefined;
      };
      const utg = width("UTG");
      const hj = width("HJ");
      const co = width("CO");
      const btn = width("BTN");
      expect(utg).toBeDefined();
      expect(utg!).toBeLessThan(hj!);
      expect(hj!).toBeLessThan(co!);
      expect(co!).toBeLessThan(btn!);
    }
  });

  it("povolí s ante širší otevírání, protože pásma jsou bez něj", () => {
    const anteOn = mttSixMaxDerivedRangePack("REGULAR", "ON");
    const anteOff = mttSixMaxDerivedRangePack("REGULAR", "OFF");
    const widthAt = (pack: typeof anteOn, position: string) => {
      const record = pack.records.find((candidate) => (
        candidate.context === "RFI" && candidate.position === position && candidate.bucket === 40
      ));
      return record ? openWidthPct(record) : 0;
    };
    // S ante se otevírá šířeji - kdyby ne, byl by podezřelý pack, ne pásmo.
    expect(widthAt(anteOn, "BTN")).toBeGreaterThan(widthAt(anteOff, "BTN"));
  });

  it("neoznačí za odchylku hloubku, kterou pack vůbec nezná", () => {
    const audit = auditSixMaxOpenWidths(mttSixMaxDerivedRangePack("REGULAR", "OFF"), [
      {
        stackBB: 999,
        sourceUrls: [],
        note: "hloubka, která v datech není",
        bands: [{ position: "UTG", minPct: 0, maxPct: 1 }],
      },
    ]);
    expect(audit.findings).toEqual([]);
    expect(audit.outOfBand).toEqual([]);
  });

  it("nese u každého pásma zdroj, ze kterého pochází", () => {
    for (const reference of SIX_MAX_OPEN_WIDTH_REFERENCES) {
      expect(reference.sourceUrls.length).toBeGreaterThan(0);
      expect(reference.bands.length).toBeGreaterThan(0);
      for (const band of reference.bands) {
        expect(band.minPct).toBeLessThan(band.maxPct);
      }
    }
  });
});
