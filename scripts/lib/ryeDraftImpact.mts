import {
  REJAM_EV_OPENER_BY_HERO,
  bucketsForContext,
  bucketsWithSpots,
  positionsForContext,
} from "../../src/core/drillEngine";
import type { ActionContext, Position, StackBucket } from "../../src/core/types";
import { createRangeStoreFromRangePack, type RangeStore } from "../../src/data/rangeStore";
import { mttPreflopRangePackForProfile } from "../../src/data/ranges/mttPreflopRangePacks";
import { createMttProductionLazyLoader } from "../../src/data/ranges/mttProductionLazyLoader";

/**
 * Co by schválená mřížka draftu udělala s odpovědí, kterou hráč dostane dnes.
 *
 * ## Proč to bydlí tady
 *
 * Počítala to stránka ke čtení, aby uměla řadit podle dopadu. Zapisovač
 * odpovědí to ale potřebuje taky, a to z důvodu, který je vážnější než sdílení
 * kódu: do 4. 9. 2026 uměl vypsat jen **kolik mřížek je schválených**, což je
 * číslo o vyrobené práci, ne o doručení. Přesně proti tomu stojí pravidlo 4 -
 * měří se, co dojde k hráči. Dvě kopie téhož výpočtu by se navíc rozešly tiše
 * a každá strana by o téže mřížce tvrdila něco jiného.
 */

export interface DraftRecord {
  position: string;
  bucket: number;
  context: string;
  /** Sedačka, která otevřela. Prázdná u kontextů, kde otvírač není. */
  vsSeat: string;
  stackSetupId: string;
  /** Stacky u stolu podle scénáře ICM (sedačka → bb); jen u ICM stránek. */
  stackSetup?: Record<string, number>;
  sourceStackBB: number;
  /**
   * Koše, na které stránka platí, když její jméno mluví o pásmu hloubek
   * (`SQU-40BBMais-…`, `BBSTR-vs-SB-Limp-20-25BB`). Chybí u stránek s jednou
   * hloubkou; `bucket` je vždycky jedním z nich.
   */
  bucketSpan?: number[];
  strict: Record<string, string[]>;
  lenient: Record<string, string[]>;
  /** ruka → akce a jak často ji zdroj hraje (jen u mixů). */
  mix?: Record<string, Record<string, number>>;
  /** ruka → jak často ji zdroj otevírá; jen u `VS_3BET` a jen u ruky otevírané zčásti. */
  openedShare?: Record<string, number>;
  notes: string[];
  sourceFile: string;
  /**
   * Stránka kreslí jen jednu větev strategie (viz `RyeGrid.partial`), takže
   * neobarvená buňka na ní neznamená fold, ale „o téhle ruce nic neříkám“.
   * Takový záznam se do packu nepouští.
   */
  partial?: true;
}

export interface DraftFile {
  createdAt: string;
  confidence: string;
  assumptions: string[];
  recordCount: number;
  records: DraftRecord[];
}

/**
 * O kolik by se změnila odpověď, kterou hráč dostane dnes.
 *
 * Měří se proti tomu, co hráč dostane **teď** na tutéž otázku: proti
 * produkčnímu packu REGULAR / ante OFF, se sedačkou otvírače v klíči. Kde už
 * v packu zpřesněný záznam z téhle mřížky je, vyjde nula - a to je správně,
 * dopad schválení je nulový, protože je doručené.
 *
 * Do 17. 9. 2026 se měřilo proti obecnému záznamu legacy indexu
 * (`getRangeRecord("OFF", …)` bez otvírače). Dokud produkt osu otvírače
 * neměl, bylo to totéž; po bodu 253 to tvrdilo o 65 mřížkách, které v
 * produkci už byly, 1 391 tříd „kde by se odpověď změnila" (bod 256).
 */
