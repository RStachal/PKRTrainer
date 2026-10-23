import type { Spot } from "../core/types";
import { evModelLabel } from "../core/trainingProfile";
import type { RangeStore } from "../data/rangeStore";
import { currentMttPreflopRangePack } from "../data/ranges/mttPreflopRangePacks";
import type { RangePack } from "../data/ranges/rangePack";
import { depthDoesNotChangeSelection } from "../data/ranges/preflopDepthHonesty";
import { localizedText } from "./cs";
import { renderMatrix } from "./rangeMatrixView";

export function renderRangeModalButton(
  spot: Spot,
  store: RangeStore,
  root: HTMLElement,
): void {
  const doc = root.ownerDocument ?? document;
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "range-modal-open";
  button.textContent = "Show range (Flopzilla)";
  button.addEventListener("click", () => openRangeModal(doc, spot, store));
  root.appendChild(button);
}

/** Otevře dialog s maticí range; nové GUI ho volá z vlastního tlačítka. */
export function openRangeModal(doc: Document, spot: Spot, store: RangeStore): void {
  const previousOverflow = doc.body.style.overflow;
  const overlay = doc.createElement("div");
  overlay.className = "range-modal";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Range matrix");

  const backdrop = doc.createElement("button");
  backdrop.type = "button";
  backdrop.className = "range-modal__backdrop";
  backdrop.setAttribute("aria-label", "Close range");
  overlay.appendChild(backdrop);

  const dialog = doc.createElement("div");
  dialog.className = "range-modal__dialog";
  overlay.appendChild(dialog);

  const header = doc.createElement("div");
  header.className = "range-modal__header";
  dialog.appendChild(header);

  const title = doc.createElement("h2");
  title.className = "range-modal__title";
  title.textContent = `${spot.context} ${spot.heroPos} ${spot.effStack} BB`;
  header.appendChild(title);

  const close = doc.createElement("button");
  close.type = "button";
  close.className = "range-modal__close";
  close.textContent = "Close";
  header.appendChild(close);

  dialog.appendChild(renderRangeModelSummary(doc, currentMttPreflopRangePack(spot.ante), spot));

  const matrix = doc.createElement("div");
  matrix.className = "range-modal__matrix";
  dialog.appendChild(matrix);
  renderMatrix(spot, store, matrix);

  const closeModal = (): void => {
    doc.removeEventListener("keydown", handleKeydown);
    doc.body.style.overflow = previousOverflow;
    overlay.remove();
  };
  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") closeModal();
  };

  backdrop.addEventListener("click", closeModal);
  close.addEventListener("click", closeModal);
  doc.addEventListener("keydown", handleKeydown);
  doc.body.style.overflow = "hidden";
  doc.body.appendChild(overlay);
  close.focus();
}

function renderRangeModelSummary(doc: Document, pack: RangePack, spot: Spot): HTMLElement {
  const section = doc.createElement("section");
  section.className = "range-modal__evidence";
  section.setAttribute("aria-label", "Model range");

  const title = doc.createElement("div");
  title.className = "range-modal__evidence-title";
  title.textContent = "Model range";
  section.appendChild(title);

  const meta = doc.createElement("div");
  meta.className = "range-modal__evidence-meta";
  meta.textContent =
    `${gameVariantLabel(pack.dimensions.gameVariant)} | ` +
    `${tableFormatLabel(pack.dimensions.tableFormat)} | ` +
    `${evModelLabel(pack.dimensions.evModel)} | ante ${pack.dimensions.ante}`;
  section.appendChild(meta);

  const assumptions = doc.createElement("div");
  assumptions.className = "range-modal__evidence-assumptions";
  assumptions.textContent = localizedText(
    "Assumptions: 9-max MTT chipEV.",
    "Předpoklady: 9-max MTT chipEV.",
  );
  section.appendChild(assumptions);

  // **Hloubka, která nic nemění, se hráči musí říct.**
  //
  // Produkt nabízí jedenáct stackových kbelíků, ale na dodávaném packu vrací
  // každá sedačka napříč nimi jedinou otevírací selekci - hloubka mění velikost
  // otevření, ne to, které ruce se otevírají. Brána to hlásí od 18. 8. 2026 a
  // její vlastní věta zní, že drill nesmí naznačovat studium podle hloubky tam,
  // kde je range identická. Do 3. 9. to hráč nikde nezjistil.
  //
  // Věta je psaná pro hráče, ne z předpokladů packu: ty nesou licence a zdroje
  // a do UI se schválně nedostávají (`uiNoSourceCitation.test.ts`).
  if (depthDoesNotChangeSelection(pack, spot.ante, spot.heroPos)) {
    const depth = doc.createElement("div");
    depth.className = "range-modal__evidence-assumptions";
    depth.textContent = localizedText(
      "On this seat the opening range is the same at every stack depth; depth changes the size, not which hands open.",
      "Na téhle sedačce je otevírací range na všech hloubkách stejná; hloubka mění velikost otevření, ne to, které ruce se otevírají.",
    );
    section.appendChild(depth);
  }

  return section;
}

function gameVariantLabel(value: RangePack["dimensions"]["gameVariant"]): string {
  if (value === "CASH") return "Cash";
  return value;
}

function tableFormatLabel(value: RangePack["dimensions"]["tableFormat"]): string {
  return value === "FULL_RING_9" ? "9-max full ring" : "6-max";
}
