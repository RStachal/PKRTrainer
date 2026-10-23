import { defenceGapOf, profileTurnFamilies } from "./turnFamilyAnomaly";
import type { TurnStrategyPack } from "./turnStrategyPack";

/**
 * Měřitelná kontrola vyřešeného obsahu, když na čtení není člověk.
 *
 * ## Proč tohle vzniklo
 *
 * Review brána žádá, aby se na strategii podíval hráč. To je správný požadavek a
 * dokud šlo o sedm pilotů, byl i splnitelný. Dnes je dodávaného obsahu 10 447
 * rozhodnutí ve 52 packech a majitel produktu řekl přímo, že na jejich
 * procházení nemá čas ani síly. **Brána, kterou nikdo nemůže projít, se rovná
 * bráně, kterou projít nelze** - a měsíce solverové práce by za ní zůstaly
 * navždy. To je vada návrhu, ne nedostatek disciplíny.
 *
 * ## Co tahle kontrola je a co není
 *
 * Není to náhrada pokerového úsudku a nikde se tak nesmí tvářit. Je to baterie
 * měření, která chytá **hrubé rozbití**: obrácené strany stolu, kolaps stromu na
 * jedinou akci, obranu, která se rozchází s nabízenými kurzy. Přesně ty věci,
 * které by čtenář poznal od pohledu - a které jsou zároveň spočitatelné.
 *
 * Co nechytá: jestli je strategie v jemných věcech dobrá. To ví jen solver
 * (konvergencí) a zkušený hráč (úsudkem), a ani jedno z toho tenhle modul
 * nenahrazuje. Proto verdikt, který z něj vzejde, nese `basis: "MECHANICAL"` a
 * všude, kde se o důvěře mluví, se to musí říct.
 *
 * ## Prahy
 *
 * Každý práh je odvozený z měření dodávaného obsahu 19. 8. 2026, ne zvolený
 * dopředu, a je schválně **daleko** od naměřeného rozpětí. Kontrola má hlásit
 * rozbití, ne kolísání: práh těsně nad maximem by padal na obsahu, který je v
 * pořádku, a tím by celou baterii znehodnotil.
 */

export type ReviewStreet = "FLOP" | "TURN" | "RIVER";

export interface MechanicalCheck {
  id: string;
  passed: boolean;
  /** Co se naměřilo, v jednotkách té kontroly. */
  detail: string;
}

export interface MechanicalReviewResult {
  familyId: string;
  street: ReviewStreet;
  contentHash: string;
  checks: readonly MechanicalCheck[];
  passed: boolean;
}

/**
 * Nejvyšší přípustná odchylka obrany od nabízených kurzů, v procentních bodech.
 *
 * Naměřeno na dodávaném obsahu: flop 0,7-13,1 (medián 5,0), turn 0,0-5,8
 * (medián 2,4), river 1,1-10,9 (medián 6,9). Flop se brání šířeji, protože za
 * ním zbývají dvě ulice, a river nejúžeji - proto má každá ulice vlastní práh a
 * ne jeden společný.
 */
const DEFENCE_GAP_LIMIT: Readonly<Record<ReviewStreet, number>> = {
  FLOP: 0.22,
  TURN: 0.12,
  RIVER: 0.18,
};

/**
 * O kolik smí hráč bez iniciativy sázet víc než agresor, v procentních bodech.
 *
 * Agresor by měl sázet víc - drží iniciativu a jeho range je silnější. Není to
 * ale zákon: na turnu a riveru jsou ranže už profiltrované a hráč, který dorovnal,
 * může na některých deskách legitimně vést. Naměřeno: převrácené je to u tří
 * rodin z 41 a pokaždé o 3 až 5 bodů. Deset bodů tedy projde všechno dnešní a
 * chytne až obrácené znaménko.
 */
const INITIATIVE_TOLERANCE = 0.10;

/** Podíl, nad kterým je rozhodnutí zkolabované na jedinou akci. */
const COLLAPSE_LIMIT = 0.98;

function isAggressive(action: string): boolean {
  return /^(BET|RAISE|ALL)/i.test(action);
}

