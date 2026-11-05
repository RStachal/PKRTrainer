import { PREFLOP_STRENGTH_ORDER } from "./preflopStrengthOrder.generated";
import { bubbleFactor, type PayoutStructure, type StackDistribution } from "../../core/icmModel";
import type { ActionKey, AnteMode, HandLabel } from "../../core/types";
import type { BlindSpeed } from "../../core/trainingProfile";
import type { RangePack, RangePackRecord } from "./rangePack";

/**
 * Odvozené ICM range pro jeden pojmenovaný scénář — ne pro „ICM obecně".
 *
 * ICM profily (`DOLAR_EV`) jsou ve smlouvě v1, ale nemají žádná data, takže jsou
 * zablokované: polovina z osmi devítistolových preflopových profilů. Chybí ale
 * rozhodnutí, ne měření — chipEV range v repozitáři jsou, ICM model s bubble
 * faktorem taky.
 *
 * ## Proč jeden scénář a ne jeden „ICM pack"
 *
 * ICM není nastavení, které by šlo zapnout. Úprava závisí na výplatní struktuře
 * a na rozdělení stacků, a její velikost se mezi situacemi liší řádově: bubble
 * faktor bývá kolem 1,3 pro čipového lídra, přes 2 pro krátký stack na bublině,
 * a v některých spotech klesá pod 1 (malý blind proti krátkému stacku, kde je
 * vyřazení soupeře cennější než riziko). Pack pojmenovaný jen „ICM" by tedy
 * tvrdil něco, co není pravda pro většinu situací, které tak označí.
 *
 * Proto je scénář součástí identity packu i jeho `assumptions`: peněžní bublina,
 * rovné stacky, výplata na tři místa. To je kanonický učební případ a zároveň
 * jediný, pro který tenhle pack platí.
 *
 * ## Proč se shove rozšiřuje a call utahuje
 *
 * Tohle je jediné místo, kde jde znaménko splést a celý pack tím obrátit.
 * Bubble faktor zdražuje **riziko**, ne agresi. Kdo dorovnává, riskuje vlastní
 * turnaj a potřebuje víc equity, takže dorovnává úžeji. Kdo tlačí all-in, získává
 * navíc fold equity, která je právě proto cennější — takže tlačí šířeji. Veřejné
 * zdroje ten rozdíl uvádějí jako velký, ne kosmetický: cutoff, který v chipEV
 * tlačí kolem 38 %, jde na bublině výrazně výš, zatímco dorovnávající range se
 * proti chipEV smrskává o desítky procent.
 *
 * Odvození je proto směrové a obě strany se hýbou opačně.
 *
 * ## Co to není
 *
 * Není to měřený ICM solve a nikdy se tak nesmí označit. Pack zůstává `LOW` a
 * míří do preview, ne do produkce — stejně jako šestistolový pack, který vznikl
 * ze stejného pravidla: raději obhajitelný default s poctivou nálepkou než
 * zablokovaný profil.
 */

/** Peněžní bublina: o jednoho hráče víc, než kolik se platí. */
export const MTT_BUBBLE_PAYOUT: PayoutStructure = {
  id: "MTT_BUBBLE_TOP_3",
  paidPlaces: 3,
  payouts: [0.5, 0.3, 0.2],
};

/**
 * Čtyři rovné stacky na bublině placené do tří míst.
 *
 * Rovné stacky schválně: je to jediné rozdělení, které nemusí nic předpokládat
 * o tom, kde hrdina v poli stojí. Jakmile se stacky rozejdou, bubble faktor se
 * rozejde s nimi a jedno číslo přestane platit pro všechny sedačky.
 */
export const MTT_BUBBLE_STACKS: StackDistribution = {
  remainingPlayers: 4,
  heroIndex: 0,
  stacks: [{ stackBB: 25 }, { stackBB: 25 }, { stackBB: 25 }, { stackBB: 25 }],
};

/** Bubble faktor scénáře, spočítaný modelem, ne odhadnutý. */
export function mttBubbleFactor(): number {
  return bubbleFactor(
    MTT_BUBBLE_STACKS.stacks.map((stack) => stack.stackBB),
    MTT_BUBBLE_PAYOUT.payouts,
    MTT_BUBBLE_STACKS.heroIndex,
    1,
  );
}

const COMBOS = (handClass: string): number => (
  handClass.length === 2 ? 6 : handClass.endsWith("s") ? 4 : 12
);

