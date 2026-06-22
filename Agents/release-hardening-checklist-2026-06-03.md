# Release hardening checklist - offline and Android WebView

## Build and bundle

- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm run build`.
- Confirm `dist/index.html`, `dist/sw.js` and one hashed `dist/assets/main-*.js` are produced.
- Confirm offline metadata is bundled by running `tests/unit/releaseBundleMetadata.test.ts`.

## Offline / Service Worker

- Service worker precaches every production asset emitted into `dist/`, including hashed chunks, manifest and install icon.
- First same-origin GET for hashed JS/CSS/data is network-served and then runtime cached.
- Second same-origin GET for the same asset is cache-served without another network call.
- Navigation fallback returns cached app shell when offline.
- A newly installed worker takes control after successful precache and claims open clients.
- During a two-build upgrade, one previous app cache remains available only for old hashed build assets requested by already-open clients.
- Stable URLs removed from the new build are never served from the previous cache.
- Registration watches both the current installing worker and later `updatefound` workers without reporting a previously activated worker as a failed install.
- If SW registration or install cache fails, app remains usable online and shows a Czech warning.

## Mobile / Android WebView smoke

- Use 360x740 as the small-viewport baseline.
- Training tab renders filters, profile selector and Start without horizontal text overflow.
- Candidate gating blocks MTT 6-max, SNG and Cash previews without rendering a poker table.
- Candidate text must not render URLs or source/provider citations in the app.
- Postflop tab renders controls, actions, result and model metadata without long IDs breaking layout.
- HH import renders textarea, analyze button, parsed table, analysis facts and horizontally scrollable matrix.
- Stats tab can export/import JSON, including postflop records.
- Matrix-heavy panels keep `overflow-x:auto` and touch scrolling enabled.

## RangePack expansion checks

- Every new RangePack has `searchQueries`, `sourceEvidence`, `assumptions`, `verifiedAt`, `licenseNote`, dimensions and confidence.
- Candidate packs stay `LOW` confidence with `records: []` until normalized chart records are legally imported.
- Resolver/profile guard must require exact match on `gameVariant`, `tableFormat`, `blindSpeed`, `street`, `evModel`, `ante` and `rakeMode`.
- Cash data must never resolve for MTT/SNG profiles.
- SNG ICM data must never resolve for chipEV profiles.
- UI may display model metadata and assumptions, but not source URLs or provider citations.
- Generated production registry entries must use dynamic `import()` only; CLI release audits call `loadAll`, while runtime training loads the selected profile key.
