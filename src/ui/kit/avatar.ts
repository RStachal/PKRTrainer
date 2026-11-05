import { isVillainArchetype } from "../../core/villain/archetypes";
import { localizedText } from "../cs";
import { archetypeName } from "../villainText";
import { AVATAR_ART, type AvatarKind } from "./avatarArt";

/**
 * Avatar hráče u stolu (Agents/plan-gto-real-2026-11.md, oddíl 5).
 *
 * V režimu GTO je to žeton s pozicí, v režimu REAL kresba typu hráče, hráč
 * sám má vlastní. Stav (na tahu, soupeř ve hře, složil, all-in, vítěz) je jen
 * lem z CSS (`.dx-avatar[data-state]`), kresba se nemění.
 */

export type AvatarState = "idle" | "active" | "focus" | "folded" | "allin" | "winner";

export interface PlayerAvatarOptions {
  kind: AvatarKind;
  /** Pozice; žeton GTO ji nese uprostřed. */
  label?: string;
  state?: AvatarState;
  /**
   * Jméno pro čtečku. Bez něj je avatar ozdoba (`aria-hidden`), jako u stolu,
   * který čtečce dává jeden popis celé situace.
   */
  accessibleName?: string;
}

let serial = 0;

const escapeText = (text: string): string => text
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

export function playerAvatar(doc: Document, options: PlayerAvatarOptions): HTMLSpanElement {
  const node = doc.createElement("span");
  node.className = "dx-avatar";
  node.dataset.kind = options.kind;
  node.dataset.state = options.state ?? "idle";
  if (options.accessibleName === undefined) {
    node.setAttribute("aria-hidden", "true");
  } else {
    node.setAttribute("role", "img");
    node.setAttribute("aria-label", options.accessibleName);
  }

  // Každý avatar má vlastní identifikátory gradientů: dva stejné typy u stolu
  // by jinak sdílely jeden a schovaný avatar by mohl vzít kresbu druhému.
  serial += 1;
  const label = escapeText(options.label ?? "");
  const art = AVATAR_ART[options.kind]
    .split("av-").join(`av${serial}-`)
    .replace("{labelSize}", label.length > 3 ? "15" : "19")
    .replace("{label}", label);
  node.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">${art}</svg>`;
  return node;
}

/** Jméno avataru pro čtečku: typ hráče, pozice v GTO, nebo „ty“. */
export function avatarName(kind: AvatarKind, position?: string): string {
  if (kind === "HERO") return localizedText("You", "Ty");
  if (isVillainArchetype(kind)) return archetypeName(kind);
  return position === undefined
    ? localizedText("Player", "Hráč")
    : localizedText(`Position ${position}`, `Pozice ${position}`);
}
