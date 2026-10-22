import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { newestDecompositionMs } from "../../scripts/lib/packInputs.mts";

/**
 * Kdy naposled noc rozkládala na turn (od 22. 10. 2026).
 *
 * Ranní cyklus podle toho pozná, že má generovat i turnové packy: rozklad
 * nevytváří monolitické checkpointy, takže spouštěč podle nich noc rozkladu
 * neviděl a nový turn čekal na sobotní plný cyklus.
 */
describe("newestDecompositionMs", () => {
  it("bere nejnovější čas složky desky; soubory a složky bez desky nepočítá", () => {
    const root = mkdtempSync(join(tmpdir(), "decomposition-"));
    const old = join(root, "MTT9_25BB_UTG_LJ_SRP__742r");
    const fresh = join(root, "MTT9_50BB_UTG_2_CO_SRP__A72r");
    mkdirSync(old);
    mkdirSync(fresh);
    mkdirSync(join(root, "bez-desky"));
    writeFileSync(join(root, "flop-only-boards.txt"), "", "utf8");
    utimesSync(old, new Date("2026-10-05T03:46:00"), new Date("2026-10-05T03:46:00"));
    utimesSync(fresh, new Date("2026-10-22T02:11:00"), new Date("2026-10-22T02:11:00"));
    utimesSync(join(root, "bez-desky"), new Date("2026-10-23T00:00:00"), new Date("2026-10-23T00:00:00"));
    utimesSync(join(root, "flop-only-boards.txt"), new Date("2026-10-23T00:00:00"), new Date("2026-10-23T00:00:00"));
    expect(newestDecompositionMs(root)).toBe(new Date("2026-10-22T02:11:00").getTime());
  });

  it("riverová vrstva hluboko pod deskou čas desky neposune", () => {
    const root = mkdtempSync(join(tmpdir(), "decomposition-"));
    const board = join(root, "MTT9_25BB_HJ_CO_SRP__K98tt");
    mkdirSync(join(board, "river", "CHECK_CHECK__4s"), { recursive: true });
    utimesSync(board, new Date("2026-10-05T02:43:00"), new Date("2026-10-05T02:43:00"));
    writeFileSync(join(board, "river", "CHECK_CHECK__4s", "item.json"), "{}", "utf8");
    expect(newestDecompositionMs(root)).toBe(new Date("2026-10-05T02:43:00").getTime());
  });

  it("bez rozkladu je nula", () => {
    expect(newestDecompositionMs(join(tmpdir(), "neexistuje-rozklad"))).toBe(0);
  });
});
