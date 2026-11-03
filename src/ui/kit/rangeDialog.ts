/**
 * Dialog s maticí range - kostra společná preflopu i postflopu.
 *
 * Preflop ji otevírá přes `openRangeModal` (starý pohled „Show range“ i nové
 * GUI „Range“), postflop z nové obrazovky (Agents/ui-redesign-plan.md, fáze 1:
 * matice „patří do dialogu, jako u preflopu“). Je tu zvlášť a bez závislostí,
 * aby postflopová obrazovka nepřitáhla do svého balíku preflopové range.
 *
 * `fill` dostane tělo dialogu pod hlavičkou a doplní obsah. Zavírá se
 * tlačítkem, klepnutím vedle a Escapem; stránka pod ním se mezitím neposouvá.
 */
export function openRangeDialog(doc: Document, titleText: string, fill: (dialog: HTMLElement) => void): void {
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
  title.textContent = titleText;
  header.appendChild(title);

  const close = doc.createElement("button");
  close.type = "button";
  close.className = "range-modal__close";
  close.textContent = "Close";
  header.appendChild(close);

  fill(dialog);

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
