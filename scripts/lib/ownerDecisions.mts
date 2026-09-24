/**
 * Otevřená rozhodnutí vlastníka jako stránka k vyplnění.
 *
 * ## Proč to musí vzniknout
 *
 * Vlastník 17. 9. 2026 na otázku „co je potřeba pro dokončení“ odpověděl
 * „vygeneruj mi html pro vyplnění“. Do té doby se rozhodnutí sbírala zprávou
 * („1: A, 2: B“) a rozcestník review desku měl tři otázky ze 14. 9., všechny
 * dávno zodpovězené (bod 249). Rozhodnutí se tedy sbírala jinak než verdikty
 * nad mřížkami, ačkoli je to tatáž práce: číst, volit, poslat zpátky.
 *
 * Stránka se chová jako čtecí stránky (`reviewAnswerMemory`): odpověď se
 * pamatuje podle identity otázky, ne pozice, exportuje se jako token pro
 * `mtt:decision-answers`, a **zapisuje se i do textu stránky** (`<pre>`), aby
 * přežila „Uložit stránku“ - zaškrtnutý radio button prohlížeč do uloženého
 * HTML nepíše, text ano.
 *
 * ## Co tu není
 *
 * Nic, co se dá změřit. Každá otázka nese čísla z měření uvedených u ní a
 * doporučení; rozhoduje vlastník, ne stránka.
 */

export interface DecisionOption {
  code: string;
  label: string;
  /** Co volba znamená - jednou větou, včetně ceny. */
  detail?: string;
}

export interface OwnerDecision {
  id: number;
  title: string;
  /** Kontext a čísla. HTML povolené, bez zpětných lomítek. */
  context: string;
  options: readonly DecisionOption[];
  /** Kód doporučené volby, nebo prázdné, když doporučení nedávám. */
  recommended: string;
  /** Volný text - čeho se má týkat. Prázdné = bez textového pole. */
  freeText?: string;
  /** Odkaz na deník. */
  diary: string;
}

export const DECISIONS_TOKEN_PREFIX = "DRILLEV-DECISIONS-V1";

