import { describe, expect, it } from "vitest";

import {
  describeInterruptions,
  summarizeInterruptions,
  type MachineEvent,
} from "../../scripts/lib/machineInterruptions.mts";

/**
 * Spal stroj během fáze cyklu?
 *
 * Události jsou skutečné, ze systémového logu rána 21. 10. 2026: fáze 1
 * hlásila 3,2x dražší cenu a příčina nebyla v cyklu - notebook šel ze zásuvky,
 * přecházel do úsporného režimu a od 7:45:56 do 8:58:24 spal.
 */
const POWER = "Microsoft-Windows-Kernel-Power";
const GENERAL = "Microsoft-Windows-Kernel-General";

const MORNING: MachineEvent[] = [
  { id: 105, provider: POWER },
  { id: 506, provider: POWER },
  // Synchronizace hodin: posun o zlomek sekundy, žádný spánek.
  { id: 1, provider: GENERAL, oldTime: "2026-10-21T05:10:22.9687955Z", newTime: "2026-10-21T05:10:22.9688022Z" },
  { id: 506, provider: POWER },
  { id: 42, provider: POWER },
  { id: 1, provider: GENERAL, oldTime: "2026-10-21T05:45:56.7619095Z", newTime: "2026-10-21T05:45:55.5000000Z" },
  // Probuzení: hodiny skočí o to, co stroj prospal.
  { id: 1, provider: GENERAL, oldTime: "2026-10-21T05:45:59.6908898Z", newTime: "2026-10-21T06:58:24.5000000Z" },
  { id: 506, provider: POWER },
];

describe("summarizeInterruptions", () => {
  it("spočítá usnutí, úsporný režim, napájení a prospaný čas ze skoku hodin", () => {
    expect(summarizeInterruptions(MORNING)).toEqual({
      sleeps: 1, standbys: 3, powerChanges: 1, sleptMinutes: 72.4,
    });
  });

  it("událost 1 od jiného poskytovatele není skok hodin", () => {
    const other = { id: 1, provider: "Microsoft-Windows-IsolatedUserMode" } as MachineEvent;
    expect(summarizeInterruptions([other])).toEqual({ sleeps: 0, standbys: 0, powerChanges: 0, sleptMinutes: 0 });
  });
});

describe("describeInterruptions", () => {
  it("klidná fáze nemá co hlásit, a cena se tak zapíše jako dosud", () => {
    expect(describeInterruptions(summarizeInterruptions([]))).toBeUndefined();
  });

  it("přerušená fáze řekne, co se stalo", () => {
    expect(describeInterruptions(summarizeInterruptions(MORNING)))
      .toBe("stroj během fáze 1x usnul (prospal 72 min), 3x přešel do úsporného režimu, 1x změnil napájení");
  });
});
