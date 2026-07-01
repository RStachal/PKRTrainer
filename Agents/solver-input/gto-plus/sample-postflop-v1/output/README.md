# Solver output workspace

This folder is a local workspace for solver exports produced while validating MTT postflop ranges.

Do not commit raw solver output. TexasSolver/GTO+/Pio-style raw trees, raw strategy dumps, logs, and intermediate
review files should stay local until they are reviewed and converted through the canonical intake pipeline:

```text
Agents/range-intake/raw/<packId>/normalized.json
Agents/range-intake/raw/<packId>/permission.json
```

Current local output folders are intentionally ignored by `.gitignore`:

```text
output/gto-plus/
output/texas-solver/
```

Only source-safe tooling, tests, documentation, and final reviewed runtime modules belong in git.