export interface DraftImpact {
  /** Tříd, kde by se doporučená akce lišila od dnešní odpovědi. */
  changed: number;
  /** Tříd, které dnešní odpověď zná. Bez nich není s čím srovnávat. */
  compared: number;
  /** Buňka, kterou knihovna dnes nemá vůbec - draft by ji přidal. */
  newCell: boolean;
  /**
   * Mřížka, která by rozsvítila kombinaci filtrů rozdávající dnes **nula** spotů.
   *
   * Změřeno 27. 8. 2026: nabídka trenažéru je širší než obsah, takže relace
   * „push/fold, 20 BB" nerozdá nic - a v draftu je pro ni šest mřížek. To je ze
   * všech dopadů ten nejhmatatelnější: nejde o přesnější odpověď, ale o to, že
   * odpověď vůbec bude.
   */
  unlocksEmpty: boolean;
  /** Hloubka nebo sedačka, kterou trenažér u tohohle kontextu vůbec nerozdává. */
  notDrilled: boolean;
}

/**
 * Produkční pack, proti kterému se dopad měří.
 *
 * `mttPreflopRangePackForProfile` vrací produkční pack až po registraci lazy
 * loaderem - v aplikaci to dělá `main.ts`, v CLI nikdo. Bez téhle registrace
 * by se měřilo nad převedeným legacy packem (1.0.0), který má ze zpřesněných
 * záznamů jen obranu BB proti SB; změřeno 17. 9. 2026 nad týmž obsahem 8,8 %
 * proti 30,4 % doručení. Proto se `impactOf` bez registrace odmítne: číslo z
 * jiného packu vypadá jako měření.
 */
let productionStore: RangeStore | undefined;

export async function loadProductionStoreForImpact(): Promise<RangeStore> {
  if (productionStore !== undefined) return productionStore;
  await createMttProductionLazyLoader().loadAll();
  const pack = mttPreflopRangePackForProfile({
    gameVariant: "MTT", tableFormat: "FULL_RING_9", blindSpeed: "REGULAR", street: "PREFLOP",
    evModel: "CHIP_EV", ante: "OFF", rakeMode: "NONE",
  });
  if (pack === undefined || !/-production-v\d+$/.test(pack.id)) {
    throw new Error(`Produkční pack REGULAR / ante OFF není registrovaný (našel se ${pack?.id ?? "žádný"}).`);
  }
  productionStore = createRangeStoreFromRangePack(pack);
  return productionStore;
}

export function impactOf(record: DraftRecord): DraftImpact {
  if (productionStore === undefined) {
    throw new Error("impactOf: nejdřív await loadProductionStoreForImpact() - jinak by se měřilo nad legacy packem.");
  }
  const current = productionStore.lookup({
    ante: "OFF",
    position: record.position as Position,
    bucket: record.bucket as StackBucket,
    context: record.context as ActionContext,
    ...(record.vsSeat === "" ? {} : { vsSeat: record.vsSeat as Position }),
  });
  // Dvě různé nuly, které vypadají stejně.
  //
  // „Nabízí se, ale nemáme obsah" se dá spravit tímhle draftem. „U tohohle
  // kontextu se ta hloubka vůbec nerozdává" se spravit nedá a číst tu mřížku
  // je dnes ztráta času. Prvních dvanáct označených obsahovalo čtyři z toho
  // druhého druhu, než se to rozlišilo.
  const context = record.context as ActionContext;
  const bucket = record.bucket as StackBucket;
  // Nabídnutá buňka musí sedět v **obou** rozměrech. Sedačka se sem doplnila
  // 28. 8. 2026, když se ukázalo, že stránka tvrdila „přidal by novou odpověď"
  // u `VS_OPEN|UTG+1` - jenže obranu proti otevření trenažér rozdává až od
  // lojacku, takže by ta mřížka po schválení nezměnila nic.
  const offered = bucketsForContext(context).includes(bucket)
    && positionsForContext(context).includes(record.position as Position);
  const live = bucketsWithSpots([context], "OFF").includes(bucket);
  const unlocksEmpty = offered && !live;
  const notDrilled = !offered;
  if (current === undefined) {
    return { changed: 0, compared: 0, newCell: true, unlocksEmpty, notDrilled };
  }
  let changed = 0;
  let compared = 0;
  for (const [hand, actions] of Object.entries(record.strict)) {
    const mine = current.strict[hand];
    // Ruka, kterou dnešní odpověď nezná, není neshoda - je to prázdno. Počítat
    // ji jako změnu by nafouklo každou mřížku na stovku.
    if (mine === undefined) continue;
    compared += 1;
    const same = mine.length === actions.length
      && [...mine].sort().join("|") === [...actions].sort().join("|");
    if (!same) changed += 1;
  }
  return { changed, compared, newCell: false, unlocksEmpty, notDrilled };
}

