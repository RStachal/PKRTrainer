// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { POSITION_ORDER, type Spot, type TableState } from "../../src/core/types";
import { preflopFocusSeat, preflopTablePlayers } from "../../src/core/villain/tableCast";
import { setAppLanguage } from "../../src/ui/cs";
import { avatarName, playerAvatar } from "../../src/ui/kit/avatar";
import { AVATAR_ART } from "../../src/ui/kit/avatarArt";
import { pokerTable } from "../../src/ui/kit/pokerTable";

afterEach(() => {
  setAppLanguage("CZ");
  document.body.innerHTML = "";
});

const tableState = (overrides: Partial<TableState> = {}): TableState => ({
  heroPos: "BTN",
  pushFold: false,
  effectiveStackBB: 25,
  limpsBefore: 0,
  callsBefore: 0,
  facing: "OPEN",
  isBvB: false,
  vsSeat: "CO",
  ...overrides,
});

const spot = (overrides: Partial<TableState> = {}): Spot => ({
  id: "VS_OPEN|BTN|25|AKs|ON|CO",
  context: "VS_OPEN",
  heroPos: "BTN",
  effStack: 25,
  ante: "ON",
  pushFold: false,
  hand: "AKs",
  heroCards: [{ rank: "A", suit: "s" }, { rank: "K", suit: "s" }],
  tableState: tableState(overrides),
  answers: [{ key: "FOLD", label: "Fold" }, { key: "CALL", label: "Call" }, { key: "3BET", label: "3-bet" }],
  correctKeys: ["CALL"],
  strictCorrect: ["CALL"],
  explanation: "Test.",
  startingPot: 2.5,
});

