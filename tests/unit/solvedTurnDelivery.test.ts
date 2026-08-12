import { beforeAll, describe, expect, it } from "vitest";

import { buildMttPostflopTrainingRuntime } from "../../src/data/ranges/mttPostflopTrainingRuntime";
import { loadAllSolvedTurnPacks } from "../../src/data/ranges/turnSolvedStrategyPacks";
import type { EntitlementGrant } from "../../src/core/paymentEntitlements";
import type { TrainingProfile } from "../../src/core/trainingProfile";

/**
 * Vyřešený turn obsah se k hráči nedostal vůbec.
 *
 * Jedenáct rodin a 3 082 vyřešených turnů se dodává jako lazy chunky a stahuje
 * na začátku relace - a runtime se jich nikdy na nic nezeptal. Produkční větev
 * je nepustí, dokud není celý profil PRODUCTION, a pilotní katalog byl flopový,
 * takže turn dostal `PREVIEW_FALLBACK` a `resolver: null`. Obsah byl dosažitelný
 * jen měřicím skriptem, což zvenku vypadá stejně, jako by neexistoval.
 */
const profile: TrainingProfile = {
  gameVariant: "MTT",
  tableFormat: "FULL_RING_9",
  blindSpeed: "REGULAR",
  street: "TURN",
  evModel: "CHIP_EV",
  ante: "OFF",
  rakeMode: "NONE",
};

const grant: EntitlementGrant = {
  entitlement: "mtt.postflop.turn.solved.pilot",
  startsAt: "2020-01-01T00:00:00Z",
  endsAt: null,
  status: "ACTIVE",
};

describe("dodání vyřešeného turn obsahu", () => {
  beforeAll(async () => {
    await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
  });

  it("bez oprávnění obsah nevydá, ale řekne, že existuje", () => {
    const runtime = buildMttPostflopTrainingRuntime({ profile, grants: [] });
    expect(runtime.mode).toBe("LOCKED_PILOT");
    expect(runtime.resolver).toBeNull();
    // Zamčeno je něco jiného než nedostupné: hráč má vědět, že je co koupit.
    expect(runtime.missingEntitlements).toContain("mtt.postflop.turn.solved.pilot");
  });

  it("s oprávněním vydá resolver nad vyřešenými rodinami", () => {
    const runtime = buildMttPostflopTrainingRuntime({ profile, grants: [grant] });
    expect(runtime.mode).toBe("SCOPED_PILOT");
    expect(runtime.resolver).not.toBeNull();
    // Není to plné pokrytí a hláška to musí říct, jinak by SCOPED_PILOT znamenal
    // totéž co PRODUCTION.
    expect(runtime.reason).toContain("není to plné produkční pokrytí");
  });

  it("nezasahuje do flopu ani riveru", () => {
    for (const street of ["FLOP", "RIVER"] as const) {
      const runtime = buildMttPostflopTrainingRuntime({
        profile: { ...profile, street },
        grants: [grant],
      });
      // Turnové oprávnění nesmí odemknout jinou ulici.
      expect(runtime.activeEntitlements).not.toContain("mtt.postflop.turn.solved.pilot");
    }
  });
});

/**
 * Hláška, podle které se hráč rozhoduje, jestli si obsah koupí.
 *
 * Runtime umí vyřešený turn zamknout, ale hráč to musí poznat. Text o pilotech
 * mluvil vždycky o flopu, protože jiné piloty neexistovaly - a člověku, který si
 * vybral turn, by věta o flopových situacích neřekla nic. Zamčeno je něco jiného
 * než nedostupné a hláška to má rozlišit.
 */
