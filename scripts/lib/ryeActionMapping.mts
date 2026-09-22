import { POSITION_ORDER, type Position } from "../../src/core/types";

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
 * Překlad akcí uvnitř každého kontextu.
 *
 * **Přepsáno 26. 8. 2026 z tabulky celých slovníků.** Původně se kontext určoval
 * shodou celé sady názvů, což bylo křehké: stránka `3b/f | 3bet/call | Jam |
 * flatcall` propadla jen proto, že měla navíc `Jam`, přestože všechny čtyři
 * akce překlad mají. Dnes platí kontext tehdy, když se v něm přeloží **každá**
 * akce legendy - a když by vyhovovaly dva, stránka se nevydá, protože není jak
 * rozhodnout, na kterou otázku odpovídá.
 */
const ACTIONS_BY_CONTEXT: ReadonlyMap<MappedContext, ReadonlyMap<string, MappedAction>> =
  new Map<MappedContext, ReadonlyMap<string, MappedAction>>([
    ["VS_OPEN", new Map<string, MappedAction>([
      ["flatcall", { action: "CALL", lost: "" }],
      ["call", { action: "CALL", lost: "" }],
      ["call 2x", { action: "CALL", lost: "zdroj rozlišuje dorovnání proti dvojnásobku" }],
      ["jam", { action: "JAM", lost: "" }],
      ["all in", { action: "JAM", lost: "" }],
      ["3b/f", { action: "3BET", lost: "zdroj říká, že proti 4betu se skládá" }],
      ["3b / fold", { action: "3BET", lost: "zdroj říká, že proti 4betu se skládá" }],
      ["3b/call", { action: "3BET", lost: "zdroj říká, že proti 4betu se dorovnává" }],
      ["3bet/call", { action: "3BET", lost: "zdroj říká, že proti 4betu se dorovnává" }],
      ["3b / call 4b", { action: "3BET", lost: "zdroj říká, že proti 4betu se dorovnává" }],
      ["3b / call 4b or jam", {
        action: "3BET", lost: "zdroj říká, že proti 4betu se dorovnává nebo jamuje",
      }],
      // Hráč dorovná a počítá s tím, že za ním někdo squeezne. Jeho akcí je
      // pořád dorovnání; plán na další ulici produkt v odpovědi nemá kam dát.
      ["call / call squeeze", { action: "CALL", lost: "zdroj plánuje dorovnat i squeeze" }],
      // „Broke" = jít do konce, nasadit celý stack.
      //
      // Význam potvrdil majitel 1. 9. 2026: je to stav, kdy hráč přijde o
      // všechny žetony. V legendě je to plán do dalšího kola - táž třída
      // poznámky jako „Call 4B", jen o stupeň dál: tam se dorovnává čtyři-bet,
      // tady jde do potu zbytek stacku.
      //
      // Odemyká tři hloubky obrany raných pozic (20, 30 a 40 bb), které se
      // četly prokazatelně - nula neshod proti legendě - a zastavil je jen
      // neznámý výraz. Viz bod 163.
      ["call / broke", { action: "CALL", lost: "zdroj plánuje dorovnat a jít o celý stack" }],
      ["3b / broke", { action: "3BET", lost: "zdroj plánuje tři-bet a jít o celý stack" }],
      ["call / fold", { action: "CALL", lost: "zdroj říká, že proti další agresi se skládá" }],
      ["call and fold vs squeeze 4x", {
        action: "CALL", lost: "zdroj říká, že proti squeezi na čtyřnásobek se skládá",
      }],
      ["call / jam vs squeeze if pfa folds", {
        action: "CALL",
        lost: "zdroj plánuje jamnout proti squeezi, když otvírající složí",
      }],
      // Exploitativní tři-bet: zdroj ho odlišuje od rovnovážného, produkt ne.
      ["3b bluff exploit", {
        action: "3BET", lost: "zdroj to označuje za exploitativní blaf, ne rovnovážnou hru",
      }],
      ["call / call squeeze if pfa folds", {
        action: "CALL", lost: "zdroj plánuje dorovnat squeeze, když otvírající složí",
      }],
      ["call / fold vs squeeze", { action: "CALL", lost: "zdroj plánuje složit proti squeezi" }],
      ["call / jam vs squeeze", { action: "CALL", lost: "zdroj plánuje jamnout proti squeezi" }],
    ])],
    // Squeeze: před hrdinou je otevření **a** dorovnání. Velikost v názvu
    // (`to 11bb`) je sizing zdroje; produkt u squeeze jednu akci nerozlišuje
    // podle velikosti, takže se zapíše do poznámky.
    ["SQUEEZE", new Map<string, MappedAction>([
      ["call", { action: "CALL", lost: "" }],
      ["all in", { action: "JAM", lost: "" }],
      ["squeeze/call", { action: "SQUEEZE", lost: "zdroj říká, že proti 4betu se dorovnává" }],
      ["squeeze/fold", { action: "SQUEEZE", lost: "zdroj říká, že proti 4betu se skládá" }],
    ])],
    ["VS_3BET", new Map<string, MappedAction>([
      ["fold vs 3bet", { action: "FOLD", lost: "" }],
      ["call vs 3bet", { action: "CALL", lost: "" }],
      ["gto jam", { action: "JAM", lost: "" }],
      ["all in or call vs 3bet", {
        action: "CALL", lost: "zdroj tu spojuje dorovnání a jam do jedné barvy",
      }],
    ])],
    ["VS_ALLIN", new Map<string, MappedAction>([
      ["call", { action: "CALL_JAM", lost: "" }],
    ])],
    ["PUSH_FOLD", new Map<string, MappedAction>([
      ["all in", { action: "JAM", lost: "" }],
      ["jam", { action: "JAM", lost: "" }],
    ])],
  ]);

