import { mttProductionLazyLoader } from "../src/data/ranges/mttProductionLazyLoader";

export async function loadCompleteMttProductionRegistry(): Promise<void> {
  await mttProductionLazyLoader.loadAll();
}
