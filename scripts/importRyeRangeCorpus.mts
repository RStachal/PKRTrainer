import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { readRyeGrid, type RyeGrid } from "./lib/ryeRangeCorpus.mts";
import {
  REFUSED_VOCABULARIES,
  bucketForStack,
  contextForVocabulary,
  mapAction,
  opponentFromFileName,
  situationFromFileName,
} from "./lib/ryeActionMapping.mts";

/**
 * Draft záznamů ranží z vlastníkova korpusu.
 *
 *   npm run mtt:rye-import -- --source="<cesta k db>" [--write]
 *
 * ## Co to je a co to není
 *
 * Je to **draft do `artifacts/`, ne produkční obsah.** Do `src/` se nic
 * nezapisuje a nezapsat by se to mělo ani ručně, dokud si to člověk nepřečte:
 * mechanická kontrola pozná rozbitý tvar, ne špatnou strategii.
 *
 * ## Fail-closed na čtyřech místech
 *
 * Záznam vznikne jen tehdy, když projde vším:
 *
 * 1. **Mřížka se ověřila proti vlastní legendě.** Neověřená se nečte vůbec.
 * 2. **Slovník má překlad**, a to celý - kontext platí, jen když se přeloží
 *    každá akce legendy.
 * 3. **Situace se dá určit** ze jména: sedačka hrdiny a hloubka.
 * 4. **Soupeř se dá určit** - ale jen tam, kde hrdina někomu čelí. U `PUSH_FOLD`
 *    žádný jeden soupeř není, hrdina jamuje proti všem za sebou, takže je ta
 *    range správně obecná a `vsSeat` by tam byl vymyšlený.
 *
 * Kolik toho každým sítem propadne, se vypisuje. Tichý import je ten, kterému
 * se pak nedá věřit.
 *
 * ## Co se o obsahu netvrdí
 *
 * Zdroj neuvádí rychlost blindů ani ante. Draft je proto zapisuje jako
 * `REGULAR` a `OFF` a **říká to jako přiznaný předpoklad**, ne jako údaj ze
 * zdroje. Důvěra je `LOW`, protože obsah nikdo nečetl.
 */

const source = process.argv.find((arg) => arg.startsWith("--source="))?.split("=").slice(1).join("=");
const write = process.argv.includes("--write");
const outPath = process.argv.find((arg) => arg.startsWith("--out="))?.split("=")[1]
  ?? "artifacts/rye-import/draft.json";

if (source === undefined) {
  console.error('Usage: npm run mtt:rye-import -- --source="<cesta ke složce db>" [--write]');
  process.exit(2);
}

interface DraftRecord {
  position: string;
  bucket: number;
  context: string;
  vsSeat: string;
  stackSetupId: string;
  sourceStackBB: number;
  /** ruka → akce s nejvyšší vahou; při shodě jich je víc. */
  strict: Record<string, string[]>;
  /** ruka → všechny akce, které zdroj u ní hraje. */
  lenient: Record<string, string[]>;
  /**
   * ruka → akce a **jak často** ji zdroj hraje, v procentech.
   *
   * Zapisuje se u ruky, kterou zdroj hraje víc způsoby, **a u ruky hrané jen
   * zčásti** - tam je jednou z položek `FOLD`. U ruky hrané naplno jedinou
   * akcí se nezapisuje nic; tam by to byl šum.
   *
   * ## Proč to tu musí být
   *
   * Do 28. 8. 2026 si import pamatoval jen **které** akce, ne jak často - a to
   * je přesně ten signál, kvůli kterému mix vůbec existuje. Změřeno na 250
   * stranách korpusu: 3 008 vážených buněk, z toho 2 577 je 50/50, ale **431
   * (14,3 %) má skutečný poměr** - 25/75, 33/67, dokonce 49/51.
   *
   * Rozdíl mezi „hraj obojí" a „hraj to takhle často" je celý rozdíl mezi
   * seznamem přijatelných odpovědí a strategií.
   */
  mix: Record<string, Record<string, number>>;
  /** Co se překladem ztratilo, po akcích. Pro člověka, který to bude číst. */
  notes: string[];
  sourceFile: string;
}

function htmlFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...htmlFiles(path));
    else if (entry.toLowerCase().endsWith(".html")) found.push(path);
  }
  return found;
}

const dropped = {
  notAGrid: 0,
  unverified: 0,
  refusedVocabulary: 0,
  noContext: 0,
  noSituation: 0,
  noOpponent: 0,
  noMappedHands: 0,
  unmappableAction: 0,
};

