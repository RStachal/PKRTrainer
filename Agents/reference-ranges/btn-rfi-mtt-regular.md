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

## Verified against the chart, 2026-07-30

The shallow buckets this file deliberately left alone were then checked against
the owner's own chart rather than against reasoning. Total hands the chart plays
at 10-20BB - every non-fold class, whatever the action - against what the pack
teaches at 15 and 20BB:

| Source | Classes | Width |
| --- | --- | --- |
| RYE BU 10-20bb chart | 82 | 40.0% |
| Pack, ante-off, 15BB and 20BB | 81 | 39.7% |
| Pack, ante-on, 15BB and 20BB | 89 | 44.5% |

**Ante-off agrees to a single hand class.** The chart plays 64s and the pack does
not; nothing else differs in either direction. That is independent corroboration
that the shallow buckets were right to leave, and it is worth more than the
argument that led to leaving them.

Ante-on is seven classes wider than the chart - Q3s, J6s, T6s, K7o, Q8o, J8o, 98o
- all of them from the ante-on widening. Whether that is correct depends on
whether the chart assumes ante, which it does not say. Left as measured rather
than trimmed to match a source whose premise is unknown.

64s is not added for the same reason: one class, four combinations, 0.3 percent,
against a chart of unstated ante. Worth recording, not worth quietly changing
shipped content over.

## Reading the chart packs in batch

`scripts/detectRangeChartGrids.ps1` locates the grids; `extractRangeChartGrid.ps1`
samples them. Run over both packs on 2026-07-30: **156 of 210 pages resolved, 340 grids**. The
other 54 are the entire mid/high-stakes pack, drawn in a different style - no gaps
between cells, thin borders, a smaller canvas - and they are refused rather than
guessed at. Wrong geometry emits a complete, confident range describing different
cells, which is the one outcome worth preventing.

What took several attempts to get right, recorded so it is not rediscovered:

- **Cells are not square.** Measured 45.08 wide against 46.2 tall. Every earlier
  attempt borrowed the column pitch for the rows, so the comb drifted a full cell
  over thirteen steps and never lined up. The hand-tuned 45.6 that appeared to
  work was a compromise between the two that the sampling window forgave.
- **Rows cannot be thresholded.** A horizontal border separates cells that are
  frequently the same colour, so it registers far more weakly than a vertical one.
  At any threshold admitting the weak ones, the strong ones smeared together.
- **Grids are not separated by a wider gap.** The space between two grids is 27px
  against a 45px cell pitch, so they are split where the spacing stops matching
  the pitch, not where a gap appears.
- **Borders arrive doubled or missing**, so the comb is fitted by trying pairs as
  the outer two and counting hits, rather than by demanding a clean run.
- **Two grids can sit almost flush.** On the pushing pages the space between them
  is 47px against a 45px cell pitch - a two-pixel deviation no spacing rule can
  separate without also splitting inside a grid. A hand grid has exactly fourteen
  borders, so a group holding a multiple of fourteen is cut structurally instead.

A test holds the property that makes the automation usable: the range read from
detected geometry is identical to the range read from geometry measured by hand.

## What the charts say about our opening ranges

`npm run mtt:charts-vs-packs` compares the widths. Run 2026-07-30 over the twelve
open-raising pages, ten grids where the file name says which seat each grid is:

| Seat | Depth | Chart | Ours, ante-off | Ours, ante-on |
| --- | --- | --- | --- | --- |
| BTN | 20BB | 40.0% | 39.7% | 44.5% |
| BTN | 25BB | 40.3% | 43.9% | 50.2% |
| BTN | 100BB | 46.9% | 43.9% | 50.2% |
| CO | 25BB | 30.3% | 27.0% | 30.0% |
| CO | 100BB | 32.4% | 27.0% | 30.0% |
| LJ | 25BB | 16.4% | 20.1% | 22.8% |
| LJ | 100BB | 18.9% | 20.1% | 22.8% |
| HJ | 25BB | 22.6% | 23.1% | 25.8% |
| HJ | 100BB | 25.5% | 23.1% | 25.8% |

**Every seat in the charts widens with depth. Ours do not.** The button goes 40.3
to 46.9 percent between 25BB and 100BB, the cutoff 30.3 to 32.4, the lojack 16.4
to 18.9, the hijack 22.6 to 25.5. Our table has one range from 25BB to 150BB for
every seat, so at 25BB the button is 3.6 points too wide and at 100BB it is 3.0
too narrow, against the same single number.

