import { describe, expect, it } from "vitest";

import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";
import type { ActionContext, ActionKey, AnteMode, Position, StackBucket } from "../../src/core/types";

// The button acts last after the flop in every pot it opens, so its range is
// meant to be materially wider than any earlier seat's. The shipped table had it
// at 39.7 percent without ante against an owner reference of 50.2 with, and
// applied one range from 15BB to 150BB. See
// Agents/reference-ranges/btn-rfi-mtt-regular.md.

const COMBOS = (handClass: string) => (
  handClass.length === 2 ? 6 : handClass.endsWith("s") ? 4 : 12
);

function contextWidthPct(
  ante: AnteMode,
  position: Position,
  bucket: StackBucket,
  context: ActionContext,
  exclude?: ActionKey,
): number | null {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.blindSpeed === "REGULAR" &&
    item.dimensions.ante === ante &&
    item.records.length > 0
  ));
  if (pack === undefined) return null;
  const entry = createRangeStoreFromRangePack(pack).lookup({ ante, position, bucket, context });
  if (entry === undefined) return null;
  const combos = Object.entries(entry.actions)
    .filter(([, actions]) => actions.some((action) => action !== "FOLD"))
    .filter(([, actions]) => exclude === undefined || !actions.includes(exclude))
    .reduce((sum, [handClass]) => sum + COMBOS(handClass), 0);
  return Math.round(combos / 1326 * 1000) / 10;
}

/** The hand classes a seat opens at one depth, for comparing depths directly. */
function openedClasses(
  ante: AnteMode,
  position: Position,
  bucket: StackBucket,
): Set<string> {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.blindSpeed === "REGULAR" &&
    item.dimensions.ante === ante &&
    item.records.length > 0
  ));
  if (pack === undefined) return new Set();
  const entry = createRangeStoreFromRangePack(pack)
    .lookup({ ante, position, bucket, context: "RFI" });
  if (entry === undefined) return new Set();
  return new Set(
    Object.entries(entry.actions)
      .filter(([, actions]) => actions.some((action) => action !== "FOLD"))
      .map(([handClass]) => handClass),
  );
}

function openWidthPct(ante: AnteMode, position: Position, bucket: StackBucket): number | null {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.blindSpeed === "REGULAR" &&
    item.dimensions.ante === ante &&
    item.records.length > 0
  ));
  if (pack === undefined) return null;
  const entry = createRangeStoreFromRangePack(pack).lookup({ ante, position, bucket, context: "RFI" });
  if (entry === undefined) return null;
  const combos = Object.entries(entry.actions)
    .filter(([, actions]) => actions.some((action) => action !== "FOLD"))
    .reduce((sum, [handClass]) => sum + COMBOS(handClass), 0);
  return Math.round(combos / 1326 * 1000) / 10;
}

