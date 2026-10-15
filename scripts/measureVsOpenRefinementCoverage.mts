import { createMttProductionLazyLoader } from "../src/data/ranges/mttProductionLazyLoader";
import type { RangePack } from "../src/data/ranges/rangePack";

/**
 * Kolik obranných range v produkčních packech umí rozlišit, kdo otevřel.
 *
 *   npm run mtt:vs-open-refinement
 *
 * ## Proč to musí vzniknout
 *
 * `srpSolverInputRanges` se packu ptá na `VS_OPEN|<sedačka obránce>|<hloubka>`
 * **bez otvírače**, a dokumentace u toho ten ústupek přiznává: obrana proti
 * raise z rané pozice a proti krádeži z buttonu vrací totéž, a naměřený rozdíl
 * proti nezávislému zdroji je v průměru 11,7 bodu a u BB až 26,9.
 *
 * Mezitím ale do packů přišly zpřesněné záznamy z RYE, klíčované právě osou
 * `vsSeat` - tedy „proti otevření ze sedačky X". Otázka, kterou tenhle skript
 * odpovídá, je, jestli už je jich dost na to, aby se ten ústupek dal zrušit:
 * kdyby se solver ptal se zpřesněním, kolik dvojic by odpověď dostalo?
 *
 * Je to měření před rozhodnutím o noci. Nastagovat 96 nových desek a nechat je
 * solvit na obraně, která otvírače nerozlišuje, znamená zapéct tu vadu do
 * dalších šestnácti rodin - a to má cenu dělat jen tehdy, když lepší vstup
 * k dispozici není.
 */

function isRangePack(pack: unknown): pack is RangePack {
  return (
    typeof pack === "object" &&
    pack !== null &&
    Array.isArray((pack as { records?: unknown }).records)
  );
}

