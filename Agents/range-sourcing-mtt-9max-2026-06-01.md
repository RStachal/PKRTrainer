# MTT 9-max chipEV preflop sourcing audit - 2026-06-01

## Scope

- Vertikala: MTT preflop, full ring 9-max.
- Model: chipEV bez ICM.
- Aktualni pouziti v aplikaci: RangePack metadata a srovnavaci evidence; zadne placene ani licencne nejasne chart hodnoty nejsou kopirovany do dat.
- Regular/turbo zaver: turbo je zatim blind-schedule/stack-distribution dimenze. Pro stejny stack v BB, ante a chipEV node nebyl nalezen verejny dukaz, ze ma mit samostatne hand recommendations.

## Vyhledavani

1. `MTT 9 max preflop charts chipEV regular speed turbo poker tournament ranges source`
2. `GTO Wizard MTT 9 max preflop charts chipEV ante tournament ranges`
3. `PokerCoaching MTT preflop charts 9 max tournament ante chipEV`
4. `ICMIZER MTT preflop charts chipEV 9 max tournament turbo regular`

## Porovnane zdroje

- GTO Wizard: verejne uvadi ChipEV 9max mixed-stack preflop reseni a stack/ante dimenze.
- Poker Academy: verejne popisuje MTT 8-max/9-max, ChipEV, BB ante, 23 stack sizes a vice preflop scenaru.
- GTO Sims: verejne popisuje 9-max MTT 30bb ChipEV ante 12% strom s open/3bet/all-in a limp/isolate nodes.
- GTOBase: verejne popisuje MTT 9-max knihovnu pro 15-30bb a solverovou metodiku Simple Preflop Holdem.
- PokerCoaching: verejne push/fold charty pro 9-handed full-ring, 1-15bb a ruzne ante formaty jsou pouzitelne jen jako short-stack sanity check.

## Rozhodnuti

- `mtt-full-ring-9-regular-preflop-chip-ev-ante-on-v1` a `ante-off-v1` zustavaji beze zmeny doporuceni.
- Metadata source evidence se rozsirila, aby odpovidala aktualnimu sourcing pravidlu z tasku 22.2/25.2.
- Turbo RangePack se zatim nevytvari: bez turbo-specifickeho a licencne pouzitelneho zdroje by to bylo jen duplikovani regular ranges pod jinym nazvem.
- Dalsi bezpecny krok pro nove ranges je nejdriv importni report z verejne/legalne pouzitelnych dat, potom teprve normalizace na 169 hand trid.
