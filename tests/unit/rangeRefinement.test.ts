import { describe, expect, it } from "vitest";
import { rangeIndexKey } from "../../src/data/ranges/index";
import { validateRangeFile } from "../../src/data/ranges/schema";
import type { RangeRecord } from "../../src/data/ranges/schema";

/**
 * Zpřesnění range podle toho, kdo jednal před hrdinou.
 *
 * ## Proč to pole vzniklo
 *
 * `VS_OPEN` byl jeden kontext bez ohledu na otvírajícího, jenže range proti
 * otevření z UTG a z BTN je jiná. Změřeno 26. 8. 2026 na vlastníkově korpusu
 * ranží: bez `vsSeat` si **15 z 16 sdílených buněk odporuje**, až u 62 tříd ze
 * 169. Se `vsSeat` jich zbude osm a s `scenarioId` (rozložení stacků u stolu)
 * **nula**.
 *
 * Postflop tenhle rozměr nese od začátku (`SRP_CO_VS_BB`).
 */

function record(overrides: Partial<RangeRecord> = {}): RangeRecord {
  return {
    position: "BTN",
    bucket: 50,
    context: "VS_OPEN",
    lenient: { AA: ["3BET"] },
    strict: { AA: ["3BET"] },
    ...overrides,
  };
}

describe("zpřesnění range podle otvírající sedačky", () => {
  it("nechá dnešní klíč bajt po bajtu tentýž", () => {
    // Tohle je ta vlastnost, na které stojí zpětná kompatibilita. Kdyby se klíč
    // záznamu bez zpřesnění změnil, přestala by sedět uložená historie hráče a
    // Question_ID - a to je tvrdé pravidlo o migraci.
    expect(rangeIndexKey("OFF", "BTN", 50, "VS_OPEN")).toBe("OFF|BTN|50|VS_OPEN");
    expect(rangeIndexKey("OFF", "BTN", 50, "VS_OPEN", {})).toBe("OFF|BTN|50|VS_OPEN");
    expect(rangeIndexKey("OFF", "BTN", 50, "VS_OPEN", { vsSeat: undefined }))
      .toBe("OFF|BTN|50|VS_OPEN");
  });

  it("zpřesněný klíč stojí vedle obecného, ne místo něj", () => {
    const plain = rangeIndexKey("OFF", "BTN", 50, "VS_OPEN");
    const versus = rangeIndexKey("OFF", "BTN", 50, "VS_OPEN", { vsSeat: "UTG" });
    const scenario = rangeIndexKey("OFF", "BTN", 50, "VS_OPEN", {
      vsSeat: "UTG",
      scenarioId: "ICM3",
    });
    expect(new Set([plain, versus, scenario]).size).toBe(3);
    expect(versus).toBe("OFF|BTN|50|VS_OPEN|vsUTG");
    expect(scenario).toBe("OFF|BTN|50|VS_OPEN|vsUTG|#ICM3");
  });

  it("dva záznamy pro různé otvírající nejsou duplicita", () => {
    // Bez zpřesnění v klíči duplicity by legitimní pár - týž spot proti dvěma
    // sedačkám - vypadal jako jeden záznam zapsaný dvakrát a validace by ho
    // odmítla. Přesně tenhle pár korpus dodává.
    const errors = validateRangeFile({
      version: "test",
      ante: "OFF",
      entries: [
        record({ vsSeat: "UTG" }),
        record({ vsSeat: "CO" }),
      ],
    });
    expect(errors.filter((error) => error.includes("duplicate"))).toEqual([]);
  });

  it("týž záznam dvakrát zůstává duplicitou", () => {
    // Uvolnit kontrolu duplicit by bylo horší než ji nemít: dva různé záznamy
    // pod stejným klíčem znamenají, že jeden z nich hráč nikdy neuvidí.
    const errors = validateRangeFile({
      version: "test",
      ante: "OFF",
      entries: [record({ vsSeat: "UTG" }), record({ vsSeat: "UTG" })],
    });
    expect(errors.some((error) => error.includes("duplicate"))).toBe(true);
  });

  it("obecná duplicita se pozná i beze zpřesnění", () => {
    const errors = validateRangeFile({ version: "test", ante: "OFF", entries: [record(), record()] });
    expect(errors.some((error) => error.includes("duplicate"))).toBe(true);
  });
});
