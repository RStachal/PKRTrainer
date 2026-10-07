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
  | "VS_LIMP"
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
      // Pátý pravopis téhož plánu; na 14 hlubokých stránkách obrany je jediný,
      // který slovník neznal, a tím padaly celé (naměřeno 24. 9. 2026).
      ["call / call or jam vs squeeze", {
        action: "CALL", lost: "zdroj plánuje proti squeezi dorovnat nebo jamnout",
      }],
    ])],
    // Squeeze: před hrdinou je otevření **a** dorovnání. Velikost v názvu
    // (`to 11bb`) je sizing zdroje; produkt u squeeze jednu akci nerozlišuje
    // podle velikosti, takže se zapíše do poznámky.
    // Squeeze má v korpusu čtyři pravopisy téhož: `squeeze/call`, `Squeeze call`,
    // `Squeeze / Fold`, `SQUEEZE/FOLD`. Mezery kolem lomítka srovnává
    // `normalizeSeparators`, zbytek je tady - a schválně vyjmenovaný, ne přes
    // vzor: barva, kterou slovník nezná, musí stránku shodit, ne spadnout do
    // foldu (bod 225).
    ["SQUEEZE", new Map<string, MappedAction>([
      ["call", { action: "CALL", lost: "" }],
      ["all in", { action: "JAM", lost: "" }],
      ["squeeze/call", { action: "SQUEEZE", lost: "zdroj říká, že proti 4betu se dorovnává" }],
      ["squeeze/fold", { action: "SQUEEZE", lost: "zdroj říká, že proti 4betu se skládá" }],
      ["squeeze/call range", { action: "SQUEEZE", lost: "zdroj říká, že proti 4betu se dorovnává" }],
      ["squeeze for value but fold", { action: "SQUEEZE", lost: "zdroj říká, že proti 4betu se skládá" }],
      ["bluff squeezes", { action: "SQUEEZE", lost: "zdroj to vede jako bluffovou část range" }],
      // Multiway stránky píšou barvu jen „Bluff Squeeze to 13bb": po odloupnutí
      // velikosti a blafu zbude holé `squeeze`, které slovník neznal - a protože
      // kontext se hledá podle **všech** barev, padala celá stránka. Plán proti
      // 4betu tu zdroj neuvádí, takže se ani nepředstírá.
      ["squeeze", { action: "SQUEEZE", lost: "" }],
      /*
       * `3bet/call` ve squeeze spotu je **squeeze**, ne 3bet.
       *
       * Do 1. 10. 2026 šel na 3BET, protože se čte doslova. Jenže tady už před
       * hrdinou leží otevření **a** dorovnání, takže navýšení na 9 bb je jedna
       * a tatáž akce, ať ji zdroj pojmenuje `3bet/call to 9bb` (hodnota) nebo
       * `Bluff Squeeze to 9bb` (blaf) - a přesně takhle smíchané to osm stránek
       * MUL na 40 bb píše. Trenažér nabízí FOLD, CALL, 3BET i SQUEEZE
       * (`actionTree.ts`) a hodnotí přesnou shodou (`scoring.ts`), takže hráč
       * s AA by za SQUEEZE dostal chybu, kdežto s AQo by SQUEEZE zmáčknout
       * musel - jedna mřížka, dvě různé správné odpovědi na tutéž akci.
       *
       * Vlastník to našel čtením mřížek 1. 10. 2026: osm stránek (id154-161)
       * odmítl s „sloučení akcí vadí". Opora, že je to vada překladu a ne
       * strategie: stránky, kde zdroj píše `Squeeze/call to …` (SB, BB a všechny
       * 100bb), mají hodnotu i blaf jako SQUEEZE, a produkční pack ve squeeze
       * kontextu 3BET nepoužívá vůbec - 58 záznamů, jen CALL, SQUEEZE a JAM.
       */
      ["3bet/call", { action: "SQUEEZE", lost: "zdroj říká, že proti 4betu se dorovnává" }],
    ])],
    // BB proti limpu malého blindu (odpověď vlastníka 2a, 22. 9. 2026).
    //
    // Produkt tu nabízí `LIMP` (check zdarma), `ISO` a do 25 bb `JAM`. Zdroj
    // maluje čtyři až pět barev, ale rozdíl mezi nimi není v tom, **co hrdina
    // udělá teď**, nýbrž co udělá proti 3betu - a to se sizingem (3.5x, 4x)
    // patří do poznámky, protože iso-raise má produkt jeden. Barvy jsou
    // vyjmenované celé, ne přes vzor: kdyby zdroj přidal šestou, musí stránka
    // spadnout, ne ji tiše vzít jako fold (bod 225).
    //
    // Velikost: zdroj isuje na 3,5x a hlouběji na 4x, produkt zná ISO_2X, ISO_25X
    // a ISO_3X. Bere se ISO_3X - největší, kterou produkt nabízí, tedy nejblíž
    // tomu, co zdroj kreslí - a přesná velikost zdroje jde do poznámky. Zaokrouhlit
    // dolů na ISO_25X by hráče učilo menší iso, než jaké range předpokládá.
    ["VS_LIMP", new Map<string, MappedAction>([
      ["check behind", { action: "LIMP", lost: "" }],
      ["all-in", { action: "JAM", lost: "" }],
      ["all in", { action: "JAM", lost: "" }],
      ["3.5x bluff", { action: "ISO_3X", lost: "zdroj isuje na 3,5x a vede to jako blaf" }],
      ["3.5x + broke", { action: "ISO_3X", lost: "zdroj isuje na 3,5x a proti 3betu dá stack do potu" }],
      ["3.5x + call reraise", { action: "ISO_3X", lost: "zdroj isuje na 3,5x a proti 3betu dorovnává" }],
      ["3.5x + call 3b", { action: "ISO_3X", lost: "zdroj isuje na 3,5x a proti 3betu dorovnává" }],
      ["3.5x + 4bet all in", { action: "ISO_3X", lost: "zdroj isuje na 3,5x a proti 3betu jde 4bet all-in" }],
      ["3.5x + all in vs 3bet", { action: "ISO_3X", lost: "zdroj isuje na 3,5x a proti 3betu jde all-in" }],
      ["3.5x + 4b < 100bb", { action: "ISO_3X", lost: "zdroj isuje na 3,5x a 4betuje do 100 bb" }],
      ["3.5x + small 4bet vs sb 3bet", { action: "ISO_3X", lost: "zdroj isuje na 3,5x a proti 3betu dělá malý 4bet" }],
      ["4x+ call 3b", { action: "ISO_3X", lost: "zdroj isuje na 4x a proti 3betu dorovnává" }],
      ["4x + small 4bet bluff", { action: "ISO_3X", lost: "zdroj isuje na 4x a dělá malý 4bet jako blaf" }],
      ["4x+ small 4bet vs 3bet and broke", { action: "ISO_3X", lost: "zdroj isuje na 4x, dělá malý 4bet a dá stack do potu" }],
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
/**
 * Mezery kolem lomítka a zdvojené mezery.
 *
 * `Squeeze / Fold` a `squeeze/fold` je táž barva; korpus je píše obojím
 * způsobem a `Squeeze call` dokonce bez lomítka. Sjednotit to ve slovníku by
 * znamenalo psát každou barvu čtyřikrát, a na čtvrtý pravopis by se stejně
 * zapomnělo. Spojka `and` se schválně nepřekládá - `Call and 3bet` je jiná
 * věta než `Call / 3bet` a hádat, která platí, není překlad.
 */
function normalizeSeparators(name: string): string {
  return name.replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim();
}

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
  // `3.5x + 4B &lt; 100bb` je `3.5x + 4b < 100bb`: text legendy je kus HTML.
  // Do 23. 9. 2026 entitu dekódovala jen větev otevíracích stránek, takže
  // `BBSTR-vs-SB-Limp-40-50BB` propadla na „kontext nenalezen" - dvě z jejích
  // šesti barev slovník nepoznal, ačkoli je zná.
  const raw = action.trim().toLowerCase().replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const sized = normalizeSizedAction(raw);
  const bluff = normalizeBluffPrefix(sized.base);
  // Pravopisné varianty se zkoušejí **až po** doslovném klíči, nikdy místo něj.
  // Sjednotit mezery kolem lomítka rovnou by rozbilo klíče, které mezery mají
  // (`call / fold vs squeeze`): změřeno 22. 9. 2026 - VS_OPEN spadl z 90 na 34
  // stránek, protože slovník přestal svoje vlastní klíče poznávat.
  const spaced = normalizeSeparators(raw);
  // `squeeze call` bez lomítka je týž pojem jako `squeeze/call`; zkusí se až
  // nakonec, aby dvouslovné barvy jako `all in` zůstaly samy sebou.
  const joined = spaced.replace(/^(squeeze) (call|fold)$/, "$1/$2");
  const found = table.get(raw) ?? table.get(sized.base) ?? table.get(bluff.base)
    ?? table.get(spaced) ?? table.get(joined);
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
  // `SQU-` je táž situace jako `MUL-`, jen z jiné nabídky zdroje: před hrdinou
  // je otevření a aspoň jedno dorovnání. Rozcestník nabídky (`SQU-menu-…`)
  // mřížka není a spadne dřív, na kontrole legendy.
  if (/^SQU-/i.test(stem)) return "SQUEEZE";
  // BB proti limpu SB. Ostatní `BBSTR-` stránky kontext nedostanou schválně:
  // čtyři místo range říkají „Defend (Create your own Ranges)", tedy pokyn, ne
  // obsah, a dvě jsou mapa hloubek jako rejam, který vlastník 22. 9. 2026
  // odložil (3c). Rozcestníky nabídky mřížka nejsou a spadnou dřív.
  if (/^BBSTR-vs-SB-Limp-/i.test(stem)) return "VS_LIMP";
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

/**
 * Jeden soupeř před hrdinou, se zkratkou zdroje **i** jejím přeložením.
 *
 * Obojí, ne jen přeložené jméno, a je to podstatné: `SEAT_ALIASES` mapuje `EP`
 * na `UTG`, což je správně u **otvírače** a špatně u **dorovnávajícího**. Vlastník
 * to 1. 10. 2026 v odpovědi T4 řekl přesně: „`EP` jako dorovnávající při otvírači
 * UTG je UTG+1 nebo UTG+2". Skupina se tedy nesmí přeložit tady, kde není vidět,
 * kdo otevřel - rozhoduje se až tam, kde se zná celá situace.
 */
export interface RyeVillain {
  /** Zkratka zdroje, jak stojí ve jméně souboru (`EP`, `MP`, `CO`, `BU`). */
  source: string;
  /** Sedačka produktu, když zkratka jmenuje jedno místo; u skupiny `undefined`. */
  seat?: string;
}

export interface RyeSituation {
  /** Sedačka hrdiny, slovníkem produktu. */
  seat: string;
  /** Hloubka v blindech, jak ji uvádí zdroj. */
  stackBB: number;
  /** Kolik soupeřů je ve hře před hrdinou; víc než jeden znamená multiway. */
  villains: number;
  /**
   * Kdo otevřel - první jmenovaný soupeř za `vs`.
   *
   * Chybí tam, kde jméno soupeře nejmenuje (push/fold, otevření), a tam, kde se
   * počet soupeřů odvodil jinak než ze jmen.
   */
  opener?: RyeVillain;
  /**
   * Kdo otevření dorovnal, v pořadí ze jména souboru.
   *
   * **Seznam, ne jedno pole**, a vlastník na to v T4 výslovně upozornil: dvě SQU
   * stránky mají dorovnávající dva (`SQU-40BBMais-BB-vs-CO-BU-SB`). Prázdný
   * seznam znamená „otevření bez dorovnání", tedy ne squeeze spot.
   *
   * Proč se to do 7. 10. 2026 nečetlo: parser počítal soupeře a jejich **jména
   * zahodil**. Změřeno na mřížkách z 1. 10.: BTN na 100 bb squeezuje 67 kombinací
   * proti flatu z EP, 84 proti MP a 102 proti CO; BB na 40 bb callne 506 proti
   * EP/MP, 644 proti CO/BU a 751 proti SB. Jedna mřížka pro všechny tři by učila
   * squeezovat do nejtěsnějšího flatu o polovinu víc, než zdroj říká.
   */
  flatCallers?: readonly RyeVillain[];
}

/**
 * Zkratky, které jmenují **skupinu sedaček** a ne místo u stolu.
 *
 * `EP` je v `SEAT_ALIASES` kvůli hrdinovi (tam je to „ta nejranější"), ale `LP`
 * tam schválně nepřidávám: `SEAT_ALIASES` čte i sedačku hrdiny a dát mu zkratku,
 * kterou zdroj pro hrdinu nepoužívá, by rozšířilo něco jiného, než je potřeba.
 * Tahle sada platí **jen pro soupeře**.
 *
 * Že `LP` chybělo, se našlo 7. 10. 2026 při čtení jmen pro 4a: je v **devíti**
 * jménech korpusu (`MUL-40BB-BB-vs-MP_LP`, `SQU-40BBMais-BU-vs-MP-LP`…) a jako
 * nerozpoznaný token se zahazovalo. Vlastník ho v T4 jmenuje mezi skupinami,
 * které má drill rozdat jako konkrétní sedačku: „(EP/MP, CO/BU, LP)".
 */
const VILLAIN_GROUPS = new Set(["EP", "LP"]);

/**
 * Slovo, kterým zdroj nabízí **dvě různá rozestavení** v jednom jménu.
 *
 * `SQU-40BBMais-MP-vs-EP-EP-or-EP-MP` znamená „EP+EP **nebo** EP+MP", tedy dvě
 * situace na jedné stránce, ne čtyři soupeře. Takové jméno seznam dorovnávajících
 * nedostane: vybrat jedno z těch dvou by bylo rozhodnutí za zdroj, a vlastník
 * přesně takovou volbu v rozhodnutí 4 odmítl (možnost b).
 */
const ALTERNATIVE_SETUP = /^or$/i;

/** Zkratka zdroje na soupeře: skupina si přeložení nenechá udělat tady. */
function villainOf(source: string): RyeVillain {
  const upper = source.toUpperCase();
  if (VILLAIN_GROUPS.has(upper) || SEAT_GROUP_ALIASES.has(upper)) return { source: upper };
  const seat = SEAT_ALIASES.get(upper);
  return seat === undefined ? { source: upper } : { source: upper, seat };
}

function namesSeat(token: string): boolean {
  return SEAT_ALIASES.has(token.toUpperCase()) || VILLAIN_GROUPS.has(token.toUpperCase());
}

/**
 * Soupeři ze jmen za `vs`, v pořadí: první je otvírač, zbytek dorovnali.
 *
 * Pořadí ze jména se bere jako pořadí akce, a je to tak u zdroje důsledné:
 * `BB-vs-EP_MP` je otevření z EP a dorovnání z MP, nikdy naopak. Slova, která
 * sedačku nejmenují (`OPEN`, `Fish`, `Flat`, `Mais`, `Call`), se vynechávají.
 *
 * Seznam vyjde `undefined` tam, kde jméno nabízí dvě rozestavení - viz
 * `ALTERNATIVE_SETUP`. Je to rozdíl proti prázdnému seznamu: prázdný znamená
 * „otevření nikdo nedorovnal", `undefined` znamená „ze jména se to nepozná".
 */
function villainsFromTokens(tokens: readonly string[]): {
  opener?: RyeVillain;
  flatCallers?: RyeVillain[];
} {
  if (tokens.some((token) => ALTERNATIVE_SETUP.test(token))) return {};
  const named = tokens.filter(namesSeat).map(villainOf);
  return named.length === 0
    ? { flatCallers: [] }
    : { opener: named[0], flatCallers: named.slice(1) };
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
 * `EP` je **skupina tří sedaček**, ne čtvrtá sedačka jako `MP`: navigace ho
 * jako místo u stolu neuvádí. Do 23. 9. 2026 zůstávalo nepřeložené a leželo
 * kvůli tomu **44 stránek** (multiway 36, squeeze 5, BB proti limpu 3) - ve
 * všech otevírá. Vlastník to rozhodl (2a): **`EP` se čte jako UTG**, tedy
 * nejranější sedačka z té trojice, a doložil to směrem chyby: obrana postavená
 * proti UTG je z trojice nejužší, takže hráč dostane spíš opatrnější odpověď
 * než přehnaně volnou. Opak - vydat tutéž mřížku pro UTG, UTG+1 i UTG+2 - by
 * tvrdil něco, co zdroj neřekl, a mýlil se ve směru, který je u vlastníka
 * doložený leak („overfold BvB", příliš mnoho flat callů z blindů).
 *
 * Každý záznam z takové stránky to nese v poznámce, ať se na to nezapomene.
 */
const SEAT_ALIASES = new Map<string, string>([
  ["UTG", "UTG"], ["UTG1", "UTG+1"], ["UTG2", "UTG+2"],
  ["EP", "UTG"],
  ["MP", "LJ"], ["LJ", "LJ"], ["HJ", "HJ"], ["CO", "CO"],
  ["BU", "BTN"], ["BTN", "BTN"], ["SB", "SB"], ["BB", "BB"],
]);

/** Zkratky zdroje, které nejsou sedačka, ale skupina - poznámka to řekne. */
export const SEAT_GROUP_ALIASES = new Map<string, string>([["EP", "UTG"]]);

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
  // Tvar 5: BB proti limpu SB, `BBSTR-vs-SB-Limp-20-25BB` nebo `-50BBMAIS`.
  //
  // Jméno nese **pásmo hloubek**, ne bod: stránka platí od spodní hranice po
  // horní. Bere se spodní hranice (tam range začíná platit) a celé pásmo si
  // záznam odnese v `bucketSpan`, ať se pack může doplnit i na hloubky mezi.
  const limp = /^BBSTR-vs-SB-Limp-(\d+)(?:-(\d+))?BB/i.exec(stem);
  // `flatCallers: []`, ne chybějící: u limpu ze SB **nikdo nedorovnal**, a to je
  // odpověď. Chybějící seznam znamená „ze jména se to nepozná" a zpřesněná cesta
  // takový záznam odmítá - naměřeno 7. 10. 2026, že bez tohohle rozlišení spadly
  // čtyři schválené BBSTR záznamy, které do packu patří.
  if (limp !== null) {
    return { seat: "BB", stackBB: Number(limp[1]), villains: 1, flatCallers: [] };
  }

  // Tvar 4: squeeze stránky zdroje, `SQU-40BBMais-BU-vs-HJ-CO`.
  //
  // `40BBMais` je „40 bb a víc", tedy **rozsah hloubek, ne bod**. Do 22. 9. 2026
  // se takové jméno schválně nečetlo a celý kontext SQUEEZE zůstával stranou;
  // vlastník toho dne rozhodl (odpověď 3c), že se squeeze rodina dodá. Čte se
  // proto spodní hranice rozsahu - `40` - a že jde o rozsah, nese záznam
  // v poznámce. Jméno s vlastní hloubkou (`SQU-40BBMais-90BB-CO-vs-…`) vyhraje
  // tu svou: je konkrétnější než hranice nabídky.
  const squeeze = /^SQU-(\d+)BBMais-(?:(\d+)BB-)?([A-Za-z0-9+]+)-vs-/i.exec(stem);
  if (squeeze !== null) {
    const seat = SEAT_ALIASES.get(squeeze[3].toUpperCase());
    if (seat === undefined) return undefined;
    // Soupeři před hrdinou: otvírač a každý dorovnávající, tedy všechno za
    // „vs“ kromě slov, která sedačku nejmenují (`OPEN`, `Fish`, `Flat`).
    // Nejmíň dva: squeeze bez otevření a dorovnání není squeeze, a jméno, ze
    // kterého by vyšel jeden, by popisovalo jinou situaci, než na kterou se
    // produkt v tomhle kontextu ptá.
    const after = stem.slice(stem.toLowerCase().indexOf('-vs-') + 4).split('-');
    const villains = after.filter((part) => SEAT_ALIASES.has(part.toUpperCase())).length;
    const named = villainsFromTokens(after);
    return {
      seat,
      stackBB: Number(squeeze[2] ?? squeeze[1]),
      villains: Math.max(2, villains),
      ...(named.opener === undefined ? {} : { opener: named.opener }),
      ...(named.flatCallers === undefined ? {} : { flatCallers: named.flatCallers }),
    };
  }
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
    // Tenhle tvar jmenuje hrdinu první a ostatní za ním, každého s vlastní
    // hloubkou (`ICM-btn35bb-co60bb`): hrdina BTN, soupeř CO. Otvírač je tedy
    // druhá sedačka v pořadí, ne první.
    const named = villainsFromTokens(paired.slice(1).map((match) => match[1]));
    return {
      seat,
      stackBB,
      villains: Math.max(1, paired.length - 1),
      ...(named.opener === undefined ? {} : { opener: named.opener }),
      ...(named.flatCallers === undefined ? {} : { flatCallers: named.flatCallers }),
    };
  }
  // Tvar 2: společná hloubka vpředu, pak `HRDINA-vs-SOUPEŘI`.
  const depth = /(?:^|[-_])(\d+)BB(?:[-_]|$)/i.exec(stem);
  /*
   * Za `vs` se čte **i pomlčka**, ne jen podtržítko.
   *
   * `MUL-40BB-BB-vs-EP_CO-BTN` míchá oba oddělovače: EP otevřel, CO a BTN
   * dorovnali, tedy tři soupeři. Do 7. 10. 2026 tu stálo `[A-Za-z0-9_+]+`, tedy
   * bez pomlčky, takže se čtení zastavilo na `EP_CO` a `BTN` zmizel. V korpusu
   * má oba oddělovače **dvanáct** jmen a vycházeli z nich dva soupeři místo tří -
   * tedy chyba v tom, jestli je spot multiway, i v tom, kdo dorovnal.
   */
  const versus = /(?:^|[-_])(UTG1|UTG2|UTG|EP|MP|LJ|HJ|CO|BU|BTN|SB|BB)[-_]vs[-_]([A-Za-z0-9_+-]+)/i.exec(stem);
  if (depth !== null && versus !== null) {
    const seat = SEAT_ALIASES.get(versus[1].toUpperCase());
    if (seat === undefined) return undefined;
    const tokens = versus[2].split(/[-_]/).filter(Boolean);
    const named = villainsFromTokens(tokens);
    // `EP_MP` znamená dva soupeře, tedy multiway. Počítají se **jmenovaní**:
    // slova jako `Mais` nebo `Call` sedačku nejmenují a za soupeře se brát nemají.
    // Proto musí `VILLAIN_GROUPS` znát `LP` - jinak by devět jmen přišlo o soupeře.
    const villains = tokens.filter(namesSeat).length;
    return {
      seat,
      stackBB: Number(depth[1]),
      villains: Math.max(1, villains),
      ...(named.opener === undefined ? {} : { opener: named.opener }),
      ...(named.flatCallers === undefined ? {} : { flatCallers: named.flatCallers }),
    };
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
    return { seat, stackBB: Number(push[1]), villains: 0, flatCallers: [] };
  }
  // Tvar 4: otevření, `OP-100BB-BU` - hloubka a hrdina, žádný soupeř (22. 9. 2026, 6a).
  const open = /^OP-(\d+)BB-(UTG1|UTG2|UTG|MP|LJ|HJ|CO|BU|BTN|SB)$/i.exec(stem);
  if (open !== null) {
    const seat = SEAT_ALIASES.get(open[2].toUpperCase());
    if (seat === undefined) return undefined;
    return { seat, stackBB: Number(open[1]), villains: 0, flatCallers: [] };
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

/**
 * Koše, na které stránka platí, když její jméno mluví o **pásmu** hloubek.
 *
 * Dvě rodiny zdroje to dělají: squeeze (`SQU-40BBMais-…`, „40 bb a víc") a BB
 * proti limpu (`BBSTR-vs-SB-Limp-20-25BB`, `-50BBMAIS`). Záznam nese jednu
 * hloubku, takže bez tohohle by stránka platná od 40 do 75 bb obsadila jediný
 * koš a zbytek pásma zůstal prázdný, aniž by kdokoli věděl proč.
 *
 * **Strop otevřeného pásma je 75 bb**, ne 150. Vlastník to rozhodl 22. 9. 2026
 * (odpověď 1c) a doložil měřením zdroje: nejhlubší číslo v názvech všech 720
 * stránek korpusu je 100 (jednou 90), nabídky končí na „100BB", a draft o 161
 * mřížkách nemá v koších 125 ani 150 jediný záznam v žádném kontextu. Rozšířit
 * squeeze až na 150 by ze zdroje udělalo autoritu pro hloubky, o kterých celý
 * korpus mlčí. Koše 100 a hlubší proto zůstávají na vlastním exportu.
 *
 * Stránka s vlastní hloubkou ve jméně (`SQU-40BBMais-90BB-CO-vs-…`) pásmo
 * nemá: konkrétní číslo je konkrétnější než hranice nabídky.
 */
export function bucketSpanFromFileName(name: string, buckets: readonly number[]): number[] {
  const stem = name.replace(/\.html$/i, "");
  const open = /^SQU-(\d+)BBMais-(?!\d+BB-)/i.exec(stem)
    ?? /^BBSTR-vs-SB-Limp-(\d+)BBMAIS/i.exec(stem);
  if (open !== null) {
    const floor = Number(open[1]);
    return buckets.filter((bucket) => bucket >= floor && bucket <= OPEN_SPAN_MAX);
  }
  const range = /^BBSTR-vs-SB-Limp-(\d+)-(\d+)BB/i.exec(stem);
  if (range !== null) {
    const [floor, ceiling] = [Number(range[1]), Number(range[2])];
    return buckets.filter((bucket) => bucket >= floor && bucket <= ceiling);
  }
  return [];
}

/** Dokud zdroj o hlubších hloubkách mlčí, otevřené pásmo končí tady. */
const OPEN_SPAN_MAX = 75;

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
  // `BBSTR-vs-SB-Limp-…` nemá sedačku hrdiny ve jméně (nese ji rodina stránek),
  // takže obecný vzor níž by za „vs" našel `SB` jen náhodou - a u jiné rodiny
  // se stejným tvarem by našel něco jiného. Vyjmenované to je jisté.
  if (/^BBSTR-vs-SB-Limp-/i.test(stem)) return { seat: "SB", stackBB: hero.stackBB };
  const versus = /(?:^|[-_])(?:UTG1|UTG2|UTG|EP|MP|LJ|HJ|CO|BU|BTN|SB|BB)[-_]vs[-_]([A-Za-z0-9+]+)/i.exec(stem);
  if (versus === null) return undefined;
  const seat = SEAT_ALIASES.get(versus[1].toUpperCase());
  // Když zdroj hloubku soupeře neuvádí, je společná - je to jedna hloubka stolu.
  return seat === undefined ? undefined : { seat, stackBB: hero.stackBB };
}
