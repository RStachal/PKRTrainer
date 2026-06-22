import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  discoverMttProductionModules,
  refreshMttProductionRegistry,
  renderMttProductionRegistry,
} from "../../scripts/mttProductionRegistryFile.mts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("MTT production registry generator", () => {
  it("bez production modulu vytvori prazdny typovany katalog", () => {
    const directory = temporaryDirectory();

    expect(discoverMttProductionModules(directory)).toEqual([]);
    expect(renderMttProductionRegistry([])).toContain(
      "generatedMttProductionManifest: readonly GeneratedMttProductionManifestEntry[] = [];",
    );
  });

  it("objevi jeden realny modul kazdeho druhu a stabilne je seradi podle packId", () => {
    const directory = temporaryDirectory();
    writeModule(directory, "mtt-z-production-turn.ts", "mtt-six-max-turbo-turn-dolar-ev-ante-off-production-v1", "turnPack");
    writeModule(directory, "mtt-a-production-preflop.ts", "mtt-full-ring-9-regular-preflop-chip-ev-ante-on-production-v1", "preflopPack");
    writeModule(directory, "mtt-c-production-river.ts", "mtt-six-max-regular-river-chip-ev-ante-on-production-v1", "riverPack");
    writeModule(directory, "mtt-b-production-flop.ts", "mtt-full-ring-9-turbo-flop-dolar-ev-ante-off-production-v1", "flopPack");
    writeFileSync(
      join(directory, "mtt-invalid-production-flop.ts"),
      'export const missingId = {};\n',
      "utf8",
    );

    const modules = discoverMttProductionModules(directory);
    expect(modules.map((module) => module.packId)).toEqual([
      "mtt-full-ring-9-regular-preflop-chip-ev-ante-on-production-v1",
      "mtt-full-ring-9-turbo-flop-dolar-ev-ante-off-production-v1",
      "mtt-six-max-regular-river-chip-ev-ante-on-production-v1",
      "mtt-six-max-turbo-turn-dolar-ev-ante-off-production-v1",
    ]);

    const registry = renderMttProductionRegistry(modules);
    expect(registry).not.toContain('import { preflopPack } from "./mtt-a-production-preflop";');
    expect(registry).toContain(
      'profileKey: "FULL_RING_9|REGULAR|CHIP_EV|PREFLOP|ON"',
    );
    expect(registry).toContain(
      'load: () => import("./mtt-a-production-preflop").then((module) => module.preflopPack)',
    );
  });

  it("zapisuje katalog idempotentne a opakovany run nevytvori diff", () => {
    const directory = temporaryDirectory();
    const registryPath = join(directory, "registry.generated.ts");
    writeModule(
      directory,
      "mtt-a-production-preflop.ts",
      "mtt-full-ring-9-regular-preflop-chip-ev-ante-on-production-v1",
      "preflopPack",
    );

    const first = refreshMttProductionRegistry({
      rangeDir: directory,
      registryPath,
      write: true,
    });
    const second = refreshMttProductionRegistry({
      rangeDir: directory,
      registryPath,
      write: true,
    });

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(readFileSync(registryPath, "utf8")).toBe(first.text);
  });
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-mtt-registry-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeModule(
  directory: string,
  fileName: string,
  packId: string,
  exportName: string,
): void {
  writeFileSync(
    join(directory, fileName),
    `export const ${exportName} = {\n  "id": "${packId}"\n};\n`,
    "utf8",
  );
}
