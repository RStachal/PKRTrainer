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

## Applied, 2026-07-30 evening

**BB defence now carries a depth curve** calibrated to the sheets' 45 percent
opener column: 35.1 percent at 15-20BB, 52.0 at 25-35, 66.5 at 40BB and above.
Every figure matches its sheet. Below 15BB the flat table stands, and the other
defending seats keep theirs - the sheets cover only the big blind, and a curve
nobody measured is worse than a flat range everybody can see is flat.

**Push/fold at 10BB is now per seat** where the sheets establish one: LJ 27.6,
HJ 34.2, CO 40.0, BTN 53.8, SB 74.7. The grouped table had put the cutoff and the
button together at 22.2, fourteen points apart in the sheets, so no single group
figure could have been right for both.

Two limits carried deliberately:

- **These are lower bounds.** Only the unambiguous blue is taken. If the cream
  turns out to be a jam they are short by up to nineteen points; if it is a fold
  they are exact. They cannot be too wide. The small blind's grid has no cream,
  so 74.7 is the figure rather than a bound.
- **Early position keeps the group.** Its sheet names three seats and the
  detector finds two grids, so which grid is which seat is not established.
  Attributing a range to the wrong seat is worse than leaving a narrow one.

A side effect worth stating: for the charted seats ante-on and ante-off now
coincide at 10BB, because the measured range already contains the group's ante
extension and the sheets do not say whether they assume ante. Equal is honest;
narrower would be a defect, and a test pins that.

**Not done, and why.** The other defending seats and VS_ALLIN at 15-30BB have no
chart coverage - the first is unmeasured, the second is absent content rather
than wrong content. Neither is a correction that can be made from what is on
disk.

## The other defending seats, 2026-07-31: no correction available, a feature is

The flatting/3betting sheets do cover the seats the BB defend sheets did not, so
the earlier note that they had no chart coverage was wrong. They are laid out by
depth band, by the **opener's seat**, and by the defender. Legend: value 3bet +
broke, 3bet + call 4bet, 3bet bluff, flatcall - plus two conditional colours,
"flat if table super soft" and "optional 3bet bluff", which are exploitative
additions and are excluded from the base range here.

Base defence, against our flat figures:

| Opener | BTN chart | BTN ours | SB chart | SB ours |
| --- | --- | --- | --- | --- |
| UTG | 14.3-17.9% | 17.0% | 10.0-12.5% | 10.3% |
| MP | 16.7-17.3% | 17.0% | 12.1-14.3% | 10.3% |
| CO | 23.4-23.7% | 17.0% | 16.9-19.2% | 10.3% |

**Unlike the big blind, these are not wrong.** Against early and middle openers
they land within a point or two; the whole residual error is against late
openers, where the sheets defend 6 to 9 points wider. Our single number per seat
is calibrated, in effect, to an early-position opener.

So there is no width correction to make. Recalibrating to the middle column would
move BTN by 0.3 points and would trade accuracy against UTG for accuracy against
CO without gaining any. What closes this gap is the opener dimension the model
does not have - the same one the big blind's sheets vary by - and that is a
feature rather than a data fix.

This also settles the earlier worry that leaving the other defending seats flat
was a silent risk. It was not: they were flat and close. The big blind was flat
and forty points out. Being flat is only a defect where the underlying strategy
moves, and it is worth measuring which case one is in before correcting either.

## The one finding behind all four gaps: no short-stack model above 12BB

Reading the rejam sheets settled what the previous four "missing" items had in
common. They are not four gaps; they are one.

Our short-stack contexts stop at 10BB. PUSH_FOLD holds buckets 5 and 10.
VS_ALLIN holds 5 and 10. Above that, VS_OPEN at 15, 20, 25 and 30BB offers
exactly two actions - CALL and 3BET. There is no jam anywhere above 12BB.

The sheets say the band from 12 to 30BB is where jamming *is* the strategy:

| Sheet | What it teaches at 15-30BB | What we offer |
| --- | --- | --- |
| Openraising 10-20bb | open-raise range plus three jam thresholds | one opening range |
| Pushing 10bb | jam ranges to 74.7% | PUSH_FOLD, stops at 10BB |
| Calling rejams | call-a-shove ranges, 15-30BB | VS_ALLIN, stops at 10BB |
| Rejaming | re-jam over an open, 2.1% to 33.0% | CALL and 3BET only |