describe("avatar hráče", () => {
  it("má kresbu pro každý typ, žeton GTO i hráče", () => {
    expect(Object.keys(AVATAR_ART).sort()).toEqual(["DICE", "EAGLE", "GTO", "HERO", "ROCK", "SHARK", "WHALE"]);
    for (const [kind, art] of Object.entries(AVATAR_ART)) {
      // Nic ze sítě: kresba odkazuje jen na vlastní gradienty.
      expect(art, kind).not.toMatch(/https?:|href=/);
      expect(art.match(/url\(#av-[a-z-]+\)/g)?.length ?? 0, kind).toBeGreaterThan(0);
    }
  });

  it("dva stejné avatary nesdílejí identifikátory gradientů", () => {
    const first = playerAvatar(document, { kind: "WHALE" });
    const second = playerAvatar(document, { kind: "WHALE" });
    const ids = (node: HTMLElement) => [...node.querySelectorAll("[id]")].map((item) => item.id);
    const shared = ids(first).filter((id) => ids(second).includes(id));
    expect(ids(first).length).toBeGreaterThan(3);
    expect(shared).toEqual([]);
    // A odkazy uvnitř míří na vlastní gradienty, ne na cizí.
    const ownIds = new Set(ids(first));
    const refs = [...first.innerHTML.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1]);
    expect(refs.every((ref) => ownIds.has(ref))).toBe(true);
  });

  it("žeton GTO nese pozici a stav jde do atributu", () => {
    const chip = playerAvatar(document, { kind: "GTO", label: "UTG+1", state: "focus" });
    expect(chip.querySelector("text")?.textContent).toBe("UTG+1");
    expect(chip.dataset.state).toBe("focus");
    expect(chip.dataset.kind).toBe("GTO");
    // Bez jména je to ozdoba; stůl dává čtečce jeden popis celé situace.
    expect(chip.getAttribute("aria-hidden")).toBe("true");
  });

  it("s jménem je to obrázek pro čtečku", () => {
    const named = playerAvatar(document, { kind: "SHARK", accessibleName: avatarName("SHARK") });
    expect(named.getAttribute("role")).toBe("img");
    expect(named.getAttribute("aria-label")).toBe("Žralok");
    setAppLanguage("EN");
    expect(avatarName("DICE")).toBe("Gambler");
    expect(avatarName("GTO", "CO")).toBe("Position CO");
    expect(avatarName("HERO")).toBe("You");
  });

  it("pozici v žetonu nepustí jako HTML", () => {
    const chip = playerAvatar(document, { kind: "GTO", label: "<b>x</b>" });
    expect(chip.querySelector("b")).toBeNull();
    expect(chip.querySelector("text")?.textContent).toBe("<b>x</b>");
  });
});

describe("stůl s hráči", () => {
  it("bez hráčů kreslí jen štítky, jako dřív", () => {
    const table = pokerTable(document, spot(), "ON");
    expect(table.querySelector(".dx-avatar")).toBeNull();
  });

  it("v GTO má každé sedadlo žeton s pozicí", () => {
    const table = pokerTable(document, spot(), "ON", POSITION_ORDER, preflopTablePlayers(spot(), { mode: "GTO" }));
    const avatars = [...table.querySelectorAll<HTMLElement>(".dx-table__seat .dx-avatar")];
    expect(avatars).toHaveLength(9);
    expect(avatars.every((avatar) => avatar.dataset.kind === "GTO")).toBe(true);
    expect(table.querySelector<HTMLElement>('.dx-table__seat[data-position="CO"] text')?.textContent).toBe("CO");
    // Soupeř ve hře má bílý lem, hráč zelený.
    expect(table.querySelector<HTMLElement>('.dx-table__seat[data-position="CO"] .dx-avatar')?.dataset.state).toBe("focus");
    expect(table.querySelector<HTMLElement>('.dx-table__seat[data-position="BTN"] .dx-avatar')?.dataset.state).toBe("active");
  });

  it("v REAL sedí u stolu typy hráčů a soupeř ve hře je zvolený typ", () => {
    const players = preflopTablePlayers(spot(), { mode: "REAL", focus: "WHALE" });
    const table = pokerTable(document, spot(), "ON", POSITION_ORDER, players);
    const kinds = [...table.querySelectorAll<HTMLElement>(".dx-table__seat")].map((seat) => seat.dataset.player);
    expect(kinds.filter((kind) => kind === "HERO")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "GTO")).toHaveLength(0);
    const villain = table.querySelector<HTMLElement>('.dx-table__seat[data-position="CO"]');
    expect(villain?.dataset.player).toBe("WHALE");
    expect(villain?.dataset.focus).toBe("true");
    // Na desktopu „Velryba · CO“; na telefonu jméno typu skryje CSS.
    expect(villain?.querySelector(".dx-table__who")?.textContent).toBe("Velryba · ");
    expect(villain?.querySelector(".dx-table__pos")?.textContent).toBe("Velryba · CO");
    expect(table.querySelector<HTMLElement>('.dx-table__seat[data-position="BTN"] .dx-table__pos')?.textContent)
      .toBe("BTN · ty");
  });

  it("tentýž spot má tentýž stůl", () => {
    const first = preflopTablePlayers(spot(), { mode: "REAL" });
    const second = preflopTablePlayers(spot(), { mode: "REAL" });
    expect(first.cast).toEqual(second.cast);
    expect(first.cast.BTN).toBeUndefined();
  });

  it("soupeř ve hře je jmenovaný soupeř, jinak poslední agresor", () => {
    expect(preflopFocusSeat(spot())).toBe("CO");
    const firstIn = spot({ facing: "NONE", vsSeat: undefined });
    expect(preflopFocusSeat(firstIn)).toBeUndefined();
    // Živý stůl tam soupeře ve hře nemá, trénink proti typu ho posadí na big blind.
    expect(preflopTablePlayers(firstIn, { mode: "REAL" }).focusSeat).toBeUndefined();
    const focused = preflopTablePlayers(firstIn, { mode: "REAL", focus: "WHALE" });
    expect(focused.focusSeat).toBe("BB");
    expect(focused.cast.BB).toBe("WHALE");
    expect(preflopTablePlayers(firstIn, { mode: "GTO", focus: "WHALE" }).focusSeat).toBeUndefined();
  });
});
