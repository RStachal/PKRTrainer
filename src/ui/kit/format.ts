import { getAppLanguage } from "../cs";

/**
 * Čísla v novém GUI podle jazyka aplikace: v češtině desetinná čárka a znak
 * mínus, v angličtině tečka. Jednotky (BB) se nepřekládají
 * (mtt-action-ev-and-language-contract.md).
 */
function locale(): string {
  return getAppLanguage() === "EN" ? "en-US" : "cs-CZ";
}

/** Číslo s nejvýš jedním desetinným místem: „2,5“, „30“ (třeba SPR). */
export function formatDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(rounded);
}

/** Částka v BB bez znaménka, nejvýš jedno desetinné místo: „2,5 BB“, „30 BB“. */
export function formatBbAmount(value: number): string {
  return `${formatDecimal(value)} BB`;
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

/**
 * Ztráta proti nejlepší akci („−0,22 BB“), nebo `null`, když se v zobrazené
 * přesnosti zaokrouhlí na nulu. U „stejně dobré“ akce bývá ztráta pár tisícin
 * a „0 BB“ vedle verdiktu by vypadalo jako chyba ve výpočtu.
 */
export function formatEvLoss(lossBb: number, decimals: number): string | null {
  const text = formatSignedBb(-lossBb, decimals);
  return text === "0 BB" ? null : text;
}
