import { anteOnRanges } from "../src/data/ranges/ante-on/index.ts";
import { anteOffRanges } from "../src/data/ranges/ante-off/index.ts";
import { validateRangeFile } from "../src/data/ranges/schema.ts";

for (const file of [anteOnRanges, anteOffRanges]) {
  const errors = validateRangeFile(file);
  const ctxCounts: Record<string, number> = {};
  let handCount = 0;
  for (const r of file.entries) {
    ctxCounts[r.context] = (ctxCounts[r.context] ?? 0) + 1;
    handCount += Object.keys(r.strict).length;
  }
  console.log(`\n=== ante=${file.ante} v${file.version} ===`);
  console.log(`records: ${file.entries.length}`);
  console.log(`validateRangeFile errors: ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 20).join("\n"));
  console.log(`total strict hand entries: ${handCount}`);
  console.log(`records per context:`, ctxCounts);
}
