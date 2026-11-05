import { describe, expect, it } from "vitest";

import { boardsDecomposedAfterPack } from "../../scripts/lib/packDecompositionAge.mts";

/**
 * Turnový pack starší než rozklad svých desek.
 *
 * Případ ze 22. 10. 2026: `MTT9_25BB_LJ_BTN_SRP` má pack z 12. 9., desky se po
 * přesolvení 5. 10. rozložily znovu, a přepočet turnové EV spároval stará
 * pravidla s novými podhrami podle jmen linek.
 */
const at = (text: string): number => new Date(text).getTime();

const pack = {
  createdAt: "2026-09-12",
  rules: [
    { sourceDirectory: "MTT9_25BB_LJ_BTN_SRP__742r" },
    { sourceDirectory: "MTT9_25BB_LJ_BTN_SRP__742r" },
    { sourceDirectory: "MTT9_25BB_LJ_BTN_SRP__883r" },
    null,
  ],
};

describe("boardsDecomposedAfterPack", () => {
  it("najde desky rozložené znovu po vzniku packu", () => {
    const plans: Record<string, number> = {
      MTT9_25BB_LJ_BTN_SRP__742r: at("2026-10-05T03:46:00"),
      MTT9_25BB_LJ_BTN_SRP__883r: at("2026-10-05T03:59:00"),
    };
    expect(boardsDecomposedAfterPack(pack, (board) => plans[board]))
      .toEqual(["MTT9_25BB_LJ_BTN_SRP__742r", "MTT9_25BB_LJ_BTN_SRP__883r"]);
  });

  it("rozklad starší než pack nebo týž den je v pořádku", () => {
    const plans: Record<string, number> = {
      MTT9_25BB_LJ_BTN_SRP__742r: at("2026-09-10T03:46:00"),
      MTT9_25BB_LJ_BTN_SRP__883r: at("2026-09-12T23:00:00"),
    };
    expect(boardsDecomposedAfterPack(pack, (board) => plans[board])).toEqual([]);
  });

  it("noční rozklad po večerním cyklu už je druhý den, a pozná se", () => {
    const plans: Record<string, number> = {
      MTT9_25BB_LJ_BTN_SRP__742r: at("2026-09-13T02:00:00"),
    };
    expect(boardsDecomposedAfterPack(pack, (board) => plans[board])).toEqual(["MTT9_25BB_LJ_BTN_SRP__742r"]);
  });

  it("deska bez rozkladu a pack bez data se nehodnotí", () => {
    expect(boardsDecomposedAfterPack(pack, () => undefined)).toEqual([]);
    expect(boardsDecomposedAfterPack({ rules: pack.rules }, () => at("2026-10-05T03:46:00"))).toEqual([]);
  });
});
