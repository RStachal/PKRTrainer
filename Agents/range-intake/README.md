# Range Intake Workspace

This folder is the internal staging area for future legal range inputs. Nothing here is rendered in the app UI.

## Folder Policy

- `raw/` is for local solver exports, permission files and review notes. Its contents are ignored by Git.
- `examples/` contains synthetic JSON examples only. They are shape examples, not poker advice and not production ranges.
- `templates/` contains source-safe CSV templates and coverage checklists for preparing private reviewed inputs.
- Runtime production packs must be generated only after validation and explicit permission review.

## Operator Workflow

1. Choose a concrete missing MTT preflop slot from `buildMttPreflopImportSlots` when importing preflop data.
2. Place the raw legal export under `Agents/range-intake/raw/<pack-id>/`.
3. Add a permission manifest for the same `packId`.
4. Check local intake file presence when staging one or more slots:

```bash
npm run range:intake:guard
npm run range:intake
npm run range:intake -- --kind=preflop --format=SIX_MAX --speed=TURBO
npm run range:intake -- --kind=postflop --format=SIX_MAX --street=RIVER --json
npm run range:intake -- --ready-only --json
npm run range:intake -- --waiting-only
```

The guard checks that `raw/` still ignores private local inputs and has no tracked raw files beyond
`.gitignore` and `README.md`. The status command is source-free and only checks whether each legal slot has its expected
`normalized.json` and `permission.json` files. Use `--ready-only` for slots that can go straight to
`validate:range-import`, or `--waiting-only` for slots still missing local files. The MTT intake plan prints both the
validation command and the matching `build:range-module --dry-run` command for each slot. The ready validator repeats
the dry-run build command for every ready slot it checks.

For a blocker-only queue that combines completion readiness with the same local file presence checks:

```bash
npm run mtt:completion -- --summary
npm run mtt:completion -- --preview --json
npm run mtt:blockers
npm run mtt:blockers -- --summary
npm run mtt:blockers -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json
npm run mtt:postflop-release -- --summary
npm run mtt:intake-plan
npm run mtt:intake-plan -- --summary
npm run mtt:intake-plan -- --ready-only --json
npm run mtt:intake-plan -- --priority=P1_PREFLOP_CHIP_EV --all
npm run mtt:intake-plan -- --priority=P2_PREFLOP_DOLAR_EV --all
npm run mtt:validate-ready-intake
npm run mtt:validate-ready-intake -- --priority=P1_PREFLOP_CHIP_EV --json
npm run mtt:validate-ready-intake -- --priority=P2_PREFLOP_DOLAR_EV --json
npm run mtt:intake-plan -- --all
```
5. Validate the normalized import:

```bash
npm run validate:range-import -- --kind=mtt-preflop --permission-manifest Agents/range-intake/raw/<pack-id>/permission.json Agents/range-intake/raw/<pack-id>/normalized.json
```

or:

```bash
npm run validate:range-import -- --kind=flop-production --permission-manifest Agents/range-intake/raw/<pack-id>/permission.json Agents/range-intake/raw/<pack-id>/normalized.json
```

or:

```bash
npm run validate:range-import -- --kind=turn-production --permission-manifest Agents/range-intake/raw/<pack-id>/permission.json Agents/range-intake/raw/<pack-id>/normalized.json
```

or:

```bash
npm run validate:range-import -- --kind=river-production --permission-manifest Agents/range-intake/raw/<pack-id>/permission.json Agents/range-intake/raw/<pack-id>/normalized.json
```

6. Review the CLI report. Promotion is blocked unless both `productionReady: true` and `permissionReady: true`.
   Add `--json` to the validation command when batch tooling needs structured readiness, legal-slot and permission results.
7. Dry-run the TypeScript module generation:

```bash
npm run build:range-module -- --kind=mtt-preflop --dry-run --permission-manifest Agents/range-intake/raw/<pack-id>/permission.json Agents/range-intake/raw/<pack-id>/normalized.json
```

Add `--json` to any dry-run command when automation needs `writeReady`, matched import slots and blockers as structured output.

or:

```bash
npm run build:range-module -- --kind=flop-production --dry-run --permission-manifest Agents/range-intake/raw/<pack-id>/permission.json Agents/range-intake/raw/<pack-id>/normalized.json
```

or:

```bash
npm run build:range-module -- --kind=turn-production --dry-run --permission-manifest Agents/range-intake/raw/<pack-id>/permission.json Agents/range-intake/raw/<pack-id>/normalized.json
```

or:

```bash
npm run build:range-module -- --kind=river-production --dry-run --permission-manifest Agents/range-intake/raw/<pack-id>/permission.json Agents/range-intake/raw/<pack-id>/normalized.json
```

8. Generate the production TypeScript pack only after the dry-run says `writeReady: true`.
9. Hand-review the generated module before wiring it into a registry.
10. Run `npm run verify:ranges`, targeted tests, `npm run typecheck` and `npm run build`.
11. Keep the app UI source-free: no URLs, providers, pack IDs or internal rule IDs in visible gameplay output.

MTT preflop slot paths use:

- `packId`: `mtt-<full-ring-9|six-max>-<regular|turbo>-preflop-<chip-ev|dolar-ev>-ante-<on|off>-production-v1`
- normalized input: `Agents/range-intake/raw/<packId>/normalized.json`
- permission manifest: `Agents/range-intake/raw/<packId>/permission.json`

MTT postflop slot paths use:

- `packId`: `mtt-<full-ring-9|six-max>-<regular|turbo>-<flop|turn|river>-<chip-ev|dolar-ev>-ante-<on|off>-production-v1`
- normalized input: `Agents/range-intake/raw/<packId>/normalized.json`
- permission manifest: `Agents/range-intake/raw/<packId>/permission.json`

Postflop production inputs (`flop-production`, `turn-production`, `river-production`) must declare profile coverage in `dimensions.blindSpeeds` and `dimensions.antes`. The MTT completion gate only treats a pack as covering rows whose `tableFormat`, `evModel`, `street`, `blindSpeed` and `ante` are all explicitly declared.

## Required Permission Manifest Fields

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

The manifest and normalized production imports must use internal `referenceId` values instead of URL fields and must not
contain placeholder text such as `TODO`, `TBD`, `FIXME` or `REPLACE_ME`.
