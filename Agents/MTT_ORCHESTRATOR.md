# Orchestrátor: soběstačný cyklus vývoje a nočního solvingu

Zadání: stroj, který zná cíl, má informace, chybějící si dopočítá, eviduje
procesy podle priority a paralelizovatelnosti, orchestruje noční solving tak, aby
placený strojový čas nesl co nejvíc, a denně před startem solvingu vyhodnotí, jak
dopadla noc i den.

Tenhle dokument je plán. Část už stojí, část ne, a je u každé napsáno co.

## Proč to vůbec potřebujeme: měření z 20. 8. 2026

Noční běh dosud rozhodoval podle pravidla zapsaného v runneru: „turn napřed, pak
river podle dosahu". Bylo správné, dokud turn chyběl. Dnes je turn hotový a
pravidlo pokračuje v riveru - jenže **měření říká, že tím se nic neodemyká**:

| | |
|---|---|
| vzorů pozic, na které se trenažér ptá | 32 |
| vzorů, které vyřešený obsah drží | 5 |
| dotazů na vzor, který máme | 12 % |

Rozklad drží pět dvojic sedaček (BTN vs BB, CO vs BB, SB vs BB, CO vs BTN, UTG vs
BB). Další riverové vrstvy prohlubují právě těch pět. **Noc tedy dvě noci po sobě
utrácela strojový čas na hloubku tam, kde už odpověď je**, a nikdo si toho
nevšiml, protože to pravidlo nikdo od jeho napsání nepřeměřil.

To je celý důvod, proč má rozhodovat stroj s měřením, a ne pravidlo v kódu.

## Revize orchestrace, 1. 9. 2026

Celková kontrola toho, jestli framework doopravdy řídí vývoj, nebo jen popisuje,
jak by ho řídil. Odpověď: **řídil devět dní naslepo.**

| vrstva | tvrdí | doopravdy |
|---|---|---|
| 0. doručení | stojí od 25. 8. | **stojí** - EV, cena i frekvence mají dno a to dno kouše |
| 1. cíl a vzdálenost | stojí | stojí |
| 2. znalost | stojí | stojí |
| 3. **rozvrh noci** | stojí | **devět dní mrtvá** - viz níž |
| 4. cyklus po noci | stojí | běží, ale **jen když ho někdo spustí**; naplánovaný není |
| 5. rozšíření vzorů | stojí | **zablokované** - 0 ze 174 desek nastagováno, chybí preflop obrana |
| 6. evidence procesů | stojí | stojí |
| 7. zpětná vazba | „chybí historie" | **mrtvá** - denní zápisy končí 23. 8. |

### Co se stalo s vrstvou 3

`Agents/daily/tonight.json` měl datum **23. 8. v 9:03**. Naplánované úlohy jsou
**jen dvě a obě jsou noční solving**; `mtt:daily` naplánovaný nebyl, spouštěl ho
člověk. Noc tedy devět nocí četla devět dní starou radu „výchozí: prohlubovat,
co je odsolvené" a poslušně prohlubovala river.

Nejtrpčí na tom je, že ten nástroj **měl pravdu už tehdy**. Jeho vlastní
hlavička říká: *„měření říká, že river do hloubky už nic neodemyká"*. Rozhodovací
vrstva to věděla, přestala běžet, a vykonávací vrstva jela dál - stroj běžel
každou noc jedenáct hodin a nikdo mu neříkal kam.

**Opraveno tak, aby se to nemohlo rozejít znovu:** rozvrh si nespouští člověk
ani plánovač, ale **noc sama** na svém začátku (`refresh_night_priority`).
Čerstvost je tím dána z definice. Když vyhodnocení spadne, noc pokračuje podle
uloženého - prázdná noc kvůli nefunkční poradě je horší než noc podle starší rady.

### Druhá vada: rozhodnutí bylo slepé k doručení

Doporučení znělo „pokračovat v hloubce - šířka vzorů je pokrytá" a mlčky
předpokládalo, že se nová hloubka k hráči dostane. Změřeno, že se nedostane:
**10 ze 48 riverových packů sedí na stropu modulu**, generátor u nich vynechává
nejméně dosahované rivery, a dodávaných desek ubylo z 983 na 882 za tři dny,
zatímco pravidel přibylo osm.

Rozhodovací vrstva měřila **produkci** (kolik vzorů držíme), ne **doručení**
(jestli se to vejde). Nově se ptá na obojí a při nasycení radí opak.

