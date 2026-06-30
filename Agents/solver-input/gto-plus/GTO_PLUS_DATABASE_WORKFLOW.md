# GTO+ database workflow for PKRTrainer MTT validation

## Krátký závěr

GTO+ neumí přímo importovat naši `manifest.json` databázi spotů jako nové řešitelné projekty. Očekává hotový `.gto` / podle verze také `.gto2` projekt.

Použitelná cesta pro více spotů je:

1. rozdělit spoty do rodin, kde mají stejný typ stromu, stack, ranges a sizing,
2. v GTO+ ručně vytvořit jeden template tree pro každou rodinu,
3. z template tree v GTO+ postavit databázi přes seznam flopů,
4. spustit `Run solver -> DATABASE -> PROCESS DATABASE`,
5. pokud je problém s RAM, použít `Export database -> process files in folder -> Merge files`.

Tedy: GTO+ databáze je dobrá pro “jeden spot family přes mnoho flopů”, ne pro “importuji libovolný seznam různých spotů z JSONu”.

## Proč nejde všechno do jedné databáze

Do jedné databáze patří spoty, které sdílí:

- pozice hráčů,
- preflop line,
- efektivní stack,
- pot,
- IP/OOP ranges,
- strom a sizingy,
- model/rake/MTT nastavení.

Pokud se změní například BTN vs BB SRP na UTG vs BB SRP, nebo SRP na 3bet pot, je to samostatná databázová rodina.

## Doporučený testovací rozpad současného source packu

| Family ID | Spoty | Důvod |
| --- | --- | --- |
| `MTT9_50BB_BTN_BB_SRP` | `A72r`, `JT9tt` | Stejný BTN open vs BB defend, 50bb, SRP; liší se pouze flop. |
| `MTT9_40BB_UTG_BB_SRP` | `Q72r` | Jiná pozice/ranges/stack než BTN vs BB. |
| `MTT9_35BB_CO_BTN_3BP` | `K83r` | Jiný pot a 3bet line. |

## Praktický postup v GTO+

### Varianta A: database uvnitř GTO+

1. Otevři GTO+.
2. Vytvoř template tree pro jednu family.
3. Nastav:
   - OOP/IP ranges,
   - board pro první test,
   - pot/stack,
   - bet sizingy,
   - MTT/chipEV nastavení podle potřeby.
4. V `Run solver -> DATABASE` vytvoř databázi z flop listu / subsetu.
5. Použij `PROCESS DATABASE`.
6. Ulož výsledný `.gto`/`.gto2` database file.
7. Exportuj strategie nebo aggregate reporty podle `OUTPUT_EXPORT_CHECKLIST.md`.

### Varianta B: málo RAM / noční batch

Oficiální GTO+ workflow pro omezenou RAM je:

1. `Run solver -> DATABASE -> Export database` do složky.
2. Přes ikonu složky vybrat tuto složku a spustit `PROCESS FILES`.
3. Po doběhu použít `Merge files` a složit jednotlivé trees zpět do databáze.

Tahle varianta je nejbližší tomu, co chceme: GTO+ pořád potřebuje databázi/tree projekty vytvořené uvnitř GTO+, ale samotné řešení může jet přes noc přes soubory ve složce.

## Co můžeme automatizovat my

Můžeme bezpečně generovat:

- seznam families,
- flop listy,
- range texty,
- sizing checklist,
- expected output checklist,
- následný import/export normalizátor do PKRTrainer.

Nemůžeme bezpečně generovat bez podpory GTO+:

- nové binární `.gto` projekty z `manifest.json`,
- přepis boardů/rangí přímo uvnitř `.gto`,
- jednu univerzální GTO+ databázi pro spoty s různými rangemi/stromy.

## Ověření po výpočtu

Po doběhu pro každou family potřebujeme:

- uložený solved `.gto`/`.gto2`,
- export strategie pro první hero decision,
- informaci o solver accuracy,
- původní ranges a flop list,
- poznámku, jestli šlo o in-memory database, nebo export/process/merge workflow.
