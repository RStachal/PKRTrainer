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
  buildTurnProductionCoverageReport,
  type TurnProductionStrategyPack,
} from "../../src/data/ranges/turnProductionStrategyPack";
import {
  buildRiverProductionCoverageReport,
  type RiverProductionStrategyPack,
} from "../../src/data/ranges/riverProductionStrategyPack";
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

  it("odmitne placeholder text v MTT preflop importu", () => {
    const input = readExample<MttPreflopRangePackImportInput>(
      "Agents/range-intake/examples/mtt-preflop-minimal.synthetic.json",
    );
    const report = buildMttPreflopImportReadinessReport({
      ...input,
      licenseNote: "TODO replace with real license review.",
    });

    expect(report.valid).toBe(false);
    expect(report.errors.join("\n")).toContain("MTT preflop import must replace placeholder text");
    expect(report.errors.join("\n")).toContain("$.licenseNote");
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
    expect(report.missingPositionPatterns).toContain("SRP_UTG_VS_BB");
    expect(report.missingRangeLanes).toEqual([]);
  });

  it("odmitne placeholder text ve flop production importu", () => {
    const pack = readExample<FlopProductionStrategyPack>(
      "Agents/range-intake/examples/flop-production-minimal.synthetic.json",
    );
    const report = buildFlopProductionCoverageReport({
      ...pack,
      rules: [
        {
          ...pack.rules[0],
          explanation: "REPLACE_ME with reviewed flop explanation.",
        },
      ],
    });

    expect(report.productionReady).toBe(false);
    expect(report.errors.join("\n")).toContain("Flop production pack must replace placeholder text");
    expect(report.errors.join("\n")).toContain("$.rules[0].explanation");
  });

  it("drzi turn priklad jako validni shape-only import bez production coverage", () => {
    const pack = readExample<TurnProductionStrategyPack>(
      "Agents/range-intake/examples/turn-production-minimal.synthetic.json",
    );
    const report = buildTurnProductionCoverageReport(pack);

    expect(pack.licenseNote).toContain("Synthetic shape example only");
    expect(report.errors).toEqual([]);
    expect(report.productionReady).toBe(false);
    expect(report.missingPotTypes).toEqual(["THREE_BET_POT"]);
    expect(report.missingPriorFlopActions).toEqual(["CHECK", "BET_BIG", "CALL", "RAISE"]);
    expect(report.missingTurnCardClasses).toContain("DYNAMIC");
    expect(report.missingRangeLanes).toEqual([]);
  });

  it("odmitne placeholder text v turn production importu", () => {
    const pack = readExample<TurnProductionStrategyPack>(
      "Agents/range-intake/examples/turn-production-minimal.synthetic.json",
    );
    const report = buildTurnProductionCoverageReport({
      ...pack,
      assumptions: [...pack.assumptions, "TBD by reviewer."],
    });

    expect(report.productionReady).toBe(false);
    expect(report.errors.join("\n")).toContain("Turn production pack must replace placeholder text");
    expect(report.errors.join("\n")).toContain("$.assumptions");
  });

  it("drzi river priklad jako validni shape-only import bez production coverage", () => {
    const pack = readExample<RiverProductionStrategyPack>(
      "Agents/range-intake/examples/river-production-minimal.synthetic.json",
    );
    const report = buildRiverProductionCoverageReport(pack);

    expect(pack.licenseNote).toContain("Synthetic shape example only");
    expect(report.errors).toEqual([]);
    expect(report.productionReady).toBe(false);
    expect(report.missingPotTypes).toEqual(["THREE_BET_POT"]);
    expect(report.missingPriorTurnActions).toEqual(["CHECK", "BET_BIG", "CALL", "RAISE"]);
    expect(report.missingRiverRunoutClasses).toContain("DYNAMIC");
    expect(report.missingBlockerRelevance).toEqual(["MEDIUM"]);
    expect(report.missingRangeLanes).toEqual([]);
  });

  it("odmitne placeholder text v river production importu", () => {
    const pack = readExample<RiverProductionStrategyPack>(
      "Agents/range-intake/examples/river-production-minimal.synthetic.json",
    );
    const report = buildRiverProductionCoverageReport({
      ...pack,
      licenseNote: "FIXME after permission review.",
    });

    expect(report.productionReady).toBe(false);
    expect(report.errors.join("\n")).toContain("River production pack must replace placeholder text");
    expect(report.errors.join("\n")).toContain("$.licenseNote");
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

  it("u owned solver exportu akceptuje potvrzeni ownera bez evidence references", () => {
    const manifest = readExample<ProductionPermissionManifest>(
      "Agents/range-intake/examples/permission-manifest.synthetic.json",
    );
    const report = buildProductionPermissionManifestReport({
      ...manifest,
      evidence: [],
      reusePolicy: {
        allowedDimensions: ["BLIND_SPEED"],
        reviewedAt: "2026-07-10",
        reviewer: "PKRTrainer owner",
        rationale: "Owner confirmed owned-export reuse for blind speed.",
        sourceMaterialReferenceIds: [],
      },
    }, {
      packId: manifest.packId,
      licenseKind: "OWNED_SOLVER_EXPORT",
      blindSpeeds: ["REGULAR", "TURBO"],
      evModels: ["CHIP_EV"],
    });

    expect(report.valid).toBe(true);
    expect(report.evidenceCount).toBe(0);
    expect(report.warnings).not.toContain(
      "Permission manifest evidence does not mark where range values are stored.",
    );
  });

  it("u third-party permission vetve evidence nadale vyzaduje", () => {
    const manifest = readExample<ProductionPermissionManifest>(
      "Agents/range-intake/examples/permission-manifest.synthetic.json",
    );
    const report = buildProductionPermissionManifestReport({
      ...manifest,
      licenseKind: "PUBLIC_CHART_WITH_PERMISSION",
      evidence: [],
    }, {
      packId: manifest.packId,
      licenseKind: "PUBLIC_CHART_WITH_PERMISSION",
    });

    expect(report.valid).toBe(false);
    expect(report.errors).toContain("Permission manifest needs at least one evidence record.");
  });

  it("vyzaduje explicitni reuse policy pro multi-speed permission target", () => {
    const manifest = readExample<ProductionPermissionManifest>(
      "Agents/range-intake/examples/permission-manifest.synthetic.json",
    );
    const manifestWithoutPolicy = { ...manifest };
    delete (manifestWithoutPolicy as { reusePolicy?: unknown }).reusePolicy;
    const missingPolicy = buildProductionPermissionManifestReport(manifestWithoutPolicy, {
      packId: manifest.packId,
      licenseKind: manifest.licenseKind,
      blindSpeeds: ["REGULAR", "TURBO"],
      evModels: ["CHIP_EV"],
    });

    expect(missingPolicy.valid).toBe(false);
    expect(missingPolicy.errors.join("\n")).toContain(
      "reviewed BLIND_SPEED reuse policy when target covers multiple blind speeds",
    );

    const withPolicy = buildProductionPermissionManifestReport({
      ...manifest,
      reusePolicy: {
        allowedDimensions: ["BLIND_SPEED"],
        reviewedAt: "2026-06-05",
        reviewer: "PKRTrainer QA",
        rationale: "Synthetic owned export fixture is reviewed for blind-speed reuse.",
        sourceMaterialReferenceIds: [manifest.evidence[0].referenceId],
      },
    }, {
      packId: manifest.packId,
      licenseKind: manifest.licenseKind,
      blindSpeeds: ["REGULAR", "TURBO"],
      evModels: ["CHIP_EV"],
    });

    expect(withPolicy.valid).toBe(true);
    expect(renderProductionPermissionManifestReport(withPolicy)).toContain("reusePolicy: BLIND_SPEED");
  });

  it("odmitne reuse policy bez vazby na evidence reference", () => {
    const manifest = readExample<ProductionPermissionManifest>(
      "Agents/range-intake/examples/permission-manifest.synthetic.json",
    );
    const report = buildProductionPermissionManifestReport({
      ...manifest,
      reusePolicy: {
        allowedDimensions: ["BLIND_SPEED"],
        reviewedAt: "2026-06-05",
        reviewer: "PKRTrainer QA",
        rationale: "Synthetic owned export fixture is reviewed for blind-speed reuse.",
        sourceMaterialReferenceIds: ["missing-evidence"],
      },
    }, {
      packId: manifest.packId,
      licenseKind: manifest.licenseKind,
      blindSpeeds: ["REGULAR", "TURBO"],
      evModels: ["CHIP_EV"],
    });

    expect(report.valid).toBe(false);
    expect(report.errors.join("\n")).toContain("must reference an evidence referenceId");
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

  it("odmitne placeholder text v permission manifestu", () => {
    const manifest = readExample<ProductionPermissionManifest>(
      "Agents/range-intake/examples/permission-manifest.synthetic.json",
    );
    const report = buildProductionPermissionManifestReport(
      {
        ...manifest,
        reviewer: "TODO reviewer",
        evidence: [
          {
            ...manifest.evidence[0],
            description: "REPLACE_ME with real evidence description.",
          },
        ],
      },
      {
        packId: manifest.packId,
        licenseKind: manifest.licenseKind,
      },
    );

    expect(report.valid).toBe(false);
    expect(report.errors.join("\n")).toContain("replace placeholder text before promotion");
    expect(report.errors.join("\n")).toContain("$.reviewer");
    expect(report.errors.join("\n")).toContain("$.evidence[0].description");
  });
});
