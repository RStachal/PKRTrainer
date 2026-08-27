import { createRangeStoreFromRangePack } from "../rangeStore";
import { allMttPreflopRangePacks } from "./mttPreflopRangePacks";
import type { AnteMode, Position, StackBucket } from "../../core/types";

/**
 * Ranže pro solver, odvozené z našich vlastních preflop packů.
 *
 * ## Proč
 *
 * Rozklad drží pět dvojic sedaček, trenažér se ptá na dvaatřicet vzorů, takže
 * jen dvanáct procent dotazů míří na spot, který vůbec máme. Zavřít tu mezeru
 * znamená odsolvit chybějící dvojice - a k tomu solver potřebuje ranže obou
 * hráčů. Dosud se psaly ručně do každého expansion skriptu, což je únosné pro
 * šest rodin a neúnosné pro sedmadvacet dvojic krát hloubky.
 *
 * Preflop packy ty ranže mají: `RFI` říká, s čím se otevírá, `VS_OPEN`, čím se
 * proti otevření brání. Odvodit je odsud znamená, že postflop stojí na tomtéž,
 * co se hráč učí preflop - a když se preflop opraví, opraví se i vstup solveru.
 *
 * ## Dva ústupky, které je nutné přiznat
 *
 * **`VS_OPEN` nerozlišuje, kdo otevřel.** Je klíčovaný jen podle sedačky
 * obránce a hloubky (viz deník, bod 62), takže obrana proti raise z rané pozice
 * a proti krádeži z buttonu vrací totéž. Odvozená range tu vadu zdědí a solve
 * postavený na ní ji ponese dál. Naměřeno na nezávislém zdroji: rozdíl mezi
 * obranami proti různým otvíračům je v průměru 11,7 bodu a u BB až 26,9.
 *
 * **Packy nesou akce, ne frekvence, a navíc čisté.** Změřeno: z 1980 tříd ve
 * `VS_OPEN` nedělá **ani jedna** call i 3bet. Skutečná solverová strategie je
 * smíšená, naše preflop packy ne - ruka buď dorovnává, nebo zvyšuje. Odvozená
 * range tím pádem nemá jak být smíšená a solve na ní postavený bude proti
 * soupeři, který hraje ostřeji rozdělené ranže, než jaké se u stolu potkávají.
 */

/**
 * Váha ruky, která podle packu dorovnává i zvyšuje.
 *
 * **Dnes se nepoužije: měřeno 0 takových tříd z 1980.** Preflop packy nesou
 * čisté akce, takže ruka buď dorovnává, nebo zvyšuje. Pojistka tu přesto je,
 * protože kdyby packy jednou smíšené akce dostaly, dát takovou ruku do
 * dorovnávající range celou by tu range nafouklo o hands, které tam část času
 * nepatří. Půlka je volba, ne měření - poměr call/3bet odsud zjistit nejde.
 */
export const MIXED_CALL_WEIGHT = 0.5;

/**
 * Postflopové pořadí sedaček: blindy první, pak UTG kolem k buttonu.
 *
 * Musí sedět s `POSTFLOP_ORDER` v generátorech packů. Kdyby se ta dvě pořadí
 * rozešla, solve by vznikl s prohozenými stranami stolu a poznalo by se to až
 * podle toho, že hráči dává odpovědi soupeře.
 */
const POSTFLOP_ORDER: readonly string[] = [
  "SB", "BB", "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN",
];

export interface SolverInputRanges {
  /** Kdo je po flopu mimo pozici a kdo v ní. */
  oopSeat: Position;
  ipSeat: Position;
  /** Třída ruky na váhu 0-1, jak to chce `set_range_oop` / `set_range_ip`. */
  oop: Record<string, number>;
  ip: Record<string, number>;
  /** Co si o téhle range musí přečíst ten, kdo ji použije. */
  caveats: string[];
}

function shippedPack(ante: AnteMode) {
  const matching = allMttPreflopRangePacks.filter((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.blindSpeed === "REGULAR" &&
    item.dimensions.ante === ante &&
    item.records.length > 0
  ));
  // Produkční verze, ne kandidát: měřit nebo solvit z kandidáta znamená stavět
  // na obsahu, který hráč nedostane. Stálo to jednou celou várku měření.
  return matching.find((item) => item.id.includes("-production-"));
}

/**
 * Ranže pro jednorazovaný pot: otvírač proti obránci, který dorovnal.
 *
 * Vrací `undefined`, když některou z těch dvou ranží pack nemá - vymyslet ji by
 * znamenalo solvit hru, kterou nikdo netrénuje.
 */