describe("button opening range width", () => {
  it("matches the purchased charts exactly, ante-off, at both measured depths", () => {
    // The charts are the benchmark and these are their measured widths. Ante-off
    // carries the depth curve by the owner's decision; ante-on sits above it.
    for (const bucket of [25, 30, 40] as StackBucket[]) {
      expect(openWidthPct("OFF", "BTN", bucket), `${bucket}BB`).toBe(40.3);
    }
    for (const bucket of [50, 100, 150] as StackBucket[]) {
      expect(openWidthPct("OFF", "BTN", bucket), `${bucket}BB`).toBe(46.9);
    }
  });

  it("widens every seat with depth, which is what the flat table did not", () => {
    // The defect the charts exposed: one range from 25BB to 150BB per seat, so
    // the same number was too wide at the shallow end and too narrow at the deep
    // one. Stated as a property rather than as eight figures.
    // Two claims, because the evidence behind them differs. For the four seats
    // whose bands were measured from the chart pack, the widening is in the
    // source and the assertion is strict. Under the gun's bands are not measured
    // - documented in Agents/reference-ranges/btn-rfi-mtt-regular.md - so the
    // claim here is only that it never runs downhill, which is the part no
    // source disputes.
    //
    // With ante on, under the gun's 25BB and 50BB bands differ only by hands the
    // ante widening already adds to both, so the curve is flat rather than
    // rising. That is a fact about how thin those two bands are, and writing
    // hands into the range to make a strict comparison pass would be inventing
    // the measurement this seat is missing.
    for (const seat of ["LJ", "HJ", "CO", "BTN"] as Position[]) {
      for (const ante of ["OFF", "ON"] as AnteMode[]) {
        const mid = openWidthPct(ante, seat, 25 as StackBucket);
        const deep = openWidthPct(ante, seat, 100 as StackBucket);
        expect(mid, `${ante} ${seat}`).not.toBeNull();
        expect(deep, `${ante} ${seat}`).not.toBeNull();
        expect(deep!, `${ante} ${seat} deep vs mid`).toBeGreaterThan(mid!);
      }
    }
    for (const ante of ["OFF", "ON"] as AnteMode[]) {
      const mid = openWidthPct(ante, "UTG", 25 as StackBucket);
      const deep = openWidthPct(ante, "UTG", 100 as StackBucket);
      expect(deep!, `${ante} UTG must not narrow`).toBeGreaterThanOrEqual(mid!);
    }
  });

  it("never drops a pair or a suited hand as stacks deepen, across the band seam", () => {
    // The measured bands take over above 20BB, and where they did they were
    // narrower than the flat table they replaced: under the gun 14.9 percent at
    // 20BB and 11.2 at 25, the lojack 20.1 and 16.4, the same at UTG+1 and
    // UTG+2. What they lost was mostly 22 through 66.
    //
    // A small pair is a set-mining hand. It needs implied odds, implied odds
    // improve as stacks deepen, and the table opened them only while stacks were
    // short - backwards, and identically backwards at four seats, which is what
    // a gap between two sources looks like rather than a decision.
    //
    // Offsuit hands are excluded on purpose: KJo and QJo were dropped at the
    // same seam and that direction stands on its own, because an offsuit
    // broadway is the hand that gets dominated when the money goes in deep.
    // The three early seats only. The chart pack measured the lojack, hijack,
    // cutoff and button, and at the lojack the flat 20BB table is wider than the
    // measured 50BB band - so applying this rule there would overwrite a
    // measurement with an inference, which is the wrong way round.
    for (const seat of ["UTG", "UTG+1", "UTG+2"] as Position[]) {
      for (const ante of ["OFF", "ON"] as AnteMode[]) {
        const shallow = openedClasses(ante, seat, 20 as StackBucket);
        const deep = openedClasses(ante, seat, 25 as StackBucket);
        const dropped = [...shallow]
          .filter((hand) => !hand.endsWith("o"))
          .filter((hand) => !deep.has(hand));
        expect(dropped, `${ante} ${seat} drops at 25BB`).toEqual([]);
      }
    }
  });

  it("never lets an early seat lose a hand it opened at a shallower depth", () => {
    // The narrowing under the gun was one missing hand - KQo at 50BB, present at
    // 25 and present at both neighbouring seats - and a width comparison alone
    // would have missed it if something wider had been added at the same time.
    // This asserts the containment directly, which is the property that was
    // actually violated.
    //
    // Only the early seats, and only across the two measured bands. The later
    // seats trade hands around freely as stacks deepen and the shallow buckets
    // come from a different source entirely.
    for (const seat of ["UTG", "UTG+1", "UTG+2"] as Position[]) {
      for (const ante of ["OFF", "ON"] as AnteMode[]) {
        const mid = openedClasses(ante, seat, 25 as StackBucket);
        const deep = openedClasses(ante, seat, 50 as StackBucket);
        expect(mid.size, `${ante} ${seat}`).toBeGreaterThan(0);
        const dropped = [...mid].filter((hand) => !deep.has(hand));
        expect(dropped, `${ante} ${seat} drops at 50BB`).toEqual([]);
      }
    }
  });

  it("holds a band flat between the depths the charts measure", () => {
    // The bands are the chart pack's own - 20-40BB and 40-100BB. Interpolating
    // between two measurements would invent values the source does not contain.
    expect(openWidthPct("OFF", "CO", 25 as StackBucket)).toBe(openWidthPct("OFF", "CO", 40 as StackBucket));
    expect(openWidthPct("OFF", "CO", 50 as StackBucket)).toBe(openWidthPct("OFF", "CO", 150 as StackBucket));
  });

  it("leaves the shallow buckets alone", () => {
    // At 15-20BB a single open range stops being the model - the strategy mixes
    // minraise, raise-fold, raise-call and open shove - so widening these would
    // be answering a question nobody has asked yet.
    expect(openWidthPct("OFF", "BTN", 15 as StackBucket)).toBe(39.7);
    expect(openWidthPct("OFF", "BTN", 20 as StackBucket)).toBe(39.7);
    expect(openWidthPct("ON", "BTN", 15 as StackBucket)).toBe(44.5);
    expect(openWidthPct("ON", "BTN", 20 as StackBucket)).toBe(44.5);
  });

  it("keeps the button wider than every earlier seat at the same depth", () => {
    // The property the original defect violated, stated directly rather than as
    // a number: position buys width, and the button has the most of it.
    for (const ante of ["ON", "OFF"] as AnteMode[]) {
      const button = openWidthPct(ante, "BTN", 50 as StackBucket);
      expect(button).not.toBeNull();
      for (const seat of ["UTG", "LJ", "HJ", "CO"] as Position[]) {
        const earlier = openWidthPct(ante, seat, 50 as StackBucket);
        if (earlier === null) continue;
        expect(button!, `${ante} ${seat}`).toBeGreaterThan(earlier);
      }
    }
  });

  it("widens with ante at every depth", () => {
    for (const bucket of [15, 25, 50, 150] as StackBucket[]) {
      const on = openWidthPct("ON", "BTN", bucket);
      const off = openWidthPct("OFF", "BTN", bucket);
      expect(on, `${bucket}BB`).not.toBeNull();
      expect(off, `${bucket}BB`).not.toBeNull();
      expect(on!, `${bucket}BB`).toBeGreaterThan(off!);
    }
  });
});