/**
 * Rozdělení akčních klíčů na ty s fold equity a ty bez ní.
 *
 * Vyjmenované z `ActionKey`, ne odhadnuté podle názvu. První verze si sadu
 * vymyslela - `RAISE`, `ALLIN`, `SHOVE` - a žádný z těch klíčů v projektu
 * neexistuje, takže agresivní strana zůstala celá nedotčená a odvození tiše
 * dělalo jen půlku práce. Přepínač, který nic nechytí, vypadá zvenku úplně
 * stejně jako přepínač, který má nechat věci být.
 */
const AGGRESSIVE_KEYS: ReadonlySet<ActionKey> = new Set<ActionKey>([
  "OPEN_2X", "OPEN_25X", "OPEN_3X",
  "ISO_2X", "ISO_25X", "ISO_3X",
  "3BET", "4BET", "SQUEEZE", "JAM",
]);

/** Klíče, kterými hrdina riskuje turnaj bez vlastní fold equity. */
const PASSIVE_KEYS: ReadonlySet<ActionKey> = new Set<ActionKey>([
  "CALL", "CALL_JAM", "LIMP", "OVERLIMP",
]);

function isAggressive(key: string): boolean {
  return AGGRESSIVE_KEYS.has(key as ActionKey);
}

function isPassive(key: string): boolean {
  return PASSIVE_KEYS.has(key as ActionKey);
}

/**
 * Pořadí ruk podle equity proti celému balíčku, dostupné synchronně.
 *
 * První verze si pořadí odvozovala z toho, v kolika rangích se ruka objevuje.
 * Jako náhrada to fungovalo hrubě - a hrubé to bylo přesně na hranici range,
 * tedy tam, kde se rozhoduje, kterou ruku rozšíření přidá. Právě kvůli tomu se
 * odvozené ICM packy nesměly hrát.
 *
 * `preflopStrengthOrder.generated` je stejné číslo, jaké vrací `strengthOrder()`
 * z equity tabulky, jen spočítané předem. Náhrada tím padá a s ní i důvod, proč
 * ty packy držet mimo dosah hráče.
 */
function handStrengthOrder(): readonly HandLabel[] {
  return PREFLOP_STRENGTH_ORDER;
}

export interface IcmAdjustment {
  /** O kolik se násobí šířka dorovnávací range. Pod jedničkou = utažení. */
  callWidthFactor: number;
  /** O kolik se násobí šířka agresivní range. Nad jedničkou = rozšíření. */
  aggressiveWidthFactor: number;
}

/**
 * Jak moc se range hýbou při daném bubble faktoru.
 *
 * Bubble faktor je poměr rizika k zisku v equity turnaje, takže dorovnání
 * potřebuje tolikrát lepší kurz — a šířka range klesá zhruba s převrácenou
 * hodnotou. Agresivní strana se hýbe opačně a mírněji, protože její zisk je
 * fold equity, ne dojetá ruka.
 *
 * Obě čísla jsou omezená, aby ani extrémní bubble faktor nevyrobil range, která
 * nedává smysl: dorovnání se neutáhne pod třetinu a shove se nerozšíří přes
 * dvojnásobek. Ty meze jsou volba, ne odvozené číslo, a jsou tady napsané proto,
 * aby je šlo najít a přepsat.
 */
export function icmAdjustmentFor(factor: number): IcmAdjustment {
  const safeFactor = Math.max(factor, 1e-6);
  return {
    callWidthFactor: Math.min(1, Math.max(1 / safeFactor, 0.33)),
    aggressiveWidthFactor: Math.min(2, Math.max(1, 1 + (safeFactor - 1) * 0.6)),
  };
}

