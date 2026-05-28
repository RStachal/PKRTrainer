# PKRTrainer agent guide

Vanilla TypeScript + Vite poker trainer. Offline-capable, Android-WebView friendly. Czech UI.

## Commands

```
npm run dev            # local dev server
npm test               # vitest run (must pass)
npm run build          # tsc --noEmit + vite build (must pass)
npm run build:offline  # vite build --mode offline
```

`npm test` and `npm run build` are the green-bar gates. Run both after non-trivial changes.

## Hard rules

- Preserve existing behavior unless explicitly requested.
- Do not change ranges, `correctAction`, spot IDs, seed behavior, or localStorage keys without an explicit migration.
- Preserve Czech UI text.
- Keep the app offline-capable and Android WebView friendly.
- Do not modify `legacy/` unless explicitly requested — it's the reference baseline.
- Prefer small, reviewable diffs. Do not commit automatically.

## Architecture map

- [src/App.ts](src/App.ts) — orchestration: state shape, session lifecycle, event handling, render flow. Keep thin.
- [src/domain/](src/domain/) — pure logic: training session engine, question/spot types, statistics, selectors, presets.
  - [appSelectors.ts](src/domain/appSelectors.ts) — pure filters: questions by format/phase/stackBand, category availability.
  - [sessionPresets.ts](src/domain/sessionPresets.ts) — focused block presets (REJAM/BB_DEFEND/ISO at fixed stack bands).
  - [trainingSession.ts](src/domain/trainingSession.ts) — seeded shuffle, missed-only mode, strict/lenient scoring.
- [src/content/](src/content/) — content data:
  - [spots/mtt15-25bb.ts](src/content/spots/mtt15-25bb.ts) — MTT preflop spots (categories, hero hands, range profile mapping).
  - [ranges/mttPreflopRanges.ts](src/content/ranges/mttPreflopRanges.ts) — 13x13 range cell data + RangeProfile metadata.
- [src/ui/](src/ui/) — pure HTML-string renderers (renderTable, renderDecisionPanel, renderRangePanel, renderSessionControls, etc.). No DOM mutations here — App.ts owns the DOM.
- [src/state/](src/state/) — localStorage adapters.

## Category dual-identity (footgun)

Spots use `SpotCategory` (`OPEN`/`DEFEND`/`DEFEND_2X`/`ISO`/`REJAM`/`SB_OPEN`/...). Questions/presets/UI use `CategoryValue` (`OPEN_HJ_CO_BTN`/`BB_DEFEND`/`BB_DEFEND_2X`/`ISO_LIMP`/`REJAM`/`SB_OPEN`/...). Translation lives in [questionFromSpot.ts](src/domain/questionFromSpot.ts).

When writing a preset, use the `CategoryValue` form. When writing a spot, use the `SpotCategory` form.

## Adding a new spot

1. Pick a stack band (15-20 or 21-25 BB) and category.
2. Find an existing range profile in [mttPreflopRanges.ts](src/content/ranges/mttPreflopRanges.ts) whose `spotType` matches your `SpotCategory` (see [questionFromSpot.ts](src/domain/questionFromSpot.ts)). The `rangeProfileId` you pass in `makeSpot` should be the `mtt-15-25-...` form — the [mtt15-25bb.ts](src/content/spots/mtt15-25bb.ts) helper rewrites it to the 15-20 or 21-25 variant by stack.
3. Pick a hand whose cell action in the resolved range profile matches your intended `correctAction`. Prefer `pure` cells over `mix` for unambiguous teaching.
4. Spot `id` must contain the category token: `-iso-` for ISO, `-bb-defend-` (but NOT `-bb-defend-2x-`) for DEFEND, `-bb-defend-2x-` for DEFEND_2X, `-open-` (but NOT `-open-sb-`) for OPEN, `-open-sb-` for SB_OPEN, `-rejam-` for REJAM. Enforced by [contentValidation.test.ts](tests/contentValidation.test.ts).

## Adding a new preset

1. Add a `SessionPreset` entry in [sessionPresets.ts](src/domain/sessionPresets.ts) with category in `CategoryValue` form.
2. Set `minimumAvailableSpots` to your expected coverage threshold (default 8). The preset's available count is checked by [sessionPresetCoverage.test.ts](tests/sessionPresetCoverage.test.ts) — if there isn't enough content, add spots first.
3. Preset buttons auto-render with live spot count and a "thin" CSS modifier when `available < blockSize`. `applySessionPreset` autoscales `blockSize` to available pool.

## Test guards (what fails when you break things)

- [contentValidation.test.ts](tests/contentValidation.test.ts) — unique IDs, valid actions, category↔id token consistency, category↔range profile spotType consistency, range cell hero-hand presence, BB defend range size sanity.
- [sessionPresetCoverage.test.ts](tests/sessionPresetCoverage.test.ts) — every preset has ≥`minimumAvailableSpots` matching questions; preset buttons render the live count and thin-modifier.
- [appSelectors.test.ts](tests/appSelectors.test.ts) — format/phase/stackBand filtering, category normalization.
- [appInteraction.test.ts](tests/appInteraction.test.ts) — full-DOM render and event flow (jsdom-based).

## Open work (parity gap)

See [docs/PARITY_CHECKLIST.md](docs/PARITY_CHECKLIST.md). The largest unfinished pieces are stats event log / export-import JSON, range modal (legacy Flopzilla-style 13x13), HH paste analyzer, and postflop generators. These need a strategic sit-down before further investment.