That is the same defect already found and half-fixed: the shipped table applied
one button range from 15BB to 150BB, and splitting it at 25BB corrected the
shallow end while leaving everything above it flat. The charts say the flatness
was the real problem and the split was only its first instalment.

Two caveats worth keeping with these numbers:

- **A page with many colours needs its legend read.** Two stronger claims about
  those pages were both wrong. Excluding them on the colour count threw out the
  100BB pages; then calling them limp/raise pages was wrong as well. Checked
  2026-07-30: the 100BB legend is entirely about play facing a three-bet - 4bet
  value, call vs 3bet, fold vs 3bet - so every coloured cell IS in the opening
  range and white is the fold. **Those widths are exact.** The small blind's
  10-20BB grid genuinely does draw limp branches, and reads 75.6 percent for that
  reason. Nothing but the legend tells them apart.
- **Seat mapping comes from the file name.** Pages naming a span rather than a
  pair - "mp-co" with three grids - are skipped, because guessing which seat the
  middle grid is would manufacture a disagreement.

## Depth curve applied, 2026-07-30

Owner's decision: the depth curve is ante-off, and the ante widening sits above
it. Applied for the four seats the charts cover, in the chart pack's own bands -
20-40BB and 40-100BB - rather than interpolated between the two measurements,
which would invent values the source does not contain.

| Seat | 25-40BB ante-off | 50BB+ ante-off | 25-40BB ante-on | 50BB+ ante-on |
| --- | --- | --- | --- | --- |
| LJ | 16.4% | 18.9% | 19.2% | 21.6% |
| HJ | 22.6% | 25.5% | 23.8% | 26.7% |
| CO | 30.3% | 32.4% | 32.4% | 33.9% |
| BTN | 40.3% | 46.9% | 44.8% | 50.5% |

Every ante-off figure matches its chart exactly. Below 25BB the flat table stands
and was separately verified against the 10-20BB chart to one hand class.

**A consequence worth stating.** Moving the packs toward the charts widened the
gap to the postflop solves for the cutoff as well as the button: its solve was
built against 24.9 percent and the pack now teaches 30.3 to 32.4, so the gap went
from 2.1 points to between 5.4 and 7.5. It stays under the guard's tolerance and
clears when those families are re-solved, but it is a real widening and not a
measurement artefact - correcting what we teach moved it away from what we
solved.

## Full open-raising comparison, 2026-07-30

All twelve pages, twenty grids, after the seat mapping learned to expand a span
(`mp-co` with three grids is LJ, HJ, CO) instead of skipping anything not naming
exactly two seats.

**The eight seats the depth curve was applied to now match their charts exactly** -
no hand in the chart the pack lacks, none in the pack the chart lacks, at both
25BB and 100BB. That is the change verified against its source rather than
against its own arithmetic.

**Early position is too wide in our packs, at every depth:**

| Seat | Depth | Chart | Ours, ante-off | Ours minus chart |
| --- | --- | --- | --- | --- |
| UTG | 20BB | 11.2% | 14.9% | +3.7 |
| UTG | 100BB | 11.5% | 14.9% | +3.4 |
| UTG+1 | 20BB | 11.5% | 15.2% | +3.7 |
| UTG+1 | 100BB | 13.0% | 15.2% | +2.2 |
| UTG+2 | 20BB | 13.9% | 18.3% | +4.4 |
| UTG+2 | 100BB | 16.3% | 18.3% | +2.0 |

Every disagreement is one-directional - hands in the pack the chart does not
open, never the reverse - so this is our range being loose rather than a
different construction. It also flatly contradicts the earlier reading that UTG
was "built correctly": that judgement came from UTG's solve input agreeing with
the pack to a tenth of a point, which only ever showed the two agreed with each
other, not that either was right.

**The 20BB flat band disagrees in both directions**, which is expected of a band
left alone: the cutoff is 6.9 points too narrow there (27.0 against 33.9) while
the lojack and hijack are slightly wide. That band is where a single opening
range stops being the model at all, so it needs the depth treatment and the
short-stack charts together rather than a width nudge.

## Push/fold, 2026-07-30: our ranges are about half as wide as the charts

The pushing sheets are 10BB. Compared against our PUSH_FOLD ranges, ante-off:

| Seat | Chart, blue only | Chart, blue + cream | Ours |
| --- | --- | --- | --- |
| SB | **74.7%** | 74.7% | 28.5% |
| BTN | 53.8% | 58.4% | 22.2% |
| CO | 40.0% | 49.3% | 22.2% |
| HJ | 34.2% | 45.7% | 15.2% |
| LJ | 27.6% | 41.2% | 15.2% |
| UTG+1 | 22.2% | 38.5% | 11.6% |
| UTG | 14.9% | 33.9% | 11.6% |