So a player between twelve and thirty big blinds - a band that covers a large
part of any tournament - is being taught deep-stack shapes. They are never told
to shove over an open, never shown a jam threshold, and never given a range for
calling one.

That reframes the earlier items. The 20BB opening band, VS_ALLIN above 10BB, and
the missing re-jam are not three data gaps to fill separately; they are one model
that ends at 12BB, and the charts to fill it are all on disk and already read.

**It also explains why the corrections that were possible were so large.** BB
defence was forty points out and push/fold roughly half, both at short depths,
because those are the places the model is being asked to describe a game it does
not represent. The deep-stack ranges, where the model does fit, were out by two
to seven points and mostly right.

Worth being clear about the size: this is a feature, not a correction. It needs
a jam action in the short-stack contexts, depth-indexed thresholds per hand
rather than one range per bucket, and the contexts extended from 10BB to 30BB.
The data is measured and waiting.

## The re-jam, measured and shipped - 2026-07-31

The first of the short-stack gaps to be closed, and the one that needed no solver
because the data was already on disk.

**What the sheets say.** The thirteen `rejaming` pages colour each hand by the
deepest stack at which it shoves over an open - 30, 25, 20 or 15bb - plus a salmon
band that three-bets and calls a four-bet instead. So the range at a depth is
every hand whose threshold reaches it, and the ranges get *narrower* as stacks get
deeper. The legend is on `Rejam BU vs MP HJ CO.png`.

Each page is a hero against a group of openers and each grid on it is one opener,
so 33 hero-opener pairs were measured. The spread across openers is large:

| Hero | vs early | vs middle | vs late |
| --- | --- | --- | --- |
| BB at 15BB | 9.8% | 15.2% | 33.0% (vs BTN) |
| SB at 15BB | 11.0% | 18.6% | 27.9% (vs BTN) |
| BTN at 15BB | 7.2% | 14.9% | 19.2% (vs CO) |

**What shipped.** `VS_OPEN` has no opener axis, so one column per hero is used and
named in `REJAM_CALIBRATION_OPENER` - a middle-position opener throughout. All 33
pairs are kept in `REJAM_RANGES` so adding the axis later needs no re-measurement.
That mattered enough to say twice: collapsing this dimension without recording it
is what left big-blind defence forty points out.

The jam sits in front of the existing defence rather than replacing it, because
the pack keeps flatting and three-betting on its own separate sheets - the
`flatcalling_3betting_*` folders. A hand that shoves at 20BB stops flatting there,
which is correct and is why the calling widths at those depths moved.

Shipped widths, ante-off:

| Seat | 15BB | 20BB | 25BB | 30BB | 40BB+ |
| --- | --- | --- | --- | --- | --- |
| LJ | 3.2% | 2.1% | 1.7% | 1.7% | none |
| HJ | 10.4% | 8.6% | 2.7% | 2.4% | none |
| CO | 11.9% | 10.4% | 5.1% | 3.0% | none |
| BTN | 14.9% | 13.1% | 4.7% | 3.0% | none |
| SB | 18.6% | 15.2% | 6.9% | 2.6% | none |
| BB | 15.2% | 12.8% | 7.8% | 4.8% | none |

Nothing above 30BB, which is where the sheets stop. The premiums three-bet rather
than jam, per the salmon band - same stack in by the river, but it keeps worse
hands in.

**A detector fault found on the way.** `Rejam BB vs MP HJ CO.png` names three
openers and has three grids at the usual offsets, but the detector found two and
did not refuse - a short page looks exactly like a page that genuinely has fewer
grids. Rather than loosen the detector, `exportRangeChartGrids.ps1` now takes a
`-Geometry` overrides file of hand-measured grids, and the generator drops any
page whose grid count disagrees with the openers its name lists. Both halves
matter: the override supplies what was missing, the check makes the next silent
short read fail loudly instead of filing a range under the wrong seat.

## Calling the re-jam - 2026-07-31

Shipped the same day as the re-jam and for the same reason: teaching a player to
shove over an open at twenty big blinds while leaving the opener with no range to
call it would describe half a spot.

