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

#### Doručení se neměří počtem záznamů, ale dosažitelností (7. 10. 2026)

Vrstva 0 se od začátku ptá „dojde odpověď k hráči". Dnes se našla její slepá
místa, a je užší, než jsem si myslel: **záznam může zůstat v packu a přestat být
dosažitelný.**

Stalo se to při zavádění osy dorovnávajícího (rozhodnutí 4a). Záznam dostal
přesnější klíč `… vsCO @BTN`, jenže klíč, který drill skládá, osu nenese, takže
se na něj nikdo nezeptá. Tři buňky tím zůstaly bez obecného záznamu a obsah,
který byl dosažitelný, přestal být.

**Co to neodhalilo:** počet přijatých záznamů (69 před i po), sada testů, ani
`valid true, productionReady true` z kontroly importu. Záznamy nezmizely, jen
se překlíčovaly. Je to tatáž třída vady jako u packů, kde se dodávka musí měřit
otiskem pravidel a ne jejich počtem - jen o vrstvu výš.

**Co to odhalilo:** srovnání proti stavu před změnou (`git stash`) a pak otázka
„existuje pro tutéž buňku pořád záznam bez té osy?". Třikrát ne.

**Pravidlo pro příště:** u každé změny klíče se musí měřit, jestli přesnější klíč
nezůstal sám. Platí to pro každou osu, kterou pack má - otvírač, scénář,
dorovnávající - a pro každou, která přijde.

**Od 7. 10. to hlídá brána** (`refinementReachability`): zpřesněný záznam musí mít
v packu sourozence o jednu osu obecnějšího, jinak je v řetězu pádu díra. Je to
**chyba, ne varování**, a smí to tak být, protože se to nejdřív změřilo - všechny
čtyři produkční packy (507, 566, 507, 566 záznamů) i kandidát s vrstvou RYE (576)
mají nula porušení. Dnešní obsah tedy nic neblokuje a brána padá zavřená, což je
u doručení ta správná strana: opačná chyba je neviditelná.