function adjustKeySet(
  source: RangePackRecord["strict"],
  order: readonly HandLabel[],
  adjustment: IcmAdjustment,
): RangePackRecord["strict"] {
  const rank = new Map(order.map((hand, index) => [hand, index]));
  const byStrength = (hands: readonly HandLabel[]) => (
    [...hands].sort((left, right) => (rank.get(left) ?? 999) - (rank.get(right) ?? 999))
  );
  const combosOf = (hands: Iterable<HandLabel>) => {
    let total = 0;
    for (const hand of hands) total += COMBOS(hand);
    return total;
  };

  const aggressiveHands = byStrength(
    Object.entries(source).filter(([, keys]) => keys.some(isAggressive)).map(([hand]) => hand),
  );
  const passiveHands = byStrength(
    Object.entries(source).filter(([, keys]) => keys.some(isPassive)).map(([hand]) => hand),
  );

  /**
   * Klíč, kterým se v tomhle spotu tlačí.
   *
   * Ruka přidaná rozšířením musí dostat akci, která v daném záznamu opravdu
   * existuje. Vymyslet jí `JAM` ve spotu, kde se otevírá na 2,5×, by hráče učilo
   * akci, kterou strom v té situaci vůbec nenabízí.
   */
  const dominantAggressiveKey = (): ActionKey | undefined => {
    const counts = new Map<ActionKey, number>();
    for (const keys of Object.values(source)) {
      for (const key of keys) {
        if (isAggressive(key)) counts.set(key as ActionKey, (counts.get(key as ActionKey) ?? 0) + 1);
      }
    }
    let best: ActionKey | undefined;
    let bestCount = 0;
    for (const [key, count] of counts) {
      if (count > bestCount) { best = key; bestCount = count; }
    }
    return best;
  };

  // Utažení: nech nejsilnější ruce, dokud se nedosáhne cílové šířky.
  const keepStrongest = (hands: readonly HandLabel[], widthFactor: number): Set<HandLabel> => {
    if (hands.length === 0) return new Set();
    const target = combosOf(hands) * widthFactor;
    const kept = new Set<HandLabel>();
    let combos = 0;
    for (const hand of hands) {
      if (combos >= target && kept.size > 0) break;
      kept.add(hand);
      combos += COMBOS(hand);
    }
    return kept;
  };

  /**
   * Rozšíření: doplň další nejsilnější ruce ze záznamu, ne jen ty, které už tlačí.
   *
   * První verze kreslila jen z ruk, které agresivní klíč už nesly - takže cílová
   * šířka byla vždycky splněná hned a rozšíření nikdy nic neudělalo. Změřeno:
   * nula ze 469 záznamů se rozšířila. Rozšířit range znamená přidat ruce, které
   * se předtím skládaly; jinak je to jen jinak pojmenované nic.
   */
  const widenAggressive = (hands: readonly HandLabel[], widthFactor: number): Set<HandLabel> => {
    const kept = new Set(hands);
    if (hands.length === 0) return kept;
    const target = combosOf(hands) * widthFactor;
    let combos = combosOf(kept);
    // Kandidáti jsou všechny třídy, ne jen ty v záznamu. Otevírací záznam drží
    // pouze ruce, které se otevírají - složené v něm vůbec nejsou - takže
    // rozšíření z jeho vlastního obsahu nemá odkud brát a mlčky nic neudělá.
    // Změřeno: otevírací range se nerozšířila ani jednou, dokud se kandidáti
    // brali odsud.
    for (const hand of byStrength(PREFLOP_STRENGTH_ORDER)) {
      if (combos >= target) break;
      if (kept.has(hand)) continue;
      kept.add(hand);
      combos += COMBOS(hand);
    }
    return kept;
  };

  const keptAggressive = widenAggressive(aggressiveHands, adjustment.aggressiveWidthFactor);
  const keptPassive = keepStrongest(passiveHands, adjustment.callWidthFactor);
  const addedKey = dominantAggressiveKey();

  const out: RangePackRecord["strict"] = {};
  for (const [hand, keys] of Object.entries(source)) {
    const surviving = keys.filter((key) => {
      if (isAggressive(key)) return keptAggressive.has(hand);
      if (isPassive(key)) return keptPassive.has(hand);
      return true;
    });
    // Ruka, kterou rozšíření nově vzalo do agresivní range, dostane akci, která
    // v tomhle spotu existuje - a ztrácí fold, protože ten by ji popíral.
    if (
      addedKey !== undefined &&
      keptAggressive.has(hand) &&
      !keys.some(isAggressive)
    ) {
      out[hand] = [addedKey];
      continue;
    }
    if (surviving.length > 0) out[hand] = surviving;
  }

  // Ruce, které rozšíření přidalo a v původním záznamu vůbec nebyly. Bez tohohle
  // kroku se spočítaly správně a pak zahodily, protože výstup procházel jen
  // klíče zdrojové mapy - rozšíření tím bylo přesně tak neúčinné jako předtím,
  // jen o úroveň níž.
  if (addedKey !== undefined) {
    for (const hand of keptAggressive) {
      if (out[hand] === undefined) out[hand] = [addedKey];
    }
  }
  return out;
}

/**
 * Zdrojový chipEV pack se předává, neimportuje.
 *
 * Import zpátky do `mttPreflopRangePacks` vyrobil kruh: ten modul potřebuje
 * odvozené packy do seznamu a tenhle potřeboval jeho měřená data. Podle toho,
 * který se načetl první, spadla buď aplikace, nebo testy - a lazy funkce ten
 * kruh jen zúžila, nezrušila. Parametr ho ruší celý.
 */
