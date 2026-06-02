# MTT flop c-bet sourcing audit - 2026-06-02

## Scope

- Vertikala: MTT postflop, flop, heads-up single-raised pot.
- Model: chipEV first; ICM pouze jako upozorneni pro budouci dimenzi.
- Aktualni pouziti v aplikaci: heuristicky StrategyPack pro board texture, SPR a sizing; zadne placene ani licencne nejasne hand-frequency tabulky nejsou kopirovany do dat.
- Stav: verejne zdroje podporuji obecne principy, ne produkcni solver chart pro vsechny kombinace pozice/boardu/stacku.

## Vyhledavani

1. `GTO Wizard flop heuristics IP c-betting MTT public range advantage board texture`
2. `GTO Wizard mechanics of c-bet sizing range advantage nut advantage wet dry flop`
3. `GTO Wizard c-betting against ICM preflop ranges MTT small bet flop`
4. `Upswing Poker continuation bet strategy flop texture range advantage`

## Porovnane zdroje

- GTO Wizard - Flop Heuristics: IP C-Betting in MTTs
  - URL: https://blog.gtowizard.com/flop-heuristics-ip-c-betting-in-mtts/
  - Relevance: MTT, flop, IP preflop raiser, single-raised pots, board texture aggregation.
  - Verejny zaver: preflop range dynamics jsou primarni driver c-bet strategie; paired, disconnected a rainbow boardy jsou obecne dobre pro c-bet, connected/monotone boardy vyzaduji opatrnost.

- GTO Wizard - The Mechanics of C-Bet Sizing
  - URL: https://blog.gtowizard.com/the-mechanics-of-c-bet-sizing/
  - Relevance: obecna solverova mechanika sizingu na flopu.
  - Verejny zaver: range advantage tlaci hlavne frekvenci betu; nut advantage a fold equity vic ovlivnuji sizing. Wet/super-wet boardy casteji vyzaduji polarizovanejsi strategii.

- GTO Wizard - C-Betting Against ICM Preflop Ranges
  - URL: https://blog.gtowizard.com/c-betting-against-icm-preflop-ranges/
  - Relevance: MTT, EP vs BB, 25bb, cEV vs ICM assumptions.
  - Verejny zaver: v chipEV/MTT spotu ma EP raiser proti BB callerovi silnou range advantage a casto preferuje maly flop bet; ICM meni preflop ranges a bude samostatna dimenze.

- Upswing Poker - When to Continuation Bet in Poker
  - URL: https://upswingpoker.com/continuation-bet-c-bet-strategy-position/
  - Relevance: verejne edukacni vysvetleni c-betu IP/OOP, range advantage a texture.
  - Verejny zaver: IP preflop raiser ma casto range advantage; OOP c-bet a texturove dynamicke boardy vyzaduji opatrnejsi pristup.

## Rozhodnuti

- `flopSingleRaisedPrototypeStrategyPack` zustava heuristicky pack s LOW confidence, ale dostava source evidence metadata.
- Pravidla lze rozsirit pouze o obecne texturove heuristiky:
  - dry/rainbow/disconnected nebo paired boardy: small c-bet je obhajitelny zaklad pri range advantage.
  - connected/two-tone a monotone boardy: check je konzervativni zaklad, dokud nemame pozicne presny solver pack.
  - low SPR: small bet muze byt prakticky vhodny, protoze stacky se daji dostat dovnitr na pozdejsich streetach.
- Nezavadime presne frekvence, mixed strategie ani 169 hand-class mapy pro postflop, protoze verejne zdroje neposkytuji licencne pouzitelny kompletni chart.

## Dalsi bezpecny krok

- Pridat do StrategyPacku `sourceEvidence`.
- Rozsirit pravidla na uroven board textur a SPR s jasnym `confidence: LOW`.
- Az pote pripravit import workflow pro skutecny solver pack s explicitnim povolenim/licenci.
