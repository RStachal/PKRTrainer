import { describe, expect, it } from "vitest";

import {
  depthDoesNotChangeSelection,
  preflopDepthSelection,
} from "../../src/data/ranges/preflopDepthHonesty";
import { currentMttPreflopRangePack } from "../../src/data/ranges/mttPreflopRangePacks";
import type { RangePack } from "../../src/data/ranges/rangePack";

/**
 * Hloubka, která nemění, které ruce se otevírají.
 *
 * Brána to hlásí od 18. 8. 2026 a její vlastní věta zní, že drill nesmí
 * naznačovat studium podle hloubky tam, kde je range identická. Test hlídá obojí:
 * že se to na dnešním obsahu pozná, a **že to samo zmizí**, jakmile dorazí
 * hloubkově rozlišené charty - jinak by hláška přežila data, která ji vyvrátila.
 */
describe("hloubka a výběr otevíraných rukou", () => {
  // Změřeno 3. 9. 2026 na runtime packu, tedy na tom, co hráč v modalu vidí:
  // sedm sedaček vrací napříč jedenácti kbelíky **tři** různé selekce, SB
  // **jednu**. Hláška proto svítí právě na SB a nikde jinde - a to je celý smysl
  // toho, že se počítá za běhu: kdyby SB dostal hloubkově rozlišená data,
  // přestane svítit sama.
  it("svítí na SB, kde hloubka nemění, které ruce se otevírají", () => {
    const pack = currentMttPreflopRangePack("OFF");
    const sb = preflopDepthSelection(pack, "OFF", "SB");
    expect(sb.buckets, "produkt nabízí víc hloubek než jednu").toBeGreaterThan(1);
    expect(sb.distinctSelections).toBe(1);
    expect(depthDoesNotChangeSelection(pack, "OFF", "SB")).toBe(true);
  });

  it("mlčí na sedačkách, kde se hloubky liší", () => {
    const pack = currentMttPreflopRangePack("OFF");
    const utg = preflopDepthSelection(pack, "OFF", "UTG");
    expect(utg.distinctSelections).toBeGreaterThan(1);
    expect(depthDoesNotChangeSelection(pack, "OFF", "UTG")).toBe(false);
  });

  it("mlčí, jakmile se hloubky liší výběrem rukou", () => {
    // Dvě hloubky, dvě různé selekce. Kdyby hláška zůstala i tady, tvrdila by o
    // obsahu něco, co přestalo platit - a to je horší než ji neukázat vůbec.
    const pack = {
      ...currentMttPreflopRangePack("OFF"),
      records: [
        {
          ante: "OFF", position: "UTG", bucket: 25, context: "RFI",
          lenient: { AA: ["RAISE"], KK: ["RAISE"] },
          strict: { AA: ["RAISE"], KK: ["RAISE"] },
        },
        {
          ante: "OFF", position: "UTG", bucket: 100, context: "RFI",
          lenient: { AA: ["RAISE"] },
          strict: { AA: ["RAISE"] },
        },
      ],
    } as unknown as RangePack;

    const measured = preflopDepthSelection(pack, "OFF", "UTG");
    expect(measured.buckets).toBe(2);
    expect(measured.distinctSelections).toBe(2);
    expect(depthDoesNotChangeSelection(pack, "OFF", "UTG")).toBe(false);
  });

  it("mlčí, když je nabízená hloubka jediná: tam se nic neslibuje", () => {
    const pack = {
      ...currentMttPreflopRangePack("OFF"),
      records: [{
        ante: "OFF", position: "UTG", bucket: 25, context: "RFI",
        lenient: { AA: ["RAISE"] },
        strict: { AA: ["RAISE"] },
      }],
    } as unknown as RangePack;
    expect(depthDoesNotChangeSelection(pack, "OFF", "UTG")).toBe(false);
  });
});