Dočasná kopie, kterou vlastník pro tuhle dobu schválil (T4: „lepší dočasně pustit
mřížku proti nejtěsnějšímu dorovnávajícímu než nechat obecný záznam"), zůstává do
doby, než se drill na osu umí zeptat. Až se smaže, tahle brána je přesně to, co
tu ztrátu zachytí.

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

#### Vrstva 0 měřila jednu ze dvou cest rozdávání (14. 10. 2026)

**Nalezeno na vlastníkovo pozorování**, že matice ukazuje sílu ruky místo akcí
a že to „nevypadá, že máme solving hotový". `mtt:post-answer` přitom hlásí
matici podle akce ve **100 %** spotů. Obojí je pravda a každé o jiné cestě.

V `postflopView.ts` stojí jedna řádka, na které to celé visí:

    const dealsSolved = options.initialPositionContext == null;

Katalog vyřešených spotů se použije, **jen když si hráč situaci nevybral**.
Jakmile si ji vybere, deska se losuje a katalog se obchází. Změřeno novým
`npm run mtt:picked-situation`, 300 spotů na ulici, situace z nabídky UI:

| | katalogová cesta | vybraná situace |
|---|---|---|
| matice se barví podle akce | **100 %** | **0,0 %** |
| cena akce na flopu | 31,3 % | **0,0 %** |
| EV akcí na flopu | 0 % | 0 % |
| odpovídá vyřešený pack | — | 65 az 74 % |

Ten poslední řádek je jádro věci: pack **odpovídá**, ale je to texturový pilot,
který `rangeBuckets` nenese - a bez nich `postflopRangeMatrixView` přepne osu na
sílu ruky. Chová se tak správně (jednobarevná matice by byla k ničemu a legenda
to přizná), ale hráč dostane **jinou osu, než na jakou se ptá**.

**Proč to brána nechytila:** `mtt:post-answer` rozdává „z katalogu, tak jak
rozdává trenažér" - což byla pravda pro jednu větev a nikdo ji nepřeměřil, když
přibyla druhá. Je to tatáž třída vady jako celá vrstva 0: měřilo se něco, co
vypadá jako doručení, ale je to doručení **po jedné cestě**.

**~~A nestojí to na nocích solveru.~~ Stálo to na filtru - ale ne na tom, který
jsem napsal napoprvé.** Tady stálo „35 z 61 situací (57,4 %) v katalogu obsah
má, rozdíl je filtr podle `positionPattern`". To číslo bylo z **jiného seznamu**,
než co vyrobí výběr hráče: měřil jsem nad `POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS`,
kdežto hráč situaci skládá z filtrů (`postflopIntentFromFilters`). Doměřeno
cestou produktu, přes všech 45 kombinací pozic, které filtry umí, a vyšly
**dvě další mezery**, které ten seznam schovával:

1. **Obrana velkého blindu dostává hrubý vzor.** Filtry dávají `EP_VS_BB` pro
   kteréhokoli otvírače od UTG po CO, a `BTN_VS_BB`, `SB_VS_BB` - vzory
   texturových pilotů. Katalog je vede jemně (`SRP_CO_VS_BB`), takže filtr
   podle vzoru nesedl **u žádného z deseti** výběrů „X proti BB", přestože
   jemný obsah pro každý z nich je. Řešeno převodem jen pro hledání v katalogu
   (`cataloguePatternFor`); kontext i záloha na piloty zůstávají beze změny.
2. **Výběr „otvírač + SB" padal na `null`** a pohled pak rozdal libovolnou
   situaci z celého katalogu - hráč chtěl CO proti SB a dostal cokoli, beze
   slova. Sedm ze 45 výběrů. Doplněna větev v `postflopIntent.ts`.

Filtr bere vedle vzoru i **hloubku** (`effectiveStackBB`): filtry ji fixují
a bez ní by hráč, který si vybral 25 bb, dostal spot ze 100 bb.

**Změřený dopad** (`npm run mtt:picked-situation`, 45 výběrů pozic krát hloubky
25/40/50/100 bb, všechny tři volby nabídky situací):

| | matice podle akce | EV akcí | cena akce |
|---|---|---|---|
| FLOP | 0 → **44,3 %** | 0 → 0 | 0 → **14,2 %** |
| TURN | 0 → **21,6 %** | 0 → **16,5 %** | 0 → **9,7 %** |
| RIVER | 0 → **27,8 %** | 0 → **19,3 %** | 0 → **9,7 %** |

Zahozených voleb **8 → 1** (zbyl samotný BB, který je skutečně nejednoznačný).
Zbytek do 100 % je **šířka solvingu**: pro tu kombinaci vzoru, hloubky a uzlu
vyřešený obsah není, a losovaná deska s pilotem je správná odpověď.

Co katalog obsahuje po ulicích, hloubkách a uzlech, tiskne
`npm run mtt:catalogue-situations`.

**Pravidlo pro příště:** když přibude cesta, kterou se obsah k hráči dostává,
musí přibýt i řádek ve vrstvě 0. Jinak brána měří tu starou a zůstává zelená.

**Řádek ve vrstvě 0 musí hlídat, ne jen měřit** (15. 10. 2026). Měření z 14. 10.
tisklo tabulku, ale do `verify:block` se nedostalo, takže by regresi zase nikdo
nepoznal. Teď má dna kolem 80 % naměřeného (flop: matice 36, cena 11; turn:
matice 17, EV 13, cena 7; river: 22, 15, 7 - tabulka ve skriptu), končí
nenulovým kódem a je v bráně hned za `mtt:post-answer`. Volání pohledu ale
jen napodobuje přes sdílený modul: kdyby pohled modul přestal volat, neviděl
by to. Proto `tests/unit/postflopViewPickedSituation.test.ts` modul
odposlouchává a ptá se samotného pohledu, s jakou situací se katalogu ptá -
ověřeno rozbitím pohledu, tři ulice zčervenaly.

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

**Od 19. 10. 2026 noci střídá mezi šířkou a prvním rozkladem** (deník 319,
`scripts/lib/nightAlternation.mts`). Priorita `NEW_FAMILIES` posílala celou noc
expanzi, kdykoli byla nastagovaná práce - a tak 349 vyřešených desek čekalo na
první rozklad (bez turnu, riveru i EV; ten den hlášeno 523 i se 174 deskami jen
pro flop, opraveno 20. 10.), zatímco fronta expanze měla ~17 nocí.
Teď po noci šířky přijde noc rozkladu a naopak; bez desek k rozkladu má šířka
všechny noci, bez nastagované práce rozklad. Expanze v noci rozkladu ustoupí
(do 19. 10. prioritu nečetla vůbec).

**Od 20. 10. 2026 dělí noc rozkladu okno mezi turn a river** (deník 320,
`--turn-share=0.5` v obou nočních úlohách, `turn_phase_end` v runneru).
Riverová fáze se dosud pouštěla jen po vyčerpané turnové frontě nebo od 90 %
rozložených desek; po růstu desek a nových rodinách je rozloženo 68 %, takže
river neběžel vůbec - a turnová EV vzniká jen z riverových vrstev. Teď turn
dostane první polovinu okna a river zbytek, napřed podhry s dodávanými
turnovými pravidly bez vrstvy (`turn-ev-priority.json`). Podíl je první odhad
z hodin obou front (turn ~80 h, river pod dodávanými pravidly ~100 h), ne
změřené optimum; přeměřit po několika nocích.

**Plný cyklus packů má vlastní okno a zámek** (`scripts/scheduled/pack-cycle.ps1`,
deník 318): s víkendovým rozvrhem v sobotu ráno, jinak na pokyn v plném okně
stroje; noční solver i lehký ranní cyklus mu ustoupí. `-Streets river` ho omezí
na vyjmenované ulice se stejným zámkem (deník 320: oprava výběru riverového
rozpočtu mění jen riverové packy).

~~**Sám nezakládá práci.** Vygenerovat parametry pro nové rodiny je krok, který
spustí člověk: je to rozhodnutí o tom, co se bude solvit další tři noci.~~
**Od 15. 10. 2026 zakládá sám**, ale jen na hloubkách se změřenou cenou desky,
a to když výhled fronty klesne pod dvě noci. Jinou osu (100 bb, další desky,
3BP) nezaloží a nahlásí ji jako rozhodnutí.

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

   Doplněn řádek **„fronta vydrží aspoň dvě noci"** (dnes v minutách podle
   změřené ceny desky: `queueRunway` a `RUNWAY_NIGHTS_MIN` ze
   `scripts/lib/expansionQueue.mts`). Dvě noci proto, že nastagovat dávku stojí
   minuty, ale vědět se o tom musí den dopředu.

   **Prázdná fronta neznamená prázdnou noc:** rozklad si okno vezme na riverové
   vrstvy, jak udělal 4. 10. od 01:13 do 06:37 (751 desek s checkpointem).
   Znamená ale, že se nedodá žádná **nová rodina**, a to je ta dražší polovina.

   **Od 15. 10. 2026 se fronta doplňuje sama.** Orchestrátor (`mtt:daily
   --write`, který si noc pouští ve 21:00) spočítá výdrž stejně jako hlídač a
   pod dvěma nocemi pustí `mtt:seat-pair-expansion --write` přes všechny
   hloubky se **změřenou** cenou desky. Zápis je idempotentní: rodiny, které ve
   frontě leží, drží, a zapisuje za konec fronty, takže nic nezdvojí ani
   nevmíchá mezi čekající desky. Hloubku bez změřené ceny ani jinou osu sám
   nezaloží - to zůstává rozhodnutím (viz níž) a orchestrátor ho v tu chvíli
   nahlásí. Tentýž den se ukázalo, že frontu četlo sedm míst a každé počítalo
   soubory místo desek (deník 314); teď ji všichni čtou modulem
   `expansionQueue.mts` se sémantikou runneru.

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
     (měřeno generátorem dávky). Jedna hloubka navíc je 16 rodin × 6 desek.

     **40 bb změřeno nocí 5.-6. 10. 2026:** medián **19,3 min** ze 17 desek,
     p90 28,6, maximum 29,1. Devadesát šest desek je tím kolem 31 hodin, tedy
     **tři noci**.

     Ruční sonda z 5. 10. (`MTT9_40BB_UTG_2_HJ_SRP A72r`, 546 s = 9,3 min,
     exploitabilita 0,40 %) z toho odhadla půl druhé noci a strop 30 min - a
     **obojí bylo špatně**. Dvě desky `742r` na třicetiminutový strop narazily
     a strop se musel zvednout na 60. `A72r` je totiž na 40 bb v nočním logu
     **nejdražší** textura (26,5 / 28,6 / 29,1 ve třech sesterských rodinách),
     ne nejlevnější: ruční sonda přes den cenu noci neříká.

     **50 bb je nastagované (96 desek) a v tabulce jako extrapolace**, plán
     39,8 min na desku z poměru dvou ručních sond. První noc na 50 bb ten řádek
     přepíše na měření sama. **(Přepsala: k 15. 10. 2026 je 50 bb změřené,
     medián 23,9 min z 81 desek - extrapolace byla o dvě třetiny výš.)**
   - **tři zablokované dvojice** — `UTG_UTG_1`, `UTG_UTG_2`, `UTG_1_UTG_2` se
     nedají založit, protože preflop pack nemá `VS_OPEN|UTG+1|25` ani
     `VS_OPEN|UTG+2|25`. Není to práce pro solver, je to **mezera v obsahu
     preflopu** - a ~~je to tentýž druh mezery, jakou zavírá vlastníkovo čtení
     ranží z RYE~~.

     **Změřeno 13. 10. 2026: RYE je nezavírá.** V kandidátovi na import
     (`artifacts/rye-import/candidate`, 414 zpřesněných záznamů) není ani jeden
     `VS_OPEN|UTG+1|25` ani `VS_OPEN|UTG+2|25`; sedačky obránce, které kandidát
     na 25 bb nese, jsou **BB, BTN, CO, HJ, LJ, SB**. Zdroj je organizovaný
     podle hrdinovy sedačky a „UTG+1 se brání proti otevření z UTG" v něm
     nefiguruje. Čekat tyhle tři dvojice od importu RYE je tedy omyl - chtějí
     jiný zdroj, nebo rozhodnutí, že se ty spoty učit nebudou.
   - **squeeze obsah z RYE** — leží hotový a čeká na přečtení 54 mřížek
     vlastníkem; bez něj do packu nejde (viz `Agents/range-intake`).