describe("big blind defence", () => {
  it("carries the charts' depth curve instead of one width everywhere", () => {
    // The flat table defended 21.6 percent at every depth. In the spot that
    // reaches more flops than any other, that is forty points short at 50BB.
    expect(contextWidthPct("OFF", "BB", 20 as StackBucket, "VS_OPEN")).toBe(35.1);
    expect(contextWidthPct("OFF", "BB", 25 as StackBucket, "VS_OPEN")).toBe(52);
    expect(contextWidthPct("OFF", "BB", 50 as StackBucket, "VS_OPEN")).toBe(66.5);
  });

  it("defends wider as stacks deepen, at both ante settings", () => {
    for (const ante of ["OFF", "ON"] as AnteMode[]) {
      const shallow = contextWidthPct(ante, "BB", 20 as StackBucket, "VS_OPEN");
      const mid = contextWidthPct(ante, "BB", 25 as StackBucket, "VS_OPEN");
      const deep = contextWidthPct(ante, "BB", 50 as StackBucket, "VS_OPEN");
      expect(shallow, ante).not.toBeNull();
      expect(mid!, ante).toBeGreaterThan(shallow!);
      expect(deep!, ante).toBeGreaterThan(mid!);
    }
  });

  it("leaves the other defending seats flat where nothing was measured", () => {
    // Only the big blind has charts for how wide to defend by flatting and
    // three-betting. Giving the rest a curve would be inventing one, and a curve
    // nobody measured is worse than a flat range everybody can see is flat.
    //
    // Checked from 40BB up, which is where the re-jam sheets stop. Below that
    // these seats now do have a measured shove, and it takes hands out of the
    // calling range rather than sitting beside it - a hand that shoves at 20BB is
    // not also flatting there. So the flatness this guards is the deep end, where
    // there is still no measurement to justify a curve.
    for (const seat of ["LJ", "HJ", "CO", "BTN", "SB"] as Position[]) {
      const mid = contextWidthPct("OFF", seat, 40 as StackBucket, "VS_OPEN");
      for (const bucket of [100, 150] as StackBucket[]) {
        expect(contextWidthPct("OFF", seat, bucket, "VS_OPEN"), `${seat} ${bucket}BB`).toBe(mid);
      }
    }
  });
});

