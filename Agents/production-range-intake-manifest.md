# Production Range Intake Manifest

Updated: 2026-06-05

This file defines what must be provided before candidate or missing ranges can be promoted to production. It is an internal engineering checklist; the app UI must remain source-free.

## Legal Input Rule

Accepted inputs:

- Owned solver export generated for PKRTrainer
- Public chart data with explicit permission to copy and redistribute inside this project
- Explicit written permission from the rights holder

Rejected inputs:

- Public metadata only
- Marketing pages without permission to copy chart values
- Manually inferred frequencies or ranges from screenshots/videos
- Paid chart values copied from a subscription product without permission

## MTT Preflop Input

Required for each target profile:

- `gameVariant`: `MTT`
- `tableFormat`: `FULL_RING_9` or `SIX_MAX`
- `blindSpeed`: `REGULAR` or `TURBO`
- `street`: `PREFLOP`
- `evModel`: `CHIP_EV` or `DOLAR_EV`
- `ante`: `ON` or `OFF`
- `rakeMode`: `NONE`
- `confidence`: `MEDIUM` or `HIGH`
- `licenseKind`: `OWNED_SOLVER_EXPORT`, `PUBLIC_CHART_WITH_PERMISSION`, or `EXPLICIT_WRITTEN_PERMISSION`
- At least two source evidence records
- At least three search/review notes
- Explicit assumptions for blind speed, ante model, stack mapping and tournament structure

Each record must include:

- `position`
- `sourceStackBB`
- `bucket`
- `context`
- `strict` map for all 169 hand classes
- `lenient` map for all 169 hand classes

Production readiness requires coverage of:

- All positions for the table format
- All supported stack buckets: `5,10,15,20,25,30,40,50,60,75,100,125,150`
- All action contexts: `RFI,VS_LIMP,VS_OPEN,VS_3BET,VS_4BET,SQUEEZE,BVB,PUSH_FOLD,VS_ALLIN`

Validator:

- `buildMttPreflopImportReadinessReport`
- `buildMttPreflopImportSlots` for the concrete non-production MTT preflop import slot list
- `npm run verify:ranges`
- `npm run validate:range-import -- --kind=mtt-preflop --permission-manifest <manifest.json> <input.json>`
- `npm run validate:range-import -- --kind=mtt-preflop --permission-manifest <manifest.json> --json <input.json>` for batch tooling
- `npm run build:range-module -- --kind=mtt-preflop --dry-run --permission-manifest <manifest.json> --json <input.json>` for structured write-readiness checks

Current legal import slots are generated from the MTT completion matrix for every non-production preflop profile. Each slot uses:

- `packId`: `mtt-<full-ring-9|six-max>-<regular|turbo>-preflop-<chip-ev|dolar-ev>-ante-<on|off>-production-v1`
- normalized input: `Agents/range-intake/raw/<packId>/normalized.json`
- permission manifest: `Agents/range-intake/raw/<packId>/permission.json`

## Flop Production Input

Required for each production StrategyPack:

- `gameVariant`: `MTT`
- `tableFormat`: `FULL_RING_9` or `SIX_MAX`
- `blindSpeeds`: one or more of `REGULAR`, `TURBO`
- `street`: `FLOP`
- `evModel`: `CHIP_EV` or `DOLAR_EV`
- `antes`: one or more of `ON`, `OFF`
- `confidence`: `MEDIUM` or `HIGH`
- Legal `licenseKind`
- At least two source evidence records
- Explicit assumptions

Each rule must include:

- `actionNode`
- `potType`
- `positionPattern`
- `boardTextures`
- `sprMin` / `sprMax`
- Available `actions`: `CHECK/BET_SMALL/BET_BIG` for c-bet nodes, `FOLD/CALL/RAISE` for `FLOP_FACING_BET`
- `recommendedAction`
- `rangeBuckets` with optional `actionMix` metadata; exact frequencies require owned export or explicit written permission
- Explanation text

Production readiness requires coverage of:

- Pot types: `SINGLE_RAISED`, `THREE_BET_POT`
- Position patterns: the 50 granular MTT postflop patterns reported by `npm run mtt:postflop-positions`, e.g. `SRP_UTG_VS_BB`, `SRP_BTN_VS_BB`, `SRP_SB_VS_BB`, `SRP_HJ_VS_CO`, `3BP_BTN_VS_UTG`
- Board textures: `paired`, `monotone`, `two-tone`, `rainbow`, `connected`, `dry`, `ace-high`, `broadway-high`, `low`, `medium`, `straight-possible`, `flush-draw-heavy`, `disconnected`
- Action nodes: `SINGLE_RAISED_POT_CBET`, `THREE_BET_POT_CBET`, `FLOP_FACING_BET`
- Range lanes: `VALUE`, `BLUFF`, `CHECK`

Validator:

- `buildFlopProductionCoverageReport`
- `renderFlopProductionCoverageReport`
- `buildMttPostflopImportSlots` for concrete MTT postflop import slot paths
- `npm run verify:ranges`
- `npm run validate:range-import -- --kind=flop-production --permission-manifest <manifest.json> <input.json>`

## Turn Production Input

Required for each production StrategyPack:

- `gameVariant`: `MTT`
- `tableFormat`: `FULL_RING_9` or `SIX_MAX`
- `blindSpeeds`: one or more of `REGULAR`, `TURBO`
- `street`: `TURN`
- `evModel`: `CHIP_EV` or `DOLAR_EV`
- `antes`: one or more of `ON`, `OFF`
- `confidence`: `MEDIUM` or `HIGH`
- Legal `licenseKind`
- At least two source evidence records
- Explicit assumptions