export const OWNER_DECISIONS_2026_09_17: readonly OwnerDecision[] = [
  {
    id: 1,
    title: "Pravidlo přednosti: RYE proti vlastnímu chartu a Kompendiu",
    context: "16. 9. jsi řekl, že RYE je reference, a 17. 9. jsi nechal RYE nahradit vlastní "
      + "export u push/fold 10 bb. Kompendium (4.2) přitom říká „chart jako baseline“ a "
      + "sada to hlídá (<code>btnOpenRangeWidth</code>). Potřebuju vědět, jestli je to "
      + "obecné pravidlo, nebo výjimka - podle toho se rozhodne bez ptaní u dalších rodin "
      + "korpusu (otázka 6) i u příštích drafů.",
    options: [
      { code: "a", label: "RYE má přednost všude, kde má mřížku", detail: "vlastní export a chart zůstávají tam, kde RYE nic nemá; sada přestane hlídat chart jako baseline u buněk, které RYE pokrývá." },
      { code: "b", label: "Jen tam, kde to výslovně rozhodnu", detail: "každá rodina zvlášť, jako dnes push/fold." },
    ],
    recommended: "a",
    diary: "256",
  },
  {
    id: 2,
    title: "Přenos letních oprav do produkce - potvrdit, nebo vrátit",
    context: "Změřeno 17. 9. 2026: produkční packy (to, co dostáváš ve čtyřech chipEV profilech) "
      + "byly snímek dat z <b>16. 7.</b> Všechno, co se od té doby opravilo podle tvých chartů - "
      + "push/fold na tvůj baseline, re-jam 15-30 bb a range, která ho dorovnává, BB proti limpu, "
      + "shove malých párů na 15 bb, opravy časných sedaček - šlo jen do legacy dat, která měří sada, "
      + "ale hráč je neviděl. Rozdíl: <b>2 971 tříd</b> (ante OFF) a <b>2 884 tříd</b> (ante ON): RFI 65-84 "
      + "buněk z 88, VS_OPEN 31, VS_LIMP 11, PUSH_FOLD 13-16, VS_ALLIN 15-30 bb chybělo celé (20 záznamů). "
      + "Dnes přestagováno a povýšeno (<code>mtt:preflop-drift</code> to od teď hlídá).",
    options: [
      { code: "a", label: "Nechat - produkce má mít to, co sada měří", detail: "hráč od příštího balíčku dostane opravené range; Question_ID se nemění, mění se odpovědi u ~2 900 tříd." },
      { code: "b", label: "Vrátit snímek z 16. 7.", detail: "git revert dnešního povýšení; opravy z léta zůstanou jen v sadě." },
    ],
    recommended: "a",
    diary: "257",
  },
  {
    id: 3,
    title: "ICM: kde má 40 schválených mřížek přistát",
    context: "RYE scénáře jsou <b>šestihráčové</b> (UTG, HJ, CO, BU, SB, BB - přesně šestistolová sada "
      + "produktu) a jeden tříhráčový (ICM9, zamítnutý). Produkt má $EV sloty pro FULL_RING_9 i SIX_MAX, "
      + "všechny prázdné. Do chipEV packu ICM mřížky nejdou (jiný model EV).",
    options: [
      { code: "a", label: "SIX_MAX / $EV profil se scénářem v klíči", detail: "sedačky sedí na zdroj 1:1; stůl se kreslí šestihráčový s napsanými stacky scénáře." },
      { code: "b", label: "FULL_RING_9 / $EV s třemi prázdnými sedačkami", detail: "kreslilo by se něco, co zdroj netvrdí." },
      { code: "c", label: "ICM zatím nedodávat", detail: "40 mřížek zůstane v draftu." },
    ],
    recommended: "a",
    diary: "256",
  },
  {
    id: 4,
    title: "ICM: forma dodání",
    context: "Produkční brána chce úplný pack (každá sedačka × hloubka × kontext). 40 mřížek "
      + "pokrývá zlomek buněk a z RYE se úplný $EV pack nikdy neposkládá (korpus: 49 z 702 buněk "
      + "i s ICM půlkou). Vyřešený postflop dnes funguje jako vrstva, která odpovídá jen tam, kde ví.",
    options: [
      { code: "a", label: "Vrstva / preview: profil rozdává jen buňky, které zná", detail: "7 scénářů, 40 mřížek, nálepka LOW a scénář v názvu profilu; ne produkce." },
      { code: "b", label: "Čekat na úplný $EV pack", detail: "z RYE nevznikne; znamená jiný zdroj nebo solver." },
    ],
    recommended: "a",
    diary: "256",
  },
  {
    id: 5,
    title: "ICM: výplatní struktura a počet hráčů u scénářů",
    context: "RYE stránky uvádějí jen stacky u stolu (např. ICM5 = UTG 75 / HJ 45 / CO 60 / BU 30 / "
      + "SB 18 / BB 22 bb), ne kolik hráčů zbývá ani jak se platí. Bez toho ICM cena (bubble faktor, "
      + "model v produktu je) spočítat nejde a spot by byl bez ceny - u chipEV to pravidla nepouští, "
      + "u ICM by to byla přiznaná výjimka.",
    options: [
      { code: "a", label: "Doplním z kurzu", detail: "napiš do pole níž ke každému scénáři: kolik hráčů zbývá, výplatní struktura (nebo „finálový stůl, 9 placených“ apod.)." },
      { code: "b", label: "Bez ceny - jen range", detail: "ICM spoty se rozdávají a hodnotí, EV se neukazuje; přiznané v profilu." },
      { code: "c", label: "Předpokládat finálový stůl (6 hráčů, standardní payout)", detail: "odhad, ne údaj zdroje; nedoporučuju." },
    ],
    recommended: "a",
    freeText: "Scénáře: ICM (UTG 20 / HJ 45 / CO 60 / BU 35 / SB 18 / BB 75), ICM3 (30/45/60/75/18/20), "
      + "ICM5 (75/45/60/30/18/22), ICM7 (75/45/60/30/18/7), ICM10 a ICM11 (50/25/11/55/9/13), "
      + "ICM14 (20/35/15/8/50/15). Ke každému: hráčů zbývá, payout.",
    diary: "256",
  },
  {
    id: 6,
    title: "RYE pro další kontexty chipEV: co má nahradit vlastní export",
    context: "Korpus má ověřených mřížek, které import dnes nepřekládá (slovník bez kontextu, "
      + "200 stránek): <b>Openraising 40</b> (RFI, produkt má 88 buněk z vlastního exportu), "
      + "<b>Rejamming 33</b> (jam přes otevření 15-30 bb, dnes z tvých chartů), <b>Squeezing 14</b>, "
      + "<b>BB strategy 11</b> (BB proti limpu SB), <b>Multiway 42</b> (kontexty, které produkt nemá). "
      + "Každá rodina je překlad slovníku (odborné rozhodnutí) plus stejná cesta jako push/fold.",
    options: [
      { code: "a", label: "Všechny rodiny, které produkt umí položit jako otázku", detail: "RFI, rejam, squeeze, BB proti limpu; multiway až bude kontext. Pořadí: RFI, rejam, squeeze, BB." },
      { code: "b", label: "Jen RFI (Openraising)", detail: "největší dopad: 88 buněk, které vidí každý." },
      { code: "c", label: "Žádná - RYE jen tam, kde vlastní obsah není", detail: "dnešní stav plus push/fold." },
    ],
    recommended: "a",
    freeText: "Výjimky nebo pořadí, když se liší od doporučení.",
    diary: "257",
  },
  {
    id: 7,
    title: "Ante u RYE chartů",
    context: "RYE neuvádí, jestli charty počítají s BB ante. Dnes jdou stejné RYE mřížky do ante OFF i ON "
      + "(tvé rozhodnutí o reuse ze 17. 9.). Tvůj push/fold chart ante uvádí (10 %), a proto byl ante OFF "
      + "držený užší. Když RYE ante předpokládá, patří jeho mřížky přesně ante ON a u ante OFF by měl "
      + "zůstat užší vlastní export - nebo přiznaná výjimka.",
    options: [
      { code: "a", label: "RYE počítá s ante - platí pro ante ON, u ante OFF nechat vlastní export", detail: "zpřesněné záznamy i push/fold by u ante OFF zmizely (30,4 % → 0 % zpřesněných spotů v ante OFF)." },
      { code: "b", label: "RYE počítá s ante, ale beru ho i pro ante OFF", detail: "dnešní stav, přiznané v assumptions packu." },
      { code: "c", label: "RYE je bez ante / nevím", detail: "dnešní stav beze změny textu." },
    ],
    recommended: "",
    diary: "255",
  },
  {
    id: 8,
    title: "Jam na 40 bb přes otevření (bod 254/1)",
    context: "RYE <code>F3B-40BB-BB-vs-BTN</code> jamuje 22-77, AJo, ATo (schválené), produkt shove na 40 bb "
      + "nenabízí, protože nemá calling range, proti které by ho ocenil (<code>CALLRE-*</code> končí 30 bb). "
      + "Cesty: jiný zdroj calling range na 40 bb, nebo spočítat ji z equity (stejný původ, jaký má dnes cena jamu).",
    options: [
      { code: "a", label: "Spočítat calling range z equity (ALL_IN_EQUITY)", detail: "bez nového zdroje; cena jamu na 40 bb bude modelová, ne z chartu." },
      { code: "b", label: "Dodám jiný zdroj calling range na 40 bb", detail: "napiš jaký (GTO Wizard, HRC, vlastní solve)." },
      { code: "c", label: "Nechat jam na 40 bb mimo", detail: "mřížka zůstane v draftu jako actionNotOffered." },
    ],
    recommended: "a",
    freeText: "U b): jaký zdroj a kde ho najdu.",
    diary: "254",
  },
  {
    id: 9,
    title: "Flopové piloty (bod 248)",
    context: "Třetí čtení: 6 pilotů ✗, 1 ✓ (UTG vs BB přijat). Zamítnutí BTN vs BB ukázalo, že 12 ze 41 rodin "
      + "stojí na jediném stromu. Návrh: 6 zamítnutých přeznačit na LOW (mění bránu) a přesolvit BTN-BB rodiny v noci.",
    options: [
      { code: "a", label: "Přeznačit na LOW a přesolvit BTN-BB", detail: "noc dostane frontu; piloty zmizí z „přečteno“ do LOW." },
      { code: "b", label: "Nechat", detail: "verdikty zůstanou zapsané, brána se nemění." },
    ],
    recommended: "a",
    diary: "248",
  },
  {
    id: 10,
    title: "Přesolvit 25bb rodiny s opravenými preflop ranžemi (4 až 5 nocí)",
    context: "Solver bere preflop ranže z produkčního packu - tedy do dneška ze snímku z 16. 7. "
      + "Všech 29 rodin na 25 bb (348 desek, dosolvených 14.-17. 9.) má proto vstupní ranže, které se "
      + "od dnešní produkce liší: RFI o 1-10 tříd, obrana o 4-15 tříd a <b>BB proti otevření o 94 tříd</b> "
      + "(od 31. 7. na 25 bb re-jamuje, stromy počítají s dorovnáním). Postflop tak modeluje range, kterou "
      + "produkt už neučí. Stejný nesoulad blokuje i další desky (<code>mtt:board-growth</code>: šablona "
      + "nesedí, 58 desek čeká). Přesolvení: 348 × 7,6 min ≈ 44 h, tedy 4 až 5 nocí bez riverových vrstev; "
      + "packy a turnová EV se pak obnoví ranním cyklem jako po každé noci.",
    options: [
      { code: "a", label: "Přesolvit 25bb rodiny, nejdřív ty s BB (4 rodiny, 48 desek, půl noci)", detail: "pak zbylých 25 rodin; po dosolvení znovu růst desek (58)." },
      { code: "b", label: "Nechat stromy, jak jsou, noci dál dávají riverové vrstvy (turnová EV)", detail: "nesoulad zůstane přiznaný v deníku; růst desek zůstane zablokovaný." },
      { code: "c", label: "Přesolvit jen rodiny s BB", detail: "48 desek, půl noci; ostatní nesoulad 4-15 tříd přiznat." },
    ],
    recommended: "a",
    diary: "257",
  },
];

