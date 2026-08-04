# The owner's study library, and what it can legitimately supply

Read 2026-08-04 from `C:\Work\PKR vedomosti`. Twenty-nine files, 229 MB, of which
two are duplicates (`Poker_for_Advanced_Players` twice; `Preflop Guide for RFI` as
both v2 and v211, identical size), so twenty-seven distinct.

## Most of this is cash game, and that matters

The owner asked for the library to be the base we build on. It can be, but only
with a distinction the filenames do not make: **the principles transfer, most of
the ranges do not.** Cash ranges are built against rake, no ante, deeper effective
play and no ICM. A cash button opening range is not an MTT button opening range,
and adopting one as "the base" would quietly undo the measured chart work.

| use | files |
| --- | --- |
| **MTT, directly usable** | MTT Push/Fold Chart, Jonathan Little I+II, Eric Lynch, the owner's Praktická MTT kniha, the owner's Kompendium |
| **Cash - principles only** | Upswing RFI guide, 20 Rules for 3-bet Pots, OR_loose_FR, OR_tight_FR, Preflop-range-robustně, Small Stakes NL, Massive Profit at the Micros, Low Stakes Playbook |
| **Maths, transfers whole** | Poker Math That Matters, Practical Poker Math, Bakker, the Poker.cz pot-odds article, the SplitSuit EV spreadsheets in `archivedwl-917.zip` |
| **Not applicable** | 6+ Hold'em (short deck, different deck and hand rankings) |
| **No content** | Splitsuit Poker Math Course - a login link, nothing else |

## Where the missing five are

The owner expected thirty-two files. The compendium explains the gap: it cites
eight sources by name, and five of them are not in the folder.

| cited source | citations | on disk |
| --- | --- | --- |
| Vasinlu21 | 6 | **missing** |
| No-BS 6-max Poker (incl. Annexes III-V) | 5 | **missing** |
| Answer Key (Preflop & Math Workbook) | 3 | **missing** |
| PKR POZNATKY | 3 | **missing** |
| PKR COACHING | 2 | **missing** |
| The Mental Game of Poker CZ | 3 | English edition only |
| Poker.cz pot odds | 2 | yes |
| MTT Push or Fold Chart | appendix | yes |

Twenty-seven distinct plus five missing is thirty-two, which is the number the
owner remembered. Those five are also the ones worth having most: they are the
coaching notes and worked answers, which is exactly the "why" layer the range
charts never contain.

## What the Kompendium settles

The owner's own compendium is the highest-signal document in the library, and two
of its statements bear directly on open questions here.

**It names the push/fold chart as its baseline.** Section 4.2: "Chart jako
baseline. Chart upravuj podle ICM, hráčů v blindech a ante/payout struktury", and
the chart is embedded as its appendix. That settles the three-way disagreement
recorded in the range file - the chart is the owner's baseline for push/fold, and
the RYE pushing sheets are not. Our 10BB push/fold is wider than the chart by up
to 11 points on the button.

**It says the 9-15BB band is a mix, and our model says it is not.** Section 4.1:
"1-8bb: push/fold. 9-15bb: mix open-raise a push. 16-25bb: víc min-raise a
raise/fold, ICM mění prahy." Our `PUSH_FOLD_MAX` is 12, so between 9 and 12 big
blinds the action tree offers jam and fold and nothing else. Three sources now
disagree with that: the compendium, the RYE 10-20BB sheet with its open-raise band
plus thresholds, and the Praktická MTT kniha. It is the same defect corrected at
15BB, one band lower.

Two smaller ones worth keeping:

- Section 6.2 gives a concrete defence frequency: MDF for the big blind against a
  3bb small-blind open is about 37.5 percent.
- Section 4.3: "SB je největší zdroj spotů" - which is an argument for treating the
  small blind's 28-point gap at 5BB as the first correction rather than a tidy-up.

## What this library cannot do

It has no MTT postflop solver output, so it cannot check the decomposed solves. It
has no ICM tables, so the compendium's repeated "adjust for ICM" stays an
instruction we cannot yet follow numerically. And nothing in it explains the cream
colour on the RYE pushing sheets, which is still the oldest open question here.

## Little contradicts the Kompendium about 10BB, and I was about to act on the wrong one

The previous entry said our pure jam/fold at 9-12BB was "the same defect corrected
at 15BB, one band lower" and named three sources against it. Reading the strongest
of them properly shows that was too strong a claim.

Jonathan Little, volume 2, states it directly:

> "Když všichni až k vám složí a vy máte 10 BB či méně, jděte all-in s poměrně
> širokou rangí."

and refers throughout to "10BB all-in nebo fold hru" - a 10BB all-in-or-fold game.
He puts the switch a band higher: "S 20 BB bude asi lepší raisnout a foldnout na
případný all-in."

So at ten big blinds unopened, the library's most authoritative MTT source says
shove, which is what our model already does.

**The disagreement is smaller than it looked.** The RYE 10-20BB sheet does draw an
open-raise band at these depths, but it is tiny - 2.6 percent on the button, 4.1
to 7.2 elsewhere - and it is the premiums: AA, AKs, KK, QQ, JJ, TT. So "mix
open-raise and push" at 10BB means shove about 37 percent and min-raise the very
top. Little's "wide all-in range" and that band are not really in conflict; one is
the strategy and the other is a small refinement on top of it.

**Left alone deliberately.** Adding a 2.6 percent raising band at 10BB would mean
teaching two regimes at one depth without being able to say which applies, against
an explicit statement from the best MTT source that the depth is all-in or fold.
The earlier framing was wrong and is corrected here rather than built on.

Two other concrete figures from Little worth keeping, both about calling a shove
at 10BB: a tight field calls with about 20 percent (55+, A7+, K9+, QT+), a loose
one with about 40 (22+, A2+, K2+, Q9+, JT). That is the width our VS_ALLIN should
sit between, and it does.
