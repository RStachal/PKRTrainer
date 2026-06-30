# GTO+ sample postflop source pack v1

Účel: rychle otestovat, jestli dokážeme připravit několik MTT postflop spotů, ručně je založit v GTO+, uložit jako `.gto`, spustit hromadný výpočet přes noc a získat export použitelné strategie/ranges pro PKRTrainer.

Pozor: tento adresář není přímý import do GTO+. GTO+ Open dialog načítá hotové `.gto` projektové soubory. Tady jsou pouze zdrojové podklady pro jejich ruční vytvoření v GTO+.

Obsah balíčku:

- `manifest.json` — strojově čitelný seznam spotů.
- `spots/*.spot.json` — detail jednotlivých spotů.
- `ranges/*.txt` — textové range stringy pro rychlé vložení/import.
- `pio/*.txt` — stejné range stringy ve složce připravené pro GTO+ / Pio-like predef import workflow.
- `boards/*.txt` — board subsety, jeden board na řádek.
- `GTO_PLUS_BATCH_RUN.md` — praktický postup v GTO+.
- `OUTPUT_EXPORT_CHECKLIST.md` — co po výpočtu vyexportovat a jak poznat, že je výsledek použitelný.

Vybrané testovací spoty:

1. `MTT9_50BB_BTN_BB_SRP_A72r_CBET`
2. `MTT9_50BB_BTN_BB_SRP_JT9tt_CBET`
3. `MTT9_40BB_UTG_BB_SRP_Q72r_CBET`
4. `MTT9_35BB_CO_BTN_3BP_K83r_CBET`

Tyto spoty úmyslně pokrývají suchý A-high board, dynamický broadway board, UTG vs BB nízkofrekvenční c-bet spot a jednoduchý IP 3bet pot. Je to malý, ale výživný vzorek — takový solverový espresso panák.
