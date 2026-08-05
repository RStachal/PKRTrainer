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

## The full inventory, measured rather than guessed

Every PDF opened and its extractable text counted. Three facts change what this
library can be asked for.

**Five files are scanned images and cannot be read at all** - 872 pages between
them, yielding under 200 characters each:

| file | pages | extractable text |
| --- | --- | --- |
| Analytical No-Limit Holdem (Bakker) | 177 | 176 chars |
| Collin Moshman - Heads Up NL | 203 | 406 chars |
| Low Stakes Poker Playbook CZ | 142 | 141 chars |
| Poker for Advanced Players (Sklansky), twice | 175 each | 174 chars |

They would need OCR before anything here could use them. Worth knowing before
anyone assumes the Playbook is available to build on.

**`OR_loose_FR` and `OR_tight_FR` are one page each with 215 characters** - they
are pictures of range grids, not text. They belong to the chart-extraction
pipeline, not to reading.

**ICM is effectively absent from the whole library.** Twelve mentions across
twenty-seven files, every one of them in passing: Little II has seven in 314
pages, all of the form "ICM se používá v SNG"; the Praktická MTT kniha lists it as
a planned chapter; the Kompendium says "adjust for ICM" without saying by how
much. There is no table, no formula, no threshold anywhere.

So the Kompendium's repeated instruction cannot be followed from this library, and
PKRTrainer cannot teach ICM from it. That needs a different source - HRC or ICMizer
exports, or GTO Wizard's ICM sims - and it is the single largest hole in the
material.

### Where the MTT substance actually is

Ranked by density of tournament vocabulary rather than by size:

| file | pages | MTT terms |
| --- | --- | --- |
| Little, volume 2 | 314 | 847 |
| Eric Lynch | 469 | 395 |
| Little, volume 1 | 294 | 261 |
| Praktická MTT kniha | 20 | 80 |

Three books, about 1,077 pages, are the whole MTT core. Everything else is cash,
maths, mental game, or unreadable.

### What they corroborate

Little states shove thresholds per hand, which is the same shape as the model
built from the RYE charts - a hand carries the deepest stack at which it goes in:

> "u plného stolu a vy máte K-2, musíte jít all-in, pokud máte méně než 8 BB"
> "všeobecně byste jít dle mého názoru all-in, jen pokud máte 23 BB nebo méně"
> "že byste tuto handu neměli složit, pokud máte 20 BB nebo méně"

That is independent support for the threshold representation, and the 23BB figure
sits inside the 12-30BB band we now teach a shove in.

Lynch puts the push/fold switch where our constant already is: "all-in, pokud je
můj stack nižší než 12 BB". `PUSH_FOLD_MAX` is 12.

## Three more folders, 2026-08-04

### archivedwl-130 - the opening-range pack is back, and it documents itself

Thirty-six PNGs in nine folders: BB defend, BB vs SB, flatcalling and three-betting
in four depth bands, and open-raising in three. This is the material that vanished
from Downloads mid-session, so the two chart-extraction tests that had been
skipping silently now run again - and pass, giving the same 169 classes, the same
five colour groups, and the same agreement between detected and hand-measured
geometry. That is independent confirmation the restored pack is the same material,
not a different edition.

The test now tries both known locations instead of one hard-coded path. It skipped
for a day because a single string went stale, which is a poor way to lose a check.

**It also contains a Readme that settles how the thresholds are read**, which until
now rested on the owner's spoken explanation:

> If you have K9o for 11bb -> Jam, for 13bb -> openraise/fold
> If you have ATo for 12bb -> jam, for 19bb -> raise/call

That confirms the reading already shipped - the threshold is the depth below which
the hand goes in - and adds something we did not have: above the threshold the
action is not simply "open-raise" but **openraise/fold** when shallow and
**raise/call** when deeper. Our RFI has one open action and does not carry that
distinction.

Still absent: `pushing`, `rejaming` and `calling rejams`. Their data is already
generated, so nothing is blocked, but they cannot be re-measured.

### archivedwl-131 - GTO Wizard trainer screenshots, not a chart pack

Forty-two phone screenshots of a GTO Wizard MTT trainer session, despite the folder
being named for SNG. Each shows a "Correct" range matrix, the action frequencies
behind it, and a score.

They matter because of what they assume. One reads `MTT Avg. 50bb` with every seat
at 50 - the uniform-stack model exactly as the owner describes it - and gives UTG's
opening frequency as **Raise 2.3: 17.7%**.

| UTG RFI at 50BB | width |
| --- | --- |
| ours, ante off | 11.5% |
| ours, ante on | 13.6% |
| GTO Wizard screenshot | **17.7%** |