describe("re-jamming over an open", () => {
  const jamWidthPct = (position: Position, bucket: StackBucket): number => {
    const pack = allMttPreflopRangePacks.find((item) => (
      item.dimensions.tableFormat === "FULL_RING_9" &&
      item.dimensions.blindSpeed === "REGULAR" &&
      item.dimensions.ante === "OFF" &&
      item.records.length > 0
    ))!;
    const entry = createRangeStoreFromRangePack(pack)
      .lookup({ ante: "OFF", position, bucket, context: "VS_OPEN" });
    if (entry === undefined) return 0;
    const combos = Object.entries(entry.strict)
      .filter(([, actions]) => actions.includes("JAM"))
      .reduce((sum, [handClass]) => sum + COMBOS(handClass), 0);
    return Math.round(combos / 1326 * 1000) / 10;
  };

  it("offers a shove at all, which between 12 and 30BB it did not", () => {
    // The gap this closes. PUSH_FOLD stops at 12BB and VS_OPEN above it held only
    // CALL and 3BET, so at twenty big blinds - where the sheets make shoving the
    // main answer to an open - a player was being taught deep-stack shapes.
    for (const seat of ["LJ", "HJ", "CO", "BTN", "SB", "BB"] as Position[]) {
      for (const bucket of [15, 20, 25, 30] as StackBucket[]) {
        expect(jamWidthPct(seat, bucket), `${seat} ${bucket}BB`).toBeGreaterThan(0);
      }
    }
  });

  it("narrows as stacks deepen, because the colours are thresholds", () => {
    // Each hand carries the deepest stack at which it jams, so a deeper bucket
    // keeps strictly fewer hands. If this ever inverts, the colour-to-depth
    // mapping has been read upside down - which is the one way to get a complete,
    // confident range that is exactly backwards.
    for (const seat of ["HJ", "CO", "BTN", "SB", "BB"] as Position[]) {
      const depths = ([15, 20, 25, 30] as StackBucket[]).map((bucket) => jamWidthPct(seat, bucket));
      for (let index = 1; index < depths.length; index += 1) {
        expect(depths[index], `${seat} ${depths.join(" ")}`).toBeLessThanOrEqual(depths[index - 1]);
      }
    }
  });

  it("stops where the sheets stop rather than extrapolating", () => {
    // 30BB is the deepest threshold drawn. Carrying a jam to 40 would be inventing
    // a number the source does not contain, and the flat defence there is intact.
    for (const seat of ["LJ", "HJ", "CO", "BTN", "SB", "BB"] as Position[]) {
      expect(jamWidthPct(seat, 40 as StackBucket), seat).toBe(0);
      expect(jamWidthPct(seat, 100 as StackBucket), seat).toBe(0);
    }
  });

  it("shoves wider from later seats", () => {
    // Position buys width here as it does everywhere else. Stated as a property so
    // it keeps holding if the calibration opener is ever changed.
    for (const bucket of [15, 20] as StackBucket[]) {
      expect(jamWidthPct("BTN", bucket), `${bucket}BB`).toBeGreaterThan(jamWidthPct("LJ", bucket));
      expect(jamWidthPct("CO", bucket), `${bucket}BB`).toBeGreaterThan(jamWidthPct("LJ", bucket));
    }
  });

  it("three-bets the premiums instead of jamming them", () => {
    // The sheets' salmon band is "3bet /call", not a shove. It gets the same stack
    // in by the river but keeps worse hands in the pot, so treating it as a jam
    // would teach the wrong action with the right range.
    const pack = allMttPreflopRangePacks.find((item) => (
      item.dimensions.tableFormat === "FULL_RING_9" &&
      item.dimensions.blindSpeed === "REGULAR" &&
      item.dimensions.ante === "OFF" &&
      item.records.length > 0
    ))!;
    const entry = createRangeStoreFromRangePack(pack)
      .lookup({ ante: "OFF", position: "BB", bucket: 20 as StackBucket, context: "VS_OPEN" })!;
    for (const hand of ["AA", "KK", "AKs", "AKo"]) {
      expect(entry.strict[hand], hand).toContain("3BET");
      expect(entry.strict[hand], hand).not.toContain("JAM");
    }
  });
});