/**
 * Akce se sizingem v názvu, který produkt nerozlišuje.
 *
 * `Bluff Squeeze to 11bb` a `Squeeze/call to 13bb` jsou tatáž akce s jinou
 * velikostí. Velikost se zapíše do poznámky, ne do klíče: kdyby se z ní stal
 * další rozměr, mřížka by narostla o něco, co produkt hráči stejně neukáže.
 */
function normalizeSizedAction(name: string): { base: string; lost: string } {
  const sized = /^(.*?)\s+to\s+(\d+)bb$/.exec(name);
  if (sized === null) return { base: name, lost: "" };
  return { base: sized[1].trim(), lost: `zdroj uvádí velikost ${sized[2]} bb` };
}

/** Squeeze s bluffovým záměrem je pořád squeeze; záměr jde do poznámky. */
function normalizeBluffPrefix(name: string): { base: string; lost: string } {
  return name.startsWith("bluff ")
    ? { base: name.slice("bluff ".length), lost: "zdroj to řadí mezi blafy" }
    : { base: name, lost: "" };
}

/**
 * Otevírací stránky (`OP-<hloubka>BB-<sedačka>`, nabídka „Openraising").
 *
 * Barva na nich neříká „otevři", to říká každá barva; říká, **co s rukou po
 * 3betu**: `Call 3B`, `Fold vs 3B`, `4B Bluff`, `Call 3B or 4B`, `Broke vs 3B`,
 * `Call 3B vs BU`. Pro range otevření je tedy každá barvená ruka otevření a
 * plán proti 3betu jde do poznámky - produkt ho v odpovědi na otevření nemá
 * kam dát (patří kontextu `VS_3BET`, který se z téže stránky čte zvlášť, až
 * na to dojde). Jediná výjimka je `OpenJam` na 20 bb: to není otevření, ale
 * shove místo něj.
 *
 * Velikost otevření zdroj na téhle stránce neuvádí; klíč (`OPEN_2X` do 25 bb,
 * `OPEN_25X` od 30) doplní importér podle hloubky tak, jak ji učí produkt.
 * Limp/raise strategie SB (`Limp / Call`, `Raise / Fold`) sem nepatří - je to
 * blind proti blindu s vlastním slovníkem a vlastním krokem (rozhodnutí 6a:
 * RFI, rejam, BB proti limpu, squeeze); vzor je nezná a stránka se nevydá.
 *
 * Rozhodnutí vlastníka 22. 9. 2026 (6a): RYE nahrazuje vlastní export i u RFI.
 */
const RFI_PLAN_PATTERN = /^(call 3b|fold vs 3b|4b|4bet|broke vs|call or jam vs 3b|jam vs)/;

function mapOpenRaisingAction(action: string): MappedAction | undefined {
  const raw = action.trim().toLowerCase().replace(/&lt;/g, "<");
  if (raw === "openjam") return { action: "JAM", lost: "" };
  if (RFI_PLAN_PATTERN.test(raw)) return { action: "OPEN", lost: `plán proti 3betu: ${action.trim()}` };
  return undefined;
}

export function mapAction(context: MappedContext, action: string): MappedAction | undefined {
  if (context === "RFI") return mapOpenRaisingAction(action);
  const table = ACTIONS_BY_CONTEXT.get(context);
  if (table === undefined) return undefined;
  const raw = action.trim().toLowerCase();
  const sized = normalizeSizedAction(raw);
  const bluff = normalizeBluffPrefix(sized.base);
  const found = table.get(raw) ?? table.get(sized.base) ?? table.get(bluff.base);
  if (found === undefined) return undefined;
  const notes = [found.lost, sized.lost, bluff.lost].filter(Boolean).join("; ");
  return { action: found.action, lost: notes };
}

