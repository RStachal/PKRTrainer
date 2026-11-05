import {
  VILLAIN_ARCHETYPES,
  isVillainArchetype,
  type TrainingMode,
  type VillainArchetype,
} from "../../core/villain/archetypes";
import { GTO_PLAYERS, type PlayerSettings } from "../../core/villain/tableCast";
import { localizedText } from "../cs";
import { playerAvatar } from "../kit/avatar";
import { archetypeName, archetypeSummary } from "../villainText";

/**
 * Volba režimu před vstupem do trenéra (Agents/plan-gto-real-2026-11.md, 3.1):
 * dvě velké karty GTO a REAL a v REAL řada soupeřů. Tím se produkt liší od
 * konkurence, proto je to první věc, kterou hráč na startu vidí. Volba se pamatuje.
 *
 * Karty jsou nativní přepínače v popiscích: šipky, tabulátor i čtečka fungují
 * bez vlastní obsluhy kláves.
 */

/** Živý stůl: žádný jmenovaný soupeř. */
const LIVE_TABLE = "";

export const PLAYER_CHOICE_STORAGE_KEY = "pkrtrainer.ui.player-choice.v1";

/** Uložená volba; cokoli poškozeného je GTO, ať start nikdy nespadne. */
export function loadPlayerChoice(storage: Pick<Storage, "getItem"> | null | undefined): PlayerSettings {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(PLAYER_CHOICE_STORAGE_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) return GTO_PLAYERS;
    const { mode, focus } = parsed as { mode?: unknown; focus?: unknown };
    if (mode !== "REAL") return GTO_PLAYERS;
    return isVillainArchetype(focus) ? { mode, focus } : { mode };
  } catch {
    return GTO_PLAYERS;
  }
}

