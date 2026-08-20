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

## Pořadí prací

1. ~~Odvození ranží z preflop packů~~ — hotovo
2. ~~Generátor rodin pro chybějící dvojice~~ — hotovo
3. ~~Noční runner podle měření~~ — hotovo
4. ~~Evidence procesů~~ — hotovo (`mtt:processes`)
5. **Porovnání dnů** — sbírá se od 20. 8., zatím jeden bod. Až bude historie,
   půjde ptát: přineslo doporučení z minulé noci to, co slibovalo?

## Co zůstává mimo dosah stroje

Nic z toho nejde odvodit ani změřit; potřebuje to vstup zvenčí.

- **six-max charty** (16 řádků knihovny) a **ICM data** (32 řádků)
- **stroj s 48+ GB RAM** pro 51 desek s blendem plného a redukovaného stromu
- **čtení hráči** - mechanická kontrola chytá hrubé rozbití, ne kvalitu hry
