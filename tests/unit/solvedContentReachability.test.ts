import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildMttPostflopTrainingRuntime } from "../../src/data/ranges/mttPostflopTrainingRuntime";
import { grantsForTier } from "../../src/core/paymentEntitlements";
import { loadAllSolvedTurnPacks } from "../../src/data/ranges/turnSolvedStrategyPacks";
import type { PostflopStreet } from "../../src/core/postflopGenerator";
import type { TrainingProfile } from "../../src/core/trainingProfile";

/**
 * Pojistka proti tomu, aby vyřešený obsah zase někde ležel bez cesty k hráči.
 *
 * Turn strávil týdny ve stavu, kdy existoval, stahoval se na začátku relace a
 * runtime se ho nikdy na nic nezeptal - produkční větev ho nepustila, dokud
 * nebyl celý profil PRODUCTION, a pilotní katalog byl flopový. Zvenku to
 * vypadalo úplně stejně, jako by ten obsah neexistoval, a našlo se to až
 * náhodou.
 *
 * River na tom bude stejně: nástroje jsou hotové a obsah přijde z nočních běhů.
 * Tenhle test si proto sám najde manifesty vyřešeného obsahu na disku a pro
 * každou ulici, která nějaký má, ověří, že runtime umí vydat resolver. Až vznikne
 * riverový manifest, spadne to hned - ne za měsíc.
 */
const MANIFEST_STREETS: readonly { street: PostflopStreet; marker: string }[] = [
  { street: "TURN", marker: "turnSolvedManifest.generated" },
  { street: "RIVER", marker: "riverSolvedManifest.generated" },
];

function manifestsOnDisk(): string[] {
  return readdirSync("src/data/ranges").filter((name) => name.includes("SolvedManifest.generated"));
}

describe("dosažitelnost vyřešeného obsahu", () => {
  it("každá ulice s manifestem umí vydat resolver", async () => {
    await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
    const present = manifestsOnDisk();
    const grants = grantsForTier("PRO_PLUS", { startsAt: "2020-01-01T00:00:00Z" });

    const checked: PostflopStreet[] = [];
    for (const { street, marker } of MANIFEST_STREETS) {
      if (!present.some((name) => name.startsWith(marker.split(".")[0]))) continue;
      checked.push(street);
      const profile: TrainingProfile = {
        gameVariant: "MTT", tableFormat: "FULL_RING_9", blindSpeed: "REGULAR",
        street, evModel: "CHIP_EV", ante: "OFF", rakeMode: "NONE",
      };
      const runtime = buildMttPostflopTrainingRuntime({ profile, grants });
      // Manifest existuje, obsah se tedy dodává - a runtime pro něj musí mít
      // větev. `PREVIEW_FALLBACK` s prázdným resolverem tady znamená, že se
      // stahuje něco, na co se nikdo nezeptá.
      expect({ street, mode: runtime.mode }).toEqual({ street, mode: "SCOPED_PILOT" });
      expect(runtime.resolver).not.toBeNull();
    }
    // Kdyby seznam přestal odpovídat souborům na disku, test by tiše nekontroloval
    // nic. Aspoň jedna ulice musí projít.
    expect(checked.length).toBeGreaterThan(0);
  });

  it("nový manifest na disku má odpovídající řádek v seznamu", () => {
    // Bez tohohle by se dal přidat riverový manifest a test výše by ho přehlédl,
    // protože by o něm nevěděl. Tady se to pozná: soubor je, řádek chybí.
    const known = MANIFEST_STREETS.map((item) => item.marker.split(".")[0]);
    for (const name of manifestsOnDisk()) {
      const stem = name.split(".")[0];
      expect(known).toContain(stem);
    }
  });
});
