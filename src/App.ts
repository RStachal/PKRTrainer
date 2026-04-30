import { CATEGORY_VALUES } from "./domain/constants";

export function createAppMarkup(): string {
  return `
    <section class="app-shell" aria-labelledby="app-title">
      <header class="app-header">
        <p class="app-kicker">Nová verze</p>
        <h1 id="app-title">PKRTrainer 2.0</h1>
        <p>Minimální Vanilla TypeScript + Vite základ pro postupný přepis.</p>
      </header>

      <section class="app-panel" aria-labelledby="status-title">
        <h2 id="status-title">Příprava nové verze</h2>
        <dl class="status-list">
          <div>
            <dt>Legacy aplikace</dt>
            <dd>Beze změn v <code>legacy/PKRTrainer.html</code></dd>
          </div>
          <div>
            <dt>Paritní kategorie</dt>
            <dd>Načteno ${CATEGORY_VALUES.length} konstant</dd>
          </div>
          <div>
            <dt>Další krok</dt>
            <dd>Postupné přenášení čisté logiky s paritními testy</dd>
          </div>
        </dl>
      </section>
    </section>
  `;
}

export function renderApp(root: HTMLElement): void {
  root.innerHTML = createAppMarkup();
}