/** Které stránky spadly na nepřeložitelné barvě. Bez toho se to nedá spravit. */
const unmappableExamples: string[] = [];

const records: DraftRecord[] = [];

for (const file of htmlFiles(source).sort()) {
  const grid: RyeGrid | undefined = readRyeGrid(file);
  if (grid === undefined) { dropped.notAGrid += 1; continue; }
  if (grid.mismatches.length > 0) { dropped.unverified += 1; continue; }

  const vocabulary = grid.legend.map((entry) => entry.action).sort().join(" | ");
  if (REFUSED_VOCABULARIES.has(vocabulary)) { dropped.refusedVocabulary += 1; continue; }

  const context = contextForVocabulary(grid.legend.map((entry) => entry.action));
  if (context === undefined) { dropped.noContext += 1; continue; }

  const name = basename(file);
  const situation = situationFromFileName(name);
  if (situation === undefined) { dropped.noSituation += 1; continue; }
  // Soupeře vyžadují jen kontexty, kde hrdina **čelí akci**.
  //
  // U `PUSH_FOLD` žádný jeden soupeř není: hrdina jamuje proti všem za sebou,
  // takže je ta range obecná a `vsSeat` by tam byl vymyšlený. Vyžadovat ho
  // zahodilo deset stran s odpovědí, která je správně obecná.
  const facingContexts = new Set(["VS_OPEN", "VS_3BET", "VS_4BET", "VS_ALLIN", "SQUEEZE"]);
  const opponent = opponentFromFileName(name, situation);
  if (facingContexts.has(context) && opponent === undefined) {
    dropped.noOpponent += 1;
    continue;
  }

  // Barva → akce produktu, jednou na stránku.
  //
  // Barva, kterou kontext neumí přeložit, **shodí celou mřížku**. Do 9. 9. 2026
  // se jen přeskočila, a to je nejhorší možný výsledek: ruce té barvy neměly
  // kam sednout, takže tiše spadly do foldu a mřížka se vydala jako úplná.
  // Druhé čtení to našlo na obou stránkách kontextu `VS_ALLIN` - jediných dvou,
  // které ten kontext má. Slovník k němu zná jen `Call`, takže z legendy
  // `All in | Call` zmizelo **75 a 29 tříd** do foldu. Situace ve zdroji přitom
  // ani jednou není čelení all-inu (jedna je squeeze, druhá obrana proti 2,5x),
  // takže ta stránka nepatří tomu kontextu vůbec - ale to je rozhodnutí o
  // slovníku, ne něco, co se dá dopočítat. Do té doby se nevydá.
  const actionOfColor = new Map<string, { action: string; lost: string }>();
  let unmappable = "";
  for (const entry of grid.legend) {
    const mapped = mapAction(context, entry.action);
    if (mapped === undefined) { unmappable = entry.action; break; }
    actionOfColor.set(entry.color, mapped);
  }
  if (unmappable !== "") {
    dropped.unmappableAction += 1;
    unmappableExamples.push(`${name}: ${context} neumí „${unmappable}“`);
    continue;
  }

  // Ruka → akce s váhami. Vážená buňka je mixovaná strategie, takže ruka může
  // mít víc akcí naráz a součet vah nemusí být jedna (zbytek je fold).
  const weights = new Map<string, Map<string, number>>();
  for (const hand of grid.hands) {
    const mapped = actionOfColor.get(hand.color);
    if (mapped === undefined) continue;
    const perHand = weights.get(hand.hand) ?? new Map<string, number>();
    perHand.set(mapped.action, (perHand.get(mapped.action) ?? 0) + hand.weight);
    weights.set(hand.hand, perHand);
  }
  if (weights.size === 0) { dropped.noMappedHands += 1; continue; }

  const strict: Record<string, string[]> = {};
  const lenient: Record<string, string[]> = {};
  const mix: Record<string, Record<string, number>> = {};
  for (const [hand, perHand] of weights) {
    const entries = [...perHand].filter(([, weight]) => weight > 0);
    if (entries.length === 0) continue;
    // Lenient je všechno, co zdroj u té ruky hraje. Strict je to, co hraje
    // nejčastěji - a při rovnosti obojí, protože u poctivého mixu 50/50 není
    // jedna z těch dvou akcí chyba.
    const best = Math.max(...entries.map(([, weight]) => weight));
    lenient[hand] = entries.map(([action]) => action).sort();
    const played = entries.reduce((total, [, weight]) => total + weight, 0);
    // Fold je akce jako každá jiná a zbytek váhy patří jemu.
    //
    // Do 9. 9. 2026 se `mix` psal jen u ruky s víc nefoldovými akcemi a váhy se
    // normalizovaly na sto. Obojí mazalo tutéž věc. Ruka hraná ze čtvrtiny
    // vešla do draftu jako **čistá akce**, protože měla jedinou položku; a ruka
    // s dvěma akcemi po čtvrtině se normalizací nafoukla na 50/50, takže z ní
    // polovina foldu zmizela. Změřeno na zdroji (`npm run mtt:rye-weight-loss`):
    // **1 175 tříd** se hraje jen zčásti, z toho **1 109 tiše** - a je to 4 680
    // kombinací. Nejčastěji jde o polovinu (730x), pak čtvrtinu (135x) a
    // třetinu (103x).
    //
    // Rozdíl mezi „3BET" a „3BET v polovině případů, jinak fold" je celá
    // strategie, a čtenář ho na stránce neměl jak poznat.
    const folded = Math.max(0, 1 - played);
    if (entries.length > 1 || folded > 0.005) {
      const shares: [string, number][] = entries.map(([action, weight]) => [
        action,
        Math.round(100 * weight),
      ]);
      if (folded > 0.005) shares.push(["FOLD", Math.round(100 * folded)]);
      mix[hand] = Object.fromEntries(shares
        .sort((left, right) => String(left[0]).localeCompare(String(right[0]))));
    }
    strict[hand] = entries
      .filter(([, weight]) => Math.abs(weight - best) < 1e-9)
      .map(([action]) => action)
      .sort();
  }

  const notes = [...actionOfColor.values()]
    .filter((mapped) => mapped.lost !== "")
    .map((mapped) => `${mapped.action}: ${mapped.lost}`);

  records.push({
    position: situation.seat,
    bucket: bucketForStack(situation.stackBB),
    context,
    // Prázdné u kontextů, kde soupeř není - viz `facingContexts` výš.
    vsSeat: opponent?.seat ?? "",
    // Sada odlišuje rozložení stacků u stolu; bez ní si dvě ICM stránky
    // odporují. Bere se z předpony jména, protože tak je zdroj člení.
    stackSetupId: /^[A-Za-z0-9]+/.exec(name)?.[0]?.toUpperCase() ?? "?",
    sourceStackBB: situation.stackBB,
    strict,
    lenient,
    mix,
    notes: [...new Set(notes)].sort(),
    sourceFile: name,
  });
}

