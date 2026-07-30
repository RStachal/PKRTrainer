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

**Applied to the preflop pack on 2026-07-30, at 25BB and above.**

The reference states ante in its premise and contains the whole of the pack's
previous ante-on addition, so 50.2 percent is the ante-ON figure. The split
between the two variants follows the ante rather than a round number: without
ante the button adds the suited tail, and with ante it also adds the weak offsuit
broadways, which are the part of a steal range that most depends on the dead
money being there.

| Depth | ante-off | ante-on |
| --- | --- | --- |
| 15-20BB | 39.7% (unchanged) | 44.5% (unchanged) |
| 25BB and up | 43.9% | **50.2%** |

The shallow buckets were left alone deliberately. By the owner notes above a
single open range stops being the model at 15-20BB, so widening them would be
answering a question nobody has asked yet - and the table applying one range from
15BB to 150BB was itself part of what was wrong.

Still outstanding: the six BTN postflop families were solved against 13.2 and
19.0 percent and now disagree with the pack by more than before. Correcting them
means re-solving, which is gated on solver memory.
`npm run mtt:postflop-range-consistency` reports the current gaps.

## Short-stack charts, and how to read them

The owner's Raise Your Edge pack answers the 15-20BB question this file left
open. Extracted from `openraising 10-20bb bu-sb.png` by
`scripts/extractRangeChartGrid.ps1`, the button at 10-20BB has no single opening
range. It has four actions:

| Action | Classes | Hands |
| --- | --- | --- |
| openraise | 6 | AA, AKs, KK, QQ, JJ, TT |
| openjam under 12BB | 26 | AQs-A8s, KQs, KJs, K4s-K2s, Q7s-Q5s, J7s, 96s, AKo, AQo, KQo, AJo, ATo, K9o, Q9o, J9o, T9o, 99, 88 |
| openjam under 15BB | 46 | A7s-A2s, KTs-K5s, QJs, QTs, Q9s, Q8s, JTs, J9s, J8s, T9s, T8s, T7s, 98s, 97s, 87s, 86s, 76s, 75s, 65s, 64s, 54s, 77, 66, KJo, KTo, QJo, QTo, JTo, A9o-A2o |
| openjam under 20BB | 4 | 55, 44, 33, 22 |

**The threshold is the depth below which you jam; above it you open-raise.**
Owner's reading, 2026-07-30: short of chips there is no fold equity to play a
flop with, so the hand goes in; past the threshold a raise becomes affordable.

That explains what first looked inverted. 99 and 88 jam only under 12BB because
from 12 to 20 they would rather raise and play; 22-55 jam all the way to 20BB
because they have nothing to play with. The strong pairs are not tighter, they
are just worth more than a shove.

So a shallow bucket needs a depth-indexed action per hand, not one open range,
which is why the widening above stopped at 25BB rather than guessing.