/**
 * Která z těch dvou ranží chybí. Prázdné pole znamená, že jsou obě.
 *
 * Bez tohohle se dala hláška „preflop pack nemá obě ranže" číst jen tak, že se
 * mezera vystopuje ručně - a stálo to hodinu, než se ukázalo, že chybí vždycky
 * jen ta obranná (`VS_OPEN` pro UTG+1 a UTG+2, na všech hloubkách). Brána, která
 * ví, co chybí, to má říct; hádat za ni je práce navíc pokaždé znovu.
 */
export function srpSolverInputGap(options: {
  openerSeat: Position;
  defenderSeat: Position;
  bucket: StackBucket;
  ante: AnteMode;
}): string[] {
  const pack = shippedPack(options.ante);
  if (pack === undefined) return ["produkční preflop pack není načtený"];
  const store = createRangeStoreFromRangePack(pack);
  const missing: string[] = [];
  if (store.lookup({
    ante: options.ante, position: options.openerSeat, bucket: options.bucket, context: "RFI",
  }) === undefined) {
    missing.push(`RFI|${options.openerSeat}|${options.bucket}`);
  }
  if (store.lookup({
    ante: options.ante, position: options.defenderSeat, bucket: options.bucket, context: "VS_OPEN",
  }) === undefined) {
    missing.push(`VS_OPEN|${options.defenderSeat}|${options.bucket}`);
  }
  return missing;
}

export function srpSolverInputRanges(options: {
  openerSeat: Position;
  defenderSeat: Position;
  bucket: StackBucket;
  ante: AnteMode;
}): SolverInputRanges | undefined {
  const pack = shippedPack(options.ante);
  if (pack === undefined) return undefined;
  const store = createRangeStoreFromRangePack(pack);

  const opening = store.lookup({
    ante: options.ante,
    position: options.openerSeat,
    bucket: options.bucket,
    context: "RFI",
  });
  const defending = store.lookup({
    ante: options.ante,
    position: options.defenderSeat,
    bucket: options.bucket,
    context: "VS_OPEN",
  });
  if (opening === undefined || defending === undefined) return undefined;

  const openerRange: Record<string, number> = {};
  for (const [handClass, actions] of Object.entries(opening.actions)) {
    if (actions.every((action) => action === "FOLD")) continue;
    openerRange[handClass] = 1;
  }

  const defenderRange: Record<string, number> = {};
  for (const [handClass, actions] of Object.entries(defending.actions)) {
    if (!actions.includes("CALL")) continue;
    // Ruka, která taky zvyšuje, tady není celá: část času skončí ve 3bet potu,
    // což je jiná hra a jiná rodina.
    defenderRange[handClass] = actions.includes("3BET") ? MIXED_CALL_WEIGHT : 1;
  }
  if (Object.keys(openerRange).length === 0 || Object.keys(defenderRange).length === 0) {
    return undefined;
  }

  const openerIndex = POSTFLOP_ORDER.indexOf(options.openerSeat);
  const defenderIndex = POSTFLOP_ORDER.indexOf(options.defenderSeat);
  if (openerIndex < 0 || defenderIndex < 0) return undefined;
  const openerIsIp = openerIndex > defenderIndex;

  return {
    oopSeat: openerIsIp ? options.defenderSeat : options.openerSeat,
    ipSeat: openerIsIp ? options.openerSeat : options.defenderSeat,
    oop: openerIsIp ? defenderRange : openerRange,
    ip: openerIsIp ? openerRange : defenderRange,
    caveats: [
      "Obranná range je z VS_OPEN, které nerozlišuje, kdo otevřel: proti rané "
      + "pozici i proti buttonu vrací totéž. Naměřený rozdíl proti nezávislému "
      + "zdroji je v průměru 11,7 bodu a u velkého blindu až 26,9.",
      "Preflop packy nesou čisté akce, ne smíšené: změřeno 0 tříd z 1980, které by "
      + "dorovnávaly i zvyšovaly. Odvozená range je proto ostřeji rozdělená, než jaké "
      + "ranže se u stolu potkávají.",
    ],
  };
}

/** Zápis pro solver: `AA:1.0,KK:0.5,...` seřazený, aby byl výstup opakovatelný. */
export function toSolverRangeSpec(range: Readonly<Record<string, number>>): string {
  return Object.entries(range)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([handClass, weight]) => `${handClass}:${weight}`)
    .join(",");
}
