/**
 * Dala by se flopová EV spočítat toutéž cestou jako turnová?
 *
 *   npm run mtt:flop-ev-feasibility
 *
 * ## Proč se to ptá teď
 *
 * Bod 131 rozhodl 26. 8. 2026 nedodávat EV na turnu **ani na flopu**, jedním
 * argumentem pro obě ulice. Turn se mezitím ukázal jako spočitatelný a zhruba
 * tak přesný jako river (body 203 az 211). Flop tím zůstal odmítnutý na základě
 * tvrzení, které u sousední ulice neobstálo - a to je přesně ten tvar zastarání,
 * na který si tenhle projekt dává pozor.
 *
 * ## Co rozhoduje
 *
 * Hodnota flopového rozhodnutí se skládá z hodnot **turnových uzlů**, a těch je
 * na každou linku tolik, kolik zbývá karet v balíčku. Turnová EV se skládala
 * z riverových vrstev a stačilo jí, že vrstva pod linkou existuje. Flopová by
 * potřebovala, aby existovala **většina turnových karet** - jinak se průměruje
 * přes hrstku a zbytek chybí.
 *
 * Měří se proto to jediné, co o možnosti rozhoduje: kolik turnových karet má
 * každá deska vyřešených. Cena se počítat nemusí, dokud tohle číslo neprojde.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = "artifacts/decomposition";
/** Karet v balíčku po flopu. */
const TURN_CARDS = 49;

interface BoardPlanItem { turn?: string; represents?: string[] }

const perBoard: { board: string; solved: number; represented: number; valued: number }[] = [];

for (const family of readdirSync(ROOT)) {
  const planPath = join(ROOT, family, "plan.json");
  if (!existsSync(planPath)) continue;
  const plan = JSON.parse(readFileSync(planPath, "utf8")) as { items?: BoardPlanItem[] };
  const cards = new Set<string>();
  const represented = new Set<string>();
  for (const item of plan.items ?? []) {
    if (item.turn === undefined) continue;
    cards.add(item.turn);
    represented.add(item.turn);
    // Jedna vyřešená karta zastupuje několik rovnocenných - pro flopový dopočet
    // se dá použít stejně, protože se stejně průměruje přes karty.
    for (const card of item.represents ?? []) represented.add(card);
  }
  if (cards.size === 0) continue;
  // **To, co doopravdy rozhoduje.** Turnová podhra existuje pro každou kartu,
  // ale ocenit ji jde jen skrz riverové vrstvy pod ní - a ty noc dělá jen pro
  // nejdosahovanější linky. Bez tohohle by měření tvrdilo, že je hotovo, a
  // přitom by měřilo jinou vrstvu, než na které to stojí.
  const riverDir = join(ROOT, family, "river");
  const valued = new Set<string>();
  if (existsSync(riverDir)) {
    for (const subgame of readdirSync(riverDir)) {
      const card = subgame.split("__").at(-1);
      if (card !== undefined && existsSync(join(riverDir, subgame, "plan.json"))) valued.add(card);
    }
  }
  perBoard.push({
    board: family, solved: cards.size, represented: represented.size, valued: valued.size,
  });
}

perBoard.sort((left, right) => right.represented - left.represented);
const total = perBoard.length;
const share = (rows: typeof perBoard): number => (
  rows.reduce((sum, row) => sum + row.represented, 0) / Math.max(1, rows.length)
);

console.log(`desek s plánem: ${total}`);
console.log(`turnových karet po flopu: ${TURN_CARDS}`);
console.log("");
// Seřazeno je podle zastoupených karet, takže min a max vyřešených se musí
// spočítat zvlášť - sáhnout na kraj toho druhého pořadí dá nesmysl.
const solvedCounts = perBoard.map((row) => row.solved).sort((left, right) => left - right);
console.log(`vyřešených karet na desku: medián ${
  solvedCounts[Math.floor(solvedCounts.length / 2)] ?? 0}, nejvíc ${
  solvedCounts[solvedCounts.length - 1] ?? 0}, nejmíň ${solvedCounts[0] ?? 0}`);
console.log(`včetně zastoupených: průměr ${share(perBoard).toFixed(1)} z ${TURN_CARDS}`
  + ` (${(100 * share(perBoard) / TURN_CARDS).toFixed(1)} %)`);
console.log("");

const valuedTotal = perBoard.reduce((sum, row) => sum + row.valued, 0);
const solvedTotal = perBoard.reduce((sum, row) => sum + row.solved, 0);
console.log(`turnových karet s riverovou vrstvou pod sebou: ${valuedTotal} z ${solvedTotal}`
  + ` vyřešených (${(100 * valuedTotal / Math.max(1, solvedTotal)).toFixed(1)} %)`);
console.log("");

const bands = [1, 0.9, 0.75, 0.5, 0.25, 0];
console.log("kolik desek má ocenitelnou aspoň tuhle část vyřešených turnových karet:");
for (const [index, edge] of bands.entries()) {
  const upper = index === 0 ? Infinity : bands[index - 1];
  const rows = perBoard.filter((row) => {
    const covered = row.valued / Math.max(1, row.solved);
    return covered >= edge && covered < upper;
  });
  console.log(`  nad ${(100 * edge).toFixed(0).padStart(3)} %: ${rows.length.toString().padStart(4)} desek`);
}
