import type { AnteMode } from "../../core/types";
import type { RangeFile, RangeRecord } from "./schema";

export function createLazyRangeFile(
  ante: AnteMode,
  version: string,
  buildEntries: () => RangeRecord[],
): RangeFile {
  let entries: RangeRecord[] | null = null;

  return {
    version,
    ante,
    get entries(): RangeRecord[] {
      if (entries === null) entries = buildEntries();
      return entries;
    },
  };
}
