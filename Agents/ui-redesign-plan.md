# Redesign GUI – plán

**Stav:** fáze 0 a 0b hotové 22. 10. 2026, další je fáze 1 (trénink). Vlastník
návrh 22. 10. schválil: „myslím, že to vypadá dobře, můžeš pokračovat." Průběh
a naměřená čísla jsou na konci dokumentu.

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

1. **Řadič preflopové relace** (`src/ui/trainer/`). Přebere ze `setupTraining`
   v `main.ts` všechno kromě DOM:
   - start relace (sekvence spotů a prázdný průnik filtrů i s hloubkami, které
     fungují),
   - odpověď (`grade`, záznam do statistik, skóre relace),
   - další spot.

   Že se chování nezměnilo, hlídají dnešní testy toku (`bootstrapIntegration`,
   `mobileWebViewSmoke`) a `e2e:chrome:preview`.
2. **Nová obrazovka tréninku** nad týmž řadičem, podle plátna. Má hlavičku
   spotu, stůl a panel akcí (na mobilu dole, na desktopu klávesy 1–4 a Enter).
   Vyhodnocení ukazuje čip verdiktu, ztrátu EV, EV akcí, pruh strategie, dvě
   věty a tlačítko „Další spot“. Obrazovka je za přepínačem.
3. **Postflop stejně.** Nejdřív řadič vytažený z `postflopView.ts`, pak nová
   obrazovka.
4. **Start zatím přes dnešní formulář.** Nové nastavení přijde ve fázi 3, do
   té doby se po startu ukáže nová obrazovka.
5. **E2E pro nové GUI za přepínačem**, včetně měření času od kliknutí na akci
   po vyhodnocení.

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
- **Komentáře v `main.ts` jsou poškozené kódováním.** 136 řádků je dvakrát
  převedených z UTF-8 („sobÄ›staÄŤnĂ©“ místo „soběstačné“). Řetězce pro hráče
  to nezasáhlo. Opravit to před fází 1, protože ta do `main.ts` sáhne nejvíc.
- **Na 360 px se překrývají sedadla.** Sedadlo protihráče na BB leží přes
  sedadlo hráče (snímek `mobile-360-05-flop-result-full`). Je to chyba
  starého stolu a nové rozvržení ji musí vyřešit.
