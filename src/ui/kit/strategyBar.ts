import { localizedText } from "../cs";

export interface StrategySegment {
  /** Akce, jak ji vidí hráč, například „Bet 33 %“. */
  label: string;
  /** Podíl akce. Součet nemusí být 1, pruh si podíly převede sám. */
  share: number;
  /** Barva akce z jediného zdroje barev akcí (`colorForActionKey` a spol.). */
  color: string;
}

/** Celé procento, v češtině s mezerou před znakem procenta. */
export function formatSharePercent(share: number): string {
  const percent = Math.round(share * 100);
  return localizedText(`${percent}%`, `${percent} %`);
}

/**
 * Pruh strategie: podíly akcí vedle sebe v barvách akcí.
 *
 * Čtečka obrazovky dostane totéž jako text („Bet 33 % 64 %, Check 31 %“),
 * protože pruh je obrázek, který nese informaci, ne ozdoba.
 */
export function strategyBar(
  doc: Document,
  segments: readonly StrategySegment[],
  options: { label?: string } = {},
): HTMLDivElement {
  const visible = segments.filter((segment) => Number.isFinite(segment.share) && segment.share > 0);
  const total = visible.reduce((sum, segment) => sum + segment.share, 0);

  const bar = doc.createElement("div");
  bar.className = "dx-strategy-bar";
  bar.setAttribute("role", "img");

  const title = options.label ?? localizedText("Strategy", "Strategie");
  const parts = visible.map((segment) => `${segment.label} ${formatSharePercent(segment.share / total)}`);
  bar.setAttribute(
    "aria-label",
    parts.length > 0 ? `${title}: ${parts.join(", ")}` : `${title}: ${localizedText("no data", "bez dat")}`,
  );

  for (const segment of visible) {
    const part = doc.createElement("div");
    part.className = "dx-strategy-bar__segment";
    part.style.width = `${Number(((segment.share / total) * 100).toFixed(2))}%`;
    part.style.setProperty("--action-accent", segment.color);
    bar.appendChild(part);
  }
  return bar;
}
