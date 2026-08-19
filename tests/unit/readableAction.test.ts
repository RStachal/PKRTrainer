import { describe, expect, it } from "vitest";

import { readableAction } from "../../src/data/ranges/turnReviewDigest";

/**
 * Akce ve výpisu ke čtení.
 *
 * Solver píše `BET 17.000000` - šest desetinných míst, která nic neznamenají, a
 * částku v žetonech, kdežto hloubka se vedle uvádí v blindech. Čtení rodiny je
 * práce na hodiny a tohle si u každého řádku převádí člověk v hlavě.
 */
describe("čitelná akce", () => {
  it("zahodí desetinná místa, která nic neznamenají", () => {
    expect(readableAction("BET 17.000000")).toBe("BET 17");
    expect(readableAction("RAISE 133.000000")).toBe("RAISE 133");
  });

  it("s potem doplní procenta potu", () => {
    expect(readableAction("BET 17.000000", 50)).toBe("BET 17 (34 % potu)");
    expect(readableAction("BET 38.000000", 50)).toBe("BET 38 (76 % potu)");
  });

  it("bez potu procenta nedoplní", () => {
    // Souhrnné rozdělení sčítá spoty s různými poty. Tatáž `BET 17` je jednou
    // třetina potu a jindy pětina, takže jedno číslo by tam lhalo.
    expect(readableAction("BET 17.000000")).toBe("BET 17");
    expect(readableAction("BET 17.000000", 0)).toBe("BET 17");
  });

  it("u zvýšení procenta nepočítá", () => {
    // `RAISE 133` znamená "na 133", ne "o 133", a pot je v tu chvíli jiný než ten
    // na uzlu. Podíl by se vztahoval k něčemu jinému, než co čtenář vidí.
    expect(readableAction("RAISE 133.000000", 50)).toBe("RAISE 133");
  });

  it("akce bez částky nechá být", () => {
    for (const action of ["CHECK", "CALL", "FOLD", "ALLIN"]) {
      expect(readableAction(action, 50)).toBe(action);
    }
  });

  it("nekulatou částku nezaokrouhlí na celé", () => {
    expect(readableAction("BET 17.5", 50)).toBe("BET 17.5 (35 % potu)");
  });
});
