import type { RangeModuleBuildKind } from "./rangeModuleBuilder.ts";

export interface RangeImportCommandSlot {
  kind: RangeModuleBuildKind;
  normalizedInputPath: string;
  permissionManifestPath: string;
}

export function validateRangeImportCommand(slot: RangeImportCommandSlot): string {
  return [
    "npm run validate:range-import --",
    `--kind=${slot.kind}`,
    `--permission-manifest ${slot.permissionManifestPath}`,
    slot.normalizedInputPath,
  ].join(" ");
}

export function buildRangeModuleDryRunCommand(slot: RangeImportCommandSlot): string {
  return [
    "npm run build:range-module --",
    `--kind=${slot.kind}`,
    "--dry-run",
    `--permission-manifest ${slot.permissionManifestPath}`,
    slot.normalizedInputPath,
  ].join(" ");
}
