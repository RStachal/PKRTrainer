# PKRTrainer Codex instructions

## Project goal

Refactor the original single-file poker trainer into a maintainable offline-capable Vanilla TypeScript + Vite app while preserving current behavior.

## Baseline

The original working app is stored under `legacy/`.

Do not modify files under `legacy/` unless explicitly requested.

## Hard rules

- Preserve existing behavior unless explicitly requested.
- Do not rewrite the whole app in one step.
- Do not change poker ranges casually.
- Do not change `correctKeys`, `strictCorrect`, question IDs, seed behavior, pool behavior or localStorage keys without explicit migration.
- Preserve Czech UI text.
- Keep the app offline-capable.
- Keep Android WebView compatibility in mind.
- Prefer small, reviewable diffs.
- Do not commit automatically.
- After changes, run build/tests if available.

## Refactor direction

Use Vanilla TypeScript + Vite.

Extract gradually:
- constants and RNG
- hand utilities
- storage keys and state loading
- ranges
- question generators
- scoring
- UI renderers
- HH parser
- dashboard/statistics