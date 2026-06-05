import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildFlopProductionCoverageReport,
  type FlopProductionStrategyPack,
} from "../../src/data/ranges/flopProductionStrategyPack";
import {
  buildMttPreflopImportReadinessReport,
  type MttPreflopRangePackImportInput,
} from "../../src/data/ranges/mttPreflopRangePackImport";
import {
  buildProductionPermissionManifestReport,
  renderProductionPermissionManifestReport,
  type ProductionPermissionManifest,
} from "../../src/data/ranges/productionPermissionManifest";

function readExample<T>(path: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), path), "utf8")) as T;
}

describe("range intake examples", () => {
  it("drzi MTT preflop priklad jako synteticky shape-only import", () => {
    const input = readExample<MttPreflopRangePackImportInput>(
      "Agents/range-intake/examples/mtt-preflop-minimal.synthetic.json",
    );
    const report = buildMttPreflopImportReadinessReport(input);

    expect(input.licenseNote).toContain("Synthetic shape example only");
    expect(report.valid).toBe(false);
    expect(report.productionReady).toBe(false);
    expect(report.errors).toContain("records[0] is missing 166 hand classes.");
  });

  it("drzi flop priklad jako validni shape-only import bez production coverage", () => {
    const pack = readExample<FlopProductionStrategyPack>(
      "Agents/range-intake/examples/flop-production-minimal.synthetic.json",
    );
    const report = buildFlopProductionCoverageReport(pack);

    expect(pack.licenseNote).toContain("Synthetic shape example only");
    expect(report.errors).toEqual([]);
    expect(report.productionReady).toBe(false);
    expect(report.missingPotTypes).toEqual(["THREE_BET_POT"]);
    expect(report.missingPositionPatterns).toContain("EP_VS_BB");
    expect(report.missingRangeLanes).toEqual([]);
  });

  it("validuje source-free permission manifest priklad", () => {
    const manifest = readExample<ProductionPermissionManifest>(
      "Agents/range-intake/examples/permission-manifest.synthetic.json",
    );
    const report = buildProductionPermissionManifestReport(manifest, {
      packId: manifest.packId,
      licenseKind: manifest.licenseKind,
    });
    const rendered = renderProductionPermissionManifestReport(report);

    expect(report.valid).toBe(true);
    expect(rendered).toContain("permissionReady: true");
    expect(rendered).not.toContain("http");
    expect(rendered).not.toContain("url");
  });

  it("odmitne URL pole v permission manifestu", () => {
    const manifest = readExample<ProductionPermissionManifest>(
      "Agents/range-intake/examples/permission-manifest.synthetic.json",
    );
    const report = buildProductionPermissionManifestReport(
      {
        ...manifest,
        evidence: [
          {
            ...manifest.evidence[0],
            url: "https://example.test/not-allowed",
          },
        ],
      } as unknown as ProductionPermissionManifest,
      {
        packId: manifest.packId,
        licenseKind: manifest.licenseKind,
      },
    );

    expect(report.valid).toBe(false);
    expect(report.errors.join("\n")).toContain("internal reference IDs instead of URL fields");
  });
});
