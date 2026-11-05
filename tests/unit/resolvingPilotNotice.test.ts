// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { grantsForTier } from "../../src/core/paymentEntitlements";
import { buildMttPostflopTrainingRuntime } from "../../src/data/ranges/mttPostflopTrainingRuntime";
import {
  findMttPostflopPilotRuntimeEntry,
  resolvingMttPostflopPilotScopes,
} from "../../src/data/ranges/mttPostflopPilotRuntime";
import type { TrainingProfile } from "../../src/core/trainingProfile";
import { renderPostflopView } from "../../src/ui/postflopView";
import { CS } from "../../src/ui/cs";

/**
 * Co uvidí platící hráč v pilotu, který se přesolvuje (odpověď vlastníka 4a,
 * 22. 9. 2026).
 *
 * Rozhodnutí 9a dalo šesti pilotům `LOW`, protože je čtenář odmítl, a resolver
 * na `LOW` neodpovídá. Řetěz je fail-close: spot se nerozdá, heuristika
 * nepřijde. Zbývala poslední věc - aby hráč nedostal obecnou větu o chybějící
 * produkci, která by na tu situaci byla nepravdivá: obsah existuje, jen se
 * přesolvuje.
 */

const profile: TrainingProfile = {
  gameVariant: "MTT",
  tableFormat: "FULL_RING_9",
  blindSpeed: "REGULAR",
  street: "FLOP",
  evModel: "CHIP_EV",
  ante: "OFF",
  rakeMode: "NONE",
};

function paidRuntime() {
  return buildMttPostflopTrainingRuntime({
    profile,
    grants: grantsForTier("PRO_PLUS", { startsAt: "2026-07-08T00:00:00.000Z" }),
    now: "2026-07-08T12:00:00.000Z",
  });
}

function renderAndGenerate(positionPattern: string): HTMLElement {
  const runtime = paidRuntime();
  const root = document.createElement("div");
  document.body.appendChild(root);
  renderPostflopView(root, {
    initialSeed: 1,
    initialStreet: "FLOP",
    initialPotType: "SINGLE_RAISED",
    initialActionNode: "SINGLE_RAISED_POT_CBET",
    initialPotBB: 6,
    initialEffectiveStackBB: 40,
    initialPositionContext: {
      heroPosition: positionPattern.includes("BTN") ? "BTN" : "UTG",
      villainPosition: "BB",
      aggressorPosition: positionPattern.includes("BTN") ? "BTN" : "UTG",
      callerPosition: "BB",
      inPosition: positionPattern.includes("BTN"),
      callerType: "BIG_BLIND",
      positionPattern,
    } as never,
    strategyResolver: (input) => runtime.resolver?.(input) ?? null,
    allowFallback: runtime.allowFallback,
  });
  root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
  return root;
}

describe("pilot, který se přesolvuje", () => {
  it("seznam mlčících pilotů jsou právě ty s LOW", () => {
    const scopes = resolvingMttPostflopPilotScopes();
    expect(scopes.length).toBeGreaterThan(0);
    for (const scope of scopes) {
      expect(findMttPostflopPilotRuntimeEntry(scope)?.packEntry.pack.confidence, scope).toBe("LOW");
    }
    expect(scopes).toContain("BTN_vs_BB_SRP_FLOP_CBET");
    expect(scopes).not.toContain("UTG_vs_BB_SRP_FLOP_CBET");
  });

  it("místo spotu řekne, že se pilot přesolvuje - ne že chybí produkce", () => {
    const root = renderAndGenerate("SRP_BTN_VS_BB");
    const notice = root.querySelector<HTMLElement>(".postflop-unavailable");
    expect(notice, "odmítnutí se vykreslilo").not.toBeNull();
    expect(notice?.dataset.reason).toBe("PILOT_RESOLVING");
    // Text se bere z katalogu, ne opsaný do testu: jazyk se přepíná a věta se
    // bude ladit, ale musí to být **ta** věta, ne obecná o chybějící produkci.
    expect(notice?.textContent).toBe(CS.postflop.unavailableResolvingPilot);
    expect(notice?.textContent).not.toBe(CS.postflop.unavailable);
  });

  it("přijatý pilot spot rozdá, takže žádné odmítnutí nepadne", () => {
    const root = renderAndGenerate("SRP_UTG_VS_BB");
    expect(root.querySelector(".postflop-unavailable")).toBeNull();
  });
});
