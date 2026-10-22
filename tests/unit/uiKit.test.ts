// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { setAppLanguage } from "../../src/ui/cs";
import { outcomeChip, type OutcomeChipKind } from "../../src/ui/kit/outcomeChip";
import { playingCard } from "../../src/ui/kit/playingCard";
import { segmentedControl } from "../../src/ui/kit/segmentedControl";
import { strategyBar } from "../../src/ui/kit/strategyBar";

afterEach(() => {
  setAppLanguage("CZ");
  document.body.innerHTML = "";
});

describe("čip verdiktu", () => {
  const kinds: OutcomeChipKind[] = ["BEST", "CORRECT", "EQUIVALENT", "ACCEPTABLE", "MISTAKE", "UNSOLVED"];

  it("má pro každý verdikt vlastní třídu, ikonu a text", () => {
    const chips = kinds.map((kind) => outcomeChip(document, kind));
    expect(new Set(chips.map((chip) => chip.className)).size).toBe(kinds.length);
    // Tvar ikony, ne jen barva - jinak by barvoslepý hráč verdikty nerozlišil.
    const shapes = chips.map((chip) => chip.querySelector("path")?.getAttribute("d"));
    expect(new Set(shapes).size).toBe(kinds.length);
    for (const chip of chips) {
      expect(chip.textContent?.trim()).not.toBe("");
      expect(chip.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("mluví jazykem aplikace", () => {
    expect(outcomeChip(document, "ACCEPTABLE").textContent).toBe("Přijatelná");
    setAppLanguage("EN");
    expect(outcomeChip(document, "ACCEPTABLE").textContent).toBe("Acceptable");
  });
});

describe("pruh strategie", () => {
  it("převede podíly na šířky a vynechá nulové", () => {
    const bar = strategyBar(document, [
      { label: "Bet 33 %", share: 2, color: "#f5b544" },
      { label: "Check", share: 1, color: "#2fb482" },
      { label: "Bet 75 %", share: 1, color: "#f07a3a" },
      { label: "All-in", share: 0, color: "#cc3440" },
      { label: "Fold", share: Number.NaN, color: "#3a3f4b" },
    ]);
    const segments = [...bar.querySelectorAll<HTMLElement>(".dx-strategy-bar__segment")];
    expect(segments.map((segment) => segment.style.width)).toEqual(["50%", "25%", "25%"]);
    expect(segments[0].style.getPropertyValue("--action-accent")).toBe("#f5b544");
  });

  it("řekne čtečce totéž, co ukazuje", () => {
    const bar = strategyBar(document, [
      { label: "Bet 33 %", share: 0.64, color: "#f5b544" },
      { label: "Check", share: 0.36, color: "#2fb482" },
    ]);
    expect(bar.getAttribute("role")).toBe("img");
    expect(bar.getAttribute("aria-label")).toBe("Strategie: Bet 33 % 64 %, Check 36 %");
  });

  it("bez dat to přizná, místo prázdného pruhu", () => {
    const bar = strategyBar(document, []);
    expect(bar.children).toHaveLength(0);
    expect(bar.getAttribute("aria-label")).toBe("Strategie: bez dat");
  });
});

describe("hrací karta", () => {
  it("ukazuje hodnotu a barvu a čtečce říká jméno karty", () => {
    const card = playingCard(document, { rank: "K", suit: "c" });
    expect(card.className).toBe("dx-card dx-card--c");
    expect(card.querySelector(".dx-card__rank")?.textContent).toBe("K");
    expect(card.querySelector(".dx-card__suit")?.textContent).toBe("♣");
    expect(card.getAttribute("aria-label")).toBe("křížový král");
  });

  it("skloňuje podle rodu a píše desítku jako na kartě", () => {
    expect(playingCard(document, { rank: "A", suit: "d" }).getAttribute("aria-label")).toBe("kárové eso");
    const ten = playingCard(document, { rank: "T", suit: "h" }, "lg");
    expect(ten.getAttribute("aria-label")).toBe("srdcová desítka");
    expect(ten.querySelector(".dx-card__rank")?.textContent).toBe("10");
    expect(ten.className).toBe("dx-card dx-card--lg dx-card--h");
  });

  it("v angličtině mluví anglicky", () => {
    setAppLanguage("EN");
    expect(playingCard(document, { rank: "Q", suit: "s" }).getAttribute("aria-label")).toBe("Queen of spades");
  });
});

describe("přepínač", () => {
  function build(onChange = vi.fn()) {
    const control = segmentedControl(document, {
      label: "Ulice",
      options: [
        { value: "PREFLOP", label: "Preflop" },
        { value: "FLOP", label: "Flop" },
        { value: "TURN", label: "Turn" },
      ],
      value: "FLOP",
      onChange,
    });
    document.body.appendChild(control.element);
    const options = [...control.element.querySelectorAll<HTMLButtonElement>("[role=radio]")];
    return { control, options, onChange };
  }

  const checked = (options: HTMLButtonElement[]) =>
    options.filter((option) => option.getAttribute("aria-checked") === "true").map((option) => option.dataset.value);

  it("je skupina přepínačů s jedinou zvolenou položkou v tabulátoru", () => {
    const { control, options } = build();
    expect(control.element.getAttribute("role")).toBe("radiogroup");
    expect(control.element.getAttribute("aria-label")).toBe("Ulice");
    expect(checked(options)).toEqual(["FLOP"]);
    expect(options.map((option) => option.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("kliknutí vybere a ohlásí změnu, opakované kliknutí nic neohlásí", () => {
    const { options, onChange } = build();
    options[2].click();
    options[2].click();
    expect(checked(options)).toEqual(["TURN"]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("TURN");
  });

  it("šipky posouvají výběr i zaměření a na konci přetečou", () => {
    const { options, onChange } = build();
    options[1].focus();
    options[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(checked(options)).toEqual(["TURN"]);
    expect(document.activeElement).toBe(options[2]);
    options[2].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(checked(options)).toEqual(["PREFLOP"]);
    options[0].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(checked(options)).toEqual(["TURN"]);
    expect(onChange.mock.calls.map((call) => call[0])).toEqual(["TURN", "PREFLOP", "TURN"]);
  });

  it("nastavení zvenku změnu neohlašuje", () => {
    const { control, options, onChange } = build();
    control.setValue("PREFLOP");
    expect(checked(options)).toEqual(["PREFLOP"]);
    expect(onChange).not.toHaveBeenCalled();
  });
});