`VS_ALLIN` held 5BB and 10BB and nothing above. The seven `calling rejams` pages
cover 15 to 30BB with the same threshold scheme - colour is the deepest stack at
which the hand calls - and no salmon band, because calling is the only choice.
The pale cells are folds; the owner confirmed that for these sheets directly,
which is why they can be read at all. It stays confined to them: the same cream on
the pushing sheets is still unresolved, and those ranges are still lower bounds.

Eighteen hero-shover pairs measured. Calibrated to the big blind shoving, for
every hero - it re-jams widest by a distance, it is the one seat present on every
hero's sheets, and it is the range we now teach the big blind to shove, so the two
sides of the spot describe the same game.

| Seat | 5BB | 10BB | 15BB | 20BB | 25BB | 30BB |
| --- | --- | --- | --- | --- | --- | --- |
| UTG | 19.3% | 8.6% | 8.0% | 5.1% | 3.5% | 3.0% |
| LJ | 24.3% | 11.8% | 8.7% | 6.2% | 3.8% | 3.0% |
| CO | 29.4% | 15.2% | 12.5% | 9.2% | 7.2% | 6.0% |
| BTN | 29.4% | 15.2% | 15.8% | 10.3% | 8.0% | 6.3% |
| SB | 30.9% | 17.8% | 17.6% | 11.9% | 9.0% | 6.3% |

**The seam is the interesting part.** The 10BB column comes from the shipped
table, written long before any chart was opened; the 15BB column comes from
sampling the charts. They meet within a few points at every seat - 17.8 against
17.6 at the small blind, 15.2 against 15.8 on the button. Two independent routes
landing on the same numbers is the closest thing to corroboration either source
has, and a test now holds that seam so a future misreading of the colour scale
shows up as a jump.

UTG+1, UTG+2, HJ and BB have no sheets and keep having no range above 10BB. A call
range borrowed from the seat next door would look exactly as authoritative as a
measured one while being wrong by an unknown amount.

## BB vs SB limp, measured - 2026-07-31

The last unexamined folder, and the same story a third time.

`BB vs SB ranges.png` carries three grids - 15-20bb, 20-25bb and 30bb+ - each with
its own legend. The detector found one of the three and did not refuse, the same
silent short read as the re-jam page, so both missing grids are now in the
geometry overrides. All three read 169 classes cleanly and their cluster counts
match their legends exactly (4, 4, 5), which is what says the geometry is right.

| Action | 15-20bb | 20-25bb | 30bb+ |
| --- | --- | --- | --- |
| check behind | 63.0% | 65.5% | 61.5% |
| jam | 20.5% | 9.0% | none |
| raise 3.5x, fold to the shove or four-bet | 8.1% | 15.4% | 18.1% |
| raise 3.5x and get it in | 8.3% | 10.1% | 16.9% |
| raise 3.5x and four-bet under 100bb | - | - | 2.6% |
| raise and call a three-bet, 50bb+ only | - | - | 0.9% |

Jamming over a limp is a fifth of the range at 15-20bb, halves by 20-25 and is
gone by 30 - the same short-stack shape as the re-jam and the calling ranges,
arrived at from a different sheet. Our `VS_LIMP` has no jam at any depth.

Not yet wired in. The two shallow bands are clean and could be shipped as they
stand; the 30bb+ band carries conditions our model cannot express - "only 50bb+"
and "four-bet under 100bb" are stack-dependent branches inside a single depth
band - so that grid needs a decision about what to do with them rather than a
straight import.

## A spot-check that vindicated the pipeline - 2026-07-31

Before shipping the re-jam ranges I checked a handful of cells on
`Rejam BB vs BU SB.png` by eye against the generated thresholds, and got seven
mismatches. Sampling the raw pixels settled it the other way: 33, 44, 77, 99 and
22 are `#84A189`, which is the 30bb light green, and TT is `#8BA8CC`, the 20bb
blue. The generated data was right at every point and my reading of the rendered
image was wrong at seven of thirteen.

Worth keeping because it is the whole argument for sampling rather than reading.
The light green (30bb) and dark green (25bb) are easy to tell apart in the legend
and hard to tell apart in a grid cell carrying a bold label, which is exactly the
error that would have shifted a range one band without anything looking wrong.

One incidental confirmation: a single pixel at the cell centre lands on the label
glyph and returns black. The extractor takes the modal colour of the cell interior
for that reason, and my ad-hoc 30x30 sample reproduced the problem the extractor
already solves.

## The range was only half the feature - 2026-07-31

