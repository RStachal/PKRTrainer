# MTT 6-max chipEV preflop sourcing audit - 2026-06-02

## Scope

- Vertikala: MTT preflop, 6-max.
- Model: chipEV bez ICM.
- Rychlosti: regular a turbo jsou zatim metadata/blind-schedule dimenze. Pri stejnem effective stacku v BB, ante modu a chipEV node se nemaji automaticky vytvaret odlisne hand recommendations bez samostatneho zdroje.
- Cile navazujicich kroku: zachovat candidate/preview stav, pripravit legalni import workflow a nepouzit zadne placene solverove chart hodnoty bez licence.
- Licencni hranice: tento audit uklada pouze verejne dostupna metodicka tvrzeni a odkazy. Nekopiruje raw 13x13 matice, frekvence, combo vahy ani placene exporty.

## Vyhledavani provedena 2026-06-02

1. `GTO Wizard ChipEV 6max MTT preflop solutions stack depths`
2. `Poker Academy preflop charts MTT stack depths ChipEV 6 max`
3. `BBZ Poker ChipEV MTT charts stack depths 6 max`
4. `GTOBase 6-max MTT preflop ChipEV ranges`

## Porovnane zdroje

### GTO Wizard - primarni metodicky zdroj

- URL: https://blog.gtowizard.com/live-cash-solutions-and-4000-new-scenarios-for-cash-mtt-formats%2A%2A/
- URL: https://blog.gtowizard.com/thousands-of-new-solutions-and-interface-updates/
- Verejne potvrzuje full ChipEV 6-max MTT reseni a samostatne ChipEV 6max MTT mixed-stack preflop reseni.
- Dulezite pro PKRTrainer: potvrzuje, ze 6-max MTT chipEV ma byt samostatna vertikala od 9-max a ze stack depth/mixed-stack dimenze patri do sourcing assumptions.
- Omezeni: verejny blog nedava legalne pouzitelne hand-class matice pro import.

### Poker Academy - srovnavaci katalog

- URL: https://poker.academy/bln/preflop-charts
- Verejne uvadi MTT, SNG, Cash a PKO chart katalog, stack depths 3-100 BB, symmetric/asymmetric simulace a MTT pokryti 8-max/9-max; 6-max explicitne popisuje hlavne pro cash game.
- Dulezite pro PKRTrainer: je pouzitelny jako sanity check pro stack-depth a format taxonomy, ale ne jako primarni 6-max MTT chipEV zdroj.
- Omezeni: 6-max MTT chipEV hodnoty nejsou verejne prokazane bez placeneho pristupu.

### BBZ Poker - srovnavaci MTT chipEV zdroj

- URL: https://bbzpoker.com/product/mtt-charts/
- Verejne popisuje chipEV MTT pouziti pred ICM tlakem, 8-max stack-depth coverage 3-100 BB a heads-up coverage.
- Dulezite pro PKRTrainer: podporuje rozhodnuti, ze MTT chipEV a ICM musi zustat oddelene modely.
- Omezeni: verejna nabidka je 8-max/HU, ne 6-max MTT.

### GTOBase - negativni kontrola proti zamenam

- URL: https://gtobase.com/en/
- Verejne popisuje 6-max cash knihovnu, chipEV/rake metodiku a Simple Preflop Holdem solverovou metodiku.
- Dulezite pro PKRTrainer: potvrzuje, ze "6-max" vysledky z webu casto znamenaji cash game, ne MTT; pro 6-max MTT import tedy nesmi byt pouzity cash charts.
- Omezeni: neni primarni MTT 6-max chipEV zdroj.

## Zaver auditu

- Nejvice verohodny verejny dukaz pro MTT 6-max chipEV je GTO Wizard, protoze explicitne rozlisuje 6max MTT chipEV od 9max a od ICM.
- Poker Academy, BBZ Poker a GTOBase jsou srovnavaci/hranici zdroje: pomahaji definovat stack-depth, symmetric/asymmetric, chipEV vs ICM a cash-vs-MTT omezeni, ale nedavaji legalni 6-max MTT range hodnoty.
- Candidate RangePacky pro 6-max mohou existovat pouze s `confidence = LOW`, prazdnymi `records` a jasnym candidate/preview statusem.
- Regular/turbo se zatim smi lisit pouze profilem a blind schedule assumptions; samostatne hand-class hodnoty pro turbo budou vyzadovat legalni turbo-specific import.
- Dalsi bezpecny krok: pripravit import report pro 6-max candidate packy, ktery overi 169 hand-class coverage, pozice UTG/HJ/CO/BTN/SB/BB, ante ON/OFF a stack-bucket mapping pred jakymkoli produkcnim scoringem.