/**
 * Otázky, které vyplynuly z práce 22. 9. 2026.
 *
 * Každá z nich je místo, kde měření došlo na hranici a dál rozhoduje vlastník:
 * dvě z dodání ICM vrstvy (jam přes 3bet, povolení pro nový pack), jedna
 * z pokračování 6a (rejam), jedna z důsledku 9a (šest pilotů mlčí).
 */
export const OWNER_DECISIONS_2026_09_22: readonly OwnerDecision[] = [
  {
    id: 1,
    title: "ICM: devět mřížek učí jam přes 3bet, produkt ho nenabízí",
    context: "Ze 40 schválených ICM mřížek jich 31 dodáno; zbylých <b>9</b> propadlo na jediné věci: "
      + "zdroj u nich učí <b>jam přes 3bet</b> (hrdina otevřel, někdo 3betoval, RYE kreslí all-in), "
      + "a produkt u čelení 3betu nabízí jen fold, call a 4bet. Doporučení, které nejde zvolit, "
      + "se nedodává - proto leží. Jde o hloubky 20, 25, 50 a 75 bb, kde má 3bettor často míň než "
      + "hrdina (třeba UTG 50 bb proti SB s 9 bb), takže „4bet“ je tam fakticky all-in.",
    options: [
      { code: "a", label: "Nabídnout jam i proti 3betu, kde ho range učí", detail: "stejná konstrukce jako 8a u openu: tlačítko se objeví jen tam, kde ho mřížka spotu kreslí; 9 mřížek se dodá." },
      { code: "b", label: "Nabízet jam proti 3betu vždy do 30 bb", detail: "jednodušší pravidlo, ale nabídne tlačítko i tam, kde o něm zdroj nic neříká." },
      { code: "c", label: "Nechat ležet", detail: "9 mřížek zůstane v draftu, dokud pro ně nebude nabídka akcí." },
    ],
    recommended: "a",
    diary: "260",
  },
  {
    id: 2,
    title: "ICM: povolení pro nový pack v balíku produktu",
    context: "Vrstva jde do profilu jako nový pack <code>mtt-six-max-regular-preflop-dolar-ev-ante-on-icm-preview-v1</code>. "
      + "Povolení, které jsi potvrdil 17. 9., mluví o <b>devítistolových</b> profilech "
      + "(<code>permission.json</code>, <code>additionalSources</code>: RYE). Obsah je týž zdroj a týž "
      + "způsob přenosu (seznamy akcí po třídách rukou, žádné obrázky ani soubory), jen jiný profil.",
    options: [
      { code: "a", label: "Ano, totéž povolení platí i pro tenhle profil", detail: "dopíšu permission.json s odkazem na tohle rozhodnutí a pack zůstane preview." },
      { code: "b", label: "Ne, ICM vrstvu z balíku vyndat", detail: "modul se smaže, mřížky zůstanou v artefaktech." },
    ],
    recommended: "a",
    diary: "260",
  },
  {
    id: 3,
    title: "6a rejam: mapa hloubek místo range - co s ní",
    context: "Rejam stránky RYE (33 mřížek) <b>nekreslí celou obranu</b>, ale mapu „do jaké hloubky se ruka "
      + "rejamuje“: barva 30bb znamená jam do 30 bb, 15bb jen do 15 bb, k tomu <code>3B/Call</code> "
      + "u prémií. Rozložit se to dá na koše 15, 20, 25 a 30 bb - to je <b>127 buněk</b>, z toho "
      + "<b>24 už pokrývají stránky F3B</b> (ty nesou obranu celou: call, 3bet i jam). "
      + "U zbylých <b>103</b> je jen jamová mapa, takže dodat ji jako celou range by učilo "
      + "„proti openu se nikdy nedorovnává“ - na 15 bb možná pravda, na 25 bb nejspíš ne.",
    options: [
      { code: "a", label: "Dodat jen tam, kde F3B nic nemá, a jen na 15 bb", detail: "nejkratší stack, kde je jam-or-fold obhajitelný; zbytek počká na F3B." },
      { code: "b", label: "Dodat všech 103 buněk jako jamovou mapu", detail: "rychlé, ale hráč se u nich dorovnání nenaučí." },
      { code: "c", label: "Přeskočit rejam a jít na BB proti limpu a squeeze", detail: "rejam se vrátí, až bude jasné, jak ho spojit s F3B." },
    ],
    recommended: "c",
    freeText: "Kdyby platilo a) nebo b): má se u těch buněk psát, že jde jen o jamovou vrstvu?",
    diary: "260",
  },
  {
    id: 4,
    title: "Šest pilotů mlčí - co má vidět platící hráč",
    context: "Po 9a nese šest ze sedmi flopových pilotů LOW (čtenář je 14. 9. odmítl) a resolver na LOW "
      + "neodpovídá. Řetěz je fail-close: placený tier v těch buňkách <b>nedostane heuristiku</b>, "
      + "ale ani spot - generátor odmítne rozdat. Zbývá jeden pilot (UTG vs BB). Přesolv těch "
      + "šesti je ve frontě za 10a (25bb rodiny), tedy řádově týden.",
    options: [
      { code: "a", label: "Nechat mlčet a napsat to v UI", detail: "„tenhle pilot se přesolvuje“ místo spotu; poctivé, ale lab je do přesolvu skoro prázdný." },
      { code: "b", label: "Pustit je zpátky s nálepkou LOW", detail: "hráč dostane obsah, který čtení neprošlo, ale vidí u něj „nízká spolehlivost“." },
      { code: "c", label: "Předřadit přesolv pilotů před 25bb rodiny", detail: "lab bude celý dřív, přesolv 25bb rodin se posune o pár nocí." },
    ],
    recommended: "a",
    diary: "260",
  },
];