/**
 * Legendy, u kterých slova situaci neřeknou: `All in`, `Jam`, `All in | Call`.
 *
 * Jam je jam, ať hrdina otevírá, čelí otevření nebo squeezuje. Do 15. 9. 2026
 * se `All in` a `Jam` samy o sobě četly jako push/fold a jméno souboru
 * rozhodovalo jen `All in | Call`. Vlastníkova strojová kontrola proti zdroji
 * (15. 9. 2026) tím pravidlem propadla u **všech devíti** push/fold záznamů
 * draftu: `F3B-20BB-SB-vs-BTN` je z nabídky „Flatting & 3Betting", tedy SB
 * čelí otevření BTN a `Jam` je 3bet-jam; `ICM11-sb9bb-btn55bb` je SB s devíti
 * blindy proti otevření BTN; `MUL-20BB-BB-vs-CO_BTN` je squeeze proti otevření
 * a dorovnání. Ani jedna nebyla push/fold, a produkt by se hráče ptal na
 * situaci bez otvírače, kterou zdroj neřeší. Skutečné push/fold stránky
 * (`PU-10bb-*`) draft naopak neměl vůbec - jejich jméno nemá `-vs-` a situace
 * se z něj nečetla.
 *
 * Proto u těchhle legend rozhoduje **výhradně jméno souboru**, a co jméno
 * neřekne, se nevydá:
 *
 * - `PU-`  push/fold, hrdina jde první do potu.
 * - `F3B-` hrdina čelí otevření (nabídka „Flatting & 3Betting").
 * - `MUL-` squeeze, před hrdinou je otevření a dorovnání.
 * - `ICM*-r` obrana proti raisu, `ICM*-ai` čelení all-inu (přípony zdroje;
 *   `-l` by byl `VS_LIMP`, který slovník nezná).
 * - `ICM*` bez přípony s pojmenovaným soupeřem, který **jedná před hrdinou**:
 *   hrdina čelí jeho otevření. Soupeř za hrdinou by znamenal, že jde první do
 *   potu hrdina - takovou stránku zdroj nemá a nevydá se.
 *
 * `All in | Call` bez jména zůstává čelením all-inu, kde `All in` není
 * hrdinova akce a slovník ho nezná - stránka se pak nevydá, místo aby jam
 * zmizel do foldu (viz test).
 */
const JAM_VOCABULARIES = new Set(["All in", "Jam", "All in | Call"]);

function contextFromFileName(name: string): MappedContext | undefined {
  const stem = name.replace(/\.html$/i, "");
  if (/^PU-/i.test(stem)) return "PUSH_FOLD";
  if (/^OP-/i.test(stem)) return "RFI";
  if (/^F3B-/i.test(stem)) return "VS_OPEN";
  if (/^MUL-/i.test(stem)) return "SQUEEZE";
  if (!/^ICM/i.test(stem)) return undefined;
  if (/-r$/i.test(stem)) return "VS_OPEN";
  if (/-ai$/i.test(stem)) return "VS_ALLIN";
  if (/-l$/i.test(stem)) return undefined;
  const hero = situationFromFileName(name);
  if (hero === undefined) return undefined;
  const opponent = opponentFromFileName(name, hero);
  if (opponent === undefined) return undefined;
  const heroIndex = POSITION_ORDER.indexOf(hero.seat as Position);
  const opponentIndex = POSITION_ORDER.indexOf(opponent.seat as Position);
  return opponentIndex >= 0 && opponentIndex < heroIndex ? "VS_OPEN" : undefined;
}

/**
 * Kontext stránky: ten, ve kterém se přeloží **všechny** akce legendy.
 *
 * Když vyhoví víc kontextů, stránka se nevydá. Není z čeho rozhodnout, na
 * kterou otázku odpovídá, a vybrat jeden by znamenalo tipovat si situaci za
 * hráče.
 */
