/**
 * Překlad akcí z vlastníkova korpusu do slovníku produktu.
 *
 * ## Proč to stojí zvlášť a s odůvodněním u každé položky
 *
 * Zdroj pojmenovává akce po svém: `3b/f`, `3B / Call 4B or Jam`, `Call / Call
 * Squeeze if PFA folds`. Produkt zná `3BET`, `CALL`, `JAM`, `SQUEEZE` a devět
 * kontextů. Ten překlad **je odborné rozhodnutí o pokeru**, ne technikálie, a
 * špatný překlad se nijak neprojeví - hráč dostane sebejistou odpověď na jinou
 * otázku, než položil.
 *
 * Proto platí tři zásady:
 *
 * 1. Co se nedá přeložit jednoznačně, **nemá překlad** a nevydá se.
 * 2. Kontext se bere ze **slovníku celé stránky**, ne z jedné akce: `Call` u
 *    stránky s `All in` znamená dorovnání jamu (`VS_ALLIN`), kdežto `Call` u
 *    stránky s `3b/f` znamená dorovnání otevření (`VS_OPEN`).
 * 3. Rozlišení „co se stane potom" zdroj nese (`3B / Call 4B` proti `3B / Fold`),
 *    ale produkt ho v jedné odpovědi nemá kam dát. Obojí je tedy `3BET` a ten
 *    rozdíl se **zahodí vědomě**; poznámka u řádku ho zachová pro člověka.
 */

/** Kontext tréninku, jak ho zná produkt. */
export type MappedContext =
  | "RFI"
  | "VS_OPEN"
  | "VS_3BET"
  | "VS_4BET"
  | "SQUEEZE"
  | "PUSH_FOLD"
  | "VS_ALLIN";

export interface MappedAction {
  /** Klíč akce v produktu. */
  action: string;
  /** Co se překladem ztratilo, pro poznámku u řádku. Prázdné, když nic. */
  lost: string;
}

/**
 * Kontext podle **celého slovníku** stránky, ne podle jedné akce.
 *
 * Klíč je seřazený seznam názvů akcí spojený svislítkem - tedy přesně to, co
 * vypíše `mtt:rye-corpus --vocab`. Co tu není, se nepřekládá.
 */
const CONTEXT_BY_VOCABULARY = new Map<string, MappedContext>([
  // Hráč čelí otevření: může složit, dorovnat, zvýšit nebo jamnout.
  ["3b/call | 3b/f | Jam", "VS_OPEN"],
  ["3b/f | 3bet/call | flatcall", "VS_OPEN"],
  ["3B / Call 4B | 3B / Call 4B or Jam | 3B / Fold | Call", "VS_OPEN"],
  ["3B / Call 4B | 3B / Call 4B or Jam | 3B / Fold | Call | Call 2x", "VS_OPEN"],
  // Hráč čelí jamu. `All in` tu není jeho akce, ale soupeřova - jeho volba je
  // dorovnat, nebo složit, takže `Call` je `CALL_JAM`.
  ["All in | Call", "VS_ALLIN"],
  // Hráč otevřel a čelí 3betu.
  ["All in or call vs 3bet | Fold vs 3bet", "VS_3BET"],
  ["All in or call vs 3bet | Call vs 3bet | Fold vs 3bet | GTO Jam", "VS_3BET"],
  // Čistý push/fold: jediná barevná akce je jam, zbytek skládá.
  ["All in", "PUSH_FOLD"],
  ["Jam", "PUSH_FOLD"],
]);

/**
 * Slovníky, které se **schválně nepřekládají**, i když se ověřily.
 *
 * Není to opomenutí, je to odmítnutí. U každého je napsané proč, aby se to
 * příště neřešilo znovu od nuly.
 */
