# Redesign GUI – plán

**Stav:** fáze 0, 0b, 1 a 2 hotové, z fáze 5 smazané klasické GUI tréninku
i s přepínačem `?ui=` (4. 11. 2026, deník 340). Nové GUI je od 3. 11. výchozí
(deník 333) a teď jediné; matice range se vejde na 360 px (deník 334). CSS
kleslo z 79,96 na 51,52 KiB, takže fáze 3 (nastavení) se do rozpočtu vejde.
Vlastník návrh 22. 10. schválil: „myslím, že to vypadá dobře, můžeš
pokračovat." Průběh a naměřená čísla jsou na konci dokumentu.

**Zadání vlastníka (22. 10. 2026):** „nelíbí se mi současné GUI … budeme potřebovat
re-design tak, aby aplikace vypadala moderně, profesionálně, přehledně a byla
současně i rychlá." K tomu: „projet veřejná repository, zda bychom se mohli
v návrhu aplikace někým inspirovat."

**Návrh obrazovek:** plátno https://claude.ai/artifact/RNsSM9dVGgsGttNVLMa8n1
(soukromé, sdílí se přes Share). Obsahuje 7 obrazovek: trénink s otázkou
a s vyhodnocením, matici range, nastavení, statistiky a dvě mobilní obrazovky
(otázka a vyhodnocení). Čísla na plátně jsou ilustrační, nejsou z packů.

## Co dnes nefunguje

Vychází z prohlídky dodávaného buildu 22. 10. 2026 (desktop 1280 px,
mobil 390 px).

