# SNG ICM preflop sourcing audit - 2026-06-01

## Scope

- Vertikala: SNG preflop.
- Model: ICM.
- Spot typy: push/fold, call all-in, rejam.
- Cil: ulozit ICM assumptions do RangePack metadata a pripravit validaci proti simulatorum; raw chart hodnoty zatim nejsou kopirovany.

## Vyhledavani

1. `ICMIZER SNG ICM push fold ranges sit and go payout structure bubble factor`
2. `HoldemResources Calculator SNG ICM Nash ranges push fold call all-in`
3. `HRC HoldemResources SNG ICM model payout structure stack distribution ranges`
4. `SNG ICM preflop ranges push fold call all-in rejam simulator`

## Porovnane zdroje

- ICMIZER bubble factor help: vysvetluje bubble factor, risk premium a payout-aware all-in rozhodnuti.
- ICMIZER overcalling example: ukazuje 9max SnG payout strukturu a ICM-sensitive call/overcall rozhodovani.
- ICMIZER custom tournaments help: potvrzuje custom payout, stacks a player-count setup.
- HoldemResources Nash ICM Calculator: potvrzuje kalkulaci pres player stacks a payout structure.
- VIP Grinders SNG strategy primer: doplnkova edukacni kontrola k ICM tlaku a payoutum.

## Rozhodnuti

- Pridany jsou SNG ICM candidate RangePacky pro 9-max/6-max, regular/turbo a ante ON/OFF.
- Candidate packy maji `confidence = LOW`, prazdne `records`, `icmContext` a `icmSpotTypes`.
- ICM context uklada payout preset, remaining players, stack distribution, bubble factor a representative spot type.
- Budouci import musi oddelit push/fold, call all-in a rejam ranges a validovat je proti ICMIZER/HoldemResources-style vystupum.