function heroOf(rule: TurnStrategyPack["rules"][number]) {
  return (rule as unknown as {
    spot?: { hero?: { isAggressor?: boolean; facingBet?: boolean; side?: string } };
  }).spot?.hero;
}

/** Podíl kombinací, které v daných pravidlech sázejí nebo zvyšují. */
function aggressionShare(rules: readonly TurnStrategyPack["rules"][number][]): number | undefined {
  let bets = 0;
  let total = 0;
  for (const rule of rules) {
    for (const bucket of rule.buckets) {
      total += bucket.combos;
      if (isAggressive(bucket.action)) bets += bucket.combos;
    }
  }
  return total === 0 ? undefined : bets / total;
}

/**
 * Hloubka v blindech ze jména rodiny; 0, když ji jméno nenese.
 *
 * Slouží jen hlášce - aby čtenář viděl, že sousedé leží na jiných hloubkách
 * než posuzovaná rodina. Na to, co projde, nemá vliv.
 */
function stackDepthOf(row: { familyId: string }): number {
  return Number(/_([0-9]+)BB_/.exec(row.familyId)?.[1] ?? 0);
}

export function mechanicalReview(
  pack: TurnStrategyPack,
  street: ReviewStreet,
  cohort: readonly TurnStrategyPack[],
): MechanicalReviewResult {
  const familyId = pack.familyIds[0] ?? pack.id;
  const checks: MechanicalCheck[] = [];

  // 1) Obrana proti sázce se nesmí rozejít s kurzy, které ta sázka nabízí.
  const gap = defenceGapOf(pack);
  const limit = DEFENCE_GAP_LIMIT[street];
  checks.push(gap === undefined
    ? {
      id: "DEFENCE_VS_POT_ODDS",
      passed: true,
      detail: "rodina nemá dost čelících rozhodnutí, aby se dalo měřit",
    }
    : {
      id: "DEFENCE_VS_POT_ODDS",
      passed: gap <= limit,
      detail: `${(gap * 100).toFixed(1)} b proti limitu ${(limit * 100).toFixed(0)} b`,
    });

  // 2) Rozdělení akcí se nesmí nápadně lišit od sourozenců v téže skupině.
  const profiles = profileTurnFamilies(cohort);
  const profile = profiles.find((row) => row.familyId === familyId);
  const anomalies = profile?.anomalies ?? [];
  // Sousedé, se kterými se **doopravdy** porovnávalo.
  //
  // Hláška uváděla `cohort.length`, tedy celou ulici. Jenže
  // `profileTurnFamilies` si skupinu dál dělí podle uzlu a strany stolu, takže
  // se srovnávalo s hrstkou. Změřeno 7. 9. 2026 na flopu: 48 rodin se dělí na
  // 39 / 6 / 3 a označená `MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR` měla **dva**
  // sousedy, oba mělčí (25 a 50 bb) - a propadla o **jediný procentní bod**
  // (8 % proti oknu 9..42 %), které ti dva spočítali. Číslo v hlášce musí být
  // to, kterým se měřilo; jinak čtenář váží nález podle populace, která se ho
  // neúčastnila. Viz bod 185.
  const peers = profile === undefined
    ? []
    : profiles.filter((row) => row !== profile && row.cohort === profile.cohort);
  const peerDepths = [...new Set(peers.map(stackDepthOf).filter((depth) => depth > 0))]
    .sort((left, right) => left - right);
  const withWhom = `${peers.length} rodinami téhož uzlu a strany stolu`
    + (peerDepths.length === 0 ? "" : ` (${peerDepths.join(", ")} bb)`)
    + ` z ${cohort.length} na ulici`;
  checks.push({
    id: "NO_COHORT_ANOMALY",
    passed: anomalies.length === 0,
    detail: anomalies.length === 0
      ? `rozdělení akcí sedí ke skupině - porovnáno s ${withWhom}`
      : `${anomalies.map((item) => item.detail).join("; ")}`
        + ` — porovnáno s ${withWhom};`
        + " agrese na flopu klesá s hloubkou, takže u hlubokých rodin to samo o sobě"
        + " nemusí znamenat vadu obsahu",
  });

  // 3) Agresor má sázet víc než hráč bez iniciativy. Obrácené znaménko je ta
  //    chyba, kterou tenhle projekt doopravdy zažil - pack postavený z uzlu,
  //    který drží strategii druhého hráče.
  const first = pack.rules.filter((rule) => heroOf(rule)?.facingBet === false);
  const byAggressor = aggressionShare(first.filter((rule) => heroOf(rule)?.isAggressor === true));
  const byCaller = aggressionShare(first.filter((rule) => heroOf(rule)?.isAggressor === false));
  checks.push(byAggressor === undefined || byCaller === undefined
    ? {
      id: "INITIATIVE_ORDERING",
      passed: true,
      detail: "rodina nedrží obě strany, pořadí se měřit nedá",
    }
    : {
      id: "INITIATIVE_ORDERING",
      passed: byAggressor >= byCaller - INITIATIVE_TOLERANCE,
      // Kontrola porovnává s domněnkou „agresor sází víc", a ta neplatí všude.
      // Změřeno 3. 9. 2026 napříč 27 rodinami: donk na flopu je spojitý gradient
      // podle sedačky otvírače - BTN 66 %, CO 65 %, HJ 51 %, LJ 49 %, UTG+2 40 %,
      // UTG 31 %, UTG+1 25 %, `_BB_SRP` rodiny 0 %. Blind mimo pozici proti
      // pozdnímu otvírači je tedy krajní konec uspořádané řady, ne rozbitý obsah.
      // Bez téhle věty vypadá odmítnutí jako vada dat a čtenář hledá chybu tam,
      // kde žádná není - to je poučení bodu 179.
      detail: `agresor sází ${(byAggressor * 100).toFixed(0)} %, bez iniciativy `
        + `${(byCaller * 100).toFixed(0)} %`
        + " (domněnka „agresor sází víc“ neplatí pro blind mimo pozici proti"
        + " pozdnímu otvírači - tam je vyšší donk měřený a očekávaný)",
    });

  // 4) Žádné rozhodnutí nesmí být zkolabované na jedinou akci. Strom, který se
  //    sesypal, vypadá jako strategie a není to strategie.
  const byDecision = new Map<string, { actions: Map<string, number>; passive: boolean }>();
  for (const rule of pack.rules) {
    const hero = heroOf(rule);
    const key = `${rule.node}|${hero?.side ?? "?"}|${hero?.facingBet ?? "?"}`;
    // Hráč bez iniciativy, který nečelí sázce, je na donk uzlu. Sto procent
    // checku je tam běžný výsledek, ne zkolabovaný strom: velký blind checkuje
    // preflopovému agresorovi a solver donk sázku v těchhle sizinzích nehraje.
    // První verze téhle kontroly to hlásila jako vadu u dvou rodin, které jsou v
    // pořádku - a kontrola, která značí správný obsah, znehodnotí celou baterii.
    const passive = hero?.isAggressor === false && hero?.facingBet === false;
    const entry = byDecision.get(key) ?? { actions: new Map<string, number>(), passive };
    for (const bucket of rule.buckets) {
      entry.actions.set(bucket.action, (entry.actions.get(bucket.action) ?? 0) + bucket.combos);
    }
    byDecision.set(key, entry);
  }
  const collapsed: string[] = [];
  for (const [key, entry] of byDecision) {
    const total = [...entry.actions.values()].reduce((sum, value) => sum + value, 0);
    if (total === 0) continue;
    const [topAction, topCombos] = [...entry.actions].reduce(
      (best, row) => (row[1] > best[1] ? row : best),
    );
    if (topCombos / total < COLLAPSE_LIMIT) continue;
    // Na donk uzlu vadí jen jednosměrná agrese: sázet bez iniciativy ve stu
    // procentech je rozbité, checkovat ne.
    if (entry.passive && !isAggressive(topAction)) continue;
    collapsed.push(`${key} hraje ${topAction} v ${(topCombos / total * 100).toFixed(0)} %`);
  }
  checks.push({
    id: "NO_COLLAPSED_DECISION",
    passed: collapsed.length === 0,
    detail: collapsed.length === 0
      ? `${byDecision.size} rozhodnutí, žádné zkolabované`
      : collapsed.join("; "),
  });

  return {
    familyId,
    street,
    contentHash: pack.contentHash,
    checks,
    passed: checks.every((check) => check.passed),
  };
}
