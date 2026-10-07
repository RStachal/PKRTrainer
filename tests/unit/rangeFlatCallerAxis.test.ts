/**
 * Osa dorovnávajícího v klíči packu - rozhodnutí 4a z 1. 10. 2026.
 *
 * ## Proč ta osa vznikla
 *
 * Range proti otevření, které někdo dorovnal, je jiná než proti otevření
 * samotnému, a liší se **i podle toho kdo**. Změřeno na vlastníkově korpusu:
 * BTN na 100 bb squeezuje 67 kombinací proti flatu z EP, 84 proti MP a 102 proti
 * CO; BB na 40 bb callne 506 proti EP/MP, 644 proti CO/BU a 751 proti SB.
 * Bez téhle osy se **7 z 8 zbylých rozporných buněk** nedalo rozlišit a která
 * mřížka přistane, neurčovalo žádné napsané pravidlo.
 *
 * ## Co tyhle testy hlídají především
 *
 * Že se **dnešní obsah nehnul**. Klíč záznamu bez téhle osy musí zůstat bajt po
 * bajtu tentýž, jinak přestane sedět uložená historie hráče a Question_ID -
 * a to je tvrdé pravidlo o migraci. Proto je prvních několik testů o tom, co se
 * stát **nesmí**, a teprve pak o tom, co se stát má.
 */
import { describe, expect, it } from "vitest";

import { getRangeRecord, rangeIndexKey, refinementFallbackChain } from "../../src/data/ranges/index";
import { questionId } from "../../src/core/questionId";
import { parseAnteFromQuestionId } from "../../src/persistence/statsRecordV2";

describe("klíč s osou dorovnávajícího", () => {
  it("nechá dnešní klíč bajt po bajtu tentýž", () => {
    expect(rangeIndexKey("OFF", "BTN", 50, "VS_OPEN")).toBe("OFF|BTN|50|VS_OPEN");
    expect(rangeIndexKey("OFF", "BTN", 50, "VS_OPEN", {})).toBe("OFF|BTN|50|VS_OPEN");
    expect(rangeIndexKey("OFF", "BTN", 50, "VS_OPEN", { vsSeat: "UTG" }))
      .toBe("OFF|BTN|50|VS_OPEN|vsUTG");
  });

  it("prázdný seznam dorovnávajících klíč nemění", () => {
    // „Otevření nikdo nedorovnal" je přesně to, co znamená `vsSeat` sám. Kdyby
    // si na to prázdný seznam vyrobil vlastní klíč, rozdělil by dnešní obsah na
    // dvě poloviny bez důvodu - a polovina by se přestala nacházet.
    expect(rangeIndexKey("OFF", "BTN", 50, "VS_OPEN", { flatCallers: [] }))
      .toBe("OFF|BTN|50|VS_OPEN");
    expect(rangeIndexKey("OFF", "BTN", 50, "VS_OPEN", { vsSeat: "UTG", flatCallers: [] }))
      .toBe("OFF|BTN|50|VS_OPEN|vsUTG");
  });

  it("jmenovaní dorovnávající dávají vlastní klíč vedle obecného", () => {
    const general = rangeIndexKey("OFF", "BTN", 50, "VS_OPEN", { vsSeat: "UTG" });
    const withFlat = rangeIndexKey("OFF", "BTN", 50, "VS_OPEN", { vsSeat: "UTG", flatCallers: ["MP"] });
    expect(withFlat).not.toBe(general);
    expect(withFlat).toBe("OFF|BTN|50|VS_OPEN|vsUTG|@MP");
  });

  it("dva různí dorovnávající dávají různé klíče", () => {
    const keys = new Set(["EP", "MP", "CO"].map((flat) => (
      rangeIndexKey("OFF", "BTN", 100, "SQUEEZE", { vsSeat: "UTG", flatCallers: [flat] })
    )));
    expect(keys.size).toBe(3);
  });

  it("na pořadí dorovnávajících záleží, protože je to pořadí akce", () => {
    // Zdroj jmenuje soupeře v pořadí, v jakém jednali. `BU+SB` a `SB+BU` jsou
    // dvě různé situace, ne dvě jména téže.
    const first = rangeIndexKey("OFF", "BB", 40, "SQUEEZE", { vsSeat: "CO", flatCallers: ["BU", "SB"] });
    const second = rangeIndexKey("OFF", "BB", 40, "SQUEEZE", { vsSeat: "CO", flatCallers: ["SB", "BU"] });
    expect(first).not.toBe(second);
  });

  it("osa se připojuje za scénář, ne před něj", () => {
    // Pořadí částí klíče je součást formátu: kdyby se přehodilo, přestaly by se
    // nacházet záznamy zapsané dřív.
    expect(rangeIndexKey("ON", "SB", 40, "SQUEEZE", {
      vsSeat: "UTG", stackSetupId: "ICM3", flatCallers: ["MP"],
    })).toBe("ON|SB|40|SQUEEZE|vsUTG|#ICM3|@MP");
  });
});

describe("pád na obecnější záznam", () => {
  /*
   * Testuje se proti **skutečnému** indexu produkčních dat, ne proti vymyšlenému:
   * smysl téhle osy je, že se obecná odpověď nepřestane nacházet, a to se dá
   * ověřit jen na obsahu, který se dodává. `VS_OPEN|BTN` existuje v každé variantě.
   */
  it("klíč s neznámým dorovnávajícím vrátí obecnější záznam, ne nic", () => {
    const general = getRangeRecord("OFF", "BTN", 50, "VS_OPEN", { vsSeat: "UTG" });
    const withFlat = getRangeRecord("OFF", "BTN", 50, "VS_OPEN", {
      vsSeat: "UTG",
      flatCallers: ["ROZHODNE_NEEXISTUJE"],
    });
    // Nezpřesněná odpověď je pořád odpověď a je lepší než žádná - tatáž zásada
    // jako u `vsSeat` a u vyřešeného postflopu.
    expect(withFlat).toBe(general);
  });

  it("klíč bez osy vrací přesně to, co vracel dřív", () => {
    // Kdyby se pád změnil, hráč by na tutéž otázku dostal jinou odpověď než
    // včera, aniž by se změnil obsah. To je ta nejtišší možná regrese.
    expect(getRangeRecord("OFF", "BTN", 50, "VS_OPEN"))
      .toBe(getRangeRecord("OFF", "BTN", 50, "VS_OPEN", {}));
  });

  it("prázdný seznam se chová jako osa nepředaná", () => {
    expect(getRangeRecord("OFF", "BTN", 50, "VS_OPEN", { vsSeat: "UTG", flatCallers: [] }))
      .toBe(getRangeRecord("OFF", "BTN", 50, "VS_OPEN", { vsSeat: "UTG" }));
  });
});

describe("Question_ID s osou dorovnávajícího", () => {
  const base = { context: "SQUEEZE", heroPos: "BTN", effStack: 100, hand: "AA", ante: "OFF" } as const;

  it("bez osy je ID nezměněné", () => {
    // Uložená historie hráče stojí na tom, že ID se nehýbe.
    expect(questionId(base)).toBe(questionId({ ...base, flatCallers: [] }));
    expect(questionId(base)).toBe("SQUEEZE|BTN|100|AA|OFF");
  });

  it("dva různí dorovnávající dávají různá ID", () => {
    // Jinak by statistika sčítala úspěšnost ve dvou různých situacích a hráč by
    // v obou viděl smyšlený průměr. Změřeno: 67 kombinací proti EP, 102 proti CO.
    const ep = questionId({ ...base, vsSeat: "UTG", flatCallers: ["EP"] });
    const co = questionId({ ...base, vsSeat: "UTG", flatCallers: ["CO"] });
    expect(ep).not.toBe(co);
    expect(new Set([questionId({ ...base, vsSeat: "UTG" }), ep, co]).size).toBe(3);
  });

  it("ante zůstává poslední, takže se dá pořád přečíst z ID", () => {
    // `parseAnteFromQuestionId` čte ante z konce. Kdyby se osa připojila za něj,
    // přestalo by se ante dát přečíst z historie - a to je migrace dat, ne
    // kosmetika. Tahle kontrola je důvod, proč `|@…` stojí **před** ante.
    for (const ante of ["ON", "OFF"] as const) {
      const id = questionId({ ...base, ante, vsSeat: "UTG", stackSetupId: "ICM3", flatCallers: ["MP", "SB"] });
      expect(id.endsWith(`|${ante}`)).toBe(true);
      expect(parseAnteFromQuestionId(id)).toBe(ante);
    }
  });
});

describe("řetěz pádu je jeden, ne dva", () => {
  /*
   * `getRangeRecord` a `createRangeStoreFromRangePack` si ten řetěz do 7. 10. 2026
   * skládaly každý sám a už se rozešly: packová cesta zkoušela `{scénář}` bez
   * sedačky, indexová ne, a osu dorovnávajícího znala jen indexová. Dvě kopie
   * téhož výpočtu se rozejdou tiše - projekt to zná z ceny desky i z dodávky packů.
   *
   * Změřeno, že ten rozchod dopad neměl: záznam se scénářem a bez sedačky není
   * v žádném ze čtyř produkčních packů ani v kandidátu. Krok, o který se cesty
   * lišily, byl mrtvý. Teď je řetěz jeden a tyhle testy drží jeho pořadí.
   */
  it("zahazuje osy od nejméně důležité", () => {
    const chain = refinementFallbackChain({
      vsSeat: "UTG", stackSetupId: "ICM3", flatCallers: ["MP"],
    });
    expect(chain).toEqual([
      { vsSeat: "UTG", stackSetupId: "ICM3", flatCallers: ["MP"] },
      { vsSeat: "UTG", flatCallers: ["MP"] },
      { vsSeat: "UTG", stackSetupId: "ICM3" },
      { vsSeat: "UTG" },
      {},
    ]);
  });

  it("bez osy dorovnávajícího je řetěz týž jako dřív", () => {
    // Tohle je ta vlastnost, na které stojí, že se dnešní obsah nehnul.
    expect(refinementFallbackChain({ vsSeat: "UTG", stackSetupId: "ICM3" }))
      .toEqual([{ vsSeat: "UTG", stackSetupId: "ICM3" }, { vsSeat: "UTG" }, {}]);
    expect(refinementFallbackChain({ vsSeat: "UTG" })).toEqual([{ vsSeat: "UTG" }, {}]);
    expect(refinementFallbackChain(undefined)).toEqual([{}]);
    expect(refinementFallbackChain({})).toEqual([{}]);
  });

  it("prázdný seznam dorovnávajících řetěz neprodlouží", () => {
    expect(refinementFallbackChain({ vsSeat: "UTG", flatCallers: [] }))
      .toEqual([{ vsSeat: "UTG" }, {}]);
  });

  it("obecný záznam je vždycky posledním pokusem", () => {
    // Nezpřesněná odpověď je pořád odpověď a je lepší než žádná.
    for (const refinement of [
      undefined, {}, { vsSeat: "UTG" as const }, { flatCallers: ["MP"] },
      { vsSeat: "UTG" as const, stackSetupId: "ICM3", flatCallers: ["MP", "SB"] },
    ]) {
      const chain = refinementFallbackChain(refinement);
      expect(chain[chain.length - 1]).toEqual({});
    }
  });
});
