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

### 5. Rozšíření vzorů pozic — **nestojí, je to další krok**

Tady je dnes největší mezera a orchestrátor na ni umí ukázat, ale ne ji zavřít.

Nové rodiny se vyrábějí skriptem typu `buildTexasSolver*ExpansionBatch.mts`, kde
je scénář (rodina, pot, stack, desky) a **ranže napsané ručně**. Aby to šlo
škálovat na 27 chybějících dvojic, musí ranže vzniknout odvozením z našich
produkčních preflop packů: RFI pro otvírače, `VS_OPEN` pro obranu.

Ústupek, který je nutné přiznat: `VS_OPEN` nerozlišuje, kdo otevřel, takže
odvozená obranná range bude pro všechny otvírače stejná. Je to vada, kterou
nese preflop, a rozšíření ji zdědí. Lepší než ji zdědit mlčky je vědět o ní.

### 6. Evidence procesů — **částečně**

Dnes: noční úloha v plánovači (21:00-08:00, 8 workerů × 2 vlákna = 16 vláken na
16 jádrech), `mtt:after-night` jako denní dávka, sada jako ruční krok.

Co chybí: jedno místo, kde je vidět, co běží, co na co čeká a co smí paralelně.
Prakticky jsou dnes tři třídy:

- **výhradní** - noční solving (drží celý stroj), plná sada, balení
- **paralelizovatelné** - generování packů po rodinách, měření, čtení
- **zakázané souběhy** - editace zdrojů během běhu sady nebo generátorů, a
  souběh sady s čímkoli náročným (změřeno: 250 s → 764 s a deset falešných pádů)

### 7. Zpětná vazba — **stojí v principu, chybí historie**

`Agents/daily/` je od dneška. Až bude mít víc než jeden záznam, půjde porovnávat:
přineslo doporučení z minulé noci to, co slibovalo? Do té doby je to jeden bod,
ne trend, a tvářit se jinak by bylo klamání sebe sama.

## Co orchestrátor vědomě nedělá

**Nespouští solver a nemění plánovač.** Vydá doporučení; zapnout je je krok, u
kterého má být člověk, protože se tím utrácí strojový čas na celou noc.

**Necommituje.** Co se změnilo a jestli je to v pořádku, je úsudek.

**Nepočítá, co neměří.** Doporučení bez podkladu se nevydá.

## Pořadí prací

1. **Odvození ranží z preflop packů** - odemyká rozšíření vzorů, tedy jedinou
   cestu, jak zvednout těch 12 %.
2. **Generátor rodin pro chybějící dvojice** ze scénářů, ne ručně psaných ranží.
3. **Noční runner podle doporučení** - dnes má prioritu zadrátovanou.
4. **Evidence procesů** na jedno místo.
5. **Porovnání dnů**, až bude historie z čeho.
