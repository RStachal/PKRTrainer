import { describe, expect, it } from "vitest";

import { mechanicalReview } from "../../src/data/ranges/mechanicalReview";
import type { TurnStrategyPack } from "../../src/data/ranges/turnStrategyPack";

/**
 * Baterie měření, která rozhoduje, co se dodává.
 *
 * Tenhle modul nahrazuje čtenáře tam, kde čtenář není, takže jeho chyby jdou
 * rovnou k hráči. Dva směry selhání jsou přitom různě drahé: propustit rozbitý
 * obsah je špatné, ale **označit správný obsah za rozbitý je horší** - seznam
 * "tohle musí projít člověk" se tím zaplní šumem a přestane se číst.
 *
 * Přesně to se stalo první verzi: kontrola na zkolabované rozhodnutí hlásila dvě
 * rodiny, kde velký blind checkuje preflopovému agresorovi ve stu procentech. To
 * není zkolabovaný strom, to je správná strategie.
 */
function rule(options: {
  node?: string;
  side?: string;
  seat?: string;
  facingBet?: boolean;
  isAggressor?: boolean;
  actions: Record<string, number>;
}) {
  return {
    sourceDirectory: "TEST__board",
    familyId: "TEST",
    node: options.node ?? "CBET",
    spot: {
      hero: {
        side: options.side ?? "OOP",
        seat: options.seat ?? "BB",
        villainSeat: "BTN",
        isAggressor: options.isAggressor ?? false,
        facingBet: options.facingBet ?? false,
      },
      potChips: 50,
      potBB: 10,
    },
    buckets: Object.entries(options.actions).map(([action, combos]) => ({
      action, combos, handClasses: [],
    })),
  };
}

function pack(rules: ReturnType<typeof rule>[]): TurnStrategyPack {
  return {
    id: "pack-TEST",
    familyIds: ["TEST"],
    contentHash: "hash-1",
    confidence: "LOW",
    rules,
  } as unknown as TurnStrategyPack;
}

const checkOf = (result: ReturnType<typeof mechanicalReview>, id: string) => (
  result.checks.find((check) => check.id === id)
);

describe("měřitelná kontrola", () => {
  it("check na 100 % od hráče bez iniciativy neoznačí za vadu", () => {
    // Velký blind checkuje preflopovému agresorovi. Donk sázku solver v těchhle
    // sizinzích nehraje, takže sto procent checku je výsledek, ne kolaps.
    const subject = pack([
      rule({ actions: { CHECK: 1000 } }),
      rule({ side: "IP", seat: "BTN", isAggressor: true, actions: { "BET 25.000000": 600, CHECK: 400 } }),
    ]);
    const result = mechanicalReview(subject, "FLOP", [subject]);
    expect(checkOf(result, "NO_COLLAPSED_DECISION")?.passed).toBe(true);
  });

  it("sázku na 100 % od hráče bez iniciativy za vadu označí", () => {
    // Opačný případ téhož uzlu: sázet bez iniciativy pokaždé je rozbité, a je to
    // přesně tvar chyby, kterou tenhle projekt zažil - pack postavený z uzlu,
    // který drží strategii druhého hráče.
    const subject = pack([rule({ actions: { "BET 25.000000": 1000 } })]);
    const result = mechanicalReview(subject, "FLOP", [subject]);
    const check = checkOf(result, "NO_COLLAPSED_DECISION");
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain("BET");
  });

  it("zkolabované rozhodnutí u agresora označí bez ohledu na akci", () => {
    const subject = pack([
      rule({ side: "IP", seat: "BTN", isAggressor: true, actions: { CHECK: 1000 } }),
    ]);
    const result = mechanicalReview(subject, "FLOP", [subject]);
    expect(checkOf(result, "NO_COLLAPSED_DECISION")?.passed).toBe(false);
  });

  it("obrácené pořadí iniciativy označí, malý rozdíl ne", () => {
    const build = (aggressorBets: number, callerBets: number) => pack([
      rule({ side: "IP", seat: "BTN", isAggressor: true, actions: { "BET 25.000000": aggressorBets, CHECK: 1000 - aggressorBets } }),
      rule({ actions: { "BET 25.000000": callerBets, CHECK: 1000 - callerBets } }),
    ]);
    // Pět bodů je v naměřeném rozpětí dodávaného obsahu, projít musí.
    const mild = mechanicalReview(build(430, 470), "TURN", []);
    expect(checkOf(mild, "INITIATIVE_ORDERING")?.passed).toBe(true);
    // Třicet bodů je obrácené znaménko, ne kolísání.
    const broken = mechanicalReview(build(200, 500), "TURN", []);
    expect(checkOf(broken, "INITIATIVE_ORDERING")?.passed).toBe(false);
  });

  it("rodina bez čelících rozhodnutí neprojde ani nepropadne na obraně", () => {
    // Nula by lhala: znamenala by dokonalou obranu tam, kde se obrana neměří.
    const subject = pack([rule({ actions: { CHECK: 1000 } })]);
    const check = checkOf(mechanicalReview(subject, "TURN", [subject]), "DEFENCE_VS_POT_ODDS");
    expect(check?.passed).toBe(true);
    expect(check?.detail).toContain("nemá dost");
  });

  it("výsledek nese otisk obsahu, na kterém se měřilo", () => {
    // Bez otisku by verdikt přežil přegenerování rodiny a tvrdil by něco o
    // obsahu, který už neexistuje.
    const subject = pack([rule({ actions: { CHECK: 1000 } })]);
    expect(mechanicalReview(subject, "TURN", [subject]).contentHash).toBe("hash-1");
  });

  it("projde jen ten, komu prošly všechny kontroly", () => {
    const subject = pack([rule({ actions: { "BET 25.000000": 1000 } })]);
    const result = mechanicalReview(subject, "FLOP", [subject]);
    expect(result.passed).toBe(false);
    expect(result.checks.some((check) => !check.passed)).toBe(true);
  });
});