After the re-jam ranges were in and their tests were green, the drill still could
not present the answer.

`offeredActions` in src/core/actionTree.ts returned exactly FOLD, CALL and 3BET
when the hero faced an open, at every depth. So a spot at 20BB whose recommended
action was JAM offered three buttons, none of them the right one. `strictCorrect`
came from the range record and `answers` from the offer, by two separate paths, and
nothing compared them - a player would have been marked wrong for every answer
available to them.

Every existing test passed through this. The comment above the default-action code
in drillEngine even asserts the invariant - "tim je doporuceni vzdy mezi
nabizenymi moznostmi (Property 9)" - but Property 9 only checks that the two sets
are non-empty, not that one contains the other.

Fixed by giving TableState a `shortStack` flag, set from the bucket beside the
existing `pushFold`, and offering JAM against an open while it holds. RE_JAM_MAX is
30, the deepest threshold the sheets draw. The action is listed last, after any
squeeze, as the one that ends the hand.

The more useful half of the fix is Property 9b, which asserts what the old comment
only claimed: every key in `strictCorrect` appears among the offered answers, for
every context and every bucket. It sweeps all buckets rather than the first valid
one, because the disagreement existed only between 15 and 30BB and a single-bucket
check would have kept missing it.

Worth stating plainly: shipping range data is not shipping a feature. The data, the
offered actions and the grading are three separate paths, and only the third one is
what the player experiences.

### What offering a new action costs elsewhere

Adding JAM to the vs-open offer had two consequences beyond the drill, and both
are worth knowing rather than being surprised by later.

**Solver EV exports are now short an action.** The app only shows per-action EV
when the export prices every action on offer, which is the right rule - a bubble
chart missing one bar is worse than none. Between 15 and 30BB there is now a
fourth option against an open, so any VS_OPEN export at those depths needs a JAM
value or the EV display silently switches off for that spot. Nothing is broken;
the coverage bar simply moved, and the next EV intake has to clear it.

**The record count went 487 to 507**, from the twenty new VS_ALLIN records. It was
hard-coded in four places, one of them in `src/` - `EXPECTED_RECORD_COUNT` in
mttPreflopRangeAudit.ts - so the audit would have reported a mismatch against
correct data. All four updated.

While there, `REPRESENTATIVE_ACTIONS.VS_OPEN` gained JAM. It lists the actions a
pack is expected to contain at least one of, so the audit will now say so if the
re-jam data ever stops reaching the packs - which, given it arrives through a
generator and a chart folder that lives outside the repository, is a failure mode
worth having an alarm for.

## BB vs SB limp, and the same shape a fourth time

The last unread folder. One sheet, three grids - 15-20BB, 20-25BB and 30BB+ -
and each grid carries its own legend, so nothing here is inferred.

| Action | 15-20BB | 20-25BB | 30BB+ |
| --- | --- | --- | --- |
| check behind | 63.0% | 65.5% | 61.5% |
| jam | **20.5%** | **9.0%** | - |
| raise 3.5x, bluff / fold to 4bet | 8.1% | 15.4% | 18.1% |
| raise 3.5x and go with it | 8.3% | 10.1% | 16.9% |
| raise 3.5x + 4bet under 100BB | - | - | 2.6% |
| raise + call a 3bet, 50BB+ only | - | - | 0.9% |
| **total, excluding check behind** | **36.9%** | **34.5%** | **38.5%** |

Two things worth keeping.

The iso-raise is close to flat across depth - 36.9, 34.5, 38.5 - but *what it is
made of* changes completely. At 15-20BB more than half of it is a shove. By 30BB
the shove is gone entirely and the same width is raises with a plan for the
four-bet. A model with one iso range per seat gets the width right and the
strategy wrong, which is the harder error to notice.

And the jam vanishes at exactly the depth the re-jam sheets stop drawing one.
Four folders, measured independently, agree that the short-stack game ends at
30BB. That is the strongest evidence yet that [the band from 12 to 30BB is one
model](#the-one-finding-behind-all-four-gaps-no-short-stack-model-above-12bb)
rather than four unrelated gaps - it has a top edge, and every sheet puts it in
the same place.

This is not wired in. Our VS_LIMP has no jam and no depth curve, exactly as
VS_OPEN did not, and the fix is the same fix. Recorded so it does not need
re-measuring - which now matters more than it did, because the source images are
no longer on disk.
