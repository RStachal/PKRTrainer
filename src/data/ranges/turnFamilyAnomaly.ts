import type { TurnStrategyPack } from "./turnStrategyPack";

/**
 * Co na rodině vypadá divně proti jejím sourozencům.
 *
 * Review je jediná věc, která solverový turn obsah drží na LOW, a je to práce,
 * kterou nikdo jiný než hráč neudělá. Jedenáct rodin po třech stech pravidlech
 * je ale příliš na to, aby to někdo přečetl celé - a hlavně je to zbytečné.
 * Chyby, které jsme v tomhle obsahu doopravdy našli, měly všechny stejný tvar:
 * ne špatné jednotlivé pravidlo, ale obrácené nebo posunuté rozdělení akcí přes
 * celou rodinu.
 *
 * Tenhle modul proto nehodnotí poker. Porovnává rodinu s ostatními rodinami
 * v podobném spotu a říká, kde se liší natolik, že to stojí za pohled. Čtenář
 * pak začne u odchylek místo u abecedy.
 *
 * ## Co to vědomě neumí
 *
 * Rodina, která je špatně stejným způsobem jako všechny ostatní, projde. Kdyby
 * se celý pipeline mýlil v jednom směru, tohle to nepozná - srovnává se s
 * vlastními daty, ne s pravdou. Je to pomůcka pro čtenáře, ne náhrada za něj.
 */

export type TurnAnomalyKind =
  | "AGGRESSION_HIGH"
  | "AGGRESSION_LOW"
  | "SINGLE_ACTION"
  | "SIZE_SPREAD";

export interface TurnAnomaly {
  kind: TurnAnomalyKind;
  detail: string;
}

export interface TurnFamilyProfile {
  familyId: string;
  /** Skupina, se kterou se rodina srovnává: uzel a strana stolu. */
  cohort: string;
  /** Podíl kombinací, které v rodině sázejí nebo zvedají, 0 až 1. */
  aggressionShare: number;
  /** Kolik různých akcí rodina vůbec hraje. */
  distinctActions: number;
  /** Nejčastější akce a její podíl. */
  topAction: string;
  topShare: number;
  anomalies: readonly TurnAnomaly[];
}

/** Akce, kterou hrdina vkládá peníze. Check a fold nechávají pot být. */
function isAggressive(action: string): boolean {
  const upper = action.toUpperCase();
  return upper.startsWith("BET") || upper.startsWith("RAISE") || upper.startsWith("ALL");
}

function combosByAction(pack: TurnStrategyPack): Map<string, number> {
  const byAction = new Map<string, number>();
  for (const rule of pack.rules) {
    for (const bucket of rule.buckets) {
      byAction.set(bucket.action, (byAction.get(bucket.action) ?? 0) + bucket.combos);
    }
  }
  return byAction;
}

/**
 * Kolik agrese je u téhle rodiny ještě normální, měřeno bez ní samotné.
 *
 * Práh se počítá z ostatních rodin ve stejné skupině, ne z tabulky - a hlavně
 * bez té rodiny, kterou zrovna posuzujeme. Při šesti rodinách si totiž odchylka
 * sama roztáhne kvartily natolik, že se do mezí vejde: první verze měla ve
 * skupině hodnoty 10, 12, 14 a 80 procent a osmdesátku neoznačila, protože
 * osmdesátka byla zároveň horním kvartilem.
 *
 * Míra rozptylu je medián absolutních odchylek, ne mezikvartilový rozsah.
 * Odolává malému vzorku líp a nepotřebuje čtyři body na to, aby dávala smysl.
 *
 * Skupina se dvěma a méně rodinami se nesrovnává vůbec: medián z jednoho čísla
 * neříká nic a označit druhé za odchylku by bylo losování.
 */
function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** Nejmenší rozptyl, se kterým se ještě počítá, aby těsná skupina neoznačila vše. */
const MIN_SPREAD = 0.04;
/** Kolik násobků rozptylu je ještě v pořádku. */
const SPREAD_TOLERANCE = 3;
/**
 * O kolik musí být rodina za mezí, aby se to hlásilo.
 *
 * Bez tohohle se příznak rozsvítil při 32 % proti mezi 32 % - tedy na
 * zaokrouhlení. Upozornění, které se spustí o vlásek, čtenář po druhé přestane
 * brát vážně, a tím ztratí smysl i ta upozornění, která něco znamenají.
 */
