# Cash 6-max preflop sourcing audit - 2026-06-03

## Scope

- Target: future cash-game 6-max preflop RangePack import.
- App behavior: candidate metadata only; no production scoring and no chart values in bundled data.
- Guardrail: cash packs must match `gameVariant`, `tableFormat`, `blindSpeed`, `street`, `evModel`, `ante` and `rakeMode` exactly before selection.
- UI rule: source URLs and provider citations are not rendered in the app.

## Independent searches

1. `cash game 6-max preflop charts rake no rake poker source GTO Wizard`
2. `6 max cash preflop ranges rake no rake poker charts source`
3. `cash preflop no rake cEV solutions 6max GTO Wizard`
4. `Upswing Poker 6-max cash game preflop ranges`

## Evidence checked

| Provider | URL | Relevant assumption | Use in app data |
| --- | --- | --- | --- |
| GTO Wizard | https://lp.gtowizard.com/ | Public overview confirms high-accuracy 6max cash coverage and separate rake-format solution families. | Metadata only; no chart values copied. |
| GTO Wizard | https://blog.gtowizard.com/multitabling-new-solutions/ | 6max cash GG/NL rake structures and high-accuracy solution notes. | Metadata only; no chart values copied. |
| GTO Wizard | https://blog.gtowizard.com/live-cash-solutions-and-4000-new-scenarios-for-cash-mtt-formats/ | Distinguishes ChipEV no-rake and rake-based cash families in public release notes. | Metadata only; no chart values copied. |
| GTO Hero | https://gtohero.com/solutions | Independent solver library lists cash 6-max, 5% rake cap and stack depths. | Metadata only; no chart values copied. |
| Poker Academy | https://poker.academy/bln/preflop-charts | States 6-max cash chart coverage and separate calculations by rake structure. | Metadata only; no chart values copied. |
| BBZ Poker | https://bbzpoker.com/product/cash-charts/ | Explains cash charts differ from tournaments because of fixed stack depth and rake assumptions. | Metadata only; no chart values copied. |
| GTO Sims | https://gtosims.com/products/100bb-6-max-cash-norake-chipev | Public product page describes 100bb 6-max cash no-rake chipEV preflop solutions. | Metadata only; no paid chart values copied. |

## Decision

- Added two LOW-confidence candidate packs:
  - `cash-six-max-regular-preflop-chip-ev-rake-candidate-v0`
  - `cash-six-max-regular-preflop-chip-ev-no-rake-candidate-v0`
- Both use `records: []` intentionally. They are import targets and preview metadata only.
- Cash assumptions are not compatible with MTT/SNG:
  - Cash: fixed/deeper stacks, no payout pressure, rake can matter.
  - MTT/SNG: tournament stacks, no cash rake, possible antes and ICM/payout pressure.
- Therefore, any mismatch in `gameVariant`, `rakeMode`, `evModel` or `tableFormat` must block RangePack selection.