describe("calling a re-jam", () => {
  const CHARTED = ["UTG", "LJ", "CO", "BTN", "SB"] as Position[];

  it("answers a shove between 15 and 30BB, where there was no answer at all", () => {
    // VS_ALLIN held 5BB and 10BB and nothing above. An opener facing a shove at
    // twenty big blinds - which is now a shove we teach - had no range to consult.
    for (const seat of CHARTED) {
      for (const bucket of [15, 20, 25, 30] as StackBucket[]) {
        const width = contextWidthPct("OFF", seat, bucket, "VS_ALLIN");
        expect(width, `${seat} ${bucket}BB`).not.toBeNull();
        expect(width!, `${seat} ${bucket}BB`).toBeGreaterThan(0);
      }
    }
  });

  it("tightens as stacks deepen", () => {
    // Same thresholds as the shoving side, so the same shape: worse pot odds and a
    // stronger shoving range both argue for calling less as stacks grow.
    for (const seat of CHARTED) {
      const depths = ([15, 20, 25, 30] as StackBucket[])
        .map((bucket) => contextWidthPct("OFF", seat, bucket, "VS_ALLIN")!);
      for (let index = 1; index < depths.length; index += 1) {
        expect(depths[index], `${seat} ${depths.join(" ")}`).toBeLessThanOrEqual(depths[index - 1]);
      }
    }
  });

  it("meets the flat table at the seam rather than jumping", () => {
    // The 10BB ranges come from the shipped table and the 15BB ones from the
    // charts, by two entirely separate routes. They land within a few points of
    // each other, which is the closest thing to independent corroboration either
    // source has. A large step here means one of the two is being misread.
    for (const seat of CHARTED) {
      const ten = contextWidthPct("OFF", seat, 10 as StackBucket, "VS_ALLIN")!;
      const fifteen = contextWidthPct("OFF", seat, 15 as StackBucket, "VS_ALLIN")!;
      expect(Math.abs(ten - fifteen), `${seat}: 10BB ${ten}% vs 15BB ${fifteen}%`).toBeLessThan(5);
    }
  });

  it("leaves the uncharted seats empty instead of borrowing a neighbour's range", () => {
    // No sheet covers these. A call range taken from the seat next door would look
    // exactly as authoritative as a measured one and be wrong by an unknown amount.
    for (const seat of ["UTG+1", "UTG+2", "HJ", "BB"] as Position[]) {
      expect(contextWidthPct("OFF", seat, 20 as StackBucket, "VS_ALLIN"), seat).toBeNull();
    }
  });
});

