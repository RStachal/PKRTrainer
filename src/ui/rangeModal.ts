import type { Spot } from "../core/types";
import type { RangeStore } from "../data/rangeStore";
import { currentMttPreflopRangePack } from "../data/ranges/mttPreflopRangePacks";
import type { RangePack } from "../data/ranges/rangePack";
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

function openRangeModal(doc: Document, spot: Spot, store: RangeStore): void {
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

  dialog.appendChild(renderRangeModelSummary(doc, currentMttPreflopRangePack(spot.ante)));

  const matrix = doc.createElement("div");
  matrix.className = "range-modal__matrix";
  dialog.appendChild(matrix);
  renderMatrix(spot, store, matrix);

  const style = doc.createElement("style");
  style.textContent = `
.range-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;
  justify-content:center;padding:clamp(8px,2vw,18px);font-family:Inter,system-ui,Arial,sans-serif;}
.range-modal__backdrop{position:absolute;inset:0;border:0;background:rgba(3,7,13,.82);
  backdrop-filter:blur(5px);
  cursor:pointer;}
.range-modal__dialog{position:relative;z-index:1;box-sizing:border-box;width:min(940px,100%);
  max-height:min(92vh,92dvh);overflow:auto;background:linear-gradient(180deg,#121928,#08101d);
  color:#e8ecf7;border:1px solid rgba(123,211,255,.2);border-radius:16px;
  padding:16px 18px 20px;box-shadow:0 34px 110px rgba(0,0,0,.58),
  inset 0 1px 0 rgba(255,255,255,.06);}
.range-modal__header{display:flex;align-items:center;justify-content:space-between;
  gap:12px;margin:-2px -2px 12px;position:sticky;top:0;z-index:2;
  background:linear-gradient(180deg,rgba(18,25,40,.98),rgba(18,25,40,.9));
  border-bottom:1px solid rgba(255,255,255,.08);
  padding-bottom:10px;}
.range-modal__title{margin:0;font-size:16px;font-weight:950;letter-spacing:0;color:#f4f7ff;}
.range-modal__close,.range-modal-open{appearance:none;border:1px solid rgba(255,255,255,.18);
  border-radius:10px;background:linear-gradient(180deg,#202a3d,#151d2d);color:#e8ecf7;
  font-weight:900;font-size:13px;padding:9px 13px;cursor:pointer;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 10px 22px rgba(0,0,0,.18);}
.range-modal__close:hover,.range-modal-open:hover{border-color:#2bd576;transform:translateY(-1px);}
.range-modal__evidence{display:grid;gap:6px;margin:0 0 12px;padding:10px;border:1px solid
  rgba(123,211,255,.16);border-radius:10px;background:rgba(255,255,255,.045);
  color:#cbd5e1;font-size:12px;}
.range-modal__evidence-title{font-weight:900;color:#e8ecf7;}
.range-modal__evidence-meta,.range-modal__evidence-assumptions{line-height:1.35;
  overflow-wrap:anywhere;}
.range-modal__matrix{overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;
  scrollbar-color:#7bd3ff rgba(255,255,255,.08);}
.range-modal__matrix .matrix{min-width:620px;}
.range-modal__matrix .matrix-cell{min-height:22px;display:flex;align-items:center;
  justify-content:center;}
.range-modal-open{margin-bottom:10px;}
@media (max-width:640px){
  .range-modal{align-items:stretch;}
  .range-modal__dialog{width:100%;max-height:min(96vh,96dvh);padding:10px 10px 14px;
    border-radius:14px;}
  .range-modal__header{align-items:flex-start;}
  .range-modal__title{font-size:14px;}
  .range-modal__close{padding:8px 10px;}
  .range-modal-open{width:100%;}
  .range-modal__matrix .matrix{min-width:560px;}
  .range-modal__matrix .range-matrix-view{min-width:560px;padding:9px;}
  .range-modal__matrix .range-matrix-header{gap:8px;}
  .range-modal__matrix .range-matrix-meta{font-size:10px;}
}
@media (prefers-reduced-motion:reduce){
  .range-modal *,.range-modal *::before,.range-modal *::after{
    transition-duration:.01ms!important;animation-duration:.01ms!important;
    animation-iteration-count:1!important;scroll-behavior:auto!important;}
  .range-modal__close:hover,.range-modal-open:hover{transform:none;}
}
`;
  overlay.appendChild(style);

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

function renderRangeModelSummary(doc: Document, pack: RangePack): HTMLElement {
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
  assumptions.textContent = `Assumptions: ${pack.assumptions.join(" ")}`;
  section.appendChild(assumptions);

  return section;
}

function gameVariantLabel(value: RangePack["dimensions"]["gameVariant"]): string {
  if (value === "CASH") return "Cash";
  return value;
}

function tableFormatLabel(value: RangePack["dimensions"]["tableFormat"]): string {
  return value === "FULL_RING_9" ? "9-max full ring" : "6-max";
}

function evModelLabel(value: RangePack["dimensions"]["evModel"]): string {
  return value === "CHIP_EV" ? "chipEV" : "ICM";
}
