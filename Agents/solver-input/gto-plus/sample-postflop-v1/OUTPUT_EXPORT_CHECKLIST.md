# Output/export checklist for PKRTrainer conversion

Po doběhnutí GTO+ potřebujeme z každého spotu získat minimálně:

- ID spotu podle `manifest.json`.
- Board.
- Efektivní stack.
- Pot na flopu.
- Pozice hráčů.
- Range OOP a IP použitá při výpočtu.
- Akce dostupné na prvním rozhodovacím uzlu.
- Frekvence akcí pro každou hand class nebo combo, ideálně v exportovatelné tabulce.
- EV jednotlivých akcí, pokud export dostupný je.
- Solver accuracy / exploitability.

Minimální akceptace testovacího výsledku:

- Spot jde otevřít a přepočítat v GTO+.
- Export obsahuje alespoň check/bet nebo bet/raise/fold frekvence pro první hero decision.
- Celková strategie se dá mapovat na PKRTrainer akce:
  - `CHECK`
  - `BET_SMALL`
  - `BET_HALF`
  - `BET_BIG`
  - `CALL`
  - `RAISE`
  - `FOLD`
- Výstup neobsahuje zjevné dead ranges nebo nulový pot.

Poznámka: pro první integraci do aplikace je lepší mít méně spotů s kvalitním exportem než hodně “skoro exportovaných” spotů. Tady se nechci tvářit statečně v bažině — chceme čistý datový řetězec.