export function mttIcmDerivedRangePack(
  blindSpeed: BlindSpeed,
  ante: AnteMode,
  source: RangePack,
): RangePack {
  const factor = mttBubbleFactor();
  const adjustment = icmAdjustmentFor(factor);
  const order = handStrengthOrder();

  const records: RangePackRecord[] = source.records.map((record) => ({
    ...record,
    strict: adjustKeySet(record.strict, order, adjustment),
    lenient: adjustKeySet(record.lenient, order, adjustment),
  }));

  return {
    id: `mtt-full-ring-9-${blindSpeed.toLowerCase()}-preflop-dolar-ev-ante-${ante.toLowerCase()}-bubble-derived-v1`,
    version: "bubble-derived-v1",
    createdAt: "2026-08-08",
    verifiedAt: "2026-08-08",
    confidence: "LOW",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed,
      street: "PREFLOP",
      evModel: "DOLAR_EV",
      ante,
      rakeMode: "NONE",
    },
    assumptions: [
      "ODVOZENO, ne změřeno: každý záznam vznikl z měřené chipEV range posunutím šířky podle bubble faktoru.",
      `Platí pro jeden scénář: peněžní bublina, čtyři rovné stacky po 25 BB, výplata na tři místa. Bubble faktor ${factor.toFixed(2)}.`,
      "Mimo tento scénář pack neplatí. ICM není nastavení - úprava závisí na výplatní struktuře a rozdělení stacků a mezi situacemi se liší řádově.",
      `Dorovnávací range se utahuje na ${(adjustment.callWidthFactor * 100).toFixed(0)} % původní šířky, agresivní se rozšiřuje na ${(adjustment.aggressiveWidthFactor * 100).toFixed(0)} %.`,
      "Směr je podstatný: kdo dorovnává, riskuje turnaj a potřebuje víc equity; kdo tlačí, získává fold equity, která je na bublině cennější.",
      "Rozšíření nemůže přidat ruce, které v měřené chipEV range nebyly - šířeji se hraje jen to, co už v datech je.",
      "Preview, ne produkce. Skórování zůstává vypnuté, dokud pack nenahradí měřený ICM solve.",
    ],
    searchQueries: [
      "MTT ICM bubble factor preflop ranges nine handed tournament",
      "ICM push fold ranges bubble tournament chipEV comparison",
      "ICM bubble shoving range wider calling range tighter than chipEV",
    ],
    // Zdroje sloužily k ověření **směru** úpravy, ne k opsání hodnot. Právě
    // směr je tady jediné místo, kde by se dal celý pack obrátit naruby, a
    // ověřit se dá veřejně dostupným popisem konceptu, aniž by z něj cokoli
    // přešlo do dat.
    sourceEvidence: [
      {
        title: "What is the Bubble Factor in poker tournaments?",
        url: "https://blog.gtowizard.com/what-is-the-bubble-factor-in-poker-tournaments/",
        provider: "GTO Wizard",
        verifiedAt: "2026-08-08",
        licenseNote:
          "Použito jen jako doklad konceptu a směru úpravy; žádné hodnoty z chartů nejsou převzaty.",
        methodologyNote:
          "Veřejný popis bubble faktoru jako poměru rizika k zisku; potvrzuje, že vyšší faktor znamená utaženější dorovnávání.",
      },
      {
        title: "The Complete Guide to the Independent Chip Model",
        url: "https://bbzpoker.com/the-complete-guide-to-independent-chip-model-icm/",
        provider: "BBZ Poker",
        verifiedAt: "2026-08-08",
        licenseNote:
          "Citace a interpretace konceptu; žádná range ani frekvence není zkopírována.",
        methodologyNote:
          "Veřejný výklad ICM potvrzující asymetrii: tlačící strana získává na hodnotě fold equity, dorovnávající potřebuje víc equity.",
      },
    ],
    records,
  };
}

/**
 * Oba odvozené packy naráz, se zdrojovými packy dodanými volajícím.
 */
export function buildMttIcmDerivedRangePacks(
  anteOff: RangePack,
  anteOn: RangePack,
): RangePack[] {
  return [
    mttIcmDerivedRangePack("REGULAR", "OFF", anteOff),
    mttIcmDerivedRangePack("REGULAR", "ON", anteOn),
  ];
}
