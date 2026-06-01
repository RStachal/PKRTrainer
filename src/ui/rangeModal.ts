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
  button.textContent = "Zobrazit rozsah (Flopzilla)";
  button.addEventListener("click", () => openRangeModal(doc, spot, store));
  root.appendChild(button);
}

function openRangeModal(doc: Document, spot: Spot, store: RangeStore): void {
  const previousOverflow = doc.body.style.overflow;
  const overlay = doc.createElement("div");
  overlay.className = "range-modal";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Range matice");

  const backdrop = doc.createElement("button");
  backdrop.type = "button";
  backdrop.className = "range-modal__backdrop";
  backdrop.setAttribute("aria-label", "Zavřít range");
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
  close.textContent = "Zavřít";
  header.appendChild(close);

  dialog.appendChild(renderRangePackEvidence(doc, currentMttPreflopRangePack(spot.ante)));

  const matrix = doc.createElement("div");
  matrix.className = "range-modal__matrix";
  dialog.appendChild(matrix);
  renderMatrix(spot, store, matrix);

  const style = doc.createElement("style");
  style.textContent = `
.range-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;
  justify-content:center;padding:clamp(8px,2vw,18px);font-family:system-ui,Arial,sans-serif;}
.range-modal__backdrop{position:absolute;inset:0;border:0;background:rgba(5,8,14,.78);
  cursor:pointer;}
.range-modal__dialog{position:relative;z-index:1;box-sizing:border-box;width:min(940px,100%);
  max-height:min(92vh,92dvh);overflow:auto;background:#11151f;color:#e8ecf7;border:1px solid
  rgba(255,255,255,.16);border-radius:10px;padding:14px 16px 18px;box-shadow:
  0 24px 80px rgba(0,0,0,.5);}
.range-modal__header{display:flex;align-items:center;justify-content:space-between;
  gap:12px;margin-bottom:12px;position:sticky;top:0;z-index:2;background:#11151f;
  padding-bottom:10px;}
.range-modal__title{margin:0;font-size:16px;font-weight:900;letter-spacing:0;}
.range-modal__close,.range-modal-open{appearance:none;border:1px solid rgba(255,255,255,.18);
  border-radius:8px;background:#1b2333;color:#e8ecf7;font-weight:800;font-size:13px;
  padding:8px 12px;cursor:pointer;}
.range-modal__close:hover,.range-modal-open:hover{border-color:#2bd576;}
.range-modal__evidence{display:grid;gap:6px;margin:0 0 12px;padding:10px;border:1px solid
  rgba(255,255,255,.12);border-radius:8px;background:#151b29;color:#cbd5e1;font-size:12px;}
.range-modal__evidence-title{font-weight:900;color:#e8ecf7;}
.range-modal__evidence-meta,.range-modal__evidence-assumptions,
  .range-modal__evidence-sources{line-height:1.35;}
.range-modal__evidence a{color:#9ee7c2;text-decoration:none;}
.range-modal__evidence a:hover{text-decoration:underline;}
.range-modal__matrix{overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;}
.range-modal__matrix .matrix{min-width:620px;}
.range-modal__matrix .matrix-cell{min-height:22px;display:flex;align-items:center;
  justify-content:center;}
.range-modal-open{margin-bottom:10px;}
@media (max-width:640px){
  .range-modal{align-items:stretch;}
  .range-modal__dialog{width:100%;max-height:min(96vh,96dvh);padding:10px 10px 14px;}
  .range-modal__title{font-size:14px;}
  .range-modal__close{padding:8px 10px;}
  .range-modal__matrix .matrix{min-width:560px;}
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

function renderRangePackEvidence(doc: Document, pack: RangePack): HTMLElement {
  const section = doc.createElement("section");
  section.className = "range-modal__evidence";
  section.setAttribute("aria-label", "Zdroj range");

  const title = doc.createElement("div");
  title.className = "range-modal__evidence-title";
  title.textContent = "RangePack";
  section.appendChild(title);

  const meta = doc.createElement("div");
  meta.className = "range-modal__evidence-meta";
  meta.textContent =
    `${pack.id} | v${pack.version} | ${pack.dimensions.evModel} | ` +
    `${pack.dimensions.tableFormat} | ověřeno ${pack.verifiedAt}`;
  section.appendChild(meta);

  const assumptions = doc.createElement("div");
  assumptions.className = "range-modal__evidence-assumptions";
  assumptions.textContent = `Assumptions: ${pack.assumptions.join(" ")}`;
  section.appendChild(assumptions);

  const sources = doc.createElement("div");
  sources.className = "range-modal__evidence-sources";
  sources.textContent = "Zdroje: ";
  pack.sourceEvidence.forEach((source, index) => {
    if (index > 0) sources.appendChild(doc.createTextNode(", "));
    const link = doc.createElement("a");
    link.href = source.url;
    link.textContent = source.provider;
    link.rel = "noreferrer";
    sources.appendChild(link);
  });
  section.appendChild(sources);

  return section;
}