export const REFUSED_VOCABULARIES = new Map<string, string>([
  [
    "15bb | 20bb | 25bb | 30bb",
    "barvy neznamenají akci, ale hloubku, při které se ruka hraje - je to jiný "
    + "druh mapy než range jedné situace a do řádku (pozice, kbelík, kontext) se nevejde",
  ],
  [
    "15bb | 20bb | 25bb | 30bb | 3B/Call",
    "totéž: čtyři barvy jsou hloubky, pátá je akce, takže stránka míchá dvě osy",
  ],
  [
    "3B Bluff Exploit | Call / Broke | Call / Fold | Jam",
    "`Call / Broke` a `3B Bluff Exploit` jsou exploatační poznámky proti konkrétní "
    + "populaci, ne baseline strategie; produkt je odlišit neumí a tvrdit je jako GTO by lhalo",
  ],
]);

/**
 * Akce → klíč produktu, uvnitř daného kontextu.
 *
 * Vrací `undefined`, když překlad neexistuje; volající takový řádek zahodí.
 */
export function mapAction(context: MappedContext, action: string): MappedAction | undefined {
  const name = action.trim().toLowerCase();
  if (context === "VS_ALLIN") {
    if (name === "call") return { action: "CALL_JAM", lost: "" };
    // `All in` je tu soupeřova akce, ne hráčova.
    if (name === "all in") return undefined;
  }
  if (context === "PUSH_FOLD") {
    if (name === "all in" || name === "jam") return { action: "JAM", lost: "" };
  }
  if (context === "VS_3BET") {
    if (name === "fold vs 3bet") return { action: "FOLD", lost: "" };
    if (name === "call vs 3bet") return { action: "CALL", lost: "" };
    if (name === "gto jam") return { action: "JAM", lost: "" };
    // Zdroj tu spojuje dvě různé odpovědi do jedné barvy. Produkt čtyřbet a jam
    // rozlišuje, takže se vydá ta konzervativnější a rozdíl se zapíše.
    if (name === "all in or call vs 3bet") {
      return { action: "CALL", lost: "zdroj tu spojuje dorovnání a jam do jedné barvy" };
    }
  }
  if (context === "VS_OPEN") {
    if (name === "flatcall" || name === "call") return { action: "CALL", lost: "" };
    if (name === "call 2x") {
      return { action: "CALL", lost: "zdroj rozlišuje dorovnání proti dvojnásobku" };
    }
    if (name === "jam") return { action: "JAM", lost: "" };
    if (name === "3b/f" || name === "3b / fold") {
      return { action: "3BET", lost: "zdroj říká, že proti 4betu se skládá" };
    }
    if (name === "3b/call" || name === "3bet/call" || name === "3b / call 4b") {
      return { action: "3BET", lost: "zdroj říká, že proti 4betu se dorovnává" };
    }
    if (name === "3b / call 4b or jam") {
      return { action: "3BET", lost: "zdroj říká, že proti 4betu se dorovnává nebo jamuje" };
    }
  }
  return undefined;
}

/** Kontext stránky podle jejího slovníku, nebo `undefined`. */
export function contextForVocabulary(actions: readonly string[]): MappedContext | undefined {
  return CONTEXT_BY_VOCABULARY.get([...actions].sort().join(" | "));
}

/**
 * Kbelík hloubky, do kterého zdrojová hloubka spadá.
 *
 * Zaokrouhluje se **na nejbližší** kbelík, ne dolů: 13 bb je blíž patnácti než
 * desítce a hrát ho podle desetiblindové strategie by bylo horší přiblížení.
 * Zdrojová hloubka zůstává v řádku zvlášť, takže se nezakryje.
 */
export const STACK_BUCKETS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150] as const;

export function bucketForStack(stackBB: number): number {
  let best = STACK_BUCKETS[0];
  for (const bucket of STACK_BUCKETS) {
    if (Math.abs(bucket - stackBB) < Math.abs(best - stackBB)) best = bucket;
  }
  return best;
}

export interface RyeSituation {
  /** Sedačka hrdiny, slovníkem produktu. */
  seat: string;
  /** Hloubka v blindech, jak ji uvádí zdroj. */
  stackBB: number;
  /** Kolik soupeřů je ve hře před hrdinou; víc než jeden znamená multiway. */
  villains: number;
}

/** Sedačky zdroje na sedačky produktu. `EP`/`MP` jsou skupiny, ne sedačky. */
const SEAT_ALIASES = new Map<string, string>([
  ["UTG", "UTG"], ["LJ", "LJ"], ["HJ", "HJ"], ["CO", "CO"],
  ["BU", "BTN"], ["BTN", "BTN"], ["SB", "SB"], ["BB", "BB"],
]);

