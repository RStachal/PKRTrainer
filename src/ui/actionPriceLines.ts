import type { DecisionPrice } from "../core/decisionPrice";

/**
 * Co musí akce vydělat, aby se zaplatila - řádek pod tlačítkem.
 *
 * ## Proč to vypadá jinak než EV
 *
 * Protože to říká něco jiného. Bublina s EV tvrdí **co akce vynese**; tenhle
 * řádek tvrdí **kolik musí vydělat, aby se vyrovnala složení**. Kdyby vypadaly
 * stejně, hráč by je četl jako totéž číslo dvakrát - a spletl by si nutnou
 * podmínku s hodnotou.
 *
 * Proto: bez ukazatele, tenčí písmo, tlumená barva, a formulace jako práh
 * („≥ 27,3 % ekvity"), ne jako výnos.
 *
 * ## Proč tak krátce
 *
 * Tlačítko má na 360px displeji kolem sta pixelů. Věta „tenhle call potřebuje
 * 27,3 % ekvity, aby se zaplatil" je pravdivá a nevejde se; práh se vejde a
 * říká totéž. Delší vysvětlení patří do panelu ceny rozhodnutí, ne na tlačítko.
 */

const PRICE_CLASS = "action-price";

function priceNode(button: HTMLButtonElement): HTMLElement {
  const existing = button.querySelector(`.${PRICE_CLASS}`);
  if (existing !== null) return existing as HTMLElement;
  const doc = button.ownerDocument ?? document;
  const node = doc.createElement("span");
  node.className = PRICE_CLASS;
  node.hidden = true;
  button.appendChild(node);
  return node;
}

/** Procenta česky, s desetinnou čárkou a bez předstírané přesnosti. */
function share(value: number): string {
  const percent = value * 100;
  return `${(percent >= 10 ? percent.toFixed(0) : percent.toFixed(1)).replace(".", ",")} %`;
}

export function priceLabel(price: DecisionPrice): string {
  if (price.kind === "EQUITY_NEEDED" && price.required !== undefined) {
    // ICM se ukazuje místo čipové hodnoty, ne vedle ní: na bublině platí ta
    // vyšší a dvě čísla vedle sebe by na tlačítku nešla přečíst.
    const required = price.requiredWithIcm ?? price.required;
    return `≥ ${share(required)} ekvity`;
  }
  if (price.kind === "FOLDS_NEEDED" && price.required !== undefined) {
    return `≥ ${share(price.required)} složení`;
  }
  return "";
}

/**
 * Doplní řádky s cenou. Vrací, kolik jich bylo vidět.
 *
 * Akce bez ceny zůstane prázdná - ne s nulou. Nula je platný práh a chybějící
 * údaj se od ní musí dát rozeznat.
 */
export function revealActionPriceLines(
  buttonsInput: Iterable<HTMLButtonElement>,
  prices: readonly DecisionPrice[],
): number {
  const byAction = new Map(prices.map((price) => [String(price.action), price]));
  let shown = 0;
  for (const button of buttonsInput) {
    const node = priceNode(button);
    const price = byAction.get(String(button.dataset.action));
    const text = price === undefined ? "" : priceLabel(price);
    node.textContent = text;
    node.hidden = text === "";
    button.dataset.actionPrice = text;
    if (text !== "") shown += 1;
  }
  return shown;
}

/** Skryje řádky, když se rozdává další spot. */
export function resetActionPriceLines(buttonsInput: Iterable<HTMLButtonElement>): void {
  for (const button of buttonsInput) {
    const node = priceNode(button);
    node.textContent = "";
    node.hidden = true;
    delete button.dataset.actionPrice;
  }
}
