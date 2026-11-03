import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { boardDirectoryOf, lostBoardsRefusal, packBoardsMissing } from "../../scripts/lib/packBoardGuard.mts";

/**
 * Dodaný turnový nebo riverový pack se nepřestaví z rozkladu, kterému chybí
 * desky - jinak by pravidla z nich z produktu tiše zmizela. Změřeno 3. 11. 2026
 * po obnově ze záloh: turn 5 desek (213 pravidel), river 8 desek (360 pravidel).
 */
function workspace(boards: string[], rules: unknown[]): { pack: string; root: string } {
  const base = mkdtempSync(join(tmpdir(), "pack-board-guard-"));
  const root = join(base, "decomposition");
  for (const board of boards) mkdirSync(join(root, board), { recursive: true });
  const pack = join(base, "pack.generated.json");
  writeFileSync(pack, JSON.stringify({ rules }), "utf8");
  return { pack, root };
}

describe("desky dodaného packu, které rozklad nemá", () => {
  it("turn: zdroj pravidla je adresář desky", () => {
    const { pack, root } = workspace(["MTT9_25BB_UTG_2_LJ_SRP__742r"], [
      { sourceDirectory: "MTT9_25BB_UTG_2_LJ_SRP__742r" },
      { sourceDirectory: "MTT9_25BB_UTG_2_LJ_SRP__883r" },
      { sourceDirectory: "MTT9_25BB_UTG_2_LJ_SRP__883r" },
      { sourceDirectory: "MTT9_25BB_UTG_2_LJ_SRP__A72r" },
    ]);
    expect(packBoardsMissing(pack, root)).toEqual([
      "MTT9_25BB_UTG_2_LJ_SRP__883r",
      "MTT9_25BB_UTG_2_LJ_SRP__A72r",
    ]);
  });

  it("river: deska je první část cesty s `__`, ne podhra za ní", () => {
    expect(boardDirectoryOf("artifacts/decomposition/MTT9_25BB_LJ_HJ_SRP__742r/river/CHECK_BET275_CALL__2d"))
      .toBe("MTT9_25BB_LJ_HJ_SRP__742r");
    const { pack, root } = workspace(["MTT9_25BB_LJ_HJ_SRP__742r"], [
      { sourceDirectory: "artifacts/decomposition/MTT9_25BB_LJ_HJ_SRP__742r/river/CHECK_BET275_CALL__2d" },
      { sourceDirectory: "artifacts\\decomposition\\MTT9_25BB_LJ_HJ_SRP__K98tt\\river\\BET182_CALL__5c" },
    ]);
    expect(packBoardsMissing(pack, root)).toEqual(["MTT9_25BB_LJ_HJ_SRP__K98tt"]);
  });

  it("přesolvená rodina s jinými podhrami na týchž deskách přestavbu nebrzdí", () => {
    // Podhra `CHECK_BET275_CALL__2d` po přesolvení neexistuje, deska ano.
    const { pack, root } = workspace(["MTT9_25BB_LJ_HJ_SRP__742r"], [
      { sourceDirectory: "artifacts/decomposition/MTT9_25BB_LJ_HJ_SRP__742r/river/CHECK_BET275_CALL__2d" },
    ]);
    expect(packBoardsMissing(pack, root)).toEqual([]);
  });

  it("bez packu, s rozbitým packem nebo bez zdrojů nic nehlásí - první stavba se neblokuje", () => {
    const { root } = workspace([], []);
    expect(packBoardsMissing(join(root, "neni.generated.json"), root)).toEqual([]);
    const broken = join(root, "..", "broken.generated.json");
    writeFileSync(broken, "{ nejde", "utf8");
    expect(packBoardsMissing(broken, root)).toEqual([]);
    const { pack } = workspace([], [{ node: "FLOP" }]);
    expect(packBoardsMissing(pack, root)).toEqual([]);
  });

  it("odmítnutí řekne rodinu, ulici, desky a jak je vyřadit vědomě", () => {
    const text = lostBoardsRefusal("MTT9_25BB_UTG_2_LJ_SRP", "turn", ["MTT9_25BB_UTG_2_LJ_SRP__883r"]);
    expect(text).toMatch(/^MTT9_25BB_UTG_2_LJ_SRP: dodaný turnový pack stojí na 1 deskách/);
    expect(text).toContain("MTT9_25BB_UTG_2_LJ_SRP__883r");
    expect(text).toContain("--allow-lost-boards");
  });
});
