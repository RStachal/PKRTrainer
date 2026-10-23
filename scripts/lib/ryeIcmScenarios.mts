import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Scénáře ICM z vlastníkova korpusu: rozložení stacků u stolu, pod kterým
 * ICM stránky platí.
 *
 * ## Odkud se berou
 *
 * Zdroj scénář nikde nepopisuje jako data; nese ho **jen v navigaci** každé
 * stránky, jako text odkazu na rozcestník: `ICM5.html` = „Coldcalling &
 * 3betting - UTG-75bb HJ-45bb CO-60bb BU-30bb SB-18bb BB-22bb“. Výplatní
 * strukturu ani počet zbývajících hráčů neuvádí nikde - vlastník to 22. 9. 2026
 * ověřil v podkladech a rozhodl, že ICM se dodá **bez ceny** (5b).
 *
 * ## Proč se scénář jmenuje podle stacků, ne podle rozcestníku
 *
 * Táž sada stacků má v korpusu dva rozcestníky: jeden pro otevření
 * (`ICM4`, „Openraising“) a jeden pro čelení (`ICM5`, „Coldcalling &
 * 3betting“). Stránky obou popisují **jeden stůl**, takže do klíče patří
 * stůl - jinak by se obrana a otevření u téhož stolu tvářily jako dva scénáře.
 * Identifikátor je proto ze stacků: `ICM_75-45-60-30-18-22` v pořadí UTG, HJ,
 * CO, BTN, SB, BB (šestistolová sada; tříhráčový stůl `ICM_BTN80-SB40-BB55`
 * jmenuje sedačky, protože jich není šest).
 */

export interface IcmScenario {
  /** Klíč scénáře, ze stacků; začíná `ICM`, aby ho `isChipEvSetup` poznal. */
  id: string;
  /** Stacky po sedačkách v bb, jak je zdroj uvádí. */
  stacksBB: Readonly<Record<string, number>>;
  /** Čitelný popis: „UTG 75 / HJ 45 / CO 60 / BTN 30 / SB 18 / BB 22 bb“. */
  label: string;
  /** Rozcestníky zdroje, které ten stůl popisují (`ICM4`, `ICM5`). */
  menus: readonly string[];
}

const SEAT_OF_SOURCE: Readonly<Record<string, string>> = {
  UTG: "UTG", HJ: "HJ", CO: "CO", BU: "BTN", BTN: "BTN", SB: "SB", BB: "BB",
};
const SEAT_ORDER = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

function scenarioFromMenuText(text: string): { stacksBB: Record<string, number> } | undefined {
  const stacks: Record<string, number> = {};
  for (const match of text.matchAll(/\b(UTG|HJ|CO|BU|BTN|SB|BB)-?(\d+)b/g)) {
    const seat = SEAT_OF_SOURCE[match[1]];
    if (seat !== undefined) stacks[seat] = Number(match[2]);
  }
  return Object.keys(stacks).length >= 3 ? { stacksBB: stacks } : undefined;
}

export function scenarioIdFor(stacksBB: Readonly<Record<string, number>>): string {
  const seats = SEAT_ORDER.filter((seat) => stacksBB[seat] !== undefined);
  return seats.length === SEAT_ORDER.length
    ? `ICM_${seats.map((seat) => stacksBB[seat]).join("-")}`
    : `ICM_${seats.map((seat) => `${seat}${stacksBB[seat]}`).join("-")}`;
}

export function scenarioLabel(stacksBB: Readonly<Record<string, number>>): string {
  return `${SEAT_ORDER.filter((seat) => stacksBB[seat] !== undefined).map((seat) => `${seat} ${stacksBB[seat]}`).join(" / ")} bb`;
}

/**
 * Scénáře přečtené z navigace korpusu: rozcestník → stůl.
 *
 * Čte se jedna stránka, která navigaci nese celou (každá ji má); první
 * nalezená s odkazy na `ICM<n>.html` stačí. Vrací i mapu předpony souboru
 * (`ICM5`) na scénář, protože draft jmenuje stránky předponou.
 */
export function readIcmScenarios(sourceDir: string): { scenarios: IcmScenario[]; byMenu: Map<string, IcmScenario> } {
  const byMenu = new Map<string, IcmScenario>();
  const scenarios = new Map<string, IcmScenario>();
  if (!existsSync(sourceDir)) return { scenarios: [], byMenu };
  const sample = readdirSync(sourceDir).find((name) => /^ICM\d*-.*\.html$/i.test(name));
  if (sample === undefined) return { scenarios: [], byMenu };
  const html = readFileSync(join(sourceDir, sample), "utf8");
  for (const match of html.matchAll(/<a[^>]+href="([^"]*?(ICM\d*)\.html)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const menu = match[2].toUpperCase();
    const text = match[3].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const parsed = scenarioFromMenuText(text);
    if (parsed === undefined || byMenu.has(menu)) continue;
    const id = scenarioIdFor(parsed.stacksBB);
    const existing = scenarios.get(id);
    const scenario: IcmScenario = existing === undefined
      ? { id, stacksBB: parsed.stacksBB, label: scenarioLabel(parsed.stacksBB), menus: [menu] }
      : { ...existing, menus: [...existing.menus, menu].sort() };
    scenarios.set(id, scenario);
    for (const name of scenario.menus) byMenu.set(name, scenario);
  }
  return { scenarios: [...scenarios.values()], byMenu };
}
