import { getAppLanguage } from "../cs";

/**
 * Čísla v novém GUI podle jazyka aplikace: v češtině desetinná čárka a znak
 * mínus, v angličtině tečka. Jednotky (BB) se nepřekládají
 * (mtt-action-ev-and-language-contract.md).
 */
function locale(): string {
  return getAppLanguage() === "EN" ? "en-US" : "cs-CZ";
}

/** Hodnota v BB se znaménkem: „+1,42 BB“, „−0,22 BB“, „0 BB“. */
export function formatSignedBb(value: number, decimals: number): string {
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals;
  if (rounded === 0) return "0 BB";
  const text = new Intl.NumberFormat(locale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: "always",
  }).format(rounded);
  // Typografické mínus místo spojovníku, ať se čísla ve sloupci nerozjedou.
  return `${text.replace("-", "−")} BB`;
}