describe("hláška u vyřešeného turnu", () => {
  it("zamčený turn mluví o turnu, ne o flopu", async () => {
    const { postflopRuntimeNotice } = await import("../../src/main");
    const turn = postflopRuntimeNotice({
      street: "TURN",
      hasScopedPilotCoverage: true,
      hasActivePilotEntitlement: false,
      productionReady: false,
    });
    expect(turn?.kind).toBe("LOCKED_PILOT");
    expect(turn?.text).toContain("turnové desky");
    expect(turn?.text).not.toContain("flop");

    // Flop musí zůstat, jak byl: hláška se dělí podle ulice, ne přepisuje.
    const flop = postflopRuntimeNotice({
      street: "FLOP",
      hasScopedPilotCoverage: true,
      hasActivePilotEntitlement: false,
      productionReady: false,
    });
    expect(flop?.text).toContain("flopové situace");
  });

  it("runtime rozliší zamčeno od nedostupného", () => {
    const locked = buildMttPostflopTrainingRuntime({ profile, grants: [] });
    const unlocked = buildMttPostflopTrainingRuntime({ profile, grants: [grant] });

    // Zamčeno: obsah existuje, jen k němu chybí licence.
    expect(locked.mode).toBe("LOCKED_PILOT");
    expect(locked.missingEntitlements.length).toBeGreaterThan(0);
    // Odemčeno: licence je aktivní a nic nechybí.
    expect(unlocked.mode).toBe("SCOPED_PILOT");
    expect(unlocked.missingEntitlements).toEqual([]);
  });
});

/**
 * Zaplatit za obsah nesmí znamenat přijít o funkci.
 *
 * Když turn dostal vlastní placený režim, začal nastavovat „runtime odmítá
 * heuristiku" globálně - a pravidlo pro hranou linku z toho vyvodilo, že se
 * linka nesmí spustit, protože flop a river vyřešené nejsou. Hráč bez oprávnění
 * tedy linku měl, hráč, který si obsah koupil, o ni přišel.
 */
describe("hraná linka u částečně vyřešeného obsahu", () => {
  it("jednotlivý spot zůstává přísný, linka smí sáhnout po heuristice", () => {
    // Dvě různé otázky, dvě různé odpovědi. Spot: hráč si vybral ulici a obsah
    // pro ni existuje, takže heuristika by byla podvod. Linka: prochází i ulice,
    // kde obsah není, a bez fallbacku by se nespustila vůbec.
    const runtime = buildMttPostflopTrainingRuntime({ profile, grants: [grant] });
    expect(runtime.allowFallback).toBe(false);
    expect(runtime.mode).toBe("SCOPED_PILOT");
  });
});

/**
 * Obsah, který si nikdo nemůže koupit, je stejně nedostupný jako obsah, který
 * neexistuje.
 *
 * Runtime umí vyřešený turn odemknout proti oprávnění - ale jen když je to
 * oprávnění v nějakém tieru. Kdyby v žádném nebylo, zůstal by `LOCKED_PILOT`
 * navždycky a celá cesta k hráči by byla teoretická.
 */
describe("dostupnost turn oprávnění v tierech", () => {
  it("odemyká PRO_PLUS a TEAM_COACH, ne FREE a PRO", async () => {
    const { TIER_ENTITLEMENTS } = await import("../../src/core/paymentEntitlements");
    const entitlement = "mtt.postflop.turn.solved.pilot";
    expect(TIER_ENTITLEMENTS.PRO_PLUS).toContain(entitlement);
    expect(TIER_ENTITLEMENTS.TEAM_COACH).toContain(entitlement);
    // Vyřešený obsah je to nejdražší, co se v produktu vyrábí; do základních
    // tierů nepatří, jinak není co prodávat.
    expect(TIER_ENTITLEMENTS.FREE).not.toContain(entitlement);
    expect(TIER_ENTITLEMENTS.PRO).not.toContain(entitlement);
  });

  it("tier, který oprávnění má, dostane od runtime resolver", async () => {
    const { grantsForTier } = await import("../../src/core/paymentEntitlements");
    const grants = grantsForTier("PRO_PLUS", { startsAt: "2020-01-01T00:00:00Z" });
    const runtime = buildMttPostflopTrainingRuntime({ profile, grants });
    expect(runtime.mode).toBe("SCOPED_PILOT");
    expect(runtime.resolver).not.toBeNull();
  });
});