/**
 * Otázky z překladu squeeze rodiny (22. 9. 2026 večer).
 *
 * Obě jsou o tom, co se zdrojem, který mluví jinak než produkt: jedna stránka
 * platí pro rozsah hloubek, a jedna rodina z poloviny neobsahuje range, ale
 * pokyn „vyrob si vlastní".
 */
export const OWNER_DECISIONS_2026_09_22_EVENING: readonly OwnerDecision[] = [
  {
    id: 1,
    title: "Squeeze: stránka platí „od 40 bb výš“, záznam vzniká na 40",
    context: "Osm přeložených squeeze mřížek má ve jméně <code>40BBMais</code>, tedy „40 bb a víc“. "
      + "Záznam ale nese jednu hloubku, takže jde do koše 40 a hlubší koše (50, 60, 75, 100, 125, 150) "
      + "zůstávají prázdné; každý záznam to má v poznámce. Rozšířit tutéž range na všechny hlubší koše "
      + "je <b>48 buněk</b> (6 košů × 8 stránek) a je to přesně to, co stránka tvrdí - ale je to jedna "
      + "range na 40 i 150 bb, a to zdroj sám nerozlišuje.",
    options: [
      { code: "a", label: "Rozšířit na všechny koše od 40 bb výš", detail: "48 buněk navíc; každá nese, že pochází ze stránky „40 bb a víc“." },
      { code: "b", label: "Nechat jen na 40 bb", detail: "hlubší koše zůstanou na vlastním exportu, squeeze z RYE bude jen na jedné hloubce." },
      { code: "c", label: "Rozšířit jen po 75 bb", detail: "kompromis: 3 koše navíc (24 buněk), 100+ zůstává vlastní." },
    ],
    recommended: "a",
    diary: "262",
  },
  {
    id: 2,
    title: "BB proti limpu: polovina rodiny není range",
    context: "Ze 14 stránek <code>BBSTR-*</code> jsou <b>2</b> přeložitelné (sizing 3.5x a check behind), "
      + "<b>4</b> místo range říkají „Defend (Create your own Ranges)“ - tedy pokyn, ne obsah - a zbylých "
      + "<b>8</b> je táž mapa hloubek jako rejam (barva = do jaké hloubky se ruka jamuje), u které jsi "
      + "rejam odložil. Dvě stránky samy o sobě jsou BB proti limpu na 20-25 a 30-40 bb.",
    options: [
      { code: "a", label: "Přeložit ty dvě a rodinu zavřít", detail: "malý zisk, ale hotová věc; mapy hloubek počkají na rozhodnutí o rejamu." },
      { code: "b", label: "Nechat celou rodinu ležet", detail: "vrátí se, až bude jasné, co s mapami hloubek." },
      { code: "c", label: "Vyřešit mapy hloubek teď (i pro rejam)", detail: "jedno pravidlo pro obě rodiny; 103 buněk rejamu a 8 stránek BB proti limpu." },
    ],
    recommended: "a",
    diary: "262",
  },
];

/**
 * Otázky z měření zbytku korpusu (23. 9. 2026).
 *
 * Tři věci, kde měření došlo na hranici: půlka zdroje nejsou mřížky, ale
 * obrázky; čtyřicet čtyři stránek jmenuje otvírače skupinou, ne sedačkou; a
 * noci se dělí mezi přesolv a rozklad podle mého odhadu, ne podle rozhodnutí.
 */
export const OWNER_DECISIONS_2026_09_23: readonly OwnerDecision[] = [
  {
    id: 1,
    title: "Rejam a open-shove jsou v korpusu obrázky, ne mřížky - číst je?",
    context: "Změřeno dnes: rodiny <code>RESHOVING</code> (82 souborů), <code>OPENSHOVING</code> (17) "
      + "a <code>HU</code> (24) nedávají <b>ani jednu</b> čitelnou mřížku - jsou to rozcestníky, které "
      + "místo tabulky ukazují <b>PNG obrázek</b>. Ty obrázky v korpusu jsou: <b>505 rejamových</b> "
      + "(14 hloubek od 5 do 20 bb × ~36 dvojic sedaček) a <b>120 open-shove</b> (15 hloubek × 8 sedaček). "
      + "Každý je mřížka 13×13, kde poloha buňky říká ruku, barva akci, a <b>v hlavičce stojí šířka range</b> "
      + "(„BB calls 18875 against BU: 17,5 %“) - tedy kontrola, kterou si dekodér ověří sám na každém obrázku. "
      + "Prototyp jsem dnes napsal: geometrie sedí, rukám rozumí, barvu zatím plete u sousedních buněk "
      + "(zelená je v rámečku, ne ve výplni). Doladit a ověřit je blok práce. "
      + "<b>Proč to není maličkost:</b> je to přesně rejam - rodina, kterou ti vytkl kouč a kterou jsme "
      + "22. 9. odložili (3c), protože její HTML stránky jsou jen mapy hloubek. Obrázky mají hloubku po "
      + "jednom blindu, ne v pásmech.",
    options: [
      { code: "a", label: "Číst obojí: rejam i open-shove", detail: "625 obrázků, kontrola šířky range u každého; nejvíc obsahu, jeden až dva bloky práce." },
      { code: "b", label: "Jen rejam (505 obrázků)", detail: "rodina, kterou vytkl kouč; open-shove má produkt z vlastního exportu." },
      { code: "c", label: "Nečíst je", detail: "rejam zůstane u map hloubek, open-shove u vlastního exportu; obrázky zůstanou nepoužité." },
    ],
    recommended: "b",
    freeText: "Kdyby se četly: mají se brát i čísla EV z obrázků (u každé ruky je napsané), nebo jen barva = akce?",
    diary: "264",
  },
  {
    id: 2,
    title: "Čtyřicet čtyři stránek jmenuje otvírače skupinou („EP“, „LP“)",
    context: "Jména jako <code>MUL-40BB-BB-vs-EP_CO-BTN</code> nebo <code>SQU-40BBMais-HJ-vs-EP-MP</code> "
      + "říkají „otevřel někdo z rané pozice“, ne kterou sedačku. Produkt zná UTG, UTG+1 a UTG+2, takže se "
      + "takové stránky dosud nevydávaly - je jich <b>44</b> (multiway 36, squeeze 5, BB proti limpu 3). "
      + "Překlad <code>MP</code> → LJ máme od 26. 8. doložený navigací zdroje (devět sedaček sedí na naši "
      + "sadu seat po seatu), ale <code>EP</code> navigace jako sedačku neuvádí - je to skupina tří.",
    options: [
      { code: "a", label: "EP = UTG (nejranější sedačka)", detail: "44 stránek se vydá; range proti UTG je nejužší z trojice, takže hráč dostane spíš opatrnější obranu." },
      { code: "b", label: "Vydat je pro všechny tři rané sedačky", detail: "jedna mřížka obsadí UTG, UTG+1 i UTG+2 - víc buněk, ale tvrdí to, co zdroj neřekl." },
      { code: "c", label: "Nechat je ležet", detail: "44 stránek zůstane mimo; platí dnešní stav." },
    ],
    recommended: "a",
    diary: "264",
  },
  {
    id: 3,
    title: "Jak dělit noci mezi přesolv a rozklad",
    context: "Přesolv (10a) má za sebou 4 rodiny z 29; zbývá <b>23 rodin = 276 desek ≈ 35 h</b> monolitu, "
      + "tedy čtyři až pět celých nocí. Jenže přesolvená rodina není hotová: její turn a river vzniknou až "
      + "z <b>rozkladu</b>, a ten ustoupí celou noc, když je nastagováno aspoň osm desek. Čtyři hotové rodiny "
      + "mají dnes rozložených 6 z 12 desek, takže jejich turn a river pořád stojí na starých ranžích. "
      + "Dnes v noci jsem proto nastagoval jen dvě rodiny (24 desek ≈ 3 h) a zbytek okna nechal rozkladu - "
      + "byl to můj odhad, ne tvoje rozhodnutí.",
    options: [
      { code: "a", label: "Takhle dál: dvě rodiny za noc, zbytek rozklad", detail: "přesolv hotový za ~12 nocí, ale turn a river drží krok." },
      { code: "b", label: "Nejdřív přesolvit všechno, rozklad potom", detail: "přesolv hotový za 4-5 nocí, ale turn a river celé knihovny stojí na starých ranžích do té doby." },
      { code: "c", label: "Nejdřív dorozložit, co je přesolvené, pak dál", detail: "čtyři hotové rodiny budou celé (flop, turn i river) do dvou nocí; přesolv se o ty noci posune." },
    ],
    recommended: "a",
    diary: "264",
  },
];

