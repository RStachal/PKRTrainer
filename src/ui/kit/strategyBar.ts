import { localizedText } from "../cs";

export interface StrategySegment {
  /** Akce, jak ji vidí hráč, například „Bet 33 %“. */
  label: string;
  /** Podíl akce. Součet nemusí být 1, pruh si podíly převede sám. */
  share: number;
  /** Barva akce z jediného zdroje barev akcí (`colorForActionKey` a spol.). */
  color: string;
}

/**
 * Celé procento, v češtině s nezlomitelnou mezerou před znakem procenta.
 * Zapsaná escapem, protože v editoru vypadá jako obyčejná a přepis ji ztratí.
 */
export function formatSharePercent(share: number): string {
  const percent = Math.round(share * 100);
  return localizedText(`${percent}%`, `${percent}\u00a0%`);
}

/** Segmenty s kladným podílem a jejich součet; pruh i legenda čtou totéž. */
function visibleSegments(segments: readonly StrategySegment[]): {
  visible: readonly StrategySegment[];
  total: number;
} {
  const visible = segments.filter((segment) => Number.isFinite(segment.share) && segment.share > 0);
  return { visible, total: visible.reduce((sum, segment) => sum + segment.share, 0) };
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
  const { visible, total } = visibleSegments(segments);

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

/**
 * Legenda k pruhu: barva, akce a podíl. Pruh popisky nemá, protože úzký
 * segment by je neunesl. Čtečka má totéž v popisu pruhu, a tak legendu
 * přeskočí, aby neslyšela každé číslo dvakrát.
 */
export function strategyLegend(doc: Document, segments: readonly StrategySegment[]): HTMLUListElement {
  const { visible, total } = visibleSegments(segments);

  const list = doc.createElement("ul");
  list.className = "dx-strategy-legend";
  list.setAttribute("aria-hidden", "true");
  for (const segment of visible) {
    const item = doc.createElement("li");
    item.className = "dx-strategy-legend__item";
    const swatch = doc.createElement("span");
    swatch.className = "dx-strategy-legend__swatch";
    swatch.style.setProperty("--action-accent", segment.color);
    const share = doc.createElement("span");
    share.className = "dx-strategy-legend__share";
    share.textContent = formatSharePercent(segment.share / total);
    item.append(swatch, `${segment.label} `, share);
    list.appendChild(item);
  }
  return list;
}
