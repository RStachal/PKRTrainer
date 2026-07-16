# MTT Action EV And Language Contract

Updated: 2026-07-16
Status: ACTIVE PRODUCT AND DATA CONTRACT

## Authority

This file defines how PKRTrainer represents alternative poker actions, solver
EV, equivalent optimal actions and the EN/CZ language modes. It applies to every
new MTT preflop and postflop import. It does not authorize invented EV, strategy,
review or provenance.

## 1. Decision Node Contract

1. The question may offer only actions legal at the exact decision node.
2. An EV-enabled node must contain solver EV in BB for every offered action.
3. A partial EV set is invalid. The runtime may still use reviewed strategy, but
   it must show EV comparison as unavailable.
4. Strategy frequency is not action EV. A 50%/50% mix does not prove equal EV.
5. The recommended action must be one of the highest-EV or equivalent-best
   actions. If reviewed strategy metadata disagrees with complete solver EV, the
   runtime recommendation follows the complete EV set and the mismatch remains
   reviewable in source data.

Preflop action families are derived from the existing legal action tree:

- unopened: fold, limp and the offered open size;
- versus limpers: fold, overlimp/check and the offered isolation size as legal;
- versus open: fold, call, 3-bet, plus squeeze only at a squeeze node;
- versus 3-bet: fold, call, 4-bet;
- versus 4-bet: fold, call, jam;
- versus all-in: fold, call jam;
- push/fold: fold, jam.

Postflop actions are the exact `rule.actions` for the matched node. Bet and raise
sizes remain distinct actions when the UI offers them as distinct controls.

## 2. Solver EV Payload

The canonical payload is `ActionEvSet` from `src/core/actionEv.ts`:

```json
{
  "source": "SOLVER",
  "unit": "BB",
  "values": [
    { "action": "FOLD", "evBb": 0 },
    { "action": "CALL", "evBb": 1.12 },
    { "action": "3BET", "evBb": 1.13 }
  ],
  "equivalentThresholdBb": 0.01,
  "acceptableThresholdBb": 0.05
}
```

The numbers above illustrate shape only and are not production poker data.
Every production value and threshold must come from the reviewed export and
review policy for that node. Thresholds must be finite, non-negative, and the
acceptable threshold cannot be smaller than the equivalent threshold.

## 3. Grading And Feedback

After an answer, the trainer displays every offered action EV, the selected
action, the best EV and the EV loss in BB.

- `BEST`: exact highest exported EV;
- `EQUIVALENT`: within `equivalentThresholdBb` of the highest EV;
- `ACCEPTABLE`: outside equivalence but within `acceptableThresholdBb`;
- `MISTAKE`: larger EV loss.

All equivalent-best actions are accepted as correct and shown together in the
explanation. Stats persist chosen EV, best EV, EV loss and equivalent-best
actions when a complete set exists. Legacy results without EV remain valid and
explicitly have no EV comparison.

Postflop stats bridge version 5 persists those five fields atomically. A v5
record with only part of the EV result is invalid; legacy v4 records containing
the former outcome/loss subset remain readable and retain their original
version during normalization.

## 4. Intake And Release Rules

Preflop `normalized.json` stores `actionEvs[handClass]` on each record. The CSV
intake uses `actionEvsBb`, `equivalentThresholdBb` and
`acceptableThresholdBb`. Postflop packs store `actionEvs` on each range bucket.

Validation is fail-closed for missing, duplicate, unsupported or non-finite
action values. Runtime code never derives EV from dominant action, mixed
frequency, hand strength or heuristics.

Run the source-safe release measurement with:

```powershell
npm run mtt:core-release -- --summary
```

`action EV comparison ready` is independent from legacy strategy readiness.
Before promoting a large EV payload, rerun bundle budget, lazy-load and browser
memory checks; use compact or sidecar encoding if the measured payload requires
it.

## 5. Language Contract

- `EN`: controls, poker terminology, explanations, errors and accessibility
  labels are English.
- `CZ`: controls and poker terminology stay English; explanatory copy, feedback,
  errors and educational summaries are Czech.
- Solver enums, action names, positions, streets, stack units and EV units are
  never translated in either mode.
- The selection persists under `pkrtrainer.ui.language.v1` and re-renders the
  active application.

## 6. Current Measured Truth

As of 2026-07-16:

- implementation and validation contract: complete;
- MTT Core preflop action EV: `0/493818` decisions, `0/4` packs ready;
- scoped FLOP pilot action EV: `0/972` decisions, `0/7` packs ready;
- current TexasSolver `dump_result` payload consumed by this repository exposes
  action strategy frequencies, not validated counterfactual action EV;
- a schema-valid synthetic production fixture has verified the complete browser
  path: all offered EV rows, two equivalent-best actions, selected-action state,
  BB units, local persistence and JSON export/import. This is pipeline evidence,
  not production poker data;
- therefore the UI truthfully reports EV comparison unavailable for current
  production content. No EV value has been fabricated.

## 7. Ordered Unlock Sequence

1. Obtain an owned solver export that includes counterfactual EV for every
   offered action at each target node.
2. Record the reviewer-approved equivalence and acceptable-loss policy.
3. Import one complete pilot node and require zero validation errors.
4. Verify recommendation reconciliation, all-action display, stats persistence,
   EN/CZ output, bundle size and browser memory.
5. Promote the remaining preflop packs and scoped FLOP pilots only after the
   pilot passes.
6. Keep frequency-only TexasSolver batches in the existing review-evidence lane;
   do not re-solve them merely to imply EV that their exporter does not contain.
