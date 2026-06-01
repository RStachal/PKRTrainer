import { describe, expect, it } from "vitest";

import { POSITION_ORDER } from "../../src/core/types";
import { buildSeatModel, effectiveStackBB, seatByPosition } from "../../src/core/seatModel";

describe("seatModel", () => {
  it("sestavi 9-max model s jednim sedadlem pro kazdou dnesni pozici", () => {
    const model = buildSeatModel({ format: "FULL_RING_9", heroPosition: "BTN" });

    expect(model.tableSize).toBe(9);
    expect(model.seats.map((seat) => seat.position)).toEqual(POSITION_ORDER);
    expect(new Set(model.seats.map((seat) => seat.position)).size).toBe(9);
    expect(model.seats.filter((seat) => seat.isHero)).toHaveLength(1);
    expect(seatByPosition(model, "BTN").isButton).toBe(true);
    expect(seatByPosition(model, "SB").isSmallBlind).toBe(true);
    expect(seatByPosition(model, "BB").isBigBlind).toBe(true);
  });

  it("sestavi 6-max model s kanonickymi pozicemi", () => {
    const model = buildSeatModel({ format: "SIX_MAX", heroPosition: "CO" });

    expect(model.tableSize).toBe(6);
    expect(model.seats.map((seat) => seat.position)).toEqual([
      "UTG",
      "HJ",
      "CO",
      "BTN",
      "SB",
      "BB",
    ]);
    expect(seatByPosition(model, "CO").isHero).toBe(true);
  });

  it("podporuje stacky po pozicich a pocita efektivni stack", () => {
    const model = buildSeatModel({
      format: "FULL_RING_9",
      heroPosition: "HJ",
      defaultStackBB: 40,
      stacksBB: {
        HJ: 18,
        BB: 32,
      },
    });

    expect(seatByPosition(model, "UTG").stackBB).toBe(40);
    expect(seatByPosition(model, "HJ").stackBB).toBe(18);
    expect(seatByPosition(model, "BB").stackBB).toBe(32);
    expect(effectiveStackBB(model, "HJ", "BB")).toBe(18);
  });

  it("odmitne hero pozici mimo zvoleny format", () => {
    expect(() => buildSeatModel({
      format: "SIX_MAX",
      heroPosition: "UTG+1",
    })).toThrow(/not valid for SIX_MAX/);
  });
});
