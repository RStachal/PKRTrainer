export type StackBandFilter = "ALL" | "BB_15_20" | "BB_21_25";

function parseBbValue(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*BB/i);
  if (!match) return null;
  return Number(match[1]);
}

export function matchesStackBandFilter(
  effectiveStack: string,
  filter: StackBandFilter,
): boolean {
  if (filter === "ALL") return true;

  const stack = parseBbValue(effectiveStack);
  if (stack === null) return false;

  if (filter === "BB_15_20") {
    return stack >= 15 && stack <= 20;
  }

  return stack >= 21 && stack <= 25;
}