/**
 * Buňka, kterou produkt umí adresovat: kontext, sedačka, hloubka **a otvírač**.
 *
 * Do 16. 9. 2026 bez otvírače - produkt tu osu neměl (bod 140) a dvě mřížky
 * lišící se jen otvíračem mířily do jedné buňky. Od bodu 253 je otvírač v
 * klíči (`RangeKey.vsSeat`, zpřesněný záznam v packu), takže se ty mřížky
 * nesráží: každá je vlastní odpověď na vlastní otázku.
 */
export function cellOf(record: DraftRecord): string {
  return `${record.context}|${record.position}|${record.bucket}|vs${record.vsSeat || "—"}`;
}

/** Rozložení stacků, které je chipEV: všechno kromě scénářů ICM. */
export function isChipEvSetup(stackSetupId: string): boolean {
  return !/^ICM/i.test(stackSetupId);
}

/**
 * Mřížky, které se v produktu srazí, protože se liší jen **rozložením stacků**.
 *
 * ## Co zbylo ze srážek po ose otvírače
 *
 * Do 16. 9. 2026 se tu počítaly mřížky lišící se otvíračem - změřeno 5. 9.
 * 2026: 17 sražených buněk, 421 tříd. Osa otvírače (bod 253) je rozpustila.
 * Co zbývá, je druhá osa, kterou klíč produktu nemá: **hloubka protihráče a
 * scénář ICM**. Změřeno 17. 9. 2026 nad draftem 118 mřížek: 10 klíčů nese víc
 * mřížek a v každém z nich je aspoň jedna ICM (`ICM-sb18bb-btn35bb`,
 * `ICM3-sb18bb-btn75bb`, `ICM5-…`, `ICM7-…` všechny na `VS_OPEN|SB|20|vsBTN`).
 *
 * Pro chipEV pack to srážka není: ICM mřížka do něj nejde vůbec (bod 253,
 * `icm`), takže chipEV mřížka přistane sama. Srážka je to teprve pro $EV pack,
 * až bude - a řeší se tím, že klíč dostane scénář (`RangeRefinement.stackSetupId`
 * už existuje, jen ho žádný pack nenese).
 *
 * Sráží se jen tehdy, když si **odporují**. Dvě mřížky se stejným doporučením
 * se dají uložit obě a nic se nerozhoduje.
 */
export interface SeatCollision {
  cell: string;
  /** Rozložení stacků, pro která draft tu buňku popisuje. */
  setups: string[];
  /** Tříd rukou, kde se ty mřížky mezi sebou neshodnou. */
  disagreeing: number;
  /**
   * Rozložení, které v chipEV packu přistane samo - jediné chipEV v té buňce.
   * `undefined`, když jsou v buňce dvě chipEV, nebo žádné (samé ICM).
   */
  chipEvSetup?: string;
  /**
   * Kolik **mřížek** (ne rozložení) si tu buňku nárokuje v chipEV.
   *
   * Do 1. 10. 2026 se počítala jen rozložení, takže tři mřížky rodiny MUL
   * v jedné buňce daly `setups = ["MUL"]`, tedy „jedno chipEV" - a stránka
   * ke kontrole pak tvrdila **u každé ze tří**, že je ta jediná. Změřeno na
   * id 138, 139 a 140: všechny tři chipEV, liší se o 2 az 10 tříd ze 169.
   * Rozložení je osa klíče; mřížka je to, co doopravdy přistane.
   */
  chipEvGrids: number;
  /** Přistane v chipEV packu bez rozhodování? */
  resolved: boolean;
}