/**
 * Otázky z 24. 9. 2026.
 *
 * Tři věci, které vyplynuly z noci a z rozhodnutí 2a: kadence nocí nemá kde
 * bydlet, produkční pack čeká na nové povolení, a multiway squeeze si v klíči
 * leze do zelí sám se sebou.
 */
export const OWNER_DECISIONS_2026_09_24: readonly OwnerDecision[] = [
  {
    id: 1,
    title: "Kadence nocí nemá kde bydlet: `tonight.json` píše stroj, ne ty",
    context: "Tvoje rozhodnutí 3c („nejdřív dorozložit, co je přesolvené“) jsem zapsal do "
      + "<code>Agents/daily/tonight.json</code>. Ve 21:00 ho orchestrátor <b>přepsal zpátky</b> na "
      + "<code>NEW_FAMILIES</code> s odůvodněním z minulého týdne. Noc nakonec dopadla podle tebe, ale "
      + "<b>jen náhodou</b>: fronta expanze byla prázdná, protože jsem ji ráno vyprázdnil ručně. Kdyby "
      + "prázdná nebyla, rozklad by ustoupil a tvoje rozhodnutí by se tiše nekonalo. "
      + "Ten soubor je výstup stroje, ne vstup od tebe - a zatím je to jediné místo, kam se priorita "
      + "na noc píše.",
    options: [
      { code: "a", label: "Tvoje rozhodnutí do zvláštního souboru, který stroj jen čte", detail: "orchestrátor smí přebít jen tam, kde nic neříkáš; co řekneš, platí, dokud to nezměníš." },
      { code: "b", label: "Nechat na stroji, 3c byla jednorázová výjimka", detail: "dnešní stav; každá další výjimka se musí udělat ručně a může se ztratit." },
      { code: "c", label: "Ptát se tě každý večer", detail: "nic se neztratí, ale je to jedna otázka denně navíc." },
    ],
    recommended: "a",
    diary: "267",
  },
  {
    id: 2,
    title: "Produkční pack čeká na nové přečtení povolení - 97 záznamů stojí",
    context: "Kandidát je hotový a ověřený: <b>97 zpřesněných záznamů</b> a <b>42 obecných nahrazených</b> "
      + "(z 62 a 8), 601 záznamů celkem, 0 duplicit, <code>valid true, productionReady true</code>. "
      + "Do modulu ale nesmí, dokud nepřečteš <code>permission.json</code> znovu <b>pro novou verzi</b>: "
      + "pack mění původ dat, protože vedle tvého vlastního exportu teď stojí koupené charty. "
      + "Týká se to dvou packů - devítistolový regular a turbo, oba ante ON (podle 7a jinam RYE nepatří).",
    options: [
      { code: "a", label: "Schvaluji pro oba ante ON packy", detail: "97 zpřesněných a 42 nahrazených záznamů dojde k hráči; ante OFF zůstává na vlastním exportu." },
      { code: "b", label: "Zatím jen devítistolový regular", detail: "turbo počká; ověří se to na jednom profilu." },
      { code: "c", label: "Zatím neschvaluji", detail: "kandidát počká; hráč dostává dál dnešní obsah." },
    ],
    recommended: "a",
    freeText: "Co má v povolení stát navíc, aby ti dávalo smysl i za rok?",
    diary: "264",
  },
  {
    id: 3,
    title: "Multiway squeeze: čtyřiadvacet mřížek z 57 by se zahodilo, protože produkt neví, kdo dorovnal",
    context: "Po tvém 2a („EP = UTG“) a doplnění tří pravopisů do slovníku má draft <b>57 squeeze "
      + "mřížek</b>, z toho <b>44 multiway</b> (dva a víc dorovnávajících) a 13 proti jednomu. Vejdou se ale "
      + "jen do <b>33 buněk</b>: produkt má v klíči hrdinu, hloubku a otvírače, kdežto <b>kdo dorovnal, "
      + "v něm není</b>. U 15 buněk se proto pere víc stránek naráz a při dnešním pravidle „první bere“ by "
      + "se <b>24 mřížek zahodilo</b> - dvě pětiny toho, co zdroj o squeezi říká. "
      + "Příklad: <code>BTN 20 bb proti UTG</code> je v korpusu třikrát, pokaždé s jiným dorovnávajícím "
      + "(CO, EP, MP), a range se mezi nimi liší - proti volnému callerovi se squeezuje jinak než proti "
      + "těsnému.",
    options: [
      { code: "a", label: "Přidat do klíče, kdo dorovnal", detail: "všech 57 mřížek se vejde; drill se musí naučit rozdat i dorovnávajícího a zeptat se na něj." },
      { code: "b", label: "Nechat „první bere“ a 24 mřížek zahodit", detail: "dnešní chování; obsah se ztratí a o tom, která stránka vyhraje, rozhoduje pořadí v souboru." },
      { code: "c", label: "Brát jen squeeze proti jednomu dorovnávajícímu", detail: "13 mřížek, žádná kolize; multiway se odloží celé, ale nic se netváří jinak, než je." },
    ],
    recommended: "a",
    diary: "267",
  },
  {
    id: 4,
    title: "Knihovna roste rychleji než to, co ji obsluhuje - čtvrtá záplata za měsíc",
    context: "Dodávaného obsahu je dnes <b>21 MB riveru, 17 MB turnu a 4,9 MB flopu</b> a build i testy "
      + "ho drží v paměti naráz. Za měsíc to vynutilo čtyři zásahy, pokaždé se stejným odůvodněním "
      + "„vyrostl obsah, ne pomalost kódu“: limit čekání na dashboard 10 → 25 s (24. 8.), limit testu "
      + "30 → 90 s (25. 8.), a dnes 90 → <b>240 s</b>. K tomu včera <b>spadl produkční build na paměť</b> "
      + "(11 422 MB proti stropu 12 288 MB); podruhé prošel, ale jen o vlásek. "
      + "Měřeno dnes: soubor `bootstrapIntegration` sám projde za <b>532 s</b>, z toho 185 s je jen "
      + "transformace packů - test startuje aplikaci pro každou kombinaci formátu, rychlosti a ante "
      + "a pokaždé se dotahuje celá knihovna. "
      + "<b>Zvedat limity dál je odpověď na příznak.</b> Příčina je, že se knihovna načítá celá i tam, "
      + "kde by nemusela, a s každou přesolvenou rodinou to bude horší - zbývá jich 23.",
    options: [
      { code: "a", label: "Líné načítání i pro build a testy", detail: "pack se načte, až když ho někdo chce; práce na jeden až dva bloky, ale limity se přestanou zvedat." },
      { code: "b", label: "Zvedat limity dál, dokud to jde", detail: "nic se nezdrží teď; příště to bude pátá záplata a build je už o vlásek od stropu." },
      { code: "c", label: "Omezit, co se dodává", detail: "méně rodin v balíku; hráč dostane míň obsahu, zato se nic nezasekne." },
    ],
    recommended: "a",
    diary: "266",
  },
];