export function contextForVocabulary(
  actions: readonly string[],
  fileName?: string,
): MappedContext | undefined {
  if (actions.length === 0) return undefined;
  // Otevírací stránky mají slovník o plánu proti 3betu, ne o otevření; jejich
  // kontext říká jméno souboru. Bez toho by je vzor `VS_3BET` četl jako
  // odpověď na 3bet, což je jiná otázka (viz `mapOpenRaisingAction`).
  if (fileName !== undefined && /^OP-/i.test(fileName)) return "RFI";
  const vocabulary = [...actions].sort().join(" | ");
  if (JAM_VOCABULARIES.has(vocabulary)) {
    if (fileName !== undefined) return contextFromFileName(fileName);
    return vocabulary === "All in | Call" ? "VS_ALLIN" : undefined;
  }
  const fits = [...ACTIONS_BY_CONTEXT.keys()].filter(
    (context) => actions.every((action) => mapAction(context, action) !== undefined),
  );
  return fits.length === 1 ? fits[0] : undefined;
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
  // Typ musí být `number`, ne odvozený literál: `STACK_BUCKETS` je konstantní
  // pole, takže by se `best` odvodilo jako `5` a další kbelík by do něj nešel.
  let best: number = STACK_BUCKETS[0];
  for (const bucket of STACK_BUCKETS) {
    if (Math.abs(bucket - stackBB) < Math.abs(best - stackBB)) best = bucket;
  }
  return best;
}

/**
 * Kbelík, do kterého se zdrojová hloubka **smí** zapsat - nebo žádný.
 *
 * Nejbližší kbelík není totéž co kbelík, který range vystihuje. Sedm blindů
 * má nejblíž k pěti, ale strategie na pěti a na sedmi blindech se liší o
 * víc než čtyřicet procent stacku, a tvrdit, že sedmiblindová range platí
 * na pěti, je jiné tvrzení než to, které zdroj dělá. Přesně tak to vyšlo
 * z vlastníkovy kontroly 15. 9. 2026: dvě stránky `ICM7-bb7bb-*` v kbelíku
 * 5 bb dostaly „moc těsné", zatímco všech 21 stránek do 17 % od kbelíku
 * (35→30, 13→15, 18→20, 45→40) prošlo.
 *
 * Hranice je pětina kbelíku. Není odvozená z jedné stránky: leží mezi tím,
 * co prošlo (17 %), a tím, co neprošlo (40 %), s odstupem na obě strany.
 * Co je dál, se nevydá a import to spočítá jako samostatný důvod.
 */
export const BUCKET_TOLERANCE = 0.2;

export function bucketForSource(stackBB: number): number | undefined {
  const bucket = bucketForStack(stackBB);
  return Math.abs(bucket - stackBB) <= BUCKET_TOLERANCE * bucket ? bucket : undefined;
}

export interface RyeSituation {
  /** Sedačka hrdiny, slovníkem produktu. */
  seat: string;
  /** Hloubka v blindech, jak ji uvádí zdroj. */
  stackBB: number;
  /** Kolik soupeřů je ve hře před hrdinou; víc než jeden znamená multiway. */
  villains: number;
}

/**
 * Sedačky zdroje na sedačky produktu.
 *
 * **Opraveno 26. 8. 2026.** Nejdřív jsem `MP` odmítal překládat jako „skupinu
 * sedaček", a bylo to špatně. Navigace ne-ICM stránek jmenuje devět sedaček
 * v pořadí `UTG UTG1 UTG2 MP HJ CO BU SB BB`, což sedí na naše
 * `UTG UTG+1 UTG+2 LJ HJ CO BTN SB BB` seat po seatu. `MP` je tedy **čtvrtá
 * sedačka**, ne skupina, a odmítat ji znamenalo zahodit celou třetinu korpusu.
 *
 * `EP` zůstává nepřeložené a je to jiný případ: objevuje se ve víceslovných
 * multiway zápisech (`BB-vs-EP_MP`), kde označuje ranou pozici obecně, ne
 * konkrétní místo u stolu.
 */