1. **Před první otázkou stojí formulář.** Má sedm rozbalovacích polí, tři skupiny
   zaškrtávátek (pozice, hloubky a kontext, všude „none selected") a k tomu
   skórování, soupeře a seed. Kdo chce jen trénovat, musí nejdřív projít
   konfigurací.
2. **V češtině vznikají věty napůl anglicky.** Je to záměr, ne chyba. Jazyková
   smlouva z 16. 7. 2026 (`mtt-action-ev-and-language-contract.md`, oddíl 5)
   nechává v režimu CZ anglicky ovládací prvky i pokerové termíny. V praxi
   z toho vychází třeba „MTT ChipEV Core. Production profile: … Trénink používá
   ověřená data z offline balíčku." a obecné prvky jako „Start training",
   „Change situation" nebo „none selected". Některé texty porušují i dnešní
   smlouvu. Například „Scroll horizontally on mobile"
   (`postflopRangeMatrixView.ts:227`) je vysvětlující text, a je natvrdo
   anglicky.
3. **Hráč vidí interní texty.** Například „Production profile: MTT 9-max regular
   preflop chipEV ante on". U heuristického flopu se ukazují i předpoklady
   modelu, mezi nimi zastaralé „Turn a river model se přidává až po stabilizaci
   flop modelu" (`postflopView.ts`, `userFacingAssumption`). Turn i river se přitom
   dávno dodávají.
4. **Vyhodnocení je dlouhý text se seznamy.** Ztráta EV a lepší akce se v něm
   ztrácejí. Matice range je až pod ohybem a na mobilu se posouvá do strany
   (590 px obsahu v 286 px, viz `mobile-screenshot-qa-2026-06-12.md`).
5. **Ovládací prvky nejsou jednotné.** Jsou tu nativní selecty v různém vzhledu,
   šedé pruhy s „Custom selection", tlačítka All a None a zaškrtávátka
   v pilulkách.
6. **Chybí sdílený vizuální základ.** Styly se vkládají jako řetězce `<style>`
   z TypeScriptu (`main.ts`, `dashboard.ts`, `tableRenderer.ts`,
   `postflopView.ts`, `rangeModal.ts`, `hhView.ts`). Barvy a rozměry si určuje
   každá obrazovka sama.

## Inspirace

Z projektů bereme jen vzory, kód ani grafiku nepřebíráme.

| Projekt | Co si bereme | Licence |
|---|---|---|
| [desktop-postflop](https://github.com/b-inary/desktop-postflop) / [wasm-postflop](https://github.com/b-inary/wasm-postflop) | Výsledek solveru jako matici 13×13 s pruhy frekvencí akcí a vedle ní EV po akcích. | AGPL-3.0. Kód ani grafiku nepřebírat, jen pozorovat. |
| [RangeAssistant](https://github.com/HoldemPokerTools/RangeAssistant) | Práci s maticí: tažení přes buňky, souhrn kombinací. | MIT |
| [Poker Academy](https://poker.academy/blog/post/practice-full-hand-training-guide) | Hodnocení podle ztráty EV místo „správně/špatně". Tlačítko, které trénuje nejslabší oblast. | Komerční produkt, jen pozorování. |
| GTO Wizard | Akce má v celé aplikaci jednu barvu: v matici, v pruhu strategie i na tlačítku. | Komerční produkt, jen pozorování. |
| [Radix Colors](https://www.radix-ui.com/colors) | Barevné škály pro tmavé téma s ověřeným kontrastem. | MIT |
| [Open Props](https://open-props.style/) | Pojmenování a struktura CSS tokenů. | MIT |

Prošel jsem i openpokertools a poker-tui. Pro návrh nepřinesly nic nového.

## Směr

1. **Trénink začíná jedním klepnutím.** Nahoře jsou předvolby (například „MTT
   9-max · preflop · všechny pozice"). Podrobné nastavení je sbalené a jeho
   výběr se pamatuje.
2. **Akce jsou vždy vidět.** Na mobilu je panel akcí přilepený dole, na
   desktopu jdou akce zvolit klávesami 1–4 a Enter vede na další spot.
3. **Vyhodnocení se přečte za dvě sekundy.** Ukazuje:
   - verdikt a ztrátu EV v BB,
   - pruh strategie solveru,
   - EV každé akce, se zvýrazněnou tou, kterou hráč zvolil,
   - nejvýš dvě věty vysvětlení.

   Podrobnosti se ukazují až na požádání.
4. **Verdikty jsou výsledky domény, UI si je nevymýšlí.** Jsou to `BEST`,
   `EQUIVALENT`, `ACCEPTABLE` a `MISTAKE` z `core/actionEv.ts`. Na turnu a riveru
   je práh rovnocennosti stejný jako práh přijatelnosti, takže tam stupeň
   „přijatelná" nevzniká. Pátý stupeň („hrubá chyba") by byl změnou domény
   a statistik, ne změnou vzhledu.
5. **Hráč nevidí interní texty.** Původ dat ukáže krátký štítek (Solver nebo
   Heuristika). Předpoklady modelu a profil patří do diagnostiky.
6. **Barvy akcí jsou v celé aplikaci stejné.**

   | Akce | Barva |
   |---|---|
   | check, call | zelená |
   | malá sázka | jantarová |
   | velká sázka | oranžová |
   | all-in | vínová |
   | fold | modrá |

   Verdikt se proto nesmí poznat jen podle barvy, nese i tvar a text.
7. **Matice se vejde na šířku telefonu bez posouvání do strany.** Buňka má
   kolem 22 px a detail se otevře klepnutím.
8. **Jazyková smlouva se zpřesní.** Pokerové termíny zůstávají v režimu CZ
   anglicky (Bet, Check, Call, Fold, All-in, range, BB, pozice, streety, SRP).
   Obecné ovládání a navigace budou česky (Spustit trénink, Další spot,
   Nastavení, Statistiky). Úprava oddílu 5 smlouvy patří do fáze 1. Režim EN
   zůstává celý anglicky.
9. **Tmavé téma je výchozí.**

## Mantinely rychlosti

- Zůstává vanilla TypeScript a nepřibude žádná runtime závislost.
- Tokeny budou v CSS souboru, ne v řetězcích v TS. Vite soubor vyextrahuje
  a zahashuje, takže ho prohlížeč cachuje.
- Žádné písmo ze sítě (offline-first, zásada 4 v `design.md`). Použije se
  systémové písmo (Segoe UI Variable, SF Pro, Roboto). Čísla mají
  `tabular-nums`, aby se sloupce EV nehýbaly.
- Rozpočet svazku (`bundle:budget`, dnes 325 kB JS a 96 kB gzip) se nezvyšuje.
  Obsah packů se dál načítá líně.
- Animace používají jen `transform` a `opacity` a respektují
  `prefers-reduced-motion`.
- Rychlost se měří, neodhaduje. E2E zapíše čas od kliknutí na akci po
  vykreslení vyhodnocení a ten nesmí růst.
- Kontrast textu musí být aspoň 4,5:1. Hlídá to test nad dvojicemi tokenů, bez
  prohlížeče. Dotykové cíle mají aspoň 44 px.

## Fáze

Každá fáze je samostatný blok. Přes den běží `verify:day`, celá brána ráno po
cyklu. Noční obsah běží dál nezávisle, redesign se solveru nedotýká.

| Fáze | Obsah | Hotovo, když |
|---|---|---|
| 0 Základ | `tokens.css`, základní prvky (tlačítko, přepínač, čip, panel, pruh strategie, karta), test kontrastu. Prohlídka UI se snímky (dnes jen pracovní skript) jako `npm run ui:tour` na 1280, 412, 390 a 360 px. | Tokeny a prvky jsou v buildu, test kontrastu je zelený, prohlídka dělá snímky. Vzhled se zatím nemění. |
| 0b Staré styly | Styly starého GUI z řetězců v TS do `src/ui/styles/legacy/*.css`, beze změny textu a ve stejném pořadí kaskády. Vlastní rozpočet pro CSS. | Snímky před a po se liší jen tam, kde starý způsob vkládání sám chyboval. Hlavní JS se zmenší. |
| 1 Trénink | Otázka a vyhodnocení na desktopu i mobilu, verdikty podle bodu 4 směru, zpřesněná jazyková smlouva (bod 8 směru) a pryč interní texty (bod 3 výtek). Nová obrazovka je za přepínačem (nastavení a parametr adresy). | E2E projde na obou rozvrženích a čas vyhodnocení se nezhorší. Pak se přepínač otočí na výchozí. |
| 2 Matice | Matice 13×13 s pruhy frekvencí, detail ruky, vejde se na šířku telefonu. | 169 buněk bez vodorovného posunu na 360 px. |
| 3 Nastavení | Předvolby, sbalené pokročilé volby, jednotné prvky místo nativních selectů a pruhů „Custom selection". | Trénink se spustí jedním klepnutím z výchozího stavu. |
| 4 Statistiky | KPI, trend, slabá místa s tlačítkem „Trénovat". | Tlačítko spustí trénink přesně na vybraném slabém místě. |
| 5 Úklid | Smazat staré styly (`src/ui/styles/legacy`) a přepínač. Snímková kontrola na desktopu a mobilu, poznámky k vydání. | Ve `src/ui/styles` nezůstane složka `legacy`. |

Pořadí odpovídá času hráče: nejvíc ho tráví v tréninku, proto fáze 1 jde hned
po základu.

## Průběh

### Fáze 0, 22. 10. 2026 (commit 9772b9c3)

Vznikly tokeny (`src/ui/styles/tokens.css`), prvky (`components.css`,
`src/ui/kit`), test kontrastu a `npm run ui:tour`. Barvy akcí zůstaly
v `colorForActionKey`. Hlídá je podmínka vlastníka z 24. 9. 2026 (odstup od
palety RYE), takže si je prvky berou přes `--action-accent`, ne z tokenů.

Ovládání Chromu, náhled a šířky obrazovky byly zkopírované ve třech skriptech.
Teď je mají jednou v `scripts/lib` (`chromeCdp`, `previewServer`, `viewports`).
`e2e:chrome:preview` po přestavbě prošel na všech čtyřech šířkách.

### Fáze 0b, 22. 10. 2026

Styly starého GUI (73,7 tisíce znaků z šesti modulů) jsou v
`src/ui/styles/legacy/`. Vytáhl je překladač TypeScriptu přesně tak, jak je
skládal runtime. `main.ts` je načítá v pořadí, v jakém dřív ležely ve stránce.

| Měřeno | Před | Po |
|---|---|---|
| hlavní JS | 301,28 KiB, gzip 89,62 | 245,95 KiB, gzip 75,76 |
| JS v precache celkem (strop 416) | 399,91 KiB | 329,14 KiB |
| CSS (nový strop 80, gzip 15) | 6,53 KiB | 69,33 KiB, gzip 12,82 |

Dvě věci zmizely jako vedlejší účinek:

- **Vkládání stylu při každém vykreslení.** Stůl přidával 6 KB `<style>`
  ke každému preflopovému spotu, postflopový pohled 28 KB ke každému
  vykreslení. Prohlížeč pokaždé přepočítal styly celé stránky.
- **Nenastylované tlačítko „Show range (Flopzilla)“.** Jeho pravidla byla
  v bloku stylu dialogu range, a ten se vkládal jen s otevřeným dialogem.
  Do prvního otevření a po každém zavření mělo tlačítko výchozí šedý vzhled
  prohlížeče.

Snímky před (`artifacts/ui-tour/2026-10-22_1457`) a po
(`2026-10-22_1527`): 30 z 39 je bajtově shodných. Osm rozdílných jsou
vyhodnocení preflopu, kde se liší jen to tlačítko. Devátý je celostránkový
snímek flopu na 360 px a liší se šumem v plynulých přechodech plsti
a pozadí. Že je to šum, ověřily dva běhy nad týmž buildem
(`2026-10-22_1551`): tentýž snímek se liší o stejných 61 578 px.

### Fáze 1: technický návrh

Logika tréninku má existovat jednou. Nové GUI ji proto nepíše znovu, ale bere
ji z řadiče, který vznikne vytažením z dnešního kódu. Starý pohled ho začne
používat první.

1. **Řadič preflopové relace** (`src/training/preflopSession.ts`, hotovo
   22. 10.). Přebírá ze `setupTraining` v `main.ts` všechno kromě DOM:
   - start relace (sekvence spotů a prázdný průnik filtrů i s hloubkami, které
     fungují),
   - odpověď (`grade`, záznam do statistik, skóre relace),
   - další spot.

   Že se chování nezměnilo, hlídají dnešní testy toku (`bootstrapIntegration`,
   `mobileWebViewSmoke`, `sessionScoreboard`) a `e2e:chrome:preview`.
   Vlastní testy řadiče (`preflopSession.test.ts`) ověřují hlavně záznam do
   statistik: je stejný jako ten, který dřív skládal `main.ts`, včetně doby
   odpovědi.

   Jedna změna je záměrná: dobu odpovědi teď měří řadič hned po kliknutí.
   Dřív se měřila až po vykreslení bublin s EV a cenových řádků, takže
   v ní bylo i pár milisekund vykreslování.
2. **Nová obrazovka tréninku** nad týmž řadičem, podle plátna. Má hlavičku
   spotu, stůl a panel akcí (na mobilu dole, na desktopu klávesy 1–4 a Enter).
   Vyhodnocení ukazuje čip verdiktu, ztrátu EV, EV akcí, pruh strategie, dvě
   věty a tlačítko „Další spot“. Obrazovka je za přepínačem.

   **Preflop hotový 22. 10.** (`src/ui/trainer/preflopTrainerView.ts`,
   `src/ui/styles/trainer.css`). Zapínal se `?ui=next`, vypínal `?ui=classic`
   a volba se pamatovala (`uiFlag.ts`; přepínač zmizel s klasikou 4. 11.). Stav:
   - Desktop má stůl vlevo, akce a vyhodnocení vpravo. Mobil má akce
     a vyhodnocení přilepené dole.
   - Nad akcemi je otázka s kartami hráče („Jak zahraješ 9♠ 6♠?“), protože
     panel na mobilu zakryje spodek stolu.
   - Vyhodnocení ukazuje čip verdiktu, ztrátu EV, EV akcí od nejlepší a větu
     „Plán:“. Celé vysvětlení a cena rozhodnutí jsou v „Podrobnostech“,
     matice range za tlačítkem „Range“.
   - Pruh strategie preflop nemá: range dává doporučené akce, ne frekvence.
     Přijde s postflopem, kde frekvence solveru jsou.
   - **Nový stůl 23. 10.** (`src/ui/kit/pokerTable.ts`). Sedadlo je štítek
     s pozicí, stackem a akcí, ne karta s ukazatelem stacku. Devět štítků se
     vejde na elipsu i na 360 px, kde se sedadla starého stolu překrývala.
     E2E nového GUI to hlídá na všech šířkách: počítá překryvy obdélníků
     sedadel a čeká nulu.
   - Rozmístění sedadel (kdo složil, akce, jmenovaný protihráč) je vytažené
     do `src/ui/tableModel.ts`. Starý i nový stůl kreslí totéž.

   Prohlídka: `npm run ui:tour` (do 4. 11. s `--ui=next`).
3. **Postflop stejně.** Je výrazně složitější než preflop: má jeden spot
   i celou linku (flop → turn → river), resolver strategie s pravidly pro
   záložní obsah, a statistiky zapisuje přes zpětná volání z `main.ts`.
   Proto po částech:
   - **3a** řadič jednoho spotu vytažený z `postflopView.ts` (generování se
     seedem, `gradePostflopAction`, záznam přes stejná volání jako dnes).
     **Rozdání hotové 23. 10.** (`src/training/postflopDeal.ts`). Patří k němu
     katalog vyřešených desek podle ulice, záloha a rozlišení pilota, který
     čeká na přesolvení. Předčtení tabulky EV je zvlášť
     (`primePostflopDeal`): vrací Promise jen tehdy, když je na co čekat, takže
     spot bez tabulky se dál vykreslí synchronně. Vyhodnocení už řadič
     nepotřebuje, `gradePostflopAction` je čistá funkce a zápis dělá `main.ts`
     přes `onAnswered`;
   - **3b** nová obrazovka jednoho spotu: deska, stůl, akce s velikostmi,
     vyhodnocení s pruhem strategie z frekvencí solveru.
     **Hotovo 23. 10.** (`src/ui/trainer/postflopTrainerView.ts`). Stav:
     - Stůl kreslí `postflopPokerTable` z téhož modelu jako preflop. Deska je
       uprostřed, aktivní jsou jen hráč a soupeř a u soupeře je jeho akce na
       téhle ulici. Proti sázce ukazuje i její velikost, když ji vyřešené
       pravidlo nese. Akci soupeře určuje `villainActionBeforeHero`, kterou
       čte i starý pohled.
     - Tlačítka nesou velikost, kterou solve hrál („Bet 33 %“, pod tím
       „2 BB“), nebo all-in za celý stack. Bez vyřešené velikosti se použije
       modelová, tatáž jako v simulátoru linky (`MODEL_BET_RATIO`).
     - Vyhodnocení ukazuje verdikt („neposouzeno“ pro akci mimo strom), ztrátu
       a EV akcí tam, kde je solver spočítal, a cenu dorovnání. Pruh strategie
       „Jak solver hraje ruce jako tvoje“ kreslí frekvence kbelíku hráčovy
       ruky, jen u vyřešeného obsahu a jen s přesnými frekvencemi. Heuristiku
       za solver nevydává.
     - V podrobnostech jsou ruce po lajnách, plán a poznámky k modelu
       (`postflopModelNotes`, vytažené ze starého pohledu, aby je četly obě
       obrazovky).
     - Skóre relace drží obrazovka. Neposouzená odpověď se do něj nepočítá.
     - Kostru (hlavička, stůl, dok, klávesy 1–9 a Enter) sdílí s preflopem
       (`trainerFrame.ts`).

     Chybí oproti starému pohledu: matice range (patří do dialogu, jako
     u preflopu) a režim linky (3c). **Obojí doplněno 3. 11.:** tlačítko
     „Range“ otevře `renderPostflopRangeMatrix` v témž dialogu jako preflop
     (kostra dialogu vytažená do `src/ui/kit/rangeDialog.ts`, aby postflop
     nepřitáhl preflopové range do svého balíku).

     Při práci se našly dvě chyby mimo redesign:
     - **Starý pohled prozrazoval odpověď.** Ukazatel sázky uprostřed stolu
       kreslil doporučenou akci („Malý bet 2 BB“) už u otázky, a to od 8. 6.
       2026. Opraveno: ukáže se až s vyhodnocením.
     - **Statistiky počítají neposouzenou odpověď jako chybu.**
       `buildPostflopResultRecord` zapisuje `correct: false` a nic dál
       `unsolved` nečte, přestože `postflopScoring.ts` výslovně říká, že to
       statistika rozlišit musí. Na riveru to v srpnu postihlo 104 z 300
       spotů. Oprava sahá na schéma záznamu, import a přehled, a proto je to
       samostatný krok. **Opraveno 3. 11.:** záznam i most do statistik v2
       nesou `unsolved: true`, validátory (a tím import) ho berou,
       `isJudgedPostflopRecord` ho drží mimo rozpad, souhrn spot/linka, trend
       a váženou úspěšnost; čas rozhodnutí se počítá dál. Přehled napíše, kolik
       odpovědí neposoudil. Starší záznamy pole nemají a rozlišit se nedají.
   - **3c** režim linky v nové obrazovce. **Hotovo 3. 11.:** `show(spot, line)`
     ukáže ulici linky („Turn 2/3“), předchozí ulice pozicemi („Flop: BTN bet
     2 BB, BB call 2 BB · pot 10 BB“) a vede „Pokračovat: Turn“ až po „Linka
     hotová: 2 z 3 správně“ a „Další linka“. Linku řídí `postflopView.ts` týmž
     `branchPostflopLine` jako starý pohled a zapíše ji celou na konci
     (`onLineCompleted`), ulice po jedné do statistik nejdou. E2E ji projde na
     všech šířkách v bráně (`line passed`), klasická linka běží jen nad
     produkční fixturou;
   - **3d** E2E postflopu za přepínačem. **Napsané 23. 10.**
     (`runNextUiPostflopScenario`): start flopu formulářem, otázka s deskou,
     odpověď skutečným vstupem, vyhodnocení a další spot na všech šířkách.
     Hlídá překryvy sedadel i desky s potem, kontrast a čas do vyhodnocení
     (`nextUiPostflop` v reportu).
4. **Start zatím přes dnešní formulář.** Nové nastavení přijde ve fázi 3, do
   té doby se po startu ukáže nová obrazovka.
5. **E2E pro nové GUI za přepínačem**, včetně měření času od kliknutí na akci
   po vyhodnocení.

   **Pro preflop hotové 22. 10.** (`runNextUiScenario`
   v `scripts/runChromeE2e.mts`). Na všech čtyřech šířkách projde otázku,
   odpověď skutečným vstupem (klávesnice, dotyk), vyhodnocení, další spot
   a znovu odpověď. Kontroluje kontrast a vodorovné přetečení. Čas od
   kliknutí po prvním snímku s vyhodnocením jde do reportu (`nextUi`
   v `artifacts/e2e-chrome/report.json`).

   | Šířka | Čas do vyhodnocení (první běh) |
   |---|---|
   | desktop 1280 | 13,7 ms |
   | mobil 360 | 4,3 ms |
   | mobil 390 | 10,2 ms |
   | mobil 412 | 6,8 ms |

   Strop 1 s je jen pojistka proti patologii, ne cíl. Kontrol kontrastu
   přibylo ze 48 na 80.

Verdikty v čipu musí pokrýt všechno, co dnes doména vrací:

- čtyři výsledky EV,
- u spotů bez EV jen „správně / nesprávně“ podle range (dnes „Správně.“
  a „Zatím ne.“),
- u postflopu „neposouzeno“ pro akci, kterou rozbor nepočítal.

### Co z toho plyne pro fázi 1

- **Rozpočet unese obě podoby najednou.** V precache je teď 87 KiB rezervy JS,
  takže nové GUI za přepínačem se vejde vedle starého bez zvedání stropu.
- **Plsť přes celou stránku je řešení starého GUI.** Test „paints the page
  in felt, not navy“ (`appShellPalette.test.ts`) chrání vlastníkův požadavek
  „herní klient, ne formulář se stolem“. Nové GUI ho plní tím, že trénink je
  stůl s akcemi bez formuláře před ním. Plátno, které vlastník schválil, má
  plsť jen na stole. Test se změní ve fázi 5 spolu se starým shellem.
- **Komentáře v `main.ts` byly poškozené kódováním (opraveno 22. 10.).**
  137 řádků bylo dvakrát převedených z UTF-8 („sobÄ›staÄŤnĂ©“ místo
  „soběstačné“). Oprava je vrátila zpět přes windows-1250. Kód zůstal bajtově
  stejný, změnily se jen znaky mimo ASCII v komentářích.
- **Na 360 px se překrývají sedadla.** Sedadlo protihráče na BB leží přes
  sedadlo hráče (snímek `mobile-360-05-flop-result-full`). Je to chyba
  starého stolu a nové rozvržení ji musí vyřešit.

### Fáze 2, 3. 11. 2026: matice range

Nové GUI otevírá „Range“ v dialogu s maticí z kitu: `src/ui/kit/handMatrix.ts`
(mřížka) a `src/ui/kit/rangeView.ts` (matice, detail ruky, souhrn s legendou).
Obsah dodávají `src/ui/trainer/preflopRange.ts` a `postflopRange.ts`. Klasické
GUI má dál starou matici; zmizí ve fázi 5.

- **Vejde se na telefon.** Řádek je mřížka třinácti sloupců, záhlaví
  s hodnotami karet není (nese je popisek buňky a čtrnáctý sloupec by na
  360 px vzal buňkám místo). Na 360 px vychází buňka na 22,9 px, jak počítal
  směr (bod 7). E2E to hlídá na všech čtyřech šířkách: 169 buněk ve 13
  řádcích, dialog ani stránka se neposouvají do strany, buňka aspoň 18 px,
  detail k ruce hráče hned a k jiné ruce po klepnutí, kontrast, Escape.

  | Šířka | Buňka | Vyhodnocení preflop / postflop |
  |---|---|---|
  | mobil 360 | 22,9 px | 9,6 / 10,8 ms |
  | mobil 390 | 25,2 px | 11,3 / 11,1 ms |
  | mobil 412 | 26,9 px | 13,6 / 15,2 ms |
  | desktop 1280 | 37,9 px | 48,3 / 34,2 ms (stroj pod zátěží) |

  Kontrol kontrastu je 160 místo 128.
- **Ovládání podle vzoru mřížky WAI-ARIA.** Tabulátor vede jen na vybranou
  buňku, šipky, Home a End přesouvají výběr i detail. Ruka hráče má bílý
  vnitřní rámeček, vybraná ruka obrys v akcentu.
- **Popisek je čitelný na každé barvě.** Na modré barvě callu (#3d7eb8)
  nemá 4,5:1 ani bílý, ani tmavý text. Popisek proto leží na tmavém
  průsvitném podkladu (`--dx-matrix-plate`, stránka z 64 %).
  `handMatrix.test.ts` počítá kontrast přes všechny barvy akcí, všechny barvy
  síly ruky i přes bílou.
- **Preflop:** plná barva akce, protože pack nese doporučené akce, ne
  frekvence. Souhrn „Hraješ 2,1 % rukou (28 z 1 326 kombinací), zbytek je
  fold.“, pruh složení range a legenda, která zvýrazní akci v matici. Detail
  ukazuje doporučení, další správné akce a EV akcí, když je pack nese.
- **Postflop:** buňka má barvu akce, kterou ruka hraje nejčastěji (barva
  tlačítka), blaf je šrafovaný. Souhrn ukazuje frekvence celé range vážené
  kombinacemi a podíl blafů v sázkách. Detail ukazuje ruku na desce, průměr
  skupiny a EV jednotlivých kombinací. Bez kbelíků (heuristika) ukáže sílu
  rukou na desce a řekne to.

**Pruh frekvencí v každé buňce, jak ho má návrh, zatím není.** Vyřešené packy
nenesou strategii po třídách rukou. Kbelík jsou všechny třídy se stejnou
převažující akcí a jeho směs je jejich průměr (`classesByDominantAction`
v `turnStrategyRuleBuilder.ts`; flop a river mají týž tvar). Pruh v buňce by
ukazoval průměr skupiny, jako by patřil té ruce. Frekvence proto jsou
v souhrnu a v detailu, s poznámkou, že jde o průměr skupiny. Kdyby je packy
nesly po třídách, pack by vyrostl. Turnový pack
`mtt9-50bb-sb-bb-srp-oop-cbet-midspr` (459 KB) má 258 pravidel a 22 754
záznamů tříd, v průměru 3,7 akce na pravidlo; směs v celých procentech by
přidala zhruba 230 KB. Je to rozhodnutí o formátu packů, ne o vzhledu.

**Rozhodnuto 3. 11. 2026 večer, majitel: „chci to. Rozšířit".** Návrh:

- **Frekvence nejdou do packu.** Pack má strop 528 KB raw a 128 KB gzip.
  Generátor ořezává pravidla na 500 KB (`trimToModuleBudget`), takže
  frekvence by z packu vytlačily obsah. Pack se navíc stahuje u každého
  rozdaného spotu. Frekvence proto leží v souboru vedle packu a stahují se až
  s maticí, stejně jako tabulky turnové EV.
- **Soubor:** `src/data/ranges/{flop,turn,river}-mix/<rodina>.generated.json`
  (`solvedClassMix.ts`). Na každé pravidlo packu jeden řetězec se 169 místy
  v pořadí mřížky, v každém celá procenta akcí v pořadí akcí pravidla. Páruje
  se podle pořadí pravidla v packu (`pack.rules.indexOf(rule)`, jako EV)
  a soubor nese otisk obsahu packu. Frekvence k jinému obsahu se nepoužijí.
- **Vlastní adresáře `-mix`:** chunk pak dostane jméno, které precache pozná
  jako odložené (`isSolvedStreetAsset`). Soubor s tečkou vedle packu by
  skončil na instalační cestě, popáté tatáž past. Skripty, které procházejí
  `turn/*.generated.json` jako packy, soubory s frekvencemi neuvidí.
- **Generátory** (flop, turn, river) zakódují směs tříd hned u postaveného
  pravidla a zapíšou soubor po ořezu (`writeClassMix`). Když se soubor
  nevejde do 500 KB, vyprázdní frekvence od konce; pravidla packu kvůli nim
  nikdy neubývají. Manifest dá rodině `loadMix` jen tehdy, když soubor leží.
- **Matice** se ukáže hned s tím, co nese pack, a až frekvence dorazí,
  překreslí se s pruhy v buňkách a s toutéž vybranou rukou. Detail pak ukáže
  strategii té třídy („Jak solver hraje 76s“), ne průměr skupiny.
- **Kde budou:** flop se staví z checkpointů monolitu, takže frekvence po
  třídách dostanou jen rodiny vyřešené od 2. 11. a další přibývají s každou
  nocí. Turn a river z rozkladu, ale jen tam, kde přestavba dá přesně dodaný
  obsah (níž).

**Stav 4. 11. 2026 (deník 336).** Frekvence se k dodaným packům dopsaly
režimem generátorů `--mix-only`: pack zůstane, jak je, a soubor
s frekvencemi se zapíše jen tehdy, když přestavba dá týž otisk obsahu
(`mixOnlyRefusal`). Přestavět packy kvůli frekvencím by znamenalo vyměnit
obsah, a s ním EV i posouzení majitelem.

| ulice | rodin s frekvencemi | proč ne zbytek |
|---|---|---|
| flop | 1 z 83 | checkpointy monolitů se ztratily 30. 10. |
| turn | 35 z 55 | u 16 je rozklad novější než dodaný pack (15 packů 25bb z 12. 9. proti rozkladu z 23.-24. 10., `MTT9_50BB_UTG_2_CO_SRP` rozložená den po stavbě packu); plný cyklus 24. 10. je přestavěl (`artifacts/after-night-full.log`), ale commity se ztratily se strojem. 3 hluboké rodiny mají v rozkladu víc desek, než na kolika pack stojí (150bb 30 proti 20), 1 rodina má ztracené desky |
| river | 1 z 48 | 20 packů z 19. 10. postavil rozpočet, který 20. 10. opravil commit fb2f7482 („cyklus 19. 10. vzal 21 packům 103 desek“), takže je přestavba změní; 27 packů z 12. 9. a 24. 9. stojí na vrstvách, které pozdější rozklad (4.-24. 10.) nahradil. Sedí jen pack z 20. 10. (`MTT9_20BB_BTN_BB_SRP_LOWSPR`); zkoušeno 12 rodin, zbytek dávky zastaven, protože jde o packy z 19. 10. |

Zbytek přijde s přestavbou packů. Sobotní plný cyklus (7. 11. v 07:00)
přestaví turn a river z dnešního rozkladu a generátor k nim frekvence zapíše
sám; cyklus necommituje, takže obsah i frekvence projdou pondělní kontrolou.

**Nalezeno cestou:**

- **Klasická matice ukazovala jinou range, než podle které se hodnotilo.**
  Klíč záznamu nesl jen sedačku protihráče, hodnocení i scénář stacků (ICM)
  a jmenované dorovnávající. Obě matice teď berou klíč z jednoho místa
  (`gradedRangeKey` v `rangeMatrixView.ts`).
- **Enter v dialogu přeskočil spot.** Klávesnice obrazovky poslouchá celý
  dokument, takže Enter na buňce matice kromě výběru ruky klikl i na „Další
  spot“ za dialogem. Týkalo se to i staré matice v dialogu z fáze 1. Našlo
  to první E2E fáze 2: po zavření dialogu už „Další spot“ nebyl. Rámec
  obrazovky teď klávesy nebere, dokud je otevřený modální dialog
  (`trainerFrame.ts`, test v `postflopTrainerView.test.ts`).
- **Legenda síly ruky vynechávala „Made flush“.** Buňka s barvou na desce
  měla barvu bez položky v legendě (`CATEGORY_ORDER`).
- **Prohlídka UI v novém GUI končila na flopu.** Postflopové kroky měly
  selektory klasiky. Teď má vlastní a fotí i dialog s range (`03b`, `06`).
- **Jednotlivý spot vyřešené packy nedostane (4. 11., deník 337).** Pruhy
  frekvencí měly projít E2E na turnovém spotu, jenže aplikace vyřešené packy
  načítá jen v produkční lince a v rozboru HH: v prohlížeči se na žádné
  ulici nestáhl ani jeden chunk `*-solved-*`, ani s licencí. Frekvence proto
  hlídá test nad dodanými daty (`solvedClassMixData.test.ts`). Majitel 4. 11.
  rozhodl, že vyřešený postflop je v betě bez licence; start postflopu teď
  packy své ulice načte před prvním rozdáním a E2E ověřuje stažení
  vyřešeného flopového i turnového packu a pruhy v turnové matici (deník 338).

**Rozpočet CSS byl skoro vyčerpaný:** 79,96 z 80 KiB. Položka legendy proto
používá tlačítko z kitu. Fáze 3 a 4 by se do stropu nevešly, a tak část úklidu
z fáze 5 šla dřív - viz další oddíl.

### Fáze 5 (část), 4. 11. 2026: klasické GUI pryč

Majitel 4. 11.: „Smazat klasiku teď". Nové GUI bylo od 3. 11. výchozí
a prošlo E2E na všech šířkách; klasika za `?ui=classic` už jen držela kód,
testy a styly, které hráč neuvidí.

- **Kód.** Z `main.ts` a `postflopView.ts` zmizelo klasické vykreslení
  (otázka, vyhodnocení, linka, Flopzilla matice, bubliny EV na tlačítkách,
  cenové řádky), moduly `uiFlag.ts`, `rangeModal.ts`,
  `actionEvButtonBubbles.ts` a `actionPriceLines.ts` a s nimi přepínač
  `?ui=`. `postflopRangeMatrixView.ts` drží jen klasifikaci rukou a EV po
  kombinacích, které čte nová matice.
- **Testy.** Kde hlídaly chování panelu nebo zásadu, jsou převedené na novou
  obrazovku: start aplikace, mobilní smoke, skóre relace, zásada „žádné zdroje
  v UI" (teď i s dialogem range u postflopu), QA matice linek a postflopový
  panel včetně poctivých poznámek modelu (SPR, dva stromy, pokrytí textur,
  all-in na tlačítku). Testy klasického vykreslení, které pokrývá
  `postflopTrainerView.test.ts`, zmizely.
- **E2E a prohlídka.** Produkční tok (jazyk, brána preflopu, produkční flop
  s EV akcí, produkční linka, turn a river, HH, statistiky, reload, offline
  a odolnost) běží na nové obrazovce; `ui:tour` přepínač `--ui` nemá.
- **Styly.** Ze `src/ui/styles/legacy` zmizela pravidla klasické obrazovky
  (77,0 → 41,4 kB zdroje). Rozpočet CSS: 79,96 → 51,52 z 80 KiB.
  Ve složce zůstaly živé styly kostry aplikace, filtrů, statistik, HH, stolu
  rozboru HH a kostry dialogu; jejich přestěhování a smazání složky zbývá.

**Nalezeno cestou:**

- **Neposouzená akce česky mluvila anglicky.** Verdikt `unsolved` měl v CZ
  katalogu překlad, ale chyběl mezi prefixy hybridního katalogu (`cs.ts`),
  takže česky hraný spot hlásil nespočítanou akci anglicky mezi českými
  větami - u preflopu i postflopu. Klasický test to dokonce bral za záměr
  („sada běží v anglické lokalizaci"). Opraveno, hlídá to
  `czechUiCatalog.test.ts`.
- **Rozdání dalšího spotu je asynchronní.** Od 4. 11. načítá `beforeGenerate`
  packy ulice před každým rozdáním a do té doby zůstává starý spot i s
  vyhodnocením. E2E se tak jednou trefilo do starého spotu (smyčka mixu po
  třídách teď čeká na nový). V produktu je během pomalého rozdání starý spot
  klikací a druhé „Další spot" rozdá dvakrát - drobnost, zatím neopravená.
- **Produkční fixture E2E je rozbitá už dřív.** `e2e:chrome:production-fixture`
  (mimo brány) padá stejně na HEAD f499e732 i na 1359ba2c: spot nese vzor
  pozic `3BP_HJ_VS_LJ` místo čekaného `OOP_CALLER_VS_IP_3BETTOR` a produkční
  linka skončí prázdnou stránkou. S dočasně uvolněnou kontrolou vzoru prošel
  na nové obrazovce produkční flop i EV akcí; linka je otevřený bod.
