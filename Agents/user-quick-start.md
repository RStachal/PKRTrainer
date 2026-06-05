# PKRTrainer user quick start

This guide is for players. It intentionally avoids source, provider and pack details.

## Training

1. Open the Training tab.
2. Pick the training profile: game type, table format, speed, street, model and rake mode.
3. Select positions, stack depths and action context.
4. Press Start training.
5. Answer with the best poker action shown for the spot.

The table appears only after a concrete question is generated. Use it to read positions, stacks, pot, hero hand and active players before answering.

## Preflop flow

Preflop questions focus on position, effective stack, ante state and action context.

Important contexts:

- RFI / Open
- vs limp
- vs open
- vs 3-bet
- vs 4-bet
- squeeze
- blind vs blind
- push / fold
- vs all-in

After each answer, review the result text and range matrix. The matrix is the main learning surface: compare your chosen action with the recommended lane and notice which hands belong to value, bluff, call/check or fold candidates.

## Postflop flow

Postflop questions start from the selected training situation and show a concrete table.

Use the table first:

- positions and IP/OOP state
- pot type and SPR
- hero hand
- board cards
- board texture tags

Then choose between the available actions, usually Check, Bet small or Bet big. After answering, review the Flopzilla-style range view. It groups candidate hands by poker function such as value, bluffs, draws, overcards and check range.

## Statistics

The Statistics tab is for improvement, not bookkeeping.

Focus on:

- accuracy trend
- weakest position
- weakest stack depth
- weakest action context
- postflop street and texture leaks
- decision time when enough hands are recorded

Use Train focus from a weak KPI to jump back into targeted practice.

## HH Import

Use HH Import to paste hand history text and review decisions from played hands. Imported hands should be used as review material, then trained again through the normal Training flow.

## Good practice loop

1. Train a small focused sample.
2. Review wrong answers immediately.
3. Check Statistics for the weakest KPI.
4. Train that exact focus.
5. Repeat with a new seed when accuracy stabilizes.
