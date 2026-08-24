// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { evaluateActionEv, type ActionEvSet } from "../../src/core/actionEv";
import {
  formatActionEvBb,
  revealActionEvButtonBubbles,
  setActionEvButtonContent,
} from "../../src/ui/actionEvButtonBubbles";

type TestAction = "FOLD" | "CALL" | "3BET";

const actionEvs: ActionEvSet<TestAction> = {
  source: "SOLVER",
  unit: "BB",
  equivalentThresholdBb: 0.01,
  acceptableThresholdBb: 0.05,
  values: [
    { action: "FOLD", evBb: 0.1 },
    { action: "CALL", evBb: 0.204 },
    { action: "3BET", evBb: 0.21 },
  ],
};

describe("action EV button bubbles", () => {
  it("odkryje EV u kazde nabizene akce az po vyhodnoceni", () => {
    const buttons = actionEvs.values.map(({ action }) => {
      const button = document.createElement("button");
      button.dataset.action = action;
      setActionEvButtonContent(button, action);
      return button;
    });

    expect(buttons.every((button) => (
      button.querySelector<HTMLElement>(".action-ev-bubble")?.hidden === true
    ))).toBe(true);

    const evaluation = evaluateActionEv(actionEvs, "CALL");
    expect(evaluation).not.toBeNull();
    expect(revealActionEvButtonBubbles(buttons, actionEvs, evaluation ?? undefined)).toBe(3);

    expect(buttons.filter((button) => button.dataset.evAvailable === "true")).toHaveLength(3);
    expect(buttons.filter((button) => (
      button.querySelector(".action-ev-bubble--best") !== null
    ))).toHaveLength(2);
    expect(buttons.filter((button) => (
      button.querySelector(".action-ev-bubble--chosen") !== null
    ))).toHaveLength(1);
    expect(buttons[1].querySelector(".action-ev-bubble")?.textContent).toBe("EV +0.204 BB");
    expect(buttons[0].querySelector<HTMLElement>(".action-ev-bubble")?.dataset.evStrengthPct)
      .toBe("8");
    expect(buttons[1].querySelector<HTMLElement>(".action-ev-bubble")?.dataset.evStrengthPct)
      .toBe("100");
    expect(buttons[2].querySelector<HTMLElement>(".action-ev-bubble")?.dataset.evStrengthPct)
      .toBe("100");
    expect(buttons[1].querySelector(".action-ev-bubble__meter")).not.toBeNull();
    expect(buttons[1].querySelector(".action-ev-bubble__fill")).not.toBeNull();
    expect(buttons[1].getAttribute("aria-label")).toBe("CALL, EV +0.204 BB");
  });

  it("zobrazi vsechny ekvivalentne nejlepsi akce stejne plnym metrem", () => {
    const equivalent: ActionEvSet<TestAction> = {
      ...actionEvs,
      values: [
        { action: "FOLD", evBb: 0.201 },
        { action: "CALL", evBb: 0.204 },
        { action: "3BET", evBb: 0.21 },
      ],
    };
    const buttons = equivalent.values.map(({ action }) => {
      const button = document.createElement("button");
      button.dataset.action = action;
      setActionEvButtonContent(button, action);
      return button;
    });
    const evaluation = evaluateActionEv(equivalent, "CALL");

    expect(evaluation?.bestActions).toEqual(["FOLD", "CALL", "3BET"]);
    expect(revealActionEvButtonBubbles(buttons, equivalent, evaluation ?? undefined)).toBe(3);
    expect(buttons.map((button) => (
      button.querySelector<HTMLElement>(".action-ev-bubble")?.dataset.evStrengthPct
    ))).toEqual(["100", "100", "100"]);
  });

  it("zustane fail-closed pri vadnem EV setu", () => {
    // Neúplná sada se od 24. 8. 2026 **zobrazuje** - chybějící akci pojmenuje
    // vlastní bublina, viz test níž. Fail-closed zůstává pro sadu, která tvrdí
    // nesmysl: duplicitní akce vzniká slitím dvou velikostí sázky při překladu
    // a padlo na ní 104 z 300 riverových spotů.
    const buttons = actionEvs.values.map(({ action }) => {
      const button = document.createElement("button");
      button.dataset.action = action;
      setActionEvButtonContent(button, action);
      return button;
    });
    const broken = {
      ...actionEvs,
      values: [...actionEvs.values, { action: "CALL" as TestAction, evBb: 9 }],
    };
    const evaluation = evaluateActionEv(actionEvs, "CALL");

    expect(revealActionEvButtonBubbles(buttons, broken, evaluation ?? undefined)).toBe(0);
    expect(buttons.every((button) => button.dataset.evAvailable === "false")).toBe(true);
    expect(buttons.every((button) => (
      button.querySelector<HTMLElement>(".action-ev-bubble")?.hidden === true
    ))).toBe(true);
    expect(buttons.every((button) => (
      button.querySelector<HTMLElement>(".action-ev-bubble")?.dataset.evStrengthPct === undefined
    ))).toBe(true);
  });

  it("odkryje EV i u zdrojů, které aplikace doopravdy vyrábí", () => {
    // Tenhle test tu chyběl a stálo to celou funkci. Bubliny procházely bránou
    // pro import packů, která vyžaduje `SOLVER` - jenže push/fold EV se počítá
    // za běhu a nese `ALL_IN_EQUITY`, riverová `SOLVED_TREE`. Obojí brána
    // zahazovala, takže hráč neviděl **žádné** EV, přestože se podle ní
    // známkovalo. Fixtura výš má `SOLVER`, takže o tom mlčela.
    for (const source of ["ALL_IN_EQUITY", "SOLVED_TREE"] as const) {
      const set: ActionEvSet<TestAction> = { ...actionEvs, source };
      const buttons = set.values.map(({ action }) => {
        const button = document.createElement("button");
        button.dataset.action = action;
        setActionEvButtonContent(button, action);
        return button;
      });
      const evaluation = evaluateActionEv(set, "CALL");
      expect(revealActionEvButtonBubbles(buttons, set, evaluation ?? undefined), source).toBe(3);
      expect(buttons.every((button) => button.dataset.evAvailable === "true"), source).toBe(true);
    }
  });

  it("akci, kterou solve nepočítal, pojmenuje místo aby ji nechala prázdnou", () => {
    // Prázdné místo vedle čísel se čte jako „tahle akce nemá cenu", a to je
    // nepravda jiného druhu než chybějící údaj. Solve nemusí obsahovat akci,
    // kterou trenažér nabízí - typicky zvýšení tam, kde solver žádnou větev se
    // zvýšením nepočítal.
    const partial: ActionEvSet<TestAction> = {
      ...actionEvs,
      source: "SOLVED_TREE",
      values: actionEvs.values.filter((item) => item.action !== "3BET"),
    };
    const buttons = actionEvs.values.map(({ action }) => {
      const button = document.createElement("button");
      button.dataset.action = action;
      setActionEvButtonContent(button, action);
      return button;
    });
    const evaluation = evaluateActionEv(partial, "CALL");
    // Vrací se počet akcí s hodnotou, ne počet tlačítek.
    expect(revealActionEvButtonBubbles(buttons, partial, evaluation ?? undefined)).toBe(2);

    const missing = buttons.find((button) => button.dataset.action === "3BET")!;
    expect(missing.dataset.evAvailable).toBe("unsolved");
    const bubble = missing.querySelector<HTMLElement>(".action-ev-bubble")!;
    expect(bubble.hidden, "chybějící hodnota musí být vidět, ne schovaná").toBe(false);
    expect(bubble.textContent).toContain("nespočítána");
    expect(bubble.dataset.evUnsolved).toBe("true");
    // A nesmí předstírat číslo.
    expect(bubble.dataset.evBb).toBeUndefined();

    const known = buttons.find((button) => button.dataset.action === "CALL")!;
    expect(known.dataset.evAvailable).toBe("true");
  });

  it("bez vyhodnocení čísla nezmizí, jen se neoznačí nejlepší", () => {
    // Vyhodnocení chybí právě tehdy, když hráč zvolil akci, kterou rozbor
    // nemodeluje - a to je nejhorší chvíle EV schovat: zvolil něco, o čem nic
    // nevíme, a chce vidět, co byly ostatní možnosti hodné. Dokud se volba
    // nepředávala zvlášť, zmizela v tu chvíli všechna čísla, i ta, která máme.
    const partial: ActionEvSet<TestAction> = {
      ...actionEvs,
      source: "SOLVED_TREE",
      values: actionEvs.values.filter((item) => item.action !== "3BET"),
    };
    const buttons = actionEvs.values.map(({ action }) => {
      const button = document.createElement("button");
      button.dataset.action = action;
      setActionEvButtonContent(button, action);
      return button;
    });

    expect(revealActionEvButtonBubbles(buttons, partial, undefined, "3BET")).toBe(2);
    const call = buttons.find((button) => button.dataset.action === "CALL")!;
    expect(call.dataset.evAvailable).toBe("true");
    expect(call.querySelector(".action-ev-bubble")?.textContent).toContain("EV");
    // Bez vyhodnocení se nic neoznačí za nejlepší - to by bylo tvrzení navíc.
    expect(buttons.some((button) => button.querySelector(".action-ev-bubble--best"))).toBe(false);
    // Zvolená akce se pozná i tak.
    const chosen = buttons.find((button) => button.dataset.action === "3BET")!;
    expect(chosen.dataset.evAvailable).toBe("unsolved");
  });

  it("formatuje kladne, zaporne i nulove BB hodnoty stabilne", () => {
    expect(formatActionEvBb(0.2044)).toBe("+0.204");
    expect(formatActionEvBb(-0.006)).toBe("-0.006");
    expect(formatActionEvBb(0)).toBe("0.000");
  });
});
