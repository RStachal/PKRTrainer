import type { FlopProductionStrategyPack } from "./flopProductionStrategyPack";
import type { RangePack } from "./rangePack";
import type { RiverProductionStrategyPack } from "./riverProductionStrategyPack";
import type { TurnProductionStrategyPack } from "./turnProductionStrategyPack";
import type {
  GeneratedMttProductionManifestEntry,
  GeneratedMttProductionPack,
} from "./mttProductionRegistry.generated";

const preflopPacks: RangePack[] = [];
const flopPacks: FlopProductionStrategyPack[] = [];
const turnPacks: TurnProductionStrategyPack[] = [];
const riverPacks: RiverProductionStrategyPack[] = [];
const registeredPackIds = new Set<string>();

export const runtimeMttPreflopRangePacks: readonly RangePack[] = preflopPacks;
export const runtimeMttFlopStrategyPacks: readonly FlopProductionStrategyPack[] = flopPacks;
export const runtimeMttTurnStrategyPacks: readonly TurnProductionStrategyPack[] = turnPacks;
export const runtimeMttRiverStrategyPacks: readonly RiverProductionStrategyPack[] = riverPacks;

export function registerMttProductionPack(
  entry: Pick<GeneratedMttProductionManifestEntry, "kind" | "packId">,
  pack: GeneratedMttProductionPack,
): void {
  if (pack.id !== entry.packId) {
    throw new Error(
      `MTT production manifest expected ${entry.packId}, loaded ${pack.id}.`,
    );
  }
  if (registeredPackIds.has(pack.id)) return;

  switch (entry.kind) {
    case "mtt-preflop":
      preflopPacks.unshift(pack as RangePack);
      break;
    case "flop-production":
      flopPacks.push(pack as FlopProductionStrategyPack);
      break;
    case "turn-production":
      turnPacks.push(pack as TurnProductionStrategyPack);
      break;
    case "river-production":
      riverPacks.push(pack as RiverProductionStrategyPack);
      break;
  }
  registeredPackIds.add(pack.id);
}

export function clearMttProductionRuntimeRegistryForTests(): void {
  preflopPacks.length = 0;
  flopPacks.length = 0;
  turnPacks.length = 0;
  riverPacks.length = 0;
  registeredPackIds.clear();
}
