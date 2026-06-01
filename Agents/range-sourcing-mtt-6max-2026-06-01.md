# MTT 6-max chipEV preflop sourcing audit - 2026-06-01

## Scope

- Vertikala: MTT preflop, 6-max.
- Model: chipEV bez ICM.
- Cil dalsi iterace: pripravit 6-max RangePacky pro regular/turbo profily bez zasahu do dnesnich 9-max dat.
- Licencni hranice: placene solverove chart hodnoty nejsou kopirovany. Candidate RangePacky nesou metadata a prazdne records, dokud nebude k dispozici legalne pouzitelny import.

## Vyhledavani

1. `MTT 6-max preflop charts chipEV tournament ranges 6max source`
2. `GTO Wizard MTT 6max ChipEV preflop charts ante stack depth`
3. `Poker Academy MTT 6 max preflop charts ChipEV BB ante`
4. `GTOBase MTT 6-max preflop chipEV tournament ranges`

## Porovnane zdroje

- GTO Wizard update k MTT solutions: potvrzuje full ChipEV 6-max MTT reseni pro ruzne stack depth.
- GTO Wizard mixed-stack expansion: potvrzuje ChipEV 6max MTT mixed-stack preflop reseni jako samostatny format vedle 9max.
- GTO Wizard status page: potvrzuje ChipEV 6max mixed-stack preflop knihovnu a stack-depth dimenzi.
- Poker Academy: potvrzuje siroke MTT pokryti a stack depths 3-100bb, ale detail 6-max MTT neni verejne dostupny bez pristupu.
- BBZ Poker: potvrzuje chipEV MTT metodiku a stack depth coverage; verejna nabidka uvadi hlavne 8-max a HU, tedy jen srovnavaci zdroj, ne primarni 6-max data.

## Rozhodnuti

- Pridany jsou ctyri candidate RangePacky:
  - regular ante ON
  - regular ante OFF
  - turbo ante ON
  - turbo ante OFF
- Candidate RangePacky maji `confidence = LOW` a prazdne `records`.
- Produkcni drill zustava na MTT 9-max RangePackach; 6-max candidate packy slouzi pro sourcing, UI/profile kompatibilitu a budouci importni workflow.
- Regular/turbo se zatim lisi profilem a blind schedule; samostatne hand recommendations se doplni az po legalnim zdroji a normalizaci 169 hand trid.
