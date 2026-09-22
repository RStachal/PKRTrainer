import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  OWNER_DECISIONS_2026_09_22_EVENING, OWNER_DECISIONS_2026_09_22_EVENING_INTRO, renderOwnerDecisionsPage,
} from "./lib/ownerDecisions.mts";

/**
 * Stránka s otevřenými rozhodnutími vlastníka, k vyplnění.
 *
 *   npm run mtt:decisions [-- --out=artifacts/review-desk/rozhodnuti.html]
 *
 * Otázky bydlí v `lib/ownerDecisions.mts` (s čísly z měření a doporučením),
 * odpovědi se čtou zpátky přes `npm run mtt:decision-answers`. Stránka je
 * statická, bez odkazů ven, pamatuje si odpovědi podle identity otázky a píše
 * je i do textu, aby přežily „Uložit stránku".
 */

const outPath = process.argv.find((arg) => arg.startsWith("--out="))?.split("=")[1]
  ?? "artifacts/review-desk/rozhodnuti.html";

// Vykresluje se **nejnovější** sada. Zodpovězená sada ze 17. 9. zůstává
// v knihovně kvůli otisku: odpovědi, které z ní vznikly, se musí dát přečíst
// i po přidání dalších otázek.
const html = renderOwnerDecisionsPage(OWNER_DECISIONS_2026_09_22_EVENING, {
  dateLabel: "22. 9. 2026 (večer)",
  intro: OWNER_DECISIONS_2026_09_22_EVENING_INTRO,
  storageKey: "drillev-decisions-2026-09-22-vecer",
});

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html, "utf8");
console.log(`Vykresleno ${OWNER_DECISIONS_2026_09_22_EVENING.length} rozhodnutí do ${outPath}`);
console.log("Otevři to v prohlížeči; stránka je statická a funguje offline.");
