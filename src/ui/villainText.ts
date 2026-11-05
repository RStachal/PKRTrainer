import type { VillainArchetype } from "../core/villain/archetypes";
import { localizedText } from "./cs";

/**
 * Jména a jedna věta o typech hráčů režimu REAL (Agents/plan-gto-real-2026-11.md,
 * 3.2). Česká jména zvolil majitel a v režimu CZ jsou názvem typu; anglická
 * jsou jejich překlad.
 */

export function archetypeName(archetype: VillainArchetype): string {
  switch (archetype) {
    case "SHARK":
      return localizedText("Shark", "Žralok");
    case "EAGLE":
      return localizedText("Eagle", "Orel");
    case "ROCK":
      return localizedText("Rock", "Kámen");
    case "DICE":
      return localizedText("Gambler", "Kostka");
    case "WHALE":
      return localizedText("Whale", "Velryba");
  }
}

export function archetypeSummary(archetype: VillainArchetype): string {
  switch (archetype) {
    case "SHARK":
      return localizedText("winning regular, plays close to equilibrium", "výherní reg, hraje blízko rovnováhy");
    case "EAGLE":
      return localizedText("slightly winning regular with leaks", "lehce výherní reg s mezerami");
    case "ROCK":
      return localizedText("nit: tight and passive", "nit: těsný a pasivní");
    case "DICE":
      return localizedText("gambler: loose and aggressive", "gambler: volný a agresivní");
    case "WHALE":
      return localizedText("big loser: loose and passive", "velmi ztrátový, volný a pasivní");
  }
}
