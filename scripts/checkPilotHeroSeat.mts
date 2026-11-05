import { generatedMttPostflopPilotPacks } from "../src/data/ranges/mttPostflopPilotPacks.generated";
import { MTT_POSTFLOP_PILOT_CATALOG } from "../src/data/ranges/mttPostflopPilotCatalog";
import { pilotHeroSeat, pilotReviewOrder } from "./lib/flopPilotReview.mts";

/**
 * Čí strategii pilot drží, a jestli to jeho jméno říká.
 *
 *   npm run mtt:pilot-hero-seat
 *
 * ## Proč to musí vzniknout
 *
 * Druhé čtení 9. 9. 2026 vytklo jako blokující nález, že pilot „BTN vs CO
 * 3bet-pot facing bet" drží range **druhého** hráče: nemá AA, KK, AKs ani AKo,
 * zato má 44-77 a 64s, což je range toho, kdo 3bet dorovnal. Táž námitka padla
 * na „BTN vs BB facing bet".
 *
 * Jenže vzor v `positionPattern` je `<agresor>_VS_<dorovnávající>`, ne
 * `<hrdina>_vs_<soupeř>` - viz `threeBetPositionPattern` a
 * `oopCallerVsIpThreeBettorContext`. U uzlu `FLOP_FACING_BET` je hrdinou právě
 * ten, kdo dorovnal, takže **ta range je správná a jméno je zavádějící**.
 *
 * Je to bod 39 o patro výš: tam digest neřekl, čí strategii čtenář vidí, a
 * sedačka cutoffu dostala odpovědi big blindu. Tady se to nestalo v datech, ale
 * v hlavě čtenáře - a stálo to blokující nález. Tenhle skript to měří, aby se
 * příště nemuselo hádat: složení range se porovná s tím, co má sedačka držet.
 */

const PREMIUM = ["AA", "KK", "AKs", "AKo"] as const;
const SMALL_PAIRS = ["44", "55", "66", "77"] as const;

const catalogById = new Map(MTT_POSTFLOP_PILOT_CATALOG.map((entry) => [entry.id, entry]));
const order = pilotReviewOrder(generatedMttPostflopPilotPacks);

console.log("Čí strategii pilot drží");
console.log("");

let misleading = 0;

for (const [index, entry] of order.entries()) {
  const catalog = catalogById.get(entry.catalogId);
  const label = catalog?.label ?? entry.catalogId;
  const rule = entry.pack.rules[0];
  if (rule === undefined) continue;

  const seat = pilotHeroSeat(rule.positionPattern, rule.actionNode);
  const classes = new Set<string>();
  for (const packRule of entry.pack.rules) {
    for (const bucket of packRule.rangeBuckets) {
      for (const hand of bucket.handClasses) classes.add(hand);
    }
  }

  const premium = PREMIUM.filter((hand) => classes.has(hand));
  const small = SMALL_PAIRS.filter((hand) => classes.has(hand));

  // Jméno pilota jmenuje sedačku první; když je to jiná sedačka než ta, jejíž
  // strategii pack drží, čtenář posuzuje range v přesvědčení, že patří někomu
  // jinému.
  const named = label.split(" ")[0];
  const off = named !== seat.seat;
  if (off) misleading += 1;

  console.log(`${String(index).padStart(2)}. ${label}`);
  console.log(`    vzor ${rule.positionPattern} / uzel ${rule.actionNode}`);
  console.log(`    hraje: ${seat.seat} - ${seat.role}${off ? `  <- jméno začíná na ${named}` : ""}`);
  console.log(
    `    v rangi: prémie ${premium.length === 0 ? "žádné" : premium.join(", ")}`
    + ` | malé páry ${small.length === 0 ? "žádné" : small.join(", ")}`,
  );
  console.log("");
}

console.log(`pilotů, jejichž jméno začíná jinou sedačkou, než která hraje: ${misleading} ze ${order.length}`);
