# Next optimal tasks - 2026-06-02

## Stav reseni

- Stabilni zaklad: MTT 9-max preflop chipEV, RangePack v2 metadata, profile selector, stats v2 migrace, sourcing evidence a offline build.
- Postflop ma typed TrainingSpot, public-heuristic flop StrategyPack, resolver, source evidence a prakticke vysvetleni.
- Nejvetsi mezera: postflop zatim neni plnohodnotna treninkova relace se statistikami, profile routingem a import/report disciplinou na urovni preflop RangePacku.

## Prioritni poradi

1. Napojit FLOP profil na skutecnou session a statistiky.
2. Vytvorit import/validation report pro Postflop StrategyPack.
3. Rozsirit flop model o pozicni kontext IP/OOP a caller typ.
4. Zpresnit board texture taxonomii pro flop pravidla.
5. Vylepsit UI evidence pro postflop rozhodnuti.
6. Pripravit dalsi obsahovou vertikalu: MTT 6-max preflop chipEV.
7. Zpevnit SNG chipEV -> ICM prechod bez míchani modelu.

## Dulezite zasady

- Nezavest produkcni postflop hand-frequency data bez jasne licence nebo vlastniho solver/import reportu.
- Zachovat existujici MTT preflop chovani, seed behavior, localStorage klice a Range_Store adapter.
- Kazdy novy pack musi mit source evidence, assumptions, confidence a testy.