describe("opening between ten and twenty big blinds", () => {
  function rfiWidthPct(position: Position, bucket: StackBucket, kind: "OPEN" | "JAM"): number {
    const pack = allMttPreflopRangePacks.find((item) => (
      item.dimensions.tableFormat === "FULL_RING_9" &&
      item.dimensions.blindSpeed === "REGULAR" &&
      item.dimensions.ante === "OFF" &&
      item.records.length > 0
    ))!;
    const entry = createRangeStoreFromRangePack(pack)
      .lookup({ ante: "OFF", position, bucket, context: "RFI" });
    if (entry === undefined) return 0;
    const combos = Object.entries(entry.strict)
      .filter(([, actions]) => actions.some((action) => (
        kind === "JAM" ? action === "JAM" : action.startsWith("OPEN")
      )))
      .reduce((sum, [handClass]) => sum + COMBOS(handClass), 0);
    return Math.round(combos / 1326 * 1000) / 10;
  }

  it("shoves the small pairs from late position at fifteen big blinds", () => {
    // The sheets do not draw one opening range at these depths. They draw a
    // raising band and three shove thresholds, and the threshold is the depth
    // *below* which the hand goes in - short of chips there is no fold equity to
    // play a flop with.
    expect(rfiWidthPct("BTN", 15 as StackBucket, "JAM")).toBe(1.8);
    expect(rfiWidthPct("CO", 15 as StackBucket, "JAM")).toBe(2.7);
  });

  it("moves those hands out of the raise rather than adding them", () => {
    // The point that makes this a strategy correction rather than a width one:
    // the total played stays exactly where it was, and only the action changes.
    for (const seat of ["BTN", "CO"] as Position[]) {
      const played = rfiWidthPct(seat, 15 as StackBucket, "OPEN")
        + rfiWidthPct(seat, 15 as StackBucket, "JAM");
      expect(Math.round(played * 10) / 10, seat).toBe(rfiWidthPct(seat, 20 as StackBucket, "OPEN"));
    }
  });

  it("stops shoving once the stack clears the deepest threshold", () => {
    // The deepest threshold any sheet draws is 20BB, so at 20 and above every
    // hand raises. Offering a shove past there would be teaching an action the
    // source never draws.
    for (const bucket of [20, 25, 50, 100] as StackBucket[]) {
      for (const seat of ["BTN", "CO"] as Position[]) {
        expect(rfiWidthPct(seat, bucket, "JAM"), `${seat} ${bucket}BB`).toBe(0);
      }
    }
  });

  it("leaves the seats whose sheets draw no shallow threshold alone", () => {
    // Early and middle position have no 20BB threshold on their grids, so they
    // raise their whole range at fifteen. Giving them a shove would be inventing
    // one the charts do not contain.
    for (const seat of ["UTG", "LJ", "HJ"] as Position[]) {
      expect(rfiWidthPct(seat, 15 as StackBucket, "JAM"), seat).toBe(0);
    }
  });
});

describe("big blind against a small-blind limp", () => {
  function actionWidthPct(bucket: StackBucket, action: ActionKey): number {
    const pack = allMttPreflopRangePacks.find((item) => (
      item.dimensions.tableFormat === "FULL_RING_9" &&
      item.dimensions.blindSpeed === "REGULAR" &&
      item.dimensions.ante === "OFF" &&
      item.records.length > 0
    ))!;
    const entry = createRangeStoreFromRangePack(pack)
      .lookup({ ante: "OFF", position: "BB", bucket, context: "VS_LIMP" });
    if (entry === undefined) return 0;
    const combos = Object.entries(entry.strict)
      .filter(([, actions]) => actions.includes(action))
      .reduce((sum, [handClass]) => sum + COMBOS(handClass), 0);
    return Math.round(combos / 1326 * 1000) / 10;
  }

  it("shoves over the limp while the stack is short, and stops when the chart does", () => {
    // The finding this replaced a flat range with: the raise width hardly moves
    // across the bands, so width was never the error. What it is made of is.
    expect(actionWidthPct(15 as StackBucket, "JAM")).toBe(20.5);
    expect(actionWidthPct(20 as StackBucket, "JAM")).toBe(9);
    expect(actionWidthPct(30 as StackBucket, "JAM")).toBe(0);
    expect(actionWidthPct(100 as StackBucket, "JAM")).toBe(0);
  });

  it("keeps the raise width nearly flat while the shove disappears into it", () => {
    // 16.4 + 20.5 at 15BB, 25.5 + 9.0 at 20BB, 38.5 + 0 at 30BB. A model with one
    // iso range per seat gets this total right at every depth and the strategy
    // wrong at two of them.
    for (const [bucket, expected] of [[15, 36.9], [20, 34.5], [30, 38.5]] as const) {
      const acting = actionWidthPct(bucket as StackBucket, "JAM")
        + actionWidthPct(bucket as StackBucket, "ISO_25X");
      expect(Math.round(acting * 10) / 10, `${bucket}BB`).toBe(expected);
    }
  });

  it("never folds a big blind that is already in for free", () => {
    // Every cell on the sheet is jam, raise or check, so the three actions have to
    // account for the whole grid. A fold appearing here would mean a misread legend.
    for (const bucket of [15, 20, 25, 30, 50, 100] as StackBucket[]) {
      const total = actionWidthPct(bucket, "JAM")
        + actionWidthPct(bucket, "ISO_25X")
        + actionWidthPct(bucket, "LIMP");
      expect(Math.round(total), `${bucket}BB`).toBe(100);
    }
  });
});

