# GTO+ batch run checklist

Tento postup je navržený tak, aby se dal provést bez reverzního inženýrství `.gto` formátu.

## Příprava jednou

1. Otevři GTO+.
2. Pokud chceš zkusit predef import rangí, zkopíruj obsah složky `pio/` do GTO+ složky určené pro Pio-like/predefined ranges import.
3. Pro každý spot z `spots/*.spot.json` založ nový GTO+ strom.
4. Ranges vlož z odpovídajících souborů v `ranges/`.
5. Board nastav podle `board` ve spot JSONu nebo podle příslušného souboru v `boards/`.
6. Bet sizingy nastav podle `tree` ve spot JSONu.
7. Ulož každý spot jako samostatný `.gto` soubor do jedné pracovní složky, například:

```text
GTO_PLUS_WORK/mtt-sample-postflop-v1/
  01_MTT9_50BB_BTN_BB_SRP_A72r_CBET.gto
  02_MTT9_50BB_BTN_BB_SRP_JT9tt_CBET.gto
  03_MTT9_40BB_UTG_BB_SRP_Q72r_CBET.gto
  04_MTT9_35BB_CO_BTN_3BP_K83r_CBET.gto
```

## Noční výpočet

1. V GTO+ použij batch workflow pro zpracování všech `.gto` souborů ve složce.
2. Cílová přesnost pro test stačí mírnější:
   - initial test: exploitability/accuracy podle GTO+ kolem `0.5% pot` až `1.0% pot`,
   - finální produkční přepočet později zpřísnit.
3. Po doběhu otevři každý `.gto` a ověř:
   - strom je solved,
   - žádný hráč nemá prázdnou range,
   - první decision node má nenulové mixy,
   - report/export jde uložit.

## Doporučené pojmenování exportů

```text
output/
  MTT9_50BB_BTN_BB_SRP_A72r_CBET.strategy.csv
  MTT9_50BB_BTN_BB_SRP_A72r_CBET.tree.txt
  MTT9_50BB_BTN_BB_SRP_A72r_CBET.notes.md
```

Pokud GTO+ nabídne více exportních variant, nejdůležitější je export strategie na prvním rozhodovacím uzlu hráče `heroDecisionPlayer` uvedeného ve spot JSONu.