8. **Cena a výtěžnost** — nová vrstva, otevřená 6. 10. 2026 na vlastníkovo
   zadání „musíme vědět, co děláme; nemůžeme pálit čas a peníze zbytečně".

   ### Čeho si framework nevšimne

   Vrstva 0 měří, **co dorazí k hráči**. Vrstvy 5 a 6 měří, **co se vyrobí**.
   Ani jedna neměří, **co to stálo** - a proto může fáze spálit desítky hodin
   stroje a všechny brány zůstanou zelené.

   Změřeno z `artifacts/after-night-turn-ev.log`, posledních šest běhů fáze
   turnové EV:

   | běh | minut | zastaralých po běhu |
   |---|---|---|
   | 1 | 210 | 1 |
   | 2 | 210 | 1 |
   | 3 | 554 | 1 |
   | 4 | 253 | 1 |
   | 5 | 210 | 1 |
   | 6 | 211 | 1 |

   **1 648 minut, tedy 27,5 hodiny, a počet zastaralých tabulek se nezměnil.**
   Z patnácti neúspěšných běhů (z celkem 21) padá **13 na dvě rodiny na 100 bb**:
   `MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR` (8x) a
   `MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR` (5x). Fáze jinak funguje - šest běhů
   dojelo na nulu - takže to není vada fáze, ale dvou rodin, které se do jejího
   stropu nevejdou a zkoušejí se dál každé ráno.

   Noční strana má svoji obdobu: ze dvanácti posledních nocí **čtyři skončily
   s prázdnou frontou** (`zbývá 0`) a jedna přišla o osm hodin na baterii, tedy
   pět z dvanácti nedoběhlo na plný výkon. Frontu od 5. 10. hlídá vrstva 7,
   baterii od 2. 10. hlídač noci.

   ### Proč se to dělo: cena desky byla zapsaná na pěti místech

   | kde | hodnota | k čemu |
   |---|---|---|
   | `run_night_expansion.py` | `BOARD_MINUTES = 12` | **nic - nikdo ho nečetl** |
   | `run_night_decomposition.py` | 715 s = 11,9 min | práh ustoupení (v komentáři) |
   | `checkProcessRegistry.mts` | 715 s = 11,9 min | odhad délky fronty |
   | `checkNightReadiness.mts` | 9 / 19,3 min podle hloubky | výhled na noci |
   | `buildTurnEvPacks.mts` | `chosen.length * 10` | odhad délky fáze EV |

   Pět čísel o téže věci, každé se posouvalo samo, a dvě z nich si v jednom
   souboru odporovala (osm desek je „půl hodiny" na řádku 178 a „dvě hodiny"
   na řádku 355). `BOARD_MINUTES` byl nejčistší příznak: dvakrát přeměřený,
   dvakrát opravený a **v kódu bez jediné reference**. Číslo, které se posouvá
   a přitom nic neovlivňuje, je horší než žádné - vypadá jako zdroj pravdy.

   Dva omyly z 5. a 6. 10. jsou toho následek: odhad fáze EV hlásil 10 minut
   u běhu, který trval 211, a dávka na 40 bb se plánovala podle jedné sondy
   (9,3 min) místo podle rozdělení (medián 19,3).

   ### Hotovo 6. 10.: jedno měření, tři odvozená čísla

   Sjednotit to na **jednu** konstantu nejde, a to je ta past. Každý konzument
   potřebuje jinou statistiku téhož rozdělení a každý se smí mýlit na jinou
   stranu:

   | k čemu | statistika | bezpečný směr omylu |
   |---|---|---|
   | zásoba na noci | medián | **podstřelit** - nadsazená cena hlásí zásobu, která není |
   | strop jedné desky | p90 x 2, 30 az 90 | **přestřelit** - těsný strop stojí strop a stupeň žebříku |
   | rezerva na konci okna | p90 | je to přesně „co s pravděpodobností 0,9 nedoběhne" |

   Směr u zásoby jsem měl ráno 6. 10. v komentáři **napsaný obráceně** („nadsazený
   odhad škodí méně"). Výhled je minuty děleno oknem, takže dražší deska dá víc
   nahlášených nocí - kdo cenu nadsadí, ohlásí zásobu, která není.

   Měří to `npm run mtt:board-cost` z nočního logu (715 desek) a zapisuje do
   `board-cost.generated.json`; čtou runner, hlídač noci i registr procesů.
   Přeměřuje se v ranním cyklu, takže nová hloubka se z extrapolace stane
   měřením sama. Odvozené stropy vyšly **shodně s ručními** (30 / 60 / 90), což
   je ověření pravidla proti úsudku, ne pravidlo dopsané k číslům.

   Dvě věci, které to vyvrátilo:

   - **Ruční sonda přes den neříká cenu noci.** `A72r` na 40 bb mi ručně doběhla
     za 9,3 min; noc tutéž texturu ve třech sesterských rodinách solvila 26,5,
     28,6 a 29,1 min. Rodinou to není - `UTG_2_HJ` má ostatní desky v řadě
     s ostatními. Takže `A72r` je na 40 bb **nejdražší** textura, ne nejlevnější,
     jak jsem 6. 10. ráno zapsal na dvě místa. Přenositelný je jen **poměr dvou
     ručních sond**, a tak je 50 bb v tabulce zapsané: jako extrapolace.
   - **Jedna prospaná noc zvedala průměr.** Deska `955tt` začala 1. 10. ve 23:09
     a „dokončila" v 07:36, tedy 507,5 min. Nad stropem stropů (90 min) není co
     měřit: runner by solve zabil, takže delší čas na hodinách znamená pohyb
     hodin bez procesu.

   ### 20. 10.: cena podle rodiny a šířky range, ne jen hloubky (deník 321)

   Řádek hloubky je průměr přes rodiny, které noc zrovna solvila - a na 40 bb
   to byly rodiny s raným otvíračem. Nové dvojice s obranou blindů stojí
   dvakrát tolik, takže fronta 186 desek se hlásila jako 6,8 noci a slib „noc
   dokončí čtyři rodiny" dopadl na jednu (bod 311). Plán a slib se teď berou
   z `costForFamily`: rodina s aspoň třemi změřenými deskami má vlastní medián
   a průměr; jinak regrese `log(minuty)` na `log(kombinací OOP + IP)`
   z parametrů solveru, po hloubkách (sklon 0,63 na 40 bb, 0,65 na 50 bb, na
   25 bb nula); až pak hloubka. Na vynechané rodině chyba 39 % → 15 % na 40 bb.
   Strop a rezerva zůstávají po hloubkách - tam je bezpečné přestřelit. Hlídač
   u výdrže fronty píše, z čeho cena je: změřená rodina, šířka range, nebo
   šířka mimo změřený rozsah (extrapolace, spíš podstřelená).

   ### Co z toho plyne pro plán

   - ~~**Nejdřív zastavit opakované pálení.**~~ Hotovo 6. 10.: fáze EV má tři
     pokusy na rodinu, pak jedno nahlášení a čekání na rozpočtové rozhodnutí.
   - ~~**Pak sjednotit cenu do jednoho místa** a nechat ji měřit.~~ Hotovo 6. 10.
   - **Zbývá práh ustoupení v minutách, ne v deskách.** `YIELD_MIN_BOARDS = 8`
     je osm desek, a to je podle hloubky 51 minut, nebo 5,3 hodiny. Dnešní
     frontě 173 desek práh nevadí, takže to nespěchá; chce to čtecí modul
     i pro Python rozkladu a dotýká se to kontraktu `tonight.json`.
   - **Odhad fáze EV je od 6. 10. měřený, ale ještě nic nenaměřil.** Je to jiná
     jednotka než deska (rodina, ne deska), takže ho neocení tabulka desek.
     Per-rodinové časy fáze už do logu psala, jenže `turn-ev-run-<k>.log` se
     každé ráno přepíše - od teď se ukládají do `artifacts/turn-ev-cost.json`
     a odhad bere jejich medián. Dokud je soubor prázdný, drží se desítka, ale
     **napíše se, že je to odhad**. To je ten rozdíl: vyměnit jednu konstantu za
     jinou by bylo totéž znovu.
   - **Fáze EV pouštěla běhy do prázdna.** Počet běhů se počítal z jader a
     paměti, nikdy z množství práce: ráno 6. 10. byla ve frontě jedna rodina a
     fáze pustila tři běhy. Běhy 2 a 3 skončily po **čtyřech sekundách** s „žádný
     turnový pack neodpovídá zadání", zatímco běh 1 mlel tu jednu rodinu
     3,5 hodiny, dokud ho nesebral strop. Stojí to jen ty čtyři sekundy, ale log
     tím o fázi lhal - vypadalo to, že se dělí práce. Opraveno, běhů je nejvýš
     tolik, kolik je rodin.
   - **Rozhodnutí o těch dvou rodinách je rozpočtové**, ne technické: vlastní
     dlouhý běh v noci (16 jader proti denním 3), nebo tabulku nechat zastaralou.
     Od 7. 10. je k tomu ale druhé číslo, viz níž: ta jedna rodina stojí
     **112 minut každého rána** i bez fáze EV.

   ### 7. 10.: největší nalezené plýtvání bylo v ranním cyklu, ne v noci

   Vrstva 8 se dívala na fázi EV a na noc. Měření ranního cyklu, které z toho
   vypadlo, je ale dražší než obojí:

   | rodina | čas generování flopového packu |
   |---|---|
   | `mtt9-100bb-sb-bb-srp-oop-cbet-highspr` | **112,5 min** |
   | `mtt9-100bb-co-bb-srp-cbet-highspr` | 8,3 min |
   | `mtt9-25bb-hj-sb-srp` | 5,5 min |
   | ostatních jedenáct dohromady | asi 12 min |

   Checkpointy té první rodiny jsou z **27. 7. 2026**, je jich 32 a mají kolem
   6 GB. Vyráběl se z nich bajt za bajt tentýž pack, a to každé ráno.

   #### Příčinu jsem ale určil špatně (opraveno 8. 10. 2026)

   Napsal jsem, že těch 112 minut stojí velikost checkpointů. Ráno 8. 10. vyrobil
   cyklus **tutéž rodinu z týchž checkpointů za 5,3 minuty** a celá fáze trvala
   45 minut místo 3 h 23. Brána po rodinách přitom nepřeskočila nic: noc změnila
   tabulku velikostí sázek, takže se otisk sdílených vstupů změnil a
   přegenerovalo se všech 58 rodin.

   Rozdíl byl v **paměti**:

   | | 7. 10. | 8. 10. |
   |---|---|---|
   | volná paměť při běhu | 8,5 GB | 16,4 GB |
   | halda na flop (`laneBudget`) | 4 096 MB | 6 587 MB |
   | nejdražší rodina | 112,5 min | **5,3 min** |
   | celá fáze 1 | 3 h 23 min | **45 min** |

   Těch 112 minut bylo **hladovění po haldě**, ne velikost dat. `laneBudget()`
   haldu škáluje podle volné paměti, takže cizí proces na stroji (virtuál a
   Obsidian drží 13 GB, bod 244) zdraží ranní cyklus dvacetinásobně.

   Brána po rodinách tím smysl neztrácí - fáze 3 téhož rána hlásí „generuji 0 ze
   4 rodin, 4 má pack z týchž vstupů" - ale **nebyla to ona, co ušetřilo ty dvě
   a půl hodiny**. Skutečná páka je volná paměť v době běhu, a ta je zatím
   neměřená: cyklus ji jen přečte a podle ní škáluje, nikde se nehlásí, že právě
   kvůli ní bude dnešní ráno dvacetkrát dražší.

   Dvě příčiny, obě opravené:

   - **Brána byla na správné místo a ve špatné granularitě.** Ptala se „je
     nejnovější checkpoint **kdekoli** novější než nejnovější pack **té ulice**",
     takže jedna nová deska v jedné rodině přegenerovala všech 54. Teď se to
     ptá po rodinách, a rozhoduje **otisk obsahu** sdílených vstupů plus čas
     checkpointů té rodiny - ne čas zápisu, protože tabulku velikostí sázek
     cyklus přepisuje každé ráno, takže podle času by se nepřeskočilo nikdy nic.
   - **Součet za ulici skrýval rozložení.** Fáze hlásila „flop 8972 s" a vypadalo
     to na sedmdesát rodin po dvou minutách. Kdyby tiskla nejdražší rodinu, bylo
     by to vidět týdny předtím, než jsem to našel z časů zápisu souborů.

   Na kterou stranu se tahle brána smí mýlit: přeskočená rodina, která se změnit
   měla, je **tiše zastaralý obsah u hráče** - nejdražší vada, jakou projekt zná.
   Zbytečně vyrobená rodina stojí minuty. Proto se při každé nejistotě generuje,
   a je na to jedenáct testů.

   ### Co tabulka ceny udělala sama, bez zásahu

   Noc 6.-7. 10. přidala 18 desek na 40 bb a ranní cyklus cenu přeměřil:

   | | před nocí | po noci |
   |---|---|---|
   | 40 bb medián | 19,3 min (17 desek) | **22,1 min** (35 desek) |
   | 40 bb p90 | 28,6 | **40,3** |
   | 40 bb strop | 60 | **90** |
   | 50 bb plán (extrapolace) | 39,8 | **45,6** |

   To je ta vrstva při práci. Má to ale důsledek, který jsem nepředvídal:
   **jakmile strop hloubky dojde na strop stropů (90), přestane být žebřík
   žebříkem.** `min(90 + 30, 90)` je pořád 90, takže stupně 0 a 1 jsou od 7. 10.
   u 40 bb i 50 bb shodné - `(90, 0.5)` a `(90, 0.5)` - a deska spadlá na stupni 0
   by se zkoušela znovu s úplně stejným povolením. Devadesát minut okna za nic.
   Runner proto **přeskakuje stupeň, který nedá nic navíc** (strop ani přesnost).

   Co z toho zůstává vlastníkovi: **strop stropů 90 minut u 50 bb nevydrží.**
   Extrapolované p90 je 83, takže kolem desetiny desek na strop narazí a stupeň 2
   už dá jen volnější přesnost, ne víc času. Buď se strop pro hlubší zvedne, nebo
   se počítá s tím, že se část desek na 50 bb nedosolví.

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
