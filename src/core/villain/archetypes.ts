import type { OpponentStyleId } from "../opponentStyle";

/**
 * Typy hráčů režimu REAL (Agents/plan-gto-real-2026-11.md, oddíl 3.2).
 *
 * Režim REAL staví stůl z hráčů, kteří se od rovnováhy odchylují známým
 * směrem, a hodnotí nejlepší odpověď proti nim. Tady je jen jejich popis:
 * statistiky, které majitel 4. 11. 2026 schválil jako výchozí (R2), a vazba na
 * dnešní čtyři styly z `opponentStyle.ts`, přes které už preflopové EV
 * all-inu umí počítat s tím, jak soupeř folduje proti shove.
 *
 * Statistiky jsou **odhad**, ne měření: dvě změřené kotvy (Little, Williams)
 * nese styl, ne typ. Doladí se čtením spotů (plán, 4.6), a proto je původ
 * uložený u typu - čtení ho může jen zpřesnit, nikdy tiše povýšit.
 */

export const VILLAIN_ARCHETYPES = ["SHARK", "EAGLE", "ROCK", "DICE", "WHALE"] as const;

export type VillainArchetype = (typeof VILLAIN_ARCHETYPES)[number];

/** Režim tréninku: rovnováha proti nikomu, nebo typy hráčů u stolu. */
export type TrainingMode = "GTO" | "REAL";

/** Rozpětí statistiky v procentech. */
export interface StatBand {
  readonly min: number;
  readonly max: number;
}

/** Jak často typ na riveru blafuje, slovně: číslo nikdo nezměřil. */
export type RiverBluffing = "BALANCED" | "FEW" | "ALMOST_NONE" | "MANY";

export interface ArchetypeStats {
  readonly vpip: StatBand;
  readonly pfr: StatBand;
  readonly threeBet: StatBand;
  readonly foldToThreeBet: StatBand;
  readonly foldToCbet: StatBand;
  readonly riverBluffing: RiverBluffing;
}

export interface ArchetypeProfile {
  readonly id: VillainArchetype;
  /**
   * Kvadrant z `opponentStyle.ts`. Z něj bere preflopové EV, kolik typ
   * folduje proti shove, dokud REAL nemá vlastní výpočet (plán, M3).
   */
  readonly style: OpponentStyleId;
  readonly stats: ArchetypeStats;
  readonly basis: "MEASURED" | "INTERPOLATED";
}

const band = (min: number, max: number): StatBand => ({ min, max });

export const ARCHETYPES: Readonly<Record<VillainArchetype, ArchetypeProfile>> = {
  SHARK: {
    id: "SHARK",
    style: "TIGHT_AGGRESSIVE",
    stats: {
      vpip: band(18, 24),
      pfr: band(15, 20),
      threeBet: band(7, 9),
      foldToThreeBet: band(50, 55),
      foldToCbet: band(40, 45),
      riverBluffing: "BALANCED",
    },
    basis: "INTERPOLATED",
  },
  EAGLE: {
    id: "EAGLE",
    style: "TIGHT_AGGRESSIVE",
    stats: {
      vpip: band(16, 22),
      pfr: band(13, 18),
      threeBet: band(5, 6),
      foldToThreeBet: band(60, 65),
      foldToCbet: band(45, 50),
      riverBluffing: "FEW",
    },
    basis: "INTERPOLATED",
  },
  ROCK: {
    id: "ROCK",
    style: "TIGHT_PASSIVE",
    stats: {
      vpip: band(10, 14),
      pfr: band(7, 10),
      threeBet: band(2, 3),
      foldToThreeBet: band(70, 75),
      foldToCbet: band(55, 60),
      riverBluffing: "ALMOST_NONE",
    },
    basis: "INTERPOLATED",
  },
  DICE: {
    id: "DICE",
    style: "LOOSE_AGGRESSIVE",
    stats: {
      vpip: band(40, 55),
      pfr: band(30, 40),
      threeBet: band(12, 18),
      foldToThreeBet: band(30, 40),
      foldToCbet: band(25, 35),
      riverBluffing: "MANY",
    },
    basis: "INTERPOLATED",
  },
  WHALE: {
    id: "WHALE",
    style: "LOOSE_PASSIVE",
    stats: {
      vpip: band(55, 70),
      pfr: band(5, 10),
      threeBet: band(1, 3),
      foldToThreeBet: band(20, 30),
      foldToCbet: band(15, 25),
      riverBluffing: "ALMOST_NONE",
    },
    basis: "INTERPOLATED",
  },
};

export function isVillainArchetype(value: unknown): value is VillainArchetype {
  return typeof value === "string" && (VILLAIN_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Co se o soupeři zapíše k odpovědi do statistik.
 *
 * V GTO nic: záznam vypadá jako před režimy a chybějící pole znamená GTO, takže
 * staré záznamy nic nepřepisují. V REAL režim a typ soupeře ve hře; typ chybí,
 * když hráč jedná první a soupeře ve hře nemá.
 */
export interface VillainFields {
  trainingMode?: "REAL";
  villainArchetype?: VillainArchetype;
}

/** Obstojí pole o soupeři v načteném záznamu? Obě jsou nepovinná. */
export function hasValidVillainFields(record: { trainingMode?: unknown; villainArchetype?: unknown }): boolean {
  return (record.trainingMode === undefined || record.trainingMode === "REAL")
    && (record.villainArchetype === undefined || isVillainArchetype(record.villainArchetype));
}

/** Jen pole o soupeři, a jen ta, která záznam má: pro přenos mezi tvary záznamu. */
export function copyVillainFields(record: VillainFields): VillainFields {
  return {
    ...(record.trainingMode === undefined ? {} : { trainingMode: record.trainingMode }),
    ...(record.villainArchetype === undefined ? {} : { villainArchetype: record.villainArchetype }),
  };
}

/**
 * Styl, podle kterého preflopové EV počítá fold proti shove.
 *
 * GTO a živý stůl bez zvoleného soupeře styl nemají: hodnotí se proti
 * rovnováze, jak to popisují dodané range. Teprve jmenovaný soupeř posune
 * jediné číslo, jako dřív volba stylu ve filtrech.
 */
export function opponentStyleFor(
  mode: TrainingMode | undefined,
  focus: VillainArchetype | undefined,
): OpponentStyleId | undefined {
  if (mode !== "REAL" || focus === undefined) return undefined;
  return ARCHETYPES[focus].style;
}
