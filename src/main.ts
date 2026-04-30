import { CATEGORY_VALUES } from "./domain/constants";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  app.innerHTML = `
    <h1>PKRTrainer 2.0</h1>
    <p>Minimální scaffold Vite + TypeScript.</p>
    <p>Legacy trenér zůstává v <code>legacy/PKRTrainer.html</code>.</p>
    <p>Načteno paritních kategorií: ${CATEGORY_VALUES.length}</p>
  `;
}
