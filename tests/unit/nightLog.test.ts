import { describe, expect, it } from "vitest";

import { nightFamilyRows } from "../../scripts/lib/nightLog.mts";

/**
 * Souhrn noci po rodinách se od 8. do 14. 9. 2026 nečetl vůbec: výraz přišel
 * o zpětná lomítka a nečekal časovou značku, kterou runner před každý řádek
 * dává. Řádky níž jsou opsané z `night.log` z 14. 9. 2026 - včetně CRLF.
 */
describe("nightFamilyRows", () => {
  it("čte řádky se značkou runneru a CRLF tak, jak je píše run_night_decomposition.py", () => {
    const rows = nightFamilyRows([
      "[06:56:47] river phase: 223 turnových podher dostalo riverovou vrstvu; vrstva 2.7 min medián, 9.9 max\r",
      "[06:56:47]      1 vrstev,    140 podher do MTT9_25BB_CO_BTN_SRP\r",
      "[06:56:47]     12 vrstev,   1856 podher do MTT9_25BB_UTG_1_BTN_SRP\r",
      "",
    ]);
    expect(rows).toEqual([
      { layers: 1, games: 140, family: "MTT9_25BB_CO_BTN_SRP" },
      { layers: 12, games: 1856, family: "MTT9_25BB_UTG_1_BTN_SRP" },
    ]);
  });

  it("řádek bez časové značky není řádek runneru", () => {
    expect(nightFamilyRows(["     1 vrstev,    140 podher do MTT9_25BB_CO_BTN_SRP"])).toEqual([]);
  });
});