/** Bez úložiště se volba jen nezapamatuje; trénink kvůli tomu nesmí selhat. */
export function savePlayerChoice(
  storage: Pick<Storage, "setItem"> | null | undefined,
  settings: PlayerSettings,
): void {
  try {
    storage?.setItem(PLAYER_CHOICE_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Plné nebo zakázané úložiště.
  }
}

export interface ModePicker {
  element: HTMLElement;
  /** Zvolený režim; soupeř jen v REAL, v GTO je soupeřem rovnováha. */
  settings(): PlayerSettings;
  /** Nastaví volbu bez ohlášení změny, například při tréninku na slabém místě. */
  setSettings(settings: PlayerSettings): void;
}

function span(doc: Document, className: string, text?: string): HTMLSpanElement {
  const node = doc.createElement("span");
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function radio(doc: Document, className: string, name: string, value: string): HTMLInputElement {
  const input = doc.createElement("input");
  input.type = "radio";
  input.className = className;
  input.name = name;
  input.value = value;
  return input;
}

let serial = 0;

export function createModePicker(
  doc: Document,
  initial: PlayerSettings,
  onChange: (settings: PlayerSettings) => void,
): ModePicker {
  // Vlastní jména skupin: stejné jméno by spojilo přepínače dvou vykreslení.
  serial += 1;
  const modeGroup = `dx-mode-${serial}`;
  const opponentGroup = `dx-opponent-${serial}`;

  const element = doc.createElement("div");
  element.className = "dx-mode-picker";

  const modes = doc.createElement("div");
  modes.className = "dx-modes";
  modes.setAttribute("role", "radiogroup");
  modes.setAttribute("aria-label", localizedText("Training mode", "Režim tréninku"));

  const modeCard = (
    mode: TrainingMode,
    art: readonly HTMLElement[],
    text: string,
    note?: string,
  ): { card: HTMLLabelElement; input: HTMLInputElement } => {
    const card = doc.createElement("label");
    card.className = "dx-mode";
    card.dataset.mode = mode;
    const input = radio(doc, "dx-mode__input filter-mode", modeGroup, mode);
    const artBox = span(doc, "dx-mode__art");
    artBox.append(...art);
    const body = span(doc, "dx-mode__body");
    body.append(span(doc, "dx-mode__name", mode), span(doc, "dx-mode__text", text));
    if (note !== undefined) body.append(span(doc, "dx-mode__note", note));
    card.append(input, artBox, body);
    return { card, input };
  };

  const gto = modeCard(
    "GTO",
    [playerAvatar(doc, { kind: "GTO", label: "GTO" })],
    localizedText(
      "Equilibrium. Graded by the solver and charts; the table shows positions only.",
      "Rovnováha. Hodnocení podle solveru a chartů, u stolu jen pozice.",
    ),
  );
  const real = modeCard(
    "REAL",
    VILLAIN_ARCHETYPES.map((kind) => playerAvatar(doc, { kind })),
    localizedText(
      "Player types at the table: shark, eagle, rock, gambler and whale.",
      "U stolu sedí typy hráčů: žralok, orel, kámen, kostka a velryba.",
    ),
    // Dokud je to pravda, musí to tu stát: slibovat víc by byla lež.
    localizedText(
      "Preflop is graded against the type; limps, squeezes and postflop still follow GTO.",
      "Preflop se hodnotí proti typu; limpy, squeeze a postflop zatím podle GTO.",
    ),
  );
  modes.append(gto.card, real.card);

  const opponents = doc.createElement("fieldset");
  opponents.className = "dx-opponents";
  const legend = doc.createElement("legend");
  legend.className = "dx-opponents__legend";
  legend.textContent = localizedText("Opponent in the hand", "Soupeř ve hře");
  const grid = doc.createElement("div");
  grid.className = "dx-opponents__grid";
  const hint = doc.createElement("p");
  hint.className = "dx-opponents__hint";
  hint.setAttribute("aria-live", "polite");

  const opponentChip = (value: string, art: HTMLElement, name: string): HTMLInputElement => {
    const chip = doc.createElement("label");
    chip.className = "dx-opponent";
    chip.dataset.value = value;
    const input = radio(doc, "dx-opponent__input filter-opponent", opponentGroup, value);
    chip.append(input, art, span(doc, "dx-opponent__name", name));
    grid.append(chip);
    return input;
  };
  const opponentInputs = [
    opponentChip(
      LIVE_TABLE,
      playerAvatar(doc, { kind: "GTO", label: "MIX" }),
      localizedText("Live table", "Živý stůl"),
    ),
    ...VILLAIN_ARCHETYPES.map((kind) => opponentChip(kind, playerAvatar(doc, { kind }), archetypeName(kind))),
  ];
  opponents.append(legend, grid, hint);
  element.append(modes, opponents);

  function settings(): PlayerSettings {
    if (!real.input.checked) return GTO_PLAYERS;
    const focus = opponentInputs.find((input) => input.checked)?.value;
    return isVillainArchetype(focus) ? { mode: "REAL", focus } : { mode: "REAL" };
  }

  function refresh(): void {
    gto.card.dataset.selected = String(gto.input.checked);
    real.card.dataset.selected = String(real.input.checked);
    opponents.hidden = !real.input.checked;
    for (const input of opponentInputs) {
      input.closest<HTMLElement>(".dx-opponent")!.dataset.selected = String(input.checked);
    }
    const focus: VillainArchetype | undefined = opponentInputs
      .map((input) => (input.checked ? input.value : undefined))
      .find(isVillainArchetype);
    hint.textContent = focus === undefined
      ? localizedText("A mix of types, different for every spot.", "Mix typů, u každého spotu jiný.")
      : `${archetypeName(focus)}: ${archetypeSummary(focus)}.`;
  }

  function setSettings(next: PlayerSettings): void {
    gto.input.checked = next.mode !== "REAL";
    real.input.checked = next.mode === "REAL";
    // V GTO se zvolený soupeř nemaže: kdo se vrátí do REAL, najde ho, kde byl.
    const value = next.focus ?? LIVE_TABLE;
    if (next.mode === "REAL" || !opponentInputs.some((input) => input.checked)) {
      for (const input of opponentInputs) input.checked = input.value === value;
    }
    refresh();
  }

  for (const input of [gto.input, real.input, ...opponentInputs]) {
    input.addEventListener("change", () => {
      refresh();
      onChange(settings());
    });
  }
  setSettings(initial);

  return { element, settings, setSettings };
}