const draft = {
  createdAt: new Date().toISOString().slice(0, 10),
  confidence: "LOW",
  assumptions: [
    "Zdroj neuvádí rychlost blindů; draft předpokládá REGULAR.",
    "Zdroj neuvádí ante; draft předpokládá OFF.",
    "Hloubka soupeře se do klíče nepromítá - změřeno, že rozpory neodstraní.",
    "Obsah nikdo nečetl; mechanická kontrola pozná rozbitý tvar, ne špatnou hru.",
  ],
  droppedByGate: dropped,
  recordCount: records.length,
  records,
};

const byContext = new Map<string, number>();
const byPosition = new Map<string, number>();
for (const record of records) {
  byContext.set(record.context, (byContext.get(record.context) ?? 0) + 1);
  byPosition.set(record.position, (byPosition.get(record.position) ?? 0) + 1);
}

console.log("Draft záznamů z vlastníkova korpusu");
console.log("");
console.log(`záznamů: ${records.length}`);
console.log(`tříd rukou celkem: ${records.reduce((sum, r) => sum + Object.keys(r.strict).length, 0)}`);
console.log("");
console.log("co propadlo sítem:");
for (const [reason, count] of Object.entries(dropped)) {
  if (count > 0) console.log(`  ${reason.padEnd(20)} ${count}`);
}
if (unmappableExamples.length > 0) {
  console.log("");
  console.log("stránky shozené nepřeložitelnou barvou (ruce té barvy by tiše spadly do foldu):");
  for (const line of unmappableExamples) console.log(`  ${line}`);
}
console.log("");
console.log("po kontextech: " + [...byContext].sort().map(([k, v]) => `${k} ${v}`).join(", "));
console.log("po sedačkách: " + [...byPosition].sort().map(([k, v]) => `${k} ${v}`).join(", "));

if (write) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  console.log("");
  console.log(`zapsáno: ${outPath}`);
} else {
  console.log("");
  console.log("Nic se nezapsalo. S `--write` se draft uloží do artifacts/.");
}
