import {
  REJAM_EV_OPENER_BY_HERO,
  bucketsForContext,
  bucketsWithSpots,
  positionsForContext,
} from "../../src/core/drillEngine";
import { getRangeRecord } from "../../src/data/ranges/index";
import type { ActionContext, Position, StackBucket } from "../../src/core/types";

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
  sourceStackBB: number;
  strict: Record<string, string[]>;
  lenient: Record<string, string[]>;
  /** ruka → akce a jak často ji zdroj hraje (jen u mixů). */
  mix?: Record<string, Record<string, number>>;
  notes: string[];
  sourceFile: string;
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
 * Měří se proti **obecnému** záznamu, tedy tomu, co hráč dostane teď - ne proti
 * zpřesněnému. To je celý smysl `vsSeat`: dnešní odpověď na „kdo otevřel"
 * nehledí, a tohle číslo říká, kolik ho to stojí u téhle konkrétní mřížky.
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

export function impactOf(record: DraftRecord): DraftImpact {
  const current = getRangeRecord(
    "OFF",
    record.position as Position,
    record.bucket as StackBucket,
    record.context as ActionContext,
  );
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

/** Buňka, kterou produkt umí adresovat: sedačka, hloubka, kontext. Bez otvírače. */
export function cellOf(record: DraftRecord): string {
  return `${record.context}|${record.position}|${record.bucket}`;
}

/**
 * Mřížky, které se v produktu srazí, protože se liší jen otvíračem.
 *
 * ## Proč tohle číslo musí zaznít dřív, než se něco zapíše
 *
 * Draft je cenný právě tím, že rozlišuje, **kdo otevřel** - audit zdrojů z
 * 3. 9. 2026 to vyčíslil na 11,7 bodu v průměru a 26,9 u big blindu. Jenže
 * produkt tu osu nemá: `TableState` nese `facing`, ne sedačku otvírače, a
 * `getRangeRecord` se ptá jen na (sedačka, hloubka, kontext). Dvě schválené
 * mřížky proti různým otvíračům tedy míří do jedné buňky.
 *
 * Sráží se ale jen tehdy, když si **odporují**. Dvě mřížky se stejným
 * doporučením se dají uložit obě a nic se nerozhoduje; teprve neshoda nutí
 * vybrat, a to je rozhodnutí o rozsahu produktu (bod 140), ne úloha importu.
 */
export interface SeatCollision {
  cell: string;
  /** Otvírači, proti kterým draft tu buňku popisuje. */
  seats: string[];
  /** Tříd rukou, kde se ty mřížky mezi sebou neshodnou. */
  disagreeing: number;
  /**
   * Otvírač, kterého produkt u téhle sedačky **už dnes předpokládá**, nebo
   * `undefined`, když pro ni žádný předpoklad nemá.
   */
  assumedSeat?: string;
  /** Sedí některá z těch mřížek na ten předpoklad? */
  resolved: boolean;
}

/**
 * Otvírač, proti kterému je chart pro tuhle sedačku kreslený.
 *
 * Není to konstanta a nesmí se za ni vydávat: mapování je **na sedačku hrdiny**
 * (hijack pro blindy, button a cutoff; lojack pro hijack; UTG+1 pro lojack) a
 * bydlí v `drillEngine`, protože podle něj se dnes počítá cena re-jamu. Volba
 * „bezpečné konstanty" ho jednou přebila a při 15 BB označila 167 rukou za
 * ztrátové, které chart jamuje.
 *
 * Majitel 4. 9. 2026 zvolil, že u sražené buňky se vezme mřížka proti tomuhle
 * otvírači - tím se z dnešního předpokladu produktu stane pravda a nemění se
 * nic z toho, co se rozdává.
 */
export function assumedOpenerFor(position: string): string | undefined {
  return REJAM_EV_OPENER_BY_HERO[position];
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
    const seats = [...new Set(group.map((record) => record.vsSeat || "—"))].sort();
    // Předpoklad se čte podle sedačky hrdiny, ne podle buňky jako celku.
    const assumedSeat = assumedOpenerFor(group[0].position);
    collisions.push({
      cell,
      seats,
      disagreeing,
      assumedSeat,
      // Fail-closed: když mezi mřížkami ta předpokládaná není, spor se
      // nerozhoduje odhadem. Vybrat libovolnou by znamenalo tvrdit o range
      // něco, co pro ni nikdo nezvolil.
      resolved: assumedSeat !== undefined && seats.includes(assumedSeat),
    });
  }
  return collisions.sort((left, right) => right.disagreeing - left.disagreeing);
}
