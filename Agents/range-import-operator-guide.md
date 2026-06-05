# Range import operator guide

This guide is for maintainers who prepare legal range data for production promotion.

## Ground rules

- Do not copy third-party chart values unless the project has explicit rights to redistribute them.
- Keep raw source material outside the runtime UI.
- Store permission evidence as internal references, not URL fields, in the permission manifest.
- Production promotion requires non-LOW confidence, real records, source evidence and a valid permission manifest.
- Candidate packs may exist as metadata placeholders, but must not be used for production scoring.

## Intake folders

- `Agents/range-intake/examples/` contains synthetic examples.
- `Agents/range-intake/raw/` is ignored by git and is the place for private source exports or review material.
- `Agents/production-range-intake-manifest.md` records the required checklist.

## Validate an MTT preflop import

Use the synthetic example as the command shape:

```powershell
npm run validate:range-import -- --kind=mtt-preflop Agents/range-intake/examples/mtt-preflop-minimal.synthetic.json --permission-manifest Agents/range-intake/examples/permission-manifest.synthetic.json
```

Expected production promotion properties:

- `productionReady: true`
- no errors
- no warnings
- confidence is `MEDIUM` or `HIGH`
- records cover required positions, stack buckets and action contexts
- permission manifest is valid for the exact pack id

## Validate a flop production import

```powershell
npm run validate:range-import -- --kind=flop-production Agents/range-intake/examples/flop-production-minimal.synthetic.json --permission-manifest Agents/range-intake/examples/permission-manifest.synthetic.json
```

Expected properties:

- legal license kind
- confidence is not `LOW`
- rules are present
- all required pot types, position patterns, board textures, action nodes and range lanes are covered
- range buckets use valid hand classes and poker feature labels

## Build a range module

Dry-run first:

```powershell
npm run build:range-module -- --kind=mtt-preflop --input Agents/range-intake/examples/mtt-preflop-minimal.synthetic.json --permission-manifest Agents/range-intake/examples/permission-manifest.synthetic.json --dry-run
```

Only write a module when:

- `writeReady: true`
- permission report is valid
- import readiness has no blockers
- output path is reviewed

## Verify the bundled app

Run:

```powershell
npm run verify:ranges
```

This reports:

- current bundled preflop range file validation
- MTT production readiness by format, speed and ante
- MTT pack import readiness
- flop production strategy readiness

## Release gate

Before releasing:

```powershell
npm run release:check
```

This runs typecheck, tests, range verification and production build.

## Promotion checklist

1. Confirm legal right to redistribute the range data.
2. Put raw evidence in `Agents/range-intake/raw/`.
3. Create or update the permission manifest with internal references.
4. Validate the import with `validate:range-import`.
5. Dry-run `build:range-module`.
6. Review generated coverage and blockers.
7. Add the generated module only after `writeReady: true`.
8. Register the pack in the appropriate resolver.
9. Run `npm run release:check`.
10. Confirm runtime UI remains source-free.