**Even the lower bound is roughly double ours at every seat**, and the small blind
is not a bound at all - its grid has two colours, so 74.7 against our 28.5 is a
46 point gap with nothing to interpret. A 10BB small blind shoving three quarters
of its range against one opponent is ordinary; shoving 28 percent is not a
tighter style, it is a different game.

This is the largest content gap found so far, and it sits in the most common
short-stack decision in the format.

**What blocks the other six.** Those grids draw three colours - blue, white and a
cream - and the sheets carry no legend. The cream is within a luminance point of
the white, so it cannot even be told apart by shade, and it covers as many hands
as the blue does on some seats. Whether it is a push or a fold changes the width
by up to nineteen points, so the comparison reports both bounds rather than
picking one. `playedBounds` collapses to a single number wherever the palette is
unambiguous, which is why the small blind shows one.

One word from the owner on what the cream means unblocks all six.

## Calling rejams, 2026-07-30: a coverage gap, not an accuracy one

The calling-rejam sheets colour by **depth, not by action**. The legend reads
30bb, 25bb, 20bb, 15bb, and the colour is the deepest stack at which the hand
calls - so the calling range at depth D is every hand whose threshold is at least
D. AA is the 30bb colour and calls everywhere; 22 is the 15bb colour and calls
only when short. That is the second sheet in this pack whose colours turned out
not to be actions, after the 100BB open-raising pages.

Read that way the sheets are internally coherent: ranges narrow as stacks deepen,
and later position calls wider. The button calls 16.1 percent at 15BB against
UTG's 8.0.

| Hero | 15BB | 20BB | 25BB | 30BB |
| --- | --- | --- | --- | --- |
| BTN | 16.1% | 11.0% | 8.4% | 6.3% |
| CO | 12.5% | 9.2% | 7.2% | 6.0% |
| LJ | 8.4% | 5.9% | 3.5% | 3.0% |
| UTG | 8.0% | 5.1% | 3.5% | 3.0% |

**Our VS_ALLIN holds records at 5BB and 10BB only.** The sheets start at 15BB, so
there is no overlapping depth to compare and nothing here contradicts what we
ship. What it shows instead is that our data stops exactly where these sheets
begin: a player at 15 to 30BB facing a shove has no vs-allin content from us at
all.

That is a different kind of finding from the push/fold one and belongs in a
different queue. Push/fold is wrong and can be corrected from data already
extracted; this is absent, and filling it means new content across four depths
and seven seats rather than a correction to something that exists.

## BB defend, 2026-07-30: we teach 21.6 percent where the charts say 31 to 68

The defend sheets are laid out by two things our model does not have. The three
grids on a page are the **opener's range width** - 40, 45 and 50 percent, against
a 2.5x open - and the file name gives the **depth band**. Actions are value 3bet,
bluff 3bet and flatcall, with white the fold.

| Depth | vs 40% opener | vs 45% | vs 50% | Ours |
| --- | --- | --- | --- | --- |
| 12-20BB | 31.2% | 35.1% | 38.8% | 21.6% |
| 25-35BB | 45.7% | 52.0% | 59.0% | 21.6% |
| 40-50BB | 62.9% | 66.5% | 68.3% | 21.6% |

Our big blind defends 21.6 percent at every depth against every opener. The
charts range from 31.2 to 68.3, so at 40-50BB against a normal button open we are
short by more than forty points.

This is the biggest gap measured so far and it sits in the most common spot in
the game - the big blind facing a raise reaches more flops than any other
situation. Folding two thirds of a range that should be defending two thirds is
not a tight style, it is giving up the pot odds the blind is paid to use.

**Two defects, not one.** The width is wrong, and the model is missing a
dimension: our VS_OPEN holds one range per seat and depth, with no notion of how
wide the opener was, while the sheets vary defence by 6 to 13 points across that
axis alone. Our ranges are also flat across depth, the same defect corrected for
RFI earlier today.

**Recommended fix, in the order it should happen.** Take the 45 percent opener
column as the single calibration point and give BB a depth curve from it -
35.1 / 52.0 / 66.5 across the three bands. That corrects the large error using
the structure the packs already have. Adding an opener-width dimension is a
model change and should wait until the widths are right; being forty points out
matters more than being six points out.