const SEAT_ALIASES = new Map<string, string>([
  ["UTG", "UTG"], ["UTG1", "UTG+1"], ["UTG2", "UTG+2"],
  ["MP", "LJ"], ["LJ", "LJ"], ["HJ", "HJ"], ["CO", "CO"],
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
 * **Co se schválně nečte:** jména jako `SQU-40BBMais-BB-vs-CO-BU-SB` uvádějí
 * hloubku `40BBMais`, tedy „40 bb a víc". To je **rozsah hloubek, ne bod**, a do
 * jednoho kbelíku se nevejde; zvolit 40 by tvrdilo, že range platí přesně tam.
 * Takové stránky proto situaci nevrátí a nevydají se - naměřeno, je to celý
 * kontext `SQUEEZE` (10 stran, 774 kombinací), který tím zůstává stranou.
 *
 * `EP` se **nepřekládá**: je to skupina („early position"), ne konkrétní místo
 * u stolu, a objevuje se ve víceslovných multiway zápisech (`BB-vs-EP_MP`).
 */
export function situationFromFileName(name: string): RyeSituation | undefined {
  const stem = name.replace(/\.html$/i, "");
  // Tvar 1: sedačka se svou hloubkou, případně dvě takové.
  const paired = [...stem.matchAll(/(utg1|utg2|utg|ep|mp|lj|hj|co|bu|btn|sb|bb)(\d+)bb/gi)];
  if (paired.length >= 1) {
    let label = paired[0][1].toUpperCase();
    let stackBB = Number(paired[0][2]);
    // `utg20bb` je „UTG, 20 bb", ne „UTG+2, 0 bb".
    //
    // Sedačka a hloubka se v tomhle tvaru dotýkají bez oddělovače, takže
    // `utg2` snědlo dvojku z hloubky a na stack zbyla nula. Naměřeno 1. 9. 2026
    // na `ICM14-utg20bb-btn8bb`: vyšlo UTG+2 na 0 bb, tedy **jiná sedačka
    // i jiná hloubka**. V korpusu je dvanáct jmen tohohle tvaru.
    //
    // Oprava je čtení pozpátku: hloubka pod dva blindy neexistuje, takže když
    // vyjde, patří ta číslice sedačce a čte se znovu bez ní.
    if (stackBB < 2 && /^(UTG1|UTG2)$/.test(label)) {
      label = "UTG";
      stackBB = Number(`${paired[0][1].slice(-1)}${paired[0][2]}`);
    }
    const seat = SEAT_ALIASES.get(label);
    if (seat === undefined) return undefined;
    return { seat, stackBB, villains: Math.max(1, paired.length - 1) };
  }
  // Tvar 2: společná hloubka vpředu, pak `HRDINA-vs-SOUPEŘI`.
  const depth = /(?:^|[-_])(\d+)BB(?:[-_]|$)/i.exec(stem);
  const versus = /(?:^|[-_])(UTG1|UTG2|UTG|EP|MP|LJ|HJ|CO|BU|BTN|SB|BB)[-_]vs[-_]([A-Za-z0-9_+]+)/i.exec(stem);
  if (depth !== null && versus !== null) {
    const seat = SEAT_ALIASES.get(versus[1].toUpperCase());
    if (seat === undefined) return undefined;
    // `EP_MP` znamená dva soupeře, tedy multiway.
    const villains = versus[2].split(/[_]/).filter(Boolean).length;
    return { seat, stackBB: Number(depth[1]), villains: Math.max(1, villains) };
  }
  // Tvar 3: push/fold, `PU-10bb-BU` - hloubka a hrdina, žádný soupeř.
  //
  // Do 15. 9. 2026 tenhle tvar propadal jako „bez situace" a draft tak neměl
  // ani jednu skutečnou push/fold stránku; devět, které za ni vydával, byly
  // jamy proti otevření (viz `contextFromFileName`).
  const push = /^PU-(\d+)bb-(UTG1|UTG2|UTG|MP|LJ|HJ|CO|BU|BTN|SB)$/i.exec(stem);
  if (depth !== null && push !== null) {
    const seat = SEAT_ALIASES.get(push[2].toUpperCase());
    if (seat === undefined) return undefined;
    return { seat, stackBB: Number(push[1]), villains: 0 };
  }
  // Tvar 4: otevření, `OP-100BB-BU` - hloubka a hrdina, žádný soupeř (22. 9. 2026, 6a).
  const open = /^OP-(\d+)BB-(UTG1|UTG2|UTG|MP|LJ|HJ|CO|BU|BTN|SB)$/i.exec(stem);
  if (open !== null) {
    const seat = SEAT_ALIASES.get(open[2].toUpperCase());
    if (seat === undefined) return undefined;
    return { seat, stackBB: Number(open[1]), villains: 0 };
  }
  return undefined;
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
  const paired = [...stem.matchAll(/(utg1|utg2|utg|ep|mp|lj|hj|co|bu|btn|sb|bb)(\d+)bb/gi)];
  if (paired.length >= 2) {
    const seat = SEAT_ALIASES.get(paired[1][1].toUpperCase());
    return seat === undefined ? undefined : { seat, stackBB: Number(paired[1][2]) };
  }
  const versus = /(?:^|[-_])(?:UTG1|UTG2|UTG|EP|MP|LJ|HJ|CO|BU|BTN|SB|BB)[-_]vs[-_]([A-Za-z0-9+]+)/i.exec(stem);
  if (versus === null) return undefined;
  const seat = SEAT_ALIASES.get(versus[1].toUpperCase());
  // Když zdroj hloubku soupeře neuvádí, je společná - je to jedna hloubka stolu.
  return seat === undefined ? undefined : { seat, stackBB: hero.stackBB };
}
