import { describe, expect, it } from "vitest";
import {
  buildRangeModuleDryRunCommand,
  validateRangeImportCommand,
} from "../../src/data/ranges/rangeImportCommands.ts";

describe("range import commands", () => {
  const slot = {
    kind: "river-production" as const,
    normalizedInputPath: "Agents/range-intake/raw/example/normalized.json",
    permissionManifestPath: "Agents/range-intake/raw/example/permission.json",
  };

  it("builds the source-free validate command for an import slot", () => {
    expect(validateRangeImportCommand(slot)).toBe(
      [
        "npm run validate:range-import --",
        "--kind=river-production",
        "--permission-manifest Agents/range-intake/raw/example/permission.json",
        "Agents/range-intake/raw/example/normalized.json",
      ].join(" "),
    );
  });

  it("builds the matching dry-run module build command for an import slot", () => {
    expect(buildRangeModuleDryRunCommand(slot)).toBe(
      [
        "npm run build:range-module --",
        "--kind=river-production",
        "--dry-run",
        "--permission-manifest Agents/range-intake/raw/example/permission.json",
        "Agents/range-intake/raw/example/normalized.json",
      ].join(" "),
    );
  });
});