/**
 * Situace ze jména souboru, přes obě konvence, které korpus používá.
 *
 * Zdroj jmenuje soubory dvěma způsoby a **první čtení pokrylo jen jeden**:
 *
 *   ICM-btn35bb-co60bb.html       hloubka je u sedačky
 *   F3B-100BB-BTN-vs-UTG.html     hloubka je společná a stojí vpředu
 *
 * Naměřeno 26. 8. 2026: první tvar má 166 souborů, druhý stovky - takže čtení
 * jen prvního podhodnotilo pokrytí zhruba desetinásobně a málem z toho vzniklo
 * špatné doporučení, jestli se import vyplatí.
 *
 * `EP` a `MP` se **nepřekládají**: jsou to skupiny sedaček („early", „middle"),
 * ne konkrétní místo u stolu. Tvrdit, že `MP` je `HJ`, by přiřadilo range
 * sedačce, pro kterou nevznikla.
 */
export function situationFromFileName(name: string): RyeSituation | undefined {
  const stem = name.replace(/\.html$/i, "");
  // Tvar 1: sedačka se svou hloubkou, případně dvě takové.
  const paired = [...stem.matchAll(/(utg|ep|mp|lj|hj|co|bu|btn|sb|bb)(\d+)bb/gi)];
  if (paired.length >= 1) {
    const seat = SEAT_ALIASES.get(paired[0][1].toUpperCase());
    if (seat === undefined) return undefined;
    return { seat, stackBB: Number(paired[0][2]), villains: Math.max(1, paired.length - 1) };
  }
  // Tvar 2: společná hloubka vpředu, pak `HRDINA-vs-SOUPEŘI`.
  const depth = /(?:^|[-_])(\d+)BB(?:[-_]|$)/i.exec(stem);
  const versus = /(?:^|[-_])(UTG|EP|MP|LJ|HJ|CO|BU|BTN|SB|BB)[-_]vs[-_]([A-Za-z_]+)/i.exec(stem);
  if (depth === null || versus === null) return undefined;
  const seat = SEAT_ALIASES.get(versus[1].toUpperCase());
  if (seat === undefined) return undefined;
  // `EP_MP` znamená dva soupeře, tedy multiway.
  const villains = versus[2].split(/[_]/).filter(Boolean).length;
  return { seat, stackBB: Number(depth[1]), villains: Math.max(1, villains) };
}

/**
 * Soupeř, proti kterému range platí - to, co dnešnímu modelu chybí.
 *
 * Zdroj ho zná u obou svých konvencí jmen: `ICM-btn35bb-co60bb` říká hloubku
 * obou, `F3B-100BB-BTN-vs-UTG` říká sedačku soupeře a společnou hloubku.
 */
export interface RyeOpponent {
  seat: string;
  /** Hloubka soupeře, když ji zdroj uvádí zvlášť. Jinak společná s hrdinou. */
  stackBB: number;
}

export function opponentFromFileName(
  name: string,
  hero: RyeSituation,
): RyeOpponent | undefined {
  const stem = name.replace(/\.html$/i, "");
  const paired = [...stem.matchAll(/(utg|ep|mp|lj|hj|co|bu|btn|sb|bb)(\d+)bb/gi)];
  if (paired.length >= 2) {
    const seat = SEAT_ALIASES.get(paired[1][1].toUpperCase());
    return seat === undefined ? undefined : { seat, stackBB: Number(paired[1][2]) };
  }
  const versus = /(?:^|[-_])(?:UTG|EP|MP|LJ|HJ|CO|BU|BTN|SB|BB)[-_]vs[-_]([A-Za-z]+)/i.exec(stem);
  if (versus === null) return undefined;
  const seat = SEAT_ALIASES.get(versus[1].toUpperCase());
  // Když zdroj hloubku soupeře neuvádí, je společná - je to jedna hloubka stolu.
  return seat === undefined ? undefined : { seat, stackBB: hero.stackBB };
}