async function main(): Promise<void> {
  const loader = createMttProductionLazyLoader();
  // Bez `loadAll()` by CLI měřilo starší zaregistrovaný pack, ne produkční.
  const packs = await loader.loadAll();

  console.log("Obranné range (VS_OPEN): umí pack rozlišit, kdo otevřel?\n");

  let totalGeneral = 0;
  let totalRefined = 0;

  for (const pack of packs) {
    if (!isRangePack(pack)) continue;

    let general = 0;
    let refined = 0;
    const seats = new Map<string, Set<string>>();

    for (const record of pack.records) {
      if (record.context !== "VS_OPEN") continue;
      const vsSeat = (record as { vsSeat?: string }).vsSeat;
      if (vsSeat === undefined || vsSeat === "") {
        general += 1;
        continue;
      }
      refined += 1;
      const key = `${String(record.position)}|${String(record.bucket)}`;
      const set = seats.get(key) ?? new Set<string>();
      set.add(vsSeat);
      seats.set(key, set);
    }

    if (general + refined === 0) continue;
    totalGeneral += general;
    totalRefined += refined;

    const total = general + refined;
    const pct = ((100 * refined) / total).toFixed(1) + " %";
    console.log(String(pack.id));
    console.log(
      `  VS_OPEN záznamů: ${total}  obecných: ${general}  se vsSeat: ${refined}  (${pct})`,
    );
    if (seats.size > 0) {
      const detail = [...seats.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, set]) => `${key}→{${[...set].sort().join(",")}}`);
      console.log(`  pokryté dvojice (${seats.size}):`);
      for (const line of detail) console.log(`    ${line}`);
    }
    console.log("");
  }

  const total = totalGeneral + totalRefined;
  console.log(
    `celkem: ${total} VS_OPEN záznamů, z toho se vsSeat ${totalRefined} = ` +
      (total === 0 ? "-" : ((100 * totalRefined) / total).toFixed(1) + " %"),
  );

  // **Po hloubkách, protože rozhodnutí o noci je vždy o jedné hloubce.**
  // Součet přes všechny hloubky umí vypadat jako dostatek i tam, kde ta
  // hloubka, která se právě stahuje, nemá nic - a nastagovat se má podle ní.
  /*
   * **Po hloubkách jen packy, ze kterých bere solver - tedy ante OFF.**
   *
   * `buildSeatPairExpansionBatch.mts` volá `srpSolverInputRanges(… ante: "OFF")`
   * a vyřešený postflopový obsah je klíčovaný `…|OFF`. Do 15. 10. 2026 tenhle
   * rozpad sčítal **všechny** packy, a protože ante ON nesou RYE vrstvu (bod 273)
   * a ante OFF podle rozhodnutí 7a ne, vyšlo „na 40 bb 56 %, na 50 bb 45 %" -
   * a já z toho napsal vlastníkovi, že zpřesnění podle otvírače ve vstupu
   * solveru je „změna v kódu bez jediné noci". Pro packy, které solver čte,
   * je to 11 záznamů ze 77 (14,3 %), samé vlastní BB proti SB. Úspora tedy
   * neexistuje - a nevznikne, dokud ante OFF nedostane zdroj s otvíračem.
   */
  const solverPacks = packs.filter((pack) => isRangePack(pack) && String(pack.id).includes("ante-off"));
  console.log(`\npo hloubkách - jen packy, ze kterých bere solver (ante OFF, ${solverPacks.length}):`);
  const byBucket = new Map<string, { general: number; refined: number }>();
  for (const pack of solverPacks) {
    if (!isRangePack(pack)) continue;
    for (const record of pack.records) {
      if (record.context !== "VS_OPEN") continue;
      const bucket = String(record.bucket);
      const cell = byBucket.get(bucket) ?? { general: 0, refined: 0 };
      const vsSeat = (record as { vsSeat?: string }).vsSeat;
      if (vsSeat === undefined || vsSeat === "") cell.general += 1;
      else cell.refined += 1;
      byBucket.set(bucket, cell);
    }
  }
  for (const [bucket, cell] of [...byBucket.entries()].sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  )) {
    const sum = cell.general + cell.refined;
    const share = ((100 * cell.refined) / sum).toFixed(0) + " %";
    const flag = cell.refined === 0 ? "  <- otvírače nerozlišuje vůbec" : "";
    console.log(
      `  ${bucket.padStart(4)} BB: ${String(cell.refined).padStart(3)} / ${String(sum).padStart(3)}  ${share.padStart(5)}${flag}`,
    );
  }

  // **Závěr se čte z hloubky, ne ze součtu - a z packů, které solver čte.**
  //
  // 13. 10. 2026 jsem z celkových 37,1 % usoudil, že nastagovat 96 desek na
  // 25 bb znamená zapéct do nich vadu, kterou už umíme opravit. Rozpad to
  // vyvrátil: na 25 bb je zpřesněných 4 z 28 (14 %) a jediná pokrytá dvojice
  // je BB proti SB. Lepší vstup pro tu hloubku tedy **neexistuje** a stagování
  // nic nekazí. (Tvrzení „kde ta změna cenu má, je 100 bb (60 %), 40 (56 %)
  // a 30 (54 %)" bylo průměrem přes ante ON, které solver nečte - viz výš.)
  const deep = [...byBucket.entries()]
    .filter(([, cell]) => cell.refined > 0 && cell.refined / (cell.general + cell.refined) >= 0.4)
    .map(([bucket]) => bucket + " BB")
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

  if (totalRefined === 0 || deep.length === 0) {
    console.log(
      "\nPro solver (ante OFF) žádná hloubka nemá aspoň 40 % obrany se zpřesněním\n" +
        "podle otvírače. Ptát se se vsSeat by vstup solveru nezlepšilo - ústupek\n" +
        "v solverInputRanges.ts trvá, dokud ante OFF nedostane zdroj s otvíračem\n" +
        "(RYE tam podle rozhodnutí 7a nepatří, počítá s BB ante).",
    );
    return;
  }
  console.log(
    `\nKde by se pro solver vyplatilo ptát se se vsSeat (aspoň 40 % záznamů ante OFF): ${deep.join(", ")}.\n` +
      "Tam obrana dnes vrací totéž proti rané pozici i proti buttonu, a naměřený\n" +
      "rozdíl je 11,7 bodu v průměru a u BB až 26,9.",
  );
}

await main();