### Co z revize zůstává otevřené

- **Vrstva 4 není naplánovaná.** Dodání noci závisí na tom, že ho někdo spustí.
  Dvakrát se stalo, že se nespustilo dva dny.
- **Vrstva 5 je zablokovaná obsahem**, ne strojem (bod 140).
- **Vrstva 7 nemá data** od 23. 8., takže „porovnání dnů" pořád nemá co porovnat.

## Vrstvy

### 0. Doručení — **chybělo do 25. 8. 2026, a byla to ta nejdražší mezera**

Všech sedm vrstev níž měří **produkci**: kolik rodin je vyřešených, kolik desek
rozložených, kolik vzorů pokrytých. Ani jedna neměřila **doručení**, tedy jestli
se vyřešená odpověď dostane hráči na obrazovku. Rozdíl mezi tím se dva týdny
neprojevil v žádné bráně a projevil se jako tři stížnosti majitele naráz.

Změřeno 25. 8. 2026 přes `npm run mtt:post-answer`, rozdáno z katalogu tak, jak
rozdává trenažér:

**Tahle tabulka je diagnóza z 25. 8. 2026, ne dnešní stav.** Nechávám ji, protože
popisuje, jak se ta vada našla; čísla, která platí teď, jsou v „Pořadí prací"
níž - všechny tři řádky jsou od 26. 8. 2026 dodané nebo rozhodnuté.

| co má hráč po odpovědi vidět | obsah to ví | dojde k hráči (25. 8.) |
|---|---|---|
| co dělat s každou kombinací matice | ano, každé vyřešené pravidlo nese `buckets[]` s akcí, třídami a frekvenční směsí | **0 %** |
| blafovací část range | ano, tytéž kbelíky nesou lajnu VALUE/BLUFF | **0 %** |
| EV jednotlivých akcí | zčásti - 17 rodin ze 47 má tabulku | **4,7 %** riverových spotů, 0 % flop a turn |

Všechny tři jsou vady **doručení, ne obsahu**. Solvery spočítaly, co bylo třeba;
cesta na obrazovku se přerušila jinde:

1. `solvedStrategySource` nevyplňuje `rangeBuckets`, takže matice nemá jedinou
   buňku s akcí. Dokud vyřešený obsah odpovídal zřídka, odpovídal chartový
   resolver, který je vyplňuje - katalogy ho v srpnu vytlačily na 100 % spotů a
   akce v matici zmizely, aniž by o tom cokoli řeklo.
2. Matice se barví podle **kategorie ruky** (Set+, Top pair, Air). Blaf a stejně
   silná ruka, která se vzdává, mají tím pádem stejnou barvu.
3. Riverová EV se váže na `contentHash` packu. Noční `mtt:after-night` packy
   přegeneruje, otisk se změní a EV se **tiše zahodí**. Naměřený stav: 30 packů
   bez tabulky (7 309 pravidel), **14 packů se zastaralou tabulkou (4 010
   pravidel)**, 3 packy doručují (896 pravidel).

Ten třetí bod je ta podstatná část a je to systémová vada, ne jednorázová:
**každá úspěšná noc snižuje doručení**, protože přegeneruje packy a tím zneplatní
EV, kterou nikdo znovu nespočítá. Produkční čísla přitom rostou. Bez vrstvy 0 se
dva týdny stavěl obsah, který se k hráči nedostával.

**Upřesnění, aby to nebylo silnější, než jaké to je:** jedna brána to viděla.
`riverEvGenerated.test.ts` zastaralou EV chytá a sada kvůli ní byla červená - 28
pádů ve 14 rodinách. Jenže `mtt:after-night` sadu schválně nespouští, takže se
to ozve až u příštího `verify:block`, o hodiny až dny později. U akcí v matici a
u blafů žádná brána nebyla vůbec; to řeší `mtt:post-answer`.

**Pravidlo, které z toho plyne:** noc, která zvedne produkci a sníží doručení,
je špatná noc. Měřítko úspěchu je doručení; produkce je jen jeho vstup.

**Nástroj:** `npm run mtt:post-answer` (skript
`scripts/measurePostAnswerFeedback.mts`) měří ty čtyři věci na všech třech
ulicích a patří do `verify:block` i do cyklu po noci. Zastaralá EV **nesmí být
tichá** - je to spočítaná a zahozená práce, a to je horší než chybějící.