describe("push/fold, from the owner's baseline chart", () => {
  // The owner's Kompendium settles which source wins here. Section 4.2 reads
  // "Chart jako baseline. Chart upravuj podle ICM..." and embeds the push/fold
  // chart as its appendix, so the chart is the baseline and the RYE pushing
  // sheets are not. See Agents/reference-ranges/study-library.md.

  it("matches the chart exactly at both push/fold depths, ante on", () => {
    // The chart states 10 percent antes, so it is an ante-on source and these are
    // its printed widths. Each was checked against the chart's own percentage when
    // the shorthand was parsed, so a misreading cannot reach here quietly.
    for (const [seat, pct] of [["UTG", 14.6], ["LJ", 24.3], ["HJ", 29.7], ["CO", 33], ["BTN", 42.7], ["SB", 71.9]] as const) {
      expect(contextWidthPct("ON", seat as Position, 10 as StackBucket, "PUSH_FOLD"), `${seat} 10BB`).toBe(pct);
    }
    for (const [seat, pct] of [["UTG", 25.5], ["LJ", 33], ["HJ", 36.7], ["CO", 45.4], ["BTN", 50.5], ["SB", 84.9]] as const) {
      expect(contextWidthPct("ON", seat as Position, 5 as StackBucket, "PUSH_FOLD"), `${seat} 5BB`).toBe(pct);
    }
  });

  it("shoves the small blind at five big blinds, which the old table did not", () => {
    // The largest single correction the chart produced. The 5BB row was legacy
    // group data never measured against anything, and had the small blind at 57.2
    // percent where the chart shoves 84.9 - twenty-eight points, in a spot the
    // Kompendium calls the biggest source of spots there is.
    expect(contextWidthPct("ON", "SB", 5 as StackBucket, "PUSH_FOLD")).toBe(84.9);
  });

  it("never lets ante-off exceed the ante-on chart", () => {
    // The chart assumes antes, so it is a ceiling for ante-off rather than its
    // value: a smaller pot cannot justify a wider shove. Ante-off keeps whichever
    // is narrower, which is why it sits at or below every figure above.
    for (const bucket of [5, 10] as StackBucket[]) {
      for (const seat of ["UTG", "LJ", "HJ", "CO", "BTN", "SB"] as Position[]) {
        const off = contextWidthPct("OFF", seat, bucket, "PUSH_FOLD");
        const on = contextWidthPct("ON", seat, bucket, "PUSH_FOLD");
        expect(off, `${seat} ${bucket}BB`).not.toBeNull();
        expect(on!, `${seat} ${bucket}BB`).toBeGreaterThanOrEqual(off!);
      }
    }
  });

  it("widens as the stack shortens, at every seat", () => {
    // The property that makes push/fold push/fold: five big blinds shoves wider
    // than ten, everywhere, because there is less room to wait.
    for (const seat of ["UTG", "LJ", "HJ", "CO", "BTN", "SB"] as Position[]) {
      const shallow = contextWidthPct("ON", seat, 5 as StackBucket, "PUSH_FOLD");
      const deeper = contextWidthPct("ON", seat, 10 as StackBucket, "PUSH_FOLD");
      expect(shallow!, seat).toBeGreaterThan(deeper!);
    }
  });

  it("widens with position at both depths", () => {
    for (const bucket of [5, 10] as StackBucket[]) {
      const order: Position[] = ["UTG", "LJ", "HJ", "CO", "BTN"];
      for (let i = 1; i < order.length; i += 1) {
        const earlier = contextWidthPct("ON", order[i - 1], bucket, "PUSH_FOLD");
        const later = contextWidthPct("ON", order[i], bucket, "PUSH_FOLD");
        expect(later!, `${order[i]} vs ${order[i - 1]} at ${bucket}BB`).toBeGreaterThan(earlier!);
      }
    }
  });
});