/**
 * Otvírač, kterého produkt u téhle sedačky předpokládá při ocenění re-jamu.
 *
 * Do 16. 9. 2026 rozhodoval o sražené buňce (volba majitele ze 4. 9. 2026);
 * s otvíračem v klíči už nerozhoduje nic, zůstává jako údaj o ceně.
 */
export function assumedOpenerFor(position: string): string | undefined {
  return REJAM_EV_OPENER_BY_HERO[position];
}

/**
 * Přistane schválení téhle mřížky v chipEV packu, nebo se zastaví o srážku?
 *
 * Čtecí stránka řadí podle dopadu - kolik tříd by se změnilo. Jenže dopad není
 * doručení. Tohle rozlišení patří ke čtení, ne až k importu: majitel čte
 * odshora a má mít nahoře to, co po schválení doopravdy dojde k hráči.
 *
 * - `PŘISTANE` - buňka je jen její, nebo je to jediná chipEV mřížka v buňce.
 * - `SRÁŽKA` - do buňky míří víc mřížek, které si odporují, a tahle sama
 *   nepřistane: buď je ICM (čeká na $EV pack se scénářem v klíči), nebo jsou v
 *   buňce dvě chipEV a rozhodnout musí člověk.
 */
export type DraftLanding = "PŘISTANE" | "SRÁŽKA";

export function draftLanding(
  record: DraftRecord,
  collisions: readonly SeatCollision[],
): DraftLanding {
  const collision = collisions.find((row) => row.cell === cellOf(record));
  if (collision === undefined) return "PŘISTANE";
  return collision.resolved && record.stackSetupId === collision.chipEvSetup ? "PŘISTANE" : "SRÁŽKA";
}

export function seatCollisions(records: readonly DraftRecord[]): SeatCollision[] {
  const byCell = new Map<string, DraftRecord[]>();
  for (const record of records) {
    const cell = cellOf(record);
    byCell.set(cell, [...(byCell.get(cell) ?? []), record]);
  }

  const collisions: SeatCollision[] = [];
  for (const [cell, group] of byCell) {
    if (group.length < 2) continue;
    const hands = new Set(group.flatMap((record) => Object.keys(record.strict)));
    let disagreeing = 0;
    for (const hand of hands) {
      const answers = new Set(
        group.map((record) => [...(record.strict[hand] ?? [])].sort().join("|")),
      );
      // Prázdno není neshoda: ruka mimo jednu range a v druhé je jiná otázka
      // než dvě různá doporučení pro tutéž ruku.
      answers.delete("");
      if (answers.size > 1) disagreeing += 1;
    }
    if (disagreeing === 0) continue;
    const setups = [...new Set(group.map((record) => record.stackSetupId))].sort();
    const chipEv = setups.filter(isChipEvSetup);
    // Mřížky, ne rozložení: rodina MUL nese v názvu i toho, kdo otevření
    // dorovnal, a ten se do klíče nedostane - takže se v jedné buňce sejde víc
    // mřížek téhož rozložení. Viz `chipEvGrids`.
    const chipEvGrids = group.filter((record) => isChipEvSetup(record.stackSetupId)).length;
    collisions.push({
      cell,
      setups,
      disagreeing,
      // Fail-closed: dvě chipEV **mřížky** v jedné buňce se nerozhodují odhadem.
      // Vybrat libovolnou by znamenalo tvrdit o range něco, co pro ni nikdo
      // nezvolil - a do 1. 10. 2026 se přesně to dělo mlčky, protože podmínka
      // počítala rozložení.
      ...(chipEvGrids === 1 ? { chipEvSetup: chipEv[0] } : {}),
      chipEvGrids,
      resolved: chipEvGrids === 1,
    });
  }
  return collisions.sort((left, right) => right.disagreeing - left.disagreeing);
}