#### Stav po opravě, tentýž den

| | před | po |
|---|---|---|
| tříd ze 169 s přiřazenou akcí (medián) | 0 | **50 flop / 40 turn / 34 river** |
| vysvětlení jmenuje blafy | 41 / 29 / 30 % | **71 / 78 / 70 %**, a jmenuje skutečné třídy místo frází |
| riverová EV: packů doručuje | 3 (896 pravidel) | **17 (4 906 pravidel)**, zastaralých 0 |
| riverová EV u hráče | 0,0 % | **31,7 %** rozdaných riverových spotů |

To poslední číslo je ta druhá polovina vady a nesouvisí s obsahem:
`actionEvsFor` se ptá `readyRiverEvPack` **synchronně uprostřed rozdání**, takže
první spot z každé rodiny EV neukázal, i když byla celá spočítaná. Načítá se teď
před rozdáním (`primeRiverEvForSeed`), kdy hráč ještě nic nečte, se stropem 2,5 s,
aby pomalé připojení rozdání nezmrazilo.

Těch 30 rodin bez tabulky **dostalo EV 26. 8. 2026**: 47/47 rodin, 13 487
pravidel, doručení 30,0 -> **89,7 %** rozdaných riverových spotů. Stálo to 8,2 MB
syrové knihovny (strop 44 -> 53 MB) a žádný nový solve. Gzip celé knihovny je
6,18 z 8 MB, takže druhý součtový strop se ani nehnul.

### 1. Cíl a vzdálenost k němu — **stojí**

Cíl je v `MTT_COMPLETION_PLAN.md`, vzdálenost měří `mtt:playable-beta` (stav a
přiznané limity) a `mtt:solved-coverage` (kolik rozdávaných spotů obsah zodpoví).
Obojí vrací čísla, ne dojmy.

### 2. Znalost — **stojí**

`MTT_AUTONOMY.md` je deník: 83 zápisů o tom, co se pokazilo, proč, a co z toho
platí dál. Není to changelog, je to paměť. Orchestrátor na něj odkazuje, když
doporučení naráží na známou past (např. bod 62: `VS_OPEN` nerozlišuje, kdo
otevřel).

### 3. Denní vyhodnocení a rozvrh noci — **stojí**

`npm run mtt:daily [-- --write]` změří stav, přečte poslední noc z jejího logu,
projde commity za den, spočítá pokrytí a **vydá doporučení s důvodem**. Report
se ukládá do `Agents/daily/<datum>.md`, takže je z čeho porovnávat týden na týden.

Když měření chybí, **řekne to a doporučení nevydá**. Chybějící číslo je
informace, ne důvod si domyslet.

### 4. Cyklus po noci — **stojí**

`npm run mtt:after-night -- --write` dodá noční práci do produktu: přegeneruje
packy, pustí mechanickou kontrolu, přegeneruje znovu, ověří typy a rozpočty.
Necommituje a nespouští sadu, obojí schválně.

### 5. Rozšíření vzorů pozic — **stojí od 20. 8. 2026**

Cesta je průchozí celá a ověřená na skutečném solvu: `srpSolverInputRanges`
odvodí ranže z produkčních preflop packů, `mtt:seat-pair-expansion` z nich
vyrobí parametry (řazené podle změřené poptávky trenažéru), `run_night_expansion.py`
je odsolví a rozklad výsledný checkpoint vidí.

Změřeno: **715 vteřin na desku** včetně zápisu dumpu, checkpoint 31 MB, commit
1,7 GB. 173 desek je 34 hodin, tedy zhruba tři noci.

Dva ústupky, které se vracejí jako `caveats`, ne jen v komentáři:
`VS_OPEN` nerozlišuje, kdo otevřel (rozdíl proti nezávislému zdroji je v průměru
9,4 bodu, u BB až 37,7 - `mtt:reference-check --defence`), a preflop packy nesou čisté akce - měřeno 0 tříd z 1980, které by
dorovnávaly i zvyšovaly.

### 6. Evidence procesů — **stojí od 20. 8. 2026**

`npm run mtt:processes` ukáže naplánované úlohy s dalším během, běžící těžké
procesy, délku front (nastagované desky, rozložené desky, riverové vrstvy) a
třídy souběhu i s tím, proč jsou zakázané. Nic nespouští ani nezastavuje - je to
pohled, ne řídicí panel.

