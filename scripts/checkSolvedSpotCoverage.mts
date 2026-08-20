import { generatePostflopSpot } from "../src/core/postflopGenerator";
import { grantsForTier } from "../src/core/paymentEntitlements";
import { buildMttPostflopTrainingRuntime } from "../src/data/ranges/mttPostflopTrainingRuntime";
import { loadAllSolvedTurnPacks } from "../src/data/ranges/turnSolvedStrategyPacks";
import { loadSolvedFlopPacks } from "../src/data/ranges/flopSolvedStrategyPacks";
import { loadSolvedRiverPacks } from "../src/data/ranges/riverSolvedStrategyPacks";
import type { PostflopStreet } from "../src/core/postflopGenerator";
import type { TrainingProfile } from "../src/core/trainingProfile";
import { runtimeSolvedFlopPacks } from "../src/data/ranges/flopSolvedRuntimeRegistry";
import { runtimeSolvedTurnPacks } from "../src/data/ranges/turnSolvedRuntimeRegistry";
import { runtimeSolvedRiverPacks } from "../src/data/ranges/riverSolvedRuntimeRegistry";

/**
 * Kolik rozdávaných spotů vyřešený obsah doopravdy zodpoví.
 *
 *   npm run mtt:solved-coverage [-- --spots=2000]
 *
 * ## Proč to potřebujeme
 *
 * Řádky knihovny pro postflop tvrdí "not production-ready" a nabízí se je
 * přepnout, protože dodáváme padesát MEDIUM packů. Jenže vyřešený pack odpovídá
 * **jen na desky, na kterých vznikl**, a všude jinde odmítá - je jich 908 na
 * riveru a 238 na flopu proti tisícům možných. Prohlásit kvůli nim profil za
 * produkčně pokrytý by bylo přehnané tvrzení.
 *
 * Rozhodnout to jde jen měřením: rozdat spoty tak, jak je rozdává trenažér, a
 * spočítat, kolikrát vyřešená odpověď přijde. Odhadovat to z počtu desek nejde,
 * protože trenažér desky nerozdává rovnoměrně - vybírá je podle toho, co se u
 * stolu doopravdy stává.
 *
 * ## Co se měří a co ne
 *
 * Měří se, jestli **nějaký** resolver odpověděl, a zvlášť se drží, jestli šlo o
 * vyřešený obsah. Pilotní texturové odpovědi se počítají odděleně: pokrývají
 * skoro všechno, ale jsou to agregáty přes třídu textury, ne přesná deska.
 */

const spots = Number(
  process.argv.find((arg) => arg.startsWith("--spots="))?.split("=")[1] ?? 1500,
);

await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
await loadSolvedFlopPacks("FULL_RING_9|REGULAR|CHIP_EV|FLOP|OFF");
await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF");

const grants = grantsForTier("PRO_PLUS", { startsAt: "2020-01-01T00:00:00Z" });

console.log("Kolik rozdávaných spotů zodpoví vyřešený obsah");
console.log(`vzorek: ${spots} spotů na ulici`);
console.log("");
console.log("ulice".padEnd(8) + "odpověď".padStart(10) + "bez odpovědi".padStart(14));

/** Vzory, na které se trenažér ptal, a jak často. */
const askedPatterns = new Map<string, number>();

for (const street of ["FLOP", "TURN", "RIVER"] as const) {
  const profile: TrainingProfile = {
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    blindSpeed: "REGULAR",
    street: street as PostflopStreet,
    evModel: "CHIP_EV",
    ante: "OFF",
    rakeMode: "NONE",
  };
  const runtime = buildMttPostflopTrainingRuntime({ profile, grants });
  if (runtime.resolver === null) {
    console.log(`${street.padEnd(8)}${"runtime nevydal resolver".padStart(24)}`);
    continue;
  }
  const resolver = runtime.resolver;
  // Odposlech, čím se resolver ptá. Bez toho se z nuly nepozná, jestli obsah
  // odmítá desku, nebo jestli se ho ptá na spot, který nikdy nikdo neřešil - a
  // to jsou dva úplně různé závěry.
  const watching = (input: Parameters<typeof resolver>[0]) => {
    const pattern = String((input as { positionPattern?: unknown }).positionPattern ?? "?");
    askedPatterns.set(pattern, (askedPatterns.get(pattern) ?? 0) + 1);
    return resolver(input);
  };

  let answered = 0;
  let missing = 0;
  for (let index = 0; index < spots; index += 1) {
    // Seed se mění po jedné, aby byl běh opakovatelný: měření, které pokaždé
    // vyjde jinak, se nedá citovat ani porovnat s příštím týdnem.
    try {
      const spot = generatePostflopSpot({
        seed: 1000 + index,
        street,
        strategyResolver: watching,
        allowFallback: false,
      });
      if (spot.recommendation === undefined || spot.recommendation === null) missing += 1;
      else answered += 1;
    } catch {
      // Bez fallbacku generátor odmítnutí hlásí výjimkou, ne spotem bez
      // doporučení. Je to právě ten stav, který se měří.
      missing += 1;
    }
  }

  const share = (answered / spots) * 100;
  console.log(
    street.padEnd(8)
    + `${share.toFixed(1)} %`.padStart(10)
    + `${missing}`.padStart(14),
  );
}

const covered = new Set<string>();
for (const pack of [
  ...(runtimeSolvedFlopPacks as readonly { rules: { positionPattern?: string }[] }[]),
  ...(runtimeSolvedTurnPacks as readonly { rules: { positionPattern?: string }[] }[]),
  ...(runtimeSolvedRiverPacks as readonly { rules: { positionPattern?: string }[] }[]),
]) {
  for (const rule of pack.rules) if (rule.positionPattern) covered.add(rule.positionPattern);
}

const asked = [...askedPatterns].sort((left, right) => right[1] - left[1]);
const answerable = asked.filter(([pattern]) => covered.has(pattern));
const askedTotal = asked.reduce((sum, [, count]) => sum + count, 0);
const answerableTotal = answerable.reduce((sum, [, count]) => sum + count, 0);

console.log("");
console.log(`vzorů, na které se trenažér ptal: ${asked.length}`);
console.log(`vzorů, které vyřešený obsah vůbec drží: ${covered.size}`);
console.log(`dotazů na vzor, který držíme: ${(answerableTotal / Math.max(askedTotal, 1) * 100).toFixed(1)} %`);
console.log("");
console.log("nejčastější dotazy:");
for (const [pattern, count] of asked.slice(0, 8)) {
  console.log(`  ${covered.has(pattern) ? "máme " : "nemáme"} ${pattern.padEnd(20)} ${count}x`);
}
console.log("");
console.log(
  "Nula u ulice neznamená, že obsah odmítá desky. Znamená, že se ho trenažér\n"
  + "ptá na spoty, které nikdo neřešil - a to je jiný závěr než chybějící deska.",
);
