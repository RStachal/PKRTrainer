# MTT Action EV And Language Contract

Updated: 2026-07-22
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
action, the best EV and the EV loss in BB. Each legal action button contains
the absolute BB value plus a relative meter scaled only against the other legal
actions at that decision. Every action inside the equivalent-best threshold uses
the same full meter so the graphic never invents an ordering between equally
valid choices. Before the answer the EV row remains visually hidden, and an
incomplete set reveals no button value or meter.

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

Generate the exact blank FLOP-pilot workbench with:

```powershell
npm run mtt:postflop-action-ev-intake -- --all --write-template --refresh-blank-templates --summary
```

The seven templates are fingerprinted against the current 972 range buckets and
2,916 offered-action slots. Validation requires every EV, both thresholds,
reviewer/date and explicit approval. A completed input can write only an
unpromoted candidate plus audit sidecar, and only with
`--confirm=WRITE_MTT_POSTFLOP_ACTION_EV_CANDIDATE`.
The refresh flag replaces only a stale, provably blank template. Any reviewer
text, threshold or EV protects the existing file and makes the refresh fail
closed; intentional replacement still requires the separate overwrite token.

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
  action strategy frequencies, not validated counterfactual action EV. A raw
  owner-depth export was checked for `ev`, `value`, `payoff`, `utility` and
  `equity` properties and exposed none; the
  [official TexasSolver console documentation](https://github.com/bupticybee/TexasSolver/tree/console#usage)
  also describes `dump_result` as an optimal-strategy JSON export;
- exact blank action-EV templates exist for 7/7 scoped FLOP pilots, but contain
  `0/972` completed decisions until owned reviewed values are supplied;
- template generation preserves an existing workbench by default. Replacing one
  requires `--overwrite-template` plus the explicit
  `OVERWRITE_MTT_POSTFLOP_ACTION_EV_TEMPLATE` confirmation token;
- preservation checks the complete immutable pilot, rule, bucket and ordered
  action structure. A malformed or stale workbench is never silently replaced;
  it is retained and reported invalid until an explicitly confirmed overwrite;
- candidate and audit outputs always use distinct paths and neither is allowed
  to overwrite the reviewed intake input;
- the audit sidecar hashes the exact candidate document bytes written to disk,
  not a differently formatted in-memory representation;
- a schema-valid synthetic production fixture has verified the complete browser
  path: all offered EV rows, two equivalent-best actions, selected-action state,
  BB units, local persistence and JSON export/import. This is pipeline evidence,
  not production poker data;
- preflop and postflop action buttons share one inline EV component; equivalent
  best and chosen states are separate, so more than one action may remain green
  while the selected action is still identifiable;
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
