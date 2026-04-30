import { CATEGORY_VALUES } from "./domain/constants";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  app.innerHTML = `
    <h1>PKRTrainer 2.0</h1>
    <p>Minimal Vite + TypeScript scaffold.</p>
    <p>Legacy trainer remains in <code>legacy/PKRTrainer.html</code>.</p>
    <p>Parity categories loaded: ${CATEGORY_VALUES.length}</p>
  `;
}
