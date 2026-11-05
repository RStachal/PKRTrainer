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

/** Komu se hraje: „proti velrybě“, „against the whale“. */
export function archetypeOpponent(archetype: VillainArchetype): string {
  switch (archetype) {
    case "SHARK":
      return localizedText("the shark", "žralokovi");
    case "EAGLE":
      return localizedText("the eagle", "orlovi");
    case "ROCK":
      return localizedText("the rock", "kameni");
    case "DICE":
      return localizedText("the gambler", "kostce");
    case "WHALE":
      return localizedText("the whale", "velrybě");
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