Each rule must include:

- `actionNode`: `TURN_BARREL`
- `potType`
- `positionPattern`
- `priorFlopAction`
- `turnCardClasses`
- `sprMin` / `sprMax`
- Available `actions`
- `recommendedAction`
- `rangeBuckets` with optional `actionMix` metadata; exact frequencies require owned export or explicit written permission
- Explanation text

Production readiness requires coverage of:

- Pot types: `SINGLE_RAISED`, `THREE_BET_POT`
- Position patterns: the 50 granular MTT postflop patterns reported by `npm run mtt:postflop-positions`, e.g. `SRP_UTG_VS_BB`, `SRP_BTN_VS_BB`, `SRP_SB_VS_BB`, `SRP_HJ_VS_CO`, `3BP_BTN_VS_UTG`
- Prior flop actions: `CHECK`, `BET_SMALL`, `BET_BIG`
- Turn card classes: `BLANK`, `LOW_BRICK`, `OVER_CARD`, `BROADWAY`, `BOARD_PAIRING`, `FLUSH_COMPLETING`, `STRAIGHT_COMPLETING`, `DYNAMIC`
- Action nodes: `TURN_BARREL`
- Range lanes: `VALUE`, `BLUFF`, `CHECK`

Validator:

- `buildTurnProductionCoverageReport`
- `renderTurnProductionCoverageReport`
- `buildMttPostflopImportSlots` for concrete MTT postflop import slot paths
- `npm run verify:ranges`
- `npm run validate:range-import -- --kind=turn-production --permission-manifest <manifest.json> <input.json>`

## River Production StrategyPack Input

River production packs use the same permission gate as flop and turn and add river-specific dimensions:

- `gameVariant`: `MTT`
- `tableFormat`: `FULL_RING_9` or `SIX_MAX`
- `blindSpeeds`: one or more of `REGULAR`, `TURBO`
- `street`: `RIVER`
- `evModel`: `CHIP_EV` or `DOLAR_EV`
- `antes`: one or more of `ON`, `OFF`
- `priorTurnAction`
- `riverRunoutClasses`
- `blockerRelevance`
- `rangeBuckets` with `VALUE`, `BLUFF` and `CHECK` lanes
- Optional `actionMix` metadata; exact frequencies require owned export or explicit written permission

Validator:

- `buildRiverProductionCoverageReport`
- `renderRiverProductionCoverageReport`
- `buildMttPostflopImportSlots` for concrete MTT postflop import slot paths
- `npm run validate:range-import -- --kind=river-production --permission-manifest <manifest.json> <input.json>`

## Permission Manifest

Every production promotion must include a separate permission manifest. The import can be technically valid, but the CLI must still fail unless the permission report says `permissionReady: true`.

Required fields:

- `packId`
- `version`
- `reviewedAt`
- `reviewer`
- `rightsOwner`
- `licenseKind`
- `allowedRedistributionScope`
- `sourceMaterialLocation`
- `evidence`
- `notes`

Accepted `allowedRedistributionScope` for production:

- `PKRTRAINER_RUNTIME_BUNDLE`

Rejected scopes:

- `PKRTRAINER_INTERNAL_REVIEW_ONLY`
- `NO_REDISTRIBUTION`

The manifest must use internal `referenceId` evidence instead of URL fields. The CLI report is intentionally source-free and prints only pack id, license kind, redistribution scope, reviewer, rights owner and evidence count.

Example files:

- `Agents/range-intake/examples/mtt-preflop-minimal.synthetic.json`
- `Agents/range-intake/examples/flop-production-minimal.synthetic.json`
- `Agents/range-intake/examples/turn-production-minimal.synthetic.json`
- `Agents/range-intake/examples/river-production-minimal.synthetic.json`
- `Agents/range-intake/examples/permission-manifest.synthetic.json`

Raw legal inputs belong under `Agents/range-intake/raw/<pack-id>/`; that folder is ignored by Git.

## Operator Workflow

1. Store the raw legal export and permission evidence under `Agents/range-intake/raw/<pack-id>/`.
2. Normalize the export into the target JSON schema.
3. Add a permission manifest with the same `packId` and matching `licenseKind`.
4. Run `npm run validate:range-import` with `--permission-manifest`.
5. Dry-run module generation with `npm run build:range-module -- --dry-run`.
6. Promote only when both `productionReady: true`, `permissionReady: true` and `writeReady: true`.
7. Run `npm run verify:ranges`, targeted tests, `npm run typecheck` and `npm run build`.
8. Verify that visible app UI remains source-free.

## Production Module Builder

The normalized module builder is intentionally a two-stage workflow:

- `buildRangeModule` creates TypeScript module text only when the import is production-ready and the permission manifest is valid.
- For postflop production, `buildRangeModule` also requires `MTT` gameVariant and at least one legal MTT postflop import slot match from `buildMttPostflopImportSlots`.
- `renderRangeModuleBuildReport` gives a dry-run report with blockers before any file write.
- `npm run build:range-module -- --dry-run ...` prints the report and writes nothing.
- `npm run build:range-module -- --out <module.ts> ...` refuses to overwrite existing files unless `--force` is passed.

Supported build kinds:

- `mtt-preflop`
- `flop-production`
- `turn-production`
- `river-production`
