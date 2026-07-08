import { describe, expect, it } from "vitest";

import {
  CONTENT_PACK_MANIFEST_SCHEMA,
  buildContentPackLibraryReport,
  buildContentPackUpdatePlan,
  validateContentPackManifest,
  type ContentPackManifest,
} from "../../src/pwa/contentPackManifest";

const hashA = `sha256:${"a".repeat(64)}`;
const hashB = `sha256:${"b".repeat(64)}`;

function manifest(overrides: Partial<ContentPackManifest> = {}): ContentPackManifest {
  return {
    schema: CONTENT_PACK_MANIFEST_SCHEMA,
    generatedAt: "2026-07-08T12:00:00.000Z",
    appShellVersion: "app-shell-v1",
    packs: [
      {
        id: "mtt-preflop-core-preview",
        label: "MTT preflop core preview",
        kind: "MTT_PREFLOP",
        releaseTrain: "mtt-preflop-preview",
        scenarioId: "mtt-9max-regular-chip-ev-preflop-core",
        version: "preview-v1",
        installMode: "BUNDLED",
        assetPath: "assets/mtt-preflop-core-preview.js",
        bytes: 1200,
        sha256: hashA,
        dependencies: [],
        resumable: false,
        chunkBytes: 1200,
      },
      {
        id: "mtt-flop-pilot-lab",
        label: "MTT flop pilot lab",
        kind: "MTT_POSTFLOP_PILOT",
        releaseTrain: "mtt-postflop-pilot",
        scenarioId: "mtt-9max-regular-chip-ev-flop-pilots",
        version: "pilot-v1",
        installMode: "OPTIONAL",
        assetPath: "packs/mtt-flop-pilot-lab.json",
        bytes: 4096,
        sha256: hashB,
        dependencies: ["mtt-preflop-core-preview"],
        rollbackVersion: "pilot-v0",
        resumable: true,
        chunkBytes: 1024,
      },
    ],
    ...overrides,
  };
}

describe("contentPackManifest", () => {
  it("vytvori offline content library report po release trainu a scenari", () => {
    const report = buildContentPackLibraryReport(manifest(), [
      {
        id: "mtt-preflop-core-preview",
        version: "preview-v1",
        sha256: hashA,
        bytes: 1200,
      },
    ]);

    expect(report).toMatchObject({
      valid: true,
      counts: {
        packs: 2,
        bundled: 1,
        optional: 1,
        remoteDisabled: 0,
        totalBytes: 5296,
        errors: 0,
      },
      releaseTrains: ["mtt-postflop-pilot", "mtt-preflop-preview"],
      scenarioIds: [
        "mtt-9max-regular-chip-ev-flop-pilots",
        "mtt-9max-regular-chip-ev-preflop-core",
      ],
    });
    expect(report.updatePlan.map((item) => `${item.id}:${item.action}`)).toEqual([
      "mtt-flop-pilot-lab:INSTALL",
      "mtt-preflop-core-preview:KEEP",
    ]);
  });

  it("naplanuje update, remove a rollback metadata bez nacitani packu do app shellu", () => {
    const plan = buildContentPackUpdatePlan(manifest(), [
      {
        id: "mtt-flop-pilot-lab",
        version: "pilot-v0",
        sha256: `sha256:${"c".repeat(64)}`,
        bytes: 2048,
      },
      {
        id: "orphan-old-pack",
        version: "old",
        sha256: `sha256:${"d".repeat(64)}`,
        bytes: 12,
      },
    ]);

    expect(plan).toEqual([
      {
        id: "mtt-flop-pilot-lab",
        action: "UPDATE",
        reason: "Installed pack differs from manifest version or hash.",
        fromVersion: "pilot-v0",
        toVersion: "pilot-v1",
        bytes: 4096,
        resumable: true,
        rollbackVersion: "pilot-v0",
      },
      {
        id: "mtt-preflop-core-preview",
        action: "INSTALL",
        reason: "Pack is not installed yet.",
        fromVersion: null,
        toVersion: "preview-v1",
        bytes: 1200,
        resumable: false,
        rollbackVersion: null,
      },
      {
        id: "orphan-old-pack",
        action: "REMOVE",
        reason: "Installed pack is not present in the current manifest.",
        fromVersion: "old",
        toVersion: null,
        bytes: 12,
        resumable: false,
        rollbackVersion: null,
      },
    ]);
  });

  it("validuje hash, relativni offline asset path, resumable optional pack a dependencies", () => {
    const invalid = manifest({
      packs: [
        {
          ...manifest().packs[0],
          sha256: "abc",
          assetPath: "https://example.test/pack.js",
          bytes: -1,
          dependencies: ["mtt-preflop-core-preview", "missing-pack"],
        },
        {
          ...manifest().packs[1],
          id: "mtt-preflop-core-preview",
          dependencies: ["mtt-preflop-core-preview"],
          resumable: false,
          chunkBytes: 0,
        },
      ],
    });

    expect(validateContentPackManifest(invalid)).toEqual([
      "mtt-preflop-core-preview: assetPath must be a relative offline asset path.",
      "mtt-preflop-core-preview: bytes must be a non-negative integer.",
      "mtt-preflop-core-preview: sha256 must use sha256:<64 hex chars> format.",
      "mtt-preflop-core-preview: pack cannot depend on itself.",
      "mtt-preflop-core-preview: duplicate content pack id.",
      "mtt-preflop-core-preview: chunkBytes must be a positive integer.",
      "mtt-preflop-core-preview: optional packs must support resumable install.",
      "mtt-preflop-core-preview: pack cannot depend on itself.",
      "mtt-preflop-core-preview: unknown dependency missing-pack.",
    ]);
  });

  it("blokuje packy oznacene jako remote disabled", () => {
    const disabled = manifest({
      packs: [
        {
          ...manifest().packs[0],
          installMode: "REMOTE_DISABLED",
        },
      ],
    });

    expect(buildContentPackUpdatePlan(disabled, [])[0]).toMatchObject({
      id: "mtt-preflop-core-preview",
      action: "BLOCKED",
      reason: "Pack is listed but remote install is disabled.",
    });
  });
});