Nejcennější je ta poslední část: **sada spuštěná vedle něčeho náročného trvala
764 vteřin místo 250 a deset testů spadlo bez vady v kódu.** Tohle je jediné
místo, kde je ta znalost napsaná tak, že se dá přečíst před spuštěním.

### 7. Zpětná vazba — **stojí v principu, chybí historie**

`Agents/daily/` je od dneška. Až bude mít víc než jeden záznam, půjde porovnávat:
přineslo doporučení z minulé noci to, co slibovalo? Do té doby je to jeden bod,
ne trend, a tvářit se jinak by bylo klamání sebe sama.

## Co orchestrátor dělá sám a co ne

**Sám rozhoduje, co se v noci solví.** Priorita z měření je ve strojově čitelné
podobě a noční rozklad podle ní ustoupí monolitické expanzi - ale jen když platí
čtyři podmínky zároveň: priorita to říká, je nastagovaná práce, desek je aspoň
osm, a je nainstalovaná úloha, která okno převezme. Ta poslední je ta podstatná:
ustoupit do prázdna je nejdražší možný výsledek, protože noc neodvede nic.

**Sám nezakládá práci.** Vygenerovat parametry pro nové rodiny je krok, který
spustí člověk: je to rozhodnutí o tom, co se bude solvit další tři noci.

**Necommituje.** Co se změnilo a jestli je to v pořádku, je úsudek.

**Nepočítá, co neměří.** Doporučení bez podkladu se nevydá a řekne se proč.

**Neprohlásí noc za úspěšnou podle produkce.** Od 25. 8. 2026 platí, že se po
noci měří doručení (vrstva 0). Noc, po které je vyřešených rodin víc a doručení
níž, se hlásí jako ztrátová, i když všechny ostatní brány svítí zeleně.

## Pořadí prací

1. ~~Odvození ranží z preflop packů~~ — hotovo
2. ~~Generátor rodin pro chybějící dvojice~~ — hotovo
3. ~~Noční runner podle měření~~ — hotovo
4. ~~Evidence procesů~~ — hotovo (`mtt:processes`)
5. **Doručení** — od 25. 8. 2026 nejvyšší priorita, protože bylo změřeně
   nejnižší ze všech vrstev. Stav k 26. 8. 2026 večer:

   | co | stav | čím změřeno |
   |---|---|---|
   | akce v matici | dodáno na všech třech ulicích | `mtt:post-answer` |
   | blafovací lajna | dodáno, **0 zamlčených**; od 28. 8. i pravdivá (bod 149) | totéž |
   | EV river | 4,7 % → **92,0 %** | totéž |
   | EV turn a flop | **rozhodnuto nedodávat** (bod 131) | 5,2 % podher má vrstvu |
   | EV preflop | **33,1 %** | `mtt:post-answer` |
   | **cena akce** | preflop **100 %**, flop 25,0 %, turn 36,3 %, river 53,3 % | totéž |
   | **frekvence** | postflop 0 → **100 %** (bod 150) | totéž |

   **Od 28. 8. 2026 má každý rozdaný spot na každé ploše aspoň jedno poctivé
   číslo** - a každé říká něco jiného: EV co akce vynese, cena kolik musí
   vydělat, aby se zaplatila, frekvence jak často to solver hraje. Všechna tři
   mají v bráně dno a ta dna jsou ověřená vynuceným pádem, ne jen zeleným během.

   Chybí jediné: **frekvence na preflopu**. Packy ji nenesou - a je to přesně
   to, co přinese vlastníkův draft (578 rukou s mixem, 92 s nerovným poměrem).

   Uvnitř preflopu je pořadí dané měřením: `VS_3BET` je 14 872 spotů (19 %
   poolu) a **0 % EV**, protože se v něm nenabízí all-in větev, ze které by šla
   cena spočítat. `VS_LIMP` je na tom stejně. Zbytek už 100 % má.

   **A dál to kód nedotlačí** (bod 136). Zbylých 66,9 % poolu čeká na obsah, ne
   na práci: `generateSpot` už dává přednost EV z packu, když ji pack nese, a
   schéma pro ni má `source: "SOLVER"` - jenže v dodávaném preflop packu je
   **0 výskytů `actionEvs`**. Preflopový export se solverovou EV je tedy jediná
   věc, která to rozsvítí, a je to vstup zvenčí.