/** Úvod stránky k rozhodnutím z 24. 9. 2026. */
export const OWNER_DECISIONS_2026_09_24_INTRO = `<p><b>Tři otázky.</b> Dvě z nich blokují obsah, který je hotový a čeká.</p>
<ol>
<li><b>Hotovo od minulé stránky:</b> tvých 46 mřížek je zpracovaných, tvoje tři nálezy opravené, a
rozhodnutí 2a („EP = UTG“) zvedlo draft ze 166 na 187 mřížek - squeeze z 11 na 26, multiway ze 3 na 13.</li>
<li><b>Noc 23./24.</b> rozložila čtyři přesolvené rodiny (467 vrstev) a jejich turn i river jsou
přegenerované: 2 240 pravidel, tříd 73 285 → 97 442, a doporučení se nezměnilo ani jednou.</li>
<li><b>Ke čtení máš 54 mřížek</b> (<code>ranze-nove.html</code>): 52 nových a 2, které se od tvého
schválení překreslily.</li>
</ol>
<p>U každé otázky je doporučení a číslo, ze kterého plyne. Vyplň, ulož stránku (Ctrl+S) nebo zkopíruj
odpovědi tlačítkem, a pošli.</p>`;

/** Úvod stránky k rozhodnutím z 23. 9. 2026. */
export const OWNER_DECISIONS_2026_09_23_INTRO = `<p><b>Tři otázky z měření zbytku korpusu.</b> Všechny vznikly dnes, když jsem
zjišťoval, co ze zdroje ještě nikdo nepřečetl.</p>
<ol>
<li><b>Hotovo od minulé stránky:</b> squeeze i BB proti limpu jsou přeložené, pásma hloubek jdou do packu
podle tvého 1c (strop 75 bb), a noc přesolvila 48 z 48 desek bez jediného selhání - doporučení se nezměnilo
ani jednou, ale range, pro kterou platí, vzrostla o 56 %.</li>
<li><b>Nález dne:</b> velká část korpusu nejsou mřížky, ale obrázky - 625 z nich, a je v nich přesně ta
rodina, kterou ti vytkl kouč (otázka 1).</li>
<li><b>Ke čtení máš pořád 48 mřížek</b> (<code>ranze-nove.html</code>); dokud je nepřečteš, squeeze ani BB
proti limpu se do packu nedostanou.</li>
</ol>
<p>U každé otázky je doporučení a číslo, ze kterého plyne. Vyplň, ulož stránku (Ctrl+S) nebo zkopíruj
odpovědi tlačítkem, a pošli.</p>`;

/** Úvod stránky k rozhodnutím z 22. 9. 2026 večer. */
export const OWNER_DECISIONS_2026_09_22_EVENING_INTRO = `<p><b>Dvě otázky z překladu squeeze rodiny.</b> Obě jsou o zdroji, který mluví jinak
než produkt.</p>
<ol>
<li><b>Hotovo od minulé stránky:</b> jam proti 3betu otevřel posledních devět ICM mřížek (pack má 40 ze 40,
508 spotů, nic se neoceňuje), povolení pro nový pack je zapsané, piloty čekající na přesolv to teď říkají
hráči vlastní větou, a squeeze rodina je přeložená - draft vyrostl ze 152 na 161 mřížek.</li>
<li><b>Ke čtení máš 43 mřížek</b> (34 otevíracích, 8 squeeze, 1 obrana BB): stránka <code>ranze-nove.html</code>
je jen z nich, zodpovězené jsou pořád v <code>ranze-vse.html</code>.</li>
<li><b>Rejam</b> zůstává odložený podle tvého 3c; mapy hloubek se ho a BB proti limpu týkají obou (otázka 2).</li>
</ol>
<p>U každé otázky je doporučení a číslo, ze kterého plyne. Vyplň, ulož stránku (Ctrl+S) nebo zkopíruj
odpovědi tlačítkem, a pošli.</p>`;

/** Úvod stránky k rozhodnutím z 22. 9. 2026. */
export const OWNER_DECISIONS_2026_09_22_INTRO = `<p><b>Čtyři otázky z práce 22. 9. 2026.</b> Každá je místo, kde měření došlo na hranici
a dál rozhoduješ ty.</p>
<ol>
<li><b>ICM vrstva je dodaná</b> (rozhodnutí 3a, 4a, 5b z 22. 9.): profil MTT / 6-max / $EV / ante ON rozdává
31 schválených mřížek v 6 scénářích, stůl kreslí stacky scénáře, nic se neoceňuje. Otázky 1 a 2 jsou zbytek:
devět mřížek, které produkt neumí položit jako otázku, a povolení pro nový pack.</li>
<li><b>6a pokračuje</b>: otevírací stránky (34 mřížek RFI) čekají na tvoje čtení - stránka je odeslaná.
Rejam je otázka 3: jeho stránky nejsou range, ale mapa hloubek.</li>
<li><b>Piloty</b> (otázka 4): 9a znamená, že šest z nich mlčí, dokud se nepřesolví a nepřečtou.</li>
</ol>
<p>U každé otázky je doporučení a číslo, ze kterého plyne. Vyplň, ulož stránku (Ctrl+S) nebo zkopíruj
odpovědi tlačítkem, a pošli.</p>`;

