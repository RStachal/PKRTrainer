# Postflop turn/river public heuristic sourcing - 2026-06-03

## Scope

- Variant: MTT full-ring 9-max, chipEV.
- Pot type: single-raised pot.
- Streets: TURN and RIVER.
- Output: LOW-confidence public heuristic StrategyPacks only.
- Excluded: paid solver charts, exact frequencies, hand-combo tables, multiway pots and 3bet-pot production strategy.

## Public Sources Checked

1. GTO Wizard - Turn Barreling in 3-Bet Pots
   - URL: https://blog.gtowizard.com/turn-barreling-in-3-bet-pots/
   - Use: broad turn barreling concepts, SPR/geometric pressure, dynamic-board caution.
   - License note: methodology citation only; no solver output copied.

2. Upswing Poker - When to Bet the Turn / Double Barreling
   - URL: https://upswingpoker.com/podcast/ep8-double-barreling/
   - Use: turn barrel texture simplification and small/big sizing framing.
   - License note: public educational summary only.

3. Upswing Poker - Bet Sizing Strategy
   - URL: https://upswingpoker.com/bet-size-strategy-tips-rules/
   - Use: generic bet-sizing principles and low-SPR sizing intuition.
   - License note: public educational article only.

4. Upswing Poker - River Poker Strategy
   - URL: https://upswingpoker.com/river-poker-strategy-tips/
   - Use: river polarized pressure, blocker caveats and value/bluff framing.
   - License note: public educational article only.

5. GTO Wizard - Blockers & Unblockers
   - URL: https://blog.gtowizard.com/blockers-unblockers-the-secret-to-picking-great-bluffs/
   - Use: river blocker/unblocker discipline; used as a warning that exact bluff selection needs a future solver/import layer.
   - License note: methodology citation only; no chart output copied.

## Decision

- Add two LOW-confidence StrategyPacks:
  - `mtt-full-ring-9-turn-single-raised-chip-ev-public-heuristic-v1`
  - `mtt-full-ring-9-river-single-raised-chip-ev-public-heuristic-v1`
- Rules are texture-level and position-pattern-level only.
- The resolver may use these packs for TURN/RIVER, but UI source evidence must show LOW confidence and assumptions.
- Production solver frequencies remain blocked until a legal import report validates source rights, dimensions and hand/action coverage.
