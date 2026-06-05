# Range Intake Workspace

This folder is the internal staging area for future legal range inputs. Nothing here is rendered in the app UI.

## Folder Policy

- `raw/` is for local solver exports, permission files and review notes. Its contents are ignored by Git.
- `examples/` contains synthetic JSON examples only. They are shape examples, not poker advice and not production ranges.
- Runtime production packs must be generated only after validation and explicit permission review.

## Operator Workflow

1. Place the raw legal export under `Agents/range-intake/raw/<pack-id>/`.
2. Add a permission manifest for the same `packId`.
3. Validate the normalized import:

```bash
npm run validate:range-import -- --kind=mtt-preflop --permission-manifest Agents/range-intake/raw/<pack-id>/permission.json Agents/range-intake/raw/<pack-id>/normalized.json
```

or:

```bash
npm run validate:range-import -- --kind=flop-production --permission-manifest Agents/range-intake/raw/<pack-id>/permission.json Agents/range-intake/raw/<pack-id>/normalized.json
```

4. Review the CLI report. Promotion is blocked unless both `productionReady: true` and `permissionReady: true`.
5. Dry-run the TypeScript module generation:

```bash
npm run build:range-module -- --kind=mtt-preflop --dry-run --permission-manifest Agents/range-intake/raw/<pack-id>/permission.json Agents/range-intake/raw/<pack-id>/normalized.json
```

or:

```bash
npm run build:range-module -- --kind=flop-production --dry-run --permission-manifest Agents/range-intake/raw/<pack-id>/permission.json Agents/range-intake/raw/<pack-id>/normalized.json
```

6. Generate the production TypeScript pack only after the dry-run says `writeReady: true`.
7. Hand-review the generated module before wiring it into a registry.
8. Run `npm run verify:ranges`, targeted tests, `npm run typecheck` and `npm run build`.
9. Keep the app UI source-free: no URLs, providers, pack IDs or internal rule IDs in visible gameplay output.

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

The manifest must use internal `referenceId` values instead of URL fields.