/** Úvod stránky: co je potřeba pro dokončení, k 17. 9. 2026. */
export const OWNER_DECISIONS_INTRO = `<p><b>Co je potřeba pro úspěšné dokončení</b> - stav k 17. 9. 2026, po třetím čtení draftu
(110 ze 118 sedí) a dnešním nálezu, že produkční packy byly dva měsíce snímek starých dat.</p>
<ol>
<li><b>ChipEV preflop je doručený a hlídaný:</b> 61 zpřesněných záznamů RYE + push/fold 10 bb z RYE ve všech
čtyřech profilech, letní opravy z tvých chartů poprvé v produkci, <code>mtt:preflop-drift</code> hlídá, že se
produkce od měřených dat znovu nerozejde. Zbývá tvoje slovo k 1, 2 a 7.</li>
<li><b>ICM ($EV) potřebuje tři rozhodnutí</b> (3, 4, 5) a pak asi tři bloky práce: katalog scénářů (stacky
sedaček z názvů stránek RYE), scénář v klíči otázky a v Question_ID, losování scénáře a stůl s napsanými stacky,
profil se scénářem v názvu, měření doručení. Bez 5 to bude bez ceny.</li>
<li><b>Zbytek korpusu RYE</b> (6): 200 ověřených mřížek, které import nepřekládá - RFI 40, rejam 33,
squeeze 14, BB proti limpu 11, multiway 42. Každá rodina = překlad slovníku + stejná cesta jako push/fold.
Bez tvého slova se nedělá nic.</li>
<li><b>Jam na 40 bb</b> (8) a <b>flopové piloty</b> (9) čekají jen na volbu.</li>
<li><b>Noci do pondělí</b> (10): bez tvé volby jedou riverové vrstvy pro turnovou EV (6 201 podher ve frontě,
~350 za noc, to stačí). S volbou 10a se od pátku přesolví 25bb rodiny s opravenými ranžemi.</li>
</ol>
<p>U každé otázky je doporučení a číslo, ze kterého plyne. Vyplň, ulož stránku (Ctrl+S) nebo zkopíruj
odpovědi tlačítkem, a pošli.</p>`;

const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, (character) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character] ?? character
));