Four points wider than our ante-on and six wider than ante-off, on the tightest
seat, from the source the owner named as the top authority. One screenshot is one
data point and the ante setting behind it is not visible, so this is recorded
rather than applied. If the remaining forty-one cover other seats and depths, they
are a reference set for the whole RFI table.

### "Poker - zaklad pro vedomosti" - the same library, already read

Twenty-nine files, and a name-by-name comparison with `C:\Work\PKR vedomosti`
shows no new poker material: it lacks the Praktická MTT kniha and adds one
spreadsheet whose name marks it as a personal financial document rather than poker
content, so it was left unopened.

## The ICM gap has an answer after all: bubble factor, 2026-08-04

The owner's Evernote archive - 39 ENEX files, 1.8 GB, mostly base64 images - holds
the thing the PDF library did not. `PS - 04_STRATEGY_SnGO.enex` contains a full
numerical treatment of **bubble factor**, which is the practical mechanism for
converting chipEV thresholds into ICM ones without owning an ICM engine.

The definition it gives is a ratio of what a call risks to what it gains, both
measured in prize-pool equity rather than chips:

```
BF = (equity if you fold - equity if you lose) / (equity if you win - equity if you fold)
```

and the adjustment is one division:

```
odds_icm = odds_chips / BF          required_equity = 1 / (1 + odds_icm)
```

Both worked examples in the article check out against that formula: pot odds of
1.65:1 divided by a bubble factor of 1.2 gives 1.375:1 and 42.1 percent required
equity, which is the 42 percent it prints; 1:1 gives 54.5 against its 55.

**Why this matters more than the ICM range pages.** Those 180 HTML grids are 14
fixed table configurations, and using them means adding a table-configuration axis
to the model and teaching only the tables they happen to cover. Bubble factor is a
single scalar per hero-villain pairing that adjusts a threshold we already have.
It applies to every spot in the existing chipEV packs rather than replacing them.

The article supplies values to calibrate against:

| stage and format | bubble factor | coin-flip call needs |
| --- | --- | --- |
| early, full ring and short handed | 1.2 | 55% |
| early, Double or Nothing | - | 67% |
| bubble, 9-max full ring, even stacks | 1.9 | 67% |
| bubble, 6-max, even stacks | 1.7 | 63% |
| bubble, Double or Nothing, even stacks | 5.1 | 83% |
| cash game | 1.0 | unchanged |

And it shows the factor is **pairwise, not per player**: with a chip leader on the
cutoff at 8000 against three stacks of 4000, the leader calls at 1.3 while the
short stacks call him at 2.1 and each other at 1.7. That asymmetry is the whole
reason a big stack can shove any two on the bubble - the article works exactly
that example and puts the small blind's 32o shove at plus 1.3 percent of the prize
pool against a correctly-calling big blind.

So the "opponent stacks" axis I earlier costed as a model change reduces to one
number per pairing. That is a far cheaper route than the ICM grids, and unlike
them it generalises beyond the configurations someone happened to publish.

## The missing files turned up, 2026-08-05

Three of the five the Kompendium cites and I could not find were sitting in
Downloads as Evernote exports, along with several nobody had mentioned:
`Vasinlu21`, `PKR COACHING` and its second part, `PKR POZNATKY`, plus
`GTO Wizard - Functions`, three `Modelování ranges` notes and
`BB x SB Limp 30bb Deep`.

Two of them speak directly to work already shipped.

**PKR POZNATKY derives minimum defence frequency in the owner's own words**, and
does it from first principles rather than quoting a number: "Pokud SB zvyšuje na
3 BB, riskuje 2,5 BB, aby vyhrál 1,5 BB. Naše minimální obranná frekvence je
1,5 / (2,5 + 1,5) = 37,5%." That is the same identity `requiredFoldFrequency`
already computed, seen from the defender's side, so it is now
`minimumDefenceFrequency` with that example as its test - the number a player is
actually taught to reach for.

**BB x SB Limp 30bb Deep independently confirms a threshold taken from the
chart.** The limp work set `LIMP_SHOVE_MAX` at 25BB because the sheet draws a
shove at 15-20 and 20-25 and none from 30 up. This note, written for a different
purpose, says the same thing in prose: "Občas shove (ale spíše s 20 bb a méně,
30 bb je na to moc)."

Two sources agreeing is worth more than either alone, particularly when one is a
picture that had to be sampled and the other is a sentence.

Other figures worth keeping from PKR POZNATKY, all of them about opponent stacks
rather than our own - the axis the model still lacks:

- "Pokud má OPO 3-6 BB, musím hrát uzkou range. Pokud má 2BB a méně, hraji témeř ATC"
- "Bacha na PUSHE s 10 a vice BB se slabymi kartami na call stations"
- "NEPUSHUJ kdyz je pred tebou reis (od rega!)"