6. **Porovnání dnů** — sbírá se od 20. 8., zatím jeden bod. Až bude historie,
   půjde ptát: přineslo doporučení z minulé noci to, co slibovalo?
7. **Zásoba práce pro noc** — nová vrstva, otevřená 5. 10. 2026, protože se
   ukázalo, že ji nikdo neměřil.

   Hlídač `mtt:night-ready` se do 5. 10. ptal jen „je připravená **dnešní**
   noc". Ta otázka má zelenou odpověď i večer předtím, než fronta doběhne -
   a tak se to stalo: 2. 10. zbývalo 151 desek, noci 2.-5. 10. udělaly 70, 64
   a 17, fronta byla 4. 10. v 01:13 na nule a 5. 10. v 19 hodin neměla noc na
   čem jet. Útes byl spočitatelný tři dny dopředu.

   Doplněn řádek **„fronta vydrží aspoň dvě noci"** (`pendingBoards /
   BOARDS_PER_NIGHT`). Dvě noci proto, že nastagovat dávku stojí minuty, ale
   vědět se o tom musí den dopředu.

   **Prázdná fronta neznamená prázdnou noc:** rozklad si okno vezme na riverové
   vrstvy, jak udělal 4. 10. od 01:13 do 06:37 (751 desek s checkpointem).
   Znamená ale, že se nedodá žádná **nová rodina**, a to je ta dražší polovina.

   ### Osa 25 BB je k 5. 10. 2026 vyčerpaná na všech třech směrech

   | směr | nástroj | stav k 5. 10. | čím změřeno |
   |---|---|---|---|
   | chybějící dvojice sedaček | `mtt:seat-pair-expansion` | **29/29 rodin hotovo** | fronta 0 desek |
   | víc desek na rodinu | `mtt:board-growth` | šablona textur došla (posledních 28 desek jde do noci 5.-6. 10.) | `--max-boards=12` dá 0 desek |
   | přesolvení na nové ranže | `mtt:resolve-stage --depth=25` | **u všech 18 rodin „liší se 0"** | tentýž výpis |

   Přesolvování, které začalo 29. 9., je tím **hotové**: každá rodina na 25 bb
   stojí na dnešních preflop ranžích z RYE, ne na červencových. Dodáno 17 packů
   s jiným obsahem (stejný počet pravidel, jiné strategie - `contentHash`).

   ### Co může přijít dál, a co to stojí

   Rozhodnutí o další ose je **rozpočtové, ne technické**, takže ho stroj
   neudělá sám. Naměřené ceny:

   - **jiná hloubka** — 25 bb stojí 148 s na desku, **100 bb přes 2,5 h**
     (měřeno generátorem dávky). Mezi tím je 40 a 50 bb nezměřených. Jedna
     hloubka navíc je 29 rodin × 6 az 18 desek, tedy při 25bb tempu 3 az 5
     nocí, při 100bb tempu měsíce.
   - **tři zablokované dvojice** — `UTG_UTG_1`, `UTG_UTG_2`, `UTG_1_UTG_2` se
     nedají založit, protože preflop pack nemá `VS_OPEN|UTG+1|25` ani
     `VS_OPEN|UTG+2|25`. Není to práce pro solver, je to **mezera v obsahu
     preflopu** - a je to tentýž druh mezery, jakou zavírá vlastníkovo čtení
     ranží z RYE.
   - **squeeze obsah z RYE** — leží hotový a čeká na přečtení 54 mřížek
     vlastníkem; bez něj do packu nejde (viz `Agents/range-intake`).

## Co zůstává mimo dosah stroje

Nic z toho nejde odvodit ani změřit; potřebuje to vstup zvenčí.

- **six-max charty** (16 řádků knihovny) a **ICM data** (32 řádků)
- **stroj s 48+ GB RAM** pro 51 desek s blendem plného a redukovaného stromu
- **čtení hráči** - mechanická kontrola chytá hrubé rozbití, ne kvalitu hry
- **preflopový export se solverovou EV** - kód ji umí přijmout i zobrazit,
  dodávaný pack ji nenese (0 výskytů), a týká se to 66,9 % rozdávaných spotů
- **hloubkově rozlišené otevírací charty** - produkční pack otevírá týchž rukou
  na 15 i na 150 bb (1 výběr rukou z 11 hloubek, všech 8 sedaček, bod 137);
  odvodit to nejde, chce to data
