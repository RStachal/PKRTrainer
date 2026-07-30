# Reference BTN RFI range, 9-max MTT, chipEV, 30-50BB

Owner-supplied on 2026-07-30, sourced from GTO Wizard and simplified to a pure
range for teaching. Recorded here as reviewable data rather than embedded in a
script, because it is a poker judgement and should be arguable on its own terms.

## The range

```
22+
A2s+ K2s+ Q2s+ J4s+ T5s+ 95s+ 85s+ 74s+ 64s+ 53s+ 43s
A2o+ K6o+ Q8o+ J8o+ T8o+ 98o
```

102 hand classes, 666 combinations, **50.2 percent** of all starting hands.

## Why this matters here

The button acts last after the flop in every single-raised pot it opens, so its
range is meant to be materially wider than any earlier seat's. Two things in this
repository disagree with that, measured 2026-07-30:

| Source | BTN RFI width |
| --- | --- |
| This reference | 50.2% |
| Shipped preflop pack (`mtt-full-ring-9-regular-preflop-chip-ev-ante-off-v1`) | 39.7% |
| Postflop solve inputs, c-bet families | 13.2% |
| Postflop solve inputs, facing-bet families | 19.0% |

The shipped pack is a strict subset of this reference - it contains no hand this
reference lacks - and is short exactly the marginal tail the owner flagged as
optional: K6o-K8o, Q8o, J8o, T8o, 98o, Q2s-Q4s, J4s-J6s, T5s, T6s, 95s, 85s,
74s, 64s, 53s, 43s. Twenty-one classes, 140 combinations.

The postflop solve inputs are a different matter entirely. At 13.2 percent the
button is folding roughly three quarters of what it should open, and the trainer deals
the hero only from the solved range, so that narrow range is exactly what a
paying player practises.

For contrast, the seats that were built correctly: UTG's solve input is 14.8
percent against the pack's 14.9, and the cutoff's is 24.9 against 27.0. So this
is one seat's data being wrong, not a different convention applied throughout.

## Owner notes carried with the range

- **30-50BB:** roughly this range. Against weak passive blinds it can widen to
  55-60 percent by adding 42s, 52s, 63s, 73s, 84s, 94s.
- **25-40BB:** similar base, but weak suited connectors lose value and high-card
  hands gain. Trim the worst offsuit combinations against frequent 3-bettors.
- **15-20BB:** a single open range stops being the right model - the strategy
  mixes minraise, raise-fold, raise-call and open shove.
- **~10BB:** much narrower and mostly shoving; a published 8-handed ante model has
  the button shoving 33.7 percent and minraising 5.2, about 39 percent in total.
- **ICM and PKO:** tighten under ICM pressure when covered; widen substantially in
  PKO when covering both blinds, where 76 percent has been published.

The stack-depth notes matter for a second reason. The shipped pack uses the same
BTN range at 20BB and at 50BB, which by the notes above cannot both be right.

## Status

Not yet applied. Applying it means two separate changes, and the second is gated
on solver memory:

1. Widening the preflop pack's BTN RFI, which is owner-verified production
   content and goes through the range intake and promotion path.
2. Re-solving the six BTN postflop families against the corrected range.

`npm run mtt:postflop-range-consistency` reports the current gaps.
