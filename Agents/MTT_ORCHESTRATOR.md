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

## Vrstvy

### 0. Doručení — **chybělo do 25. 8. 2026, a byla to ta nejdražší mezera**

Všech sedm vrstev níž měří **produkci**: kolik rodin je vyřešených, kolik desek
rozložených, kolik vzorů pokrytých. Ani jedna neměřila **doručení**, tedy jestli
se vyřešená odpověď dostane hráči na obrazovku. Rozdíl mezi tím se dva týdny
neprojevil v žádné bráně a projevil se jako tři stížnosti majitele naráz.

Změřeno 25. 8. 2026 přes `npm run mtt:post-answer`, rozdáno z katalogu tak, jak
rozdává trenažér:

| co má hráč po odpovědi vidět | obsah to ví | dojde k hráči |
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

Zbývá 30 rodin bez tabulky vůbec. Dopočítat je stojí ~12 MB, a v rozpočtu líného
obsahu zbývá po zvednutí stropu na 44 MB zhruba **2,5 MB**. Je to tedy
**rozhodnutí majitele o velikosti stahování**, ne práce, kterou lze udělat
potichu - a znamenalo by to strop zvednout znovu.

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
11,7 bodu), a preflop packy nesou čisté akce - měřeno 0 tříd z 1980, které by
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
5. **Doručení** — od 25. 8. 2026 nejvyšší priorita, protože je změřeně nejnižší
   ze všech vrstev. Pořadí uvnitř podle dopadu: akce v matici (0 % → celá
   knihovna), blafovací lajna (tatáž změna), EV (4,7 % river, 0 % jinde).
6. **Porovnání dnů** — sbírá se od 20. 8., zatím jeden bod. Až bude historie,
   půjde ptát: přineslo doporučení z minulé noci to, co slibovalo?

## Co zůstává mimo dosah stroje

Nic z toho nejde odvodit ani změřit; potřebuje to vstup zvenčí.

- **six-max charty** (16 řádků knihovny) a **ICM data** (32 řádků)
- **stroj s 48+ GB RAM** pro 51 desek s blendem plného a redukovaného stromu
- **čtení hráči** - mechanická kontrola chytá hrubé rozbití, ne kvalitu hry
