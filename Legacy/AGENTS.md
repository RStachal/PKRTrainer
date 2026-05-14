# FUF-PKRTrainer Codex instructions

## Project goal

This project is a poker trainer originally implemented as a single-file HTML/CSS/JavaScript app.

The goal is to refactor it into a maintainable offline-capable web app while preserving current behavior.

## Current baseline

The original working version is stored under `legacy/`.

Do not modify files under `legacy/` unless explicitly requested.

## Hard rules

- Preserve existing behavior unless a requested task explicitly changes it.
- Do not rewrite the whole app in one step.
- Prefer small, reviewable diffs.
- Do not remove poker logic.
- Do not simplify ranges without explaining the strategic impact.
- Do not change ranges casually.
- Do not change answer keys, `correctKeys`, `strictCorrect`, question IDs, seed behavior or localStorage keys without explicit migration.
- Preserve Czech UI text.
- Keep the app offline-capable.
- Keep Android WebView compatibility in mind.
- No automatic commits.
- After changes, run build/tests if available.

## Preferred technical direction

Use Vanilla TypeScript + Vite.

Split the app into modules:

- poker hand utilities
- preflop ranges
- postflop heuristics
- question generators
- pool builder
- UI rendering
- range matrix rendering
- table simulation
- localStorage persistence
- HH parser
- dashboard/statistics