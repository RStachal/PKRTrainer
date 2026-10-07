/**
 * Zůstal zpřesněný záznam dosažitelný?
 *
 * Tyhle testy vznikly **po** vadě, kterou nic nehlídalo (7. 10. 2026): osa
 * dorovnávajícího v klíči udělala tři schválené mřížky nedosažitelnými a počet
 * přijatých záznamů se přitom nezměnil (69 před i po), takže brána mlčela.
 *
 * První test je proto přímo ten případ, a je napsaný tak, aby spadl na kódu,
 * jaký byl před opravou.
 */
import { describe, expect, it } from "vitest";

import {
  orphanedRefinements,
  reachabilityErrors,
  type ReachabilityRecord,
} from "../../src/data/ranges/refinementReachability";

const record = (overrides: Partial<ReachabilityRecord> = {}): ReachabilityRecord => ({
  position: "BB", bucket: 20, context: "SQUEEZE", ...overrides,
});

describe("dosažitelnost zpřesněných záznamů", () => {
  it("mřížka s dorovnávajícím bez sourozence se sedačkou je osiřelá", () => {
    // Přesně ta tři místa z 7. 10.: `SQUEEZE BB 20 vsCO @BTN` bez záznamu
    // `SQUEEZE BB 20 vsCO`. Drill se na osu neptá, takže se na takový klíč
    // nikdo nezeptá a buňka tiše spadne na obecnou odpověď základního packu.
    const orphans = orphanedRefinements([
      record({ vsSeat: "CO", flatCallers: ["BTN"] }),
      record({}),
    ]);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].axis).toBe("flatCallers");
    expect(orphans[0].cell).toContain("vsCO|@BTN");
  });

  it("se sourozencem se sedačkou je dosažitelná", () => {
    expect(orphanedRefinements([
      record({ vsSeat: "CO", flatCallers: ["BTN"] }),
      record({ vsSeat: "CO" }),
      record({}),
    ])).toEqual([]);
  });

  it("záznam se sedačkou potřebuje obecný záznam té buňky", () => {
    // Tohle platí od osy otvírače (16. 9. 2026): zpřesnění je nadstavba nad
    // obecnou odpovědí, ne její náhrada.
    const orphans = orphanedRefinements([record({ vsSeat: "CO" })]);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].axis).toBe("vsSeat");
  });

  it("záznam se scénářem potřebuje sourozence bez scénáře", () => {
    const orphans = orphanedRefinements([
      record({ vsSeat: "CO", stackSetupId: "ICM3" }),
      record({}),
    ]);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].axis).toBe("stackSetupId");
  });

  it("prázdný seznam dorovnávajících není zpřesnění", () => {
    // `[]` znamená „otevření nikdo nedorovnal", což je přesně to, co říká
    // `vsSeat` sám - takový záznam je sourozenec, ne zpřesnění.
    expect(orphanedRefinements([
      record({ vsSeat: "CO", flatCallers: [] }),
      record({}),
    ])).toEqual([]);
    // A sám o sobě obecnému sourozenci stačí jako nadstavba nad buňkou.
    expect(orphanedRefinements([record({ vsSeat: "CO", flatCallers: [] })]))
      .toHaveLength(1);
  });

  it("obecný záznam sám o sobě osiřelý není", () => {
    expect(orphanedRefinements([record({})])).toEqual([]);
  });

  it("buňky se nepletou mezi sebou", () => {
    // Sourozenec musí být **téže** buňky. Záznam pro jinou hloubku nebo jinou
    // sedačku nic nezachraňuje, a kdyby se klíče porovnávaly volněji, kontrola
    // by mlčela právě tam, kde má křičet.
    const orphans = orphanedRefinements([
      record({ vsSeat: "CO", flatCallers: ["BTN"] }),
      record({ vsSeat: "LJ" }),
      record({ bucket: 40, vsSeat: "CO" }),
      record({}),
    ]);
    expect(orphans).toHaveLength(2);
    expect(orphans.map((row) => row.axis).sort()).toEqual(["flatCallers", "vsSeat"]);
  });

  it("hláška říká, co je špatně a co se s tím má udělat", () => {
    const [message] = reachabilityErrors([record({ vsSeat: "CO" })]);
    expect(message).toContain("unreachable");
    expect(message).toContain("beside the general answer");
  });
});
