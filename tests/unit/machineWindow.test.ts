import { describe, expect, it } from "vitest";

import { machineWindow, workerCap } from "../../scripts/lib/machineWindow.mts";

/**
 * Kolik ze stroje si běh smí vzít.
 *
 * Majitel 15. 10. 2026: „pondělí až pátek 21 - 7, kdykoli o víkendu" na 100 %,
 * přes den ve všední den jen částečně. Do té doby okno znalo jen den a noc, takže
 * o víkendu přes den by si běh vzal polovinu jader stroje, který nikdo nepoužívá.
 */
describe("machineWindow", () => {
  // Měsíce v `Date` jsou od nuly: 9 je říjen. 19. 10. 2026 je pondělí.
  const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0, 0);

  it("všední den přes den je denní okno s polovinou jader", () => {
    expect(machineWindow(at(21, 12))).toBe("DEN");
    expect(workerCap(at(21, 12))).toBeLessThan(workerCap(at(21, 22)));
  });

  it("noc ve všední den je plná", () => {
    expect(machineWindow(at(21, 22))).toBe("NOC");
    expect(machineWindow(at(22, 3))).toBe("NOC");
  });

  it("víkend je plný celý den, i v poledne", () => {
    expect(machineWindow(at(24, 12))).toBe("VÍKEND");
    expect(machineWindow(at(25, 15))).toBe("VÍKEND");
    expect(workerCap(at(24, 12))).toBe(workerCap(at(21, 22)));
  });

  it("pondělí ráno před sedmou je ještě noc, po sedmé den", () => {
    expect(machineWindow(at(26, 6))).toBe("NOC");
    expect(machineWindow(at(26, 8))).toBe("DEN");
  });
});