/** Otisk otázek: změní-li se jejich znění, uložené odpovědi se nepřevezmou. */
export function decisionsHash(decisions: readonly OwnerDecision[]): string {
  const text = decisions.map((row) => `${row.id}:${row.title}:${row.options.map((option) => option.code + option.label).join(",")}`).join("|");
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

export function renderOwnerDecisionsPage(
  decisions: readonly OwnerDecision[],
  input: { dateLabel: string; intro: string; storageKey: string },
): string {
  const hash = decisionsHash(decisions);
  const sections = decisions.map((row) => {
    const options = row.options.map((option) => (
      `<label class="opt${option.code === row.recommended ? " opt--rec" : ""}">`
      + `<input type="radio" name="v${row.id}" value="${option.code}">`
      + `<span><b>${option.code.toUpperCase()})</b> ${escapeHtml(option.label)}`
      + `${option.detail ? `<small> - ${escapeHtml(option.detail)}</small>` : ""}</span></label>`
    )).join("\n");
    const free = row.freeText === undefined
      ? ""
      : `<p class="q-hint">${escapeHtml(row.freeText)}</p><textarea class="free" name="t${row.id}" rows="4"></textarea>`;
    return `<section id="q${row.id}">
  <h2>${row.id}. ${escapeHtml(row.title)} <small>deník ${escapeHtml(row.diary)}</small></h2>
  <p class="ctx">${row.context}</p>
  <div class="verdict" data-id="${row.id}">
    <p class="q-focus">${row.recommended === "" ? "Bez doporučení - je to tvůj údaj." : `Doporučení: <b>${row.recommended.toUpperCase()}</b>.`}</p>
    <div class="opts">
${options}
    </div>
    ${free}
  </div>
</section>`;
  }).join("\n");

  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DrillEV - rozhodnutí ${escapeHtml(input.dateLabel)}</title>
<style>
 body{margin:0;background:#0b0f16;color:#e6edf7;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
 main{max-width:860px;margin:0 auto;padding:16px}
 h1{font-size:22px;margin:8px 0 4px}
 h2{font-size:17px;margin:26px 0 6px;color:#dce6f5}
 h2 small{font-weight:400;color:#7f93ad;font-size:12px;margin-left:8px}
 .intro{color:#cfe0f5;background:#121a27;border:1px solid #2a3446;border-radius:10px;padding:12px 14px}
 .intro ol{margin:6px 0 0 18px;padding:0}
 .ctx{color:#b9c8dc;margin:0 0 8px}
 .ctx code{background:#1a2333;padding:1px 5px;border-radius:4px;font-size:13px}
 .bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px;align-items:center;
      padding:10px 12px;background:#0f141d;border-bottom:1px solid #2a3446}
 .bar b{color:#7bd3ff}
 .bar button{padding:9px 12px;border:0;border-radius:8px;background:#2f4a7a;color:#fff;font-size:13px;cursor:pointer;min-height:40px}
 .bar button.ghost{background:#1f2839;color:#cfe0f5}
 .bar span[id$="-warning"]{color:#ff8f6b;font-size:12px;max-width:460px}
 .verdict{margin-top:8px;padding:10px;background:#161d2b;border-radius:8px}
 .q-focus{margin:0 0 6px;font-size:13px;color:#dce6f5}
 .q-hint{margin:8px 0 6px;font-size:12px;color:#9fb3cd}
 .opts{display:flex;flex-direction:column;gap:6px}
 .opt{display:flex;align-items:flex-start;gap:10px;padding:9px 12px;border-radius:10px;background:#1f2839;color:#cfe0f5;cursor:pointer;user-select:none}
 .opt input{width:18px;height:18px;margin:3px 0 0}
 .opt small{display:block;color:#9fb3cd;font-size:12px}
 .opt:has(input:checked){background:#2f4a7a;color:#fff}
 .opt:has(input:checked) small{color:#dbe7fa}
 .opt--rec{border:1px solid #3f6f86}
 .free{width:100%;box-sizing:border-box;background:#0f141d;color:#e6edf7;border:1px solid #2a3446;border-radius:8px;padding:8px;font:14px/1.4 inherit}
 #export{width:100%;box-sizing:border-box;height:120px;margin-top:8px;background:#0f141d;color:#cfe0f5;border:1px solid #2a3446;border-radius:8px;font:12px/1.4 ui-monospace,monospace;padding:8px}
 #filled{white-space:pre-wrap;background:#0f141d;border:1px dashed #2a3446;border-radius:8px;padding:10px;color:#9fb3cd;font:12px/1.4 ui-monospace,monospace;margin-top:24px}
 .done{color:#7ee0a3}
</style>
</head>
<body>
<div class="bar">
  <span id="progress">zodpovězeno <b>0</b> z ${decisions.length}</span>
  <button id="next">Další nezodpovězená</button>
  <button id="share" class="ghost">Zkopírovat odpovědi</button>
  <span id="storage-warning" hidden>Pozor: tenhle prohlížeč tu stránku neuloží. Odpovědi drží jen adresa - ulož si ji, nebo je průběžně kopíruj.</span>
  <span id="stale-warning" hidden>Otázky se od uložení odpovědí změnily, takže se nepřebírají.</span>
</div>
<main>
<h1>DrillEV - rozhodnutí ${escapeHtml(input.dateLabel)}</h1>
<div class="intro">${input.intro}</div>
${sections}
<textarea id="export" hidden readonly></textarea>
<pre id="filled">(zatím bez odpovědí - text se sem zapíše sám, ať přežije uložení stránky)</pre>
<p class="q-hint">Hotovou stránku ulož (Ctrl+S, „Webová stránka, kompletní“) a pošli, nebo zkopíruj odpovědi tlačítkem nahoře. Zpracuje je <code>npm run mtt:decision-answers</code>.</p>
</main>
<script>
(function () {
  var KEY = ${JSON.stringify(input.storageKey)};
  var PREFIX = ${JSON.stringify(DECISIONS_TOKEN_PREFIX)};
  var HASH = ${JSON.stringify(hash)};
  var blocks = document.querySelectorAll(".verdict");
  var ids = [];
  for (var b = 0; b < blocks.length; b += 1) ids.push(blocks[b].getAttribute("data-id"));

  function pickedFor(id) {
    var picked = document.querySelector('input[name="v' + id + '"]:checked');
    return picked ? picked.value : "";
  }
  function textFor(id) {
    var area = document.querySelector('textarea[name="t' + id + '"]');
    if (!area) return "";
    // Bez zpětného lomítka v emitovaném skriptu (viz reviewAnswerMemory):
    // konce řádků se nahrazují přes kódy znaků.
    return area.value.split(String.fromCharCode(13)).join(" ").split(String.fromCharCode(10)).join(" ").trim();
  }
  function codes() {
    var parts = [];
    for (var i = 0; i < ids.length; i += 1) {
      var code = pickedFor(ids[i]);
      if (code !== "") parts.push(ids[i] + code);
    }
    return parts;
  }
  function token() {
    var parts = codes();
    return parts.length === 0 ? "" : PREFIX + " " + HASH + " " + parts.join(" ");
  }
  function texts() {
    var lines = [];
    for (var i = 0; i < ids.length; i += 1) {
      var text = textFor(ids[i]);
      if (text !== "") lines.push("T" + ids[i] + ": " + text);
    }
    return lines;
  }
  function exportText() {
    var head = token();
    if (head === "") return "";
    return [head].concat(texts()).join(String.fromCharCode(10));
  }
  function refresh() {
    var done = codes().length;
    var counter = document.getElementById("progress");
    if (counter) counter.innerHTML = "zodpovězeno <b>" + done + "</b> z " + ids.length + (done === ids.length ? ' <span class="done">- hotovo</span>' : "");
    var filled = document.getElementById("filled");
    if (filled) filled.textContent = exportText() || "(zatím bez odpovědí - text se sem zapíše sám, ať přežije uložení stránky)";
  }
  function save() {
    var text = exportText();
    try { localStorage.setItem(KEY, text); } catch (error) { /* bez úložiště */ }
    if (history.replaceState) history.replaceState(null, "", "#v=" + encodeURIComponent(text));
    refresh();
  }
  function apply(text) {
    var lines = text.split(String.fromCharCode(10));
    if (lines.length === 0) return;
    var parts = lines[0].split(" ");
    if (parts.length < 2 || parts[0] !== PREFIX) return;
    if (parts[1] !== HASH) { var warn = document.getElementById("stale-warning"); if (warn) warn.hidden = false; return; }
    for (var i = 2; i < parts.length; i += 1) {
      var match = /^([0-9]+)([a-z])$/.exec(parts[i]);
      if (match === null) continue;
      var radio = document.querySelector('input[name="v' + match[1] + '"][value="' + match[2] + '"]');
      if (radio !== null) radio.checked = true;
    }
    for (var line = 1; line < lines.length; line += 1) {
      var found = /^T([0-9]+): (.*)$/.exec(lines[line]);
      if (found === null) continue;
      var area = document.querySelector('textarea[name="t' + found[1] + '"]');
      if (area !== null) area.value = found[2];
    }
  }
  function storageWorks() {
    try { localStorage.setItem(KEY + "-probe", "1"); localStorage.removeItem(KEY + "-probe"); return true; } catch (error) { return false; }
  }
  function load() {
    var text = "";
    if (location.hash.indexOf("#v=") === 0) {
      try { text = decodeURIComponent(location.hash.slice(3)); } catch (error) { text = ""; }
    }
    if (text === "") { try { text = localStorage.getItem(KEY) || ""; } catch (error) { text = ""; } }
    if (text !== "") apply(text);
    if (!storageWorks()) { var warn = document.getElementById("storage-warning"); if (warn) warn.hidden = false; }
    refresh();
  }
  document.addEventListener("change", function (event) {
    var name = event.target && event.target.name;
    if (name && /^[vt][0-9]+$/.test(name)) save();
  });
  document.addEventListener("input", function (event) {
    var name = event.target && event.target.name;
    if (name && /^t[0-9]+$/.test(name)) save();
  });
  document.addEventListener("click", function (event) {
    var id = event.target && event.target.id;
    if (id === "next") {
      for (var i = 0; i < blocks.length; i += 1) {
        if (!blocks[i].querySelector('input[type="radio"]:checked')) {
          (blocks[i].closest("section") || blocks[i]).scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }
      alert("Hotovo, všechno má odpověď.");
    }
    if (id === "share") {
      var box = document.getElementById("export");
      box.hidden = false;
      box.value = exportText();
      box.focus();
      box.select();
      try { document.execCommand("copy"); } catch (error) { /* stačí označené */ }
    }
  });
  load();
})();
</script>
</body>
</html>
`;
}