const MIN_MARGIN = 0.05;

function outlierBoundsWithout(others: readonly number[]): { low: number; high: number } {
  if (others.length < 2) return { low: -Infinity, high: Infinity };
  const median = medianOf(others);
  const spread = Math.max(medianOf(others.map((value) => Math.abs(value - median))), MIN_SPREAD);
  return {
    low: median - SPREAD_TOLERANCE * spread,
    high: median + SPREAD_TOLERANCE * spread,
  };
}

export function profileTurnFamilies(
  packs: readonly TurnStrategyPack[],
): TurnFamilyProfile[] {
  const rows = packs.map((pack) => {
    const first = pack.rules[0];
    const byAction = combosByAction(pack);
    const total = [...byAction.values()].reduce((sum, value) => sum + value, 0) || 1;
    let aggressive = 0;
    for (const [action, combos] of byAction) if (isAggressive(action)) aggressive += combos;
    const [topAction, topCombos] = [...byAction].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    return {
      familyId: pack.familyIds[0] ?? pack.id,
      // Uzel a strana stolu, protože jinak se srovnává neporovnatelné.
      //
      // U uzlu FACING_BET je „agrese" raise proti sázce, u CBET je to sázka do
      // checknutého potu, a hrdina mimo pozici bez iniciativy checká skoro vždy.
      // První verze porovnávala všech jedenáct rodin dohromady: rozptyl vyšel od
      // 15 do 55 procent, meze se roztáhly přes celý obor a detektor neoznačil
      // nic. Nebylo to tím, že by data byla v pořádku, ale tím, že se míchaly
      // tři různé otázky.
      cohort: `${first?.node ?? "?"}|${first?.heroOutOfPosition ? "OOP" : "IP"}`,
      aggressionShare: aggressive / total,
      distinctActions: byAction.size,
      topAction,
      topShare: topCombos / total,
      anomalies: [] as TurnAnomaly[],
    };
  });

  // Skupiny se drží jako řádky, ne jako čísla, aby šlo každou rodinu posoudit
  // proti ostatním podle identity. Filtrovat podle hodnoty by u dvou rodin se
  // shodnou agresí vyhodilo obě.
  const byCohort = new Map<string, TurnFamilyProfile[]>();
  for (const row of rows) {
    const bucket = byCohort.get(row.cohort) ?? [];
    bucket.push(row);
    byCohort.set(row.cohort, bucket);
  }

  for (const row of rows) {
    const cohort = byCohort.get(row.cohort) ?? [];
    const others = cohort
      .filter((candidate) => candidate !== row)
      .map((candidate) => candidate.aggressionShare);
    const bounds = outlierBoundsWithout(others);
    if (row.aggressionShare > bounds.high + MIN_MARGIN) {
      row.anomalies.push({
        kind: "AGGRESSION_HIGH",
        detail: `sází ${(row.aggressionShare * 100).toFixed(0)} % kombinací, víc než ostatní rodiny (mez ${(bounds.high * 100).toFixed(0)} %)`,
      });
    }
    if (row.aggressionShare < bounds.low - MIN_MARGIN) {
      row.anomalies.push({
        kind: "AGGRESSION_LOW",
        detail: `sází jen ${(row.aggressionShare * 100).toFixed(0)} % kombinací, míň než ostatní rodiny (mez ${(bounds.low * 100).toFixed(0)} %)`,
      });
    }
    // Jedna akce na celou rodinu znamená, že se strom někde složil - a uzel bez
    // volby se nedá trénovat, i když je technicky správně.
    if (row.distinctActions <= 1) {
      row.anomalies.push({
        kind: "SINGLE_ACTION",
        detail: `hraje jedinou akci (${row.topAction}), takže tam není co rozhodovat`,
      });
    }
    // Rodina, kde jedna akce sebere skoro všechno, taky nemá co učit.
    if (row.distinctActions > 1 && row.topShare > 0.97) {
      row.anomalies.push({
        kind: "SIZE_SPREAD",
        detail: `${row.topAction} bere ${(row.topShare * 100).toFixed(1)} % kombinací; ostatní akce jsou v podstatě nepoužité`,
      });
    }
  }
  return rows;
}
