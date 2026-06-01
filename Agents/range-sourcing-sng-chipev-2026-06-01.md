# SNG chipEV preflop sourcing audit - 2026-06-01

## Scope

- Vertikala: SNG preflop.
- Prvni faze: chipEV bez ICM.
- Cil: pripravit SNG profil a RangePack schema pro budouci import, ale nezapojovat prazdne candidate packy do produkcniho scoringu.
- Licencni hranice: verejne zdroje slouzi jako evidence metodiky a pokryti; raw chart hodnoty nejsou kopirovany.

## Vyhledavani

1. `SNG chipEV preflop charts sit and go poker ranges stack depths source`
2. `GTO Wizard Spin and Go SNG chipEV preflop solutions stack depths`
3. `HoldemResources SNG chipEV preflop ranges sit and go Nash push fold`
4. `ICMIZER SNG chipEV mode preflop ranges sit and go`

## Porovnane zdroje

- GTO Wizard status page: potvrzuje Spin & Go 1-25bb a HU SnG 1-72bb all-spots reseni vcetne varying stacks.
- GTO Wizard Spin & Go / HU SnG article: potvrzuje preflop-to-river Spin & Go a HU SnG reseni a non-uniform stack situace.
- GTO Wizard custom preflop solutions help: potvrzuje obecny preflop solver setup s player count, stacks, blinds a antes.
- GTO Charts Spin and Go: verejne uvadi Spin and Go preflop chart coverage pro kratke stacky; pouzito jen jako srovnavaci evidence.
- PokerMasterminds push/fold PDF: verejne uvadi HRC +chipEV shove charts; pouzitelne jen jako short-stack metodicka evidence.

## Rozhodnuti

- Pridany jsou SNG chipEV candidate RangePacky pro 9-max/6-max, regular/turbo a ante ON/OFF.
- Candidate packy maji `confidence = LOW` a prazdne `records`.
- ICM neni soucasti tohoto kroku; zustava pro task 26.2/26.3.
- SNG chipEV candidate packy umoznuji profilovou kompatibilitu a budouci import bez zmeny RangePack API.
