import { renderHandGridBlock } from "./handGridRender";
import type { TurnStrategyPack } from "./turnStrategyPack";
import type { TurnStrategyRule } from "./turnStrategyRuleBuilder";

/**
 * Co se předkládá člověku ke čtení, než rodina smí do produkce.
 *
 * Tenhle výpis je jediná cesta z LOW ven a přijetí zvedne rodinu na MEDIUM. To
 * znamená, že chyba **tady** je horší než chyba v generátoru: generátor se dá
 * přegenerovat, ale verdikt vydaný nad zavádějícím výpisem se zapíše jako
 * „člověk to viděl a schválil".
 *
 * ## Proč hlavička jmenuje hrdinu
 *
 * Poziční vzor `SRP_CO_VS_BB` pojmenovává preflopovou akci - kdo otevřel a kdo
 * dorovnal. Neříká, čí strategii uzel drží, a v třinácti rodinách ze šestnácti
 * to není ta první sedačka: `SRP_CO_VS_BB` nese strategii big blindu, který po
 * dorovnání c-betu hraje první na turnu. Přesně tahle záměna už jednou byla
 * chyba v kódu a filovala odpovědi jednoho hráče pod sedačku druhého. V kódu je
 * opravená; ve výpisu pro člověka žila dál, a čtenář nemá jak ji poznat - mřížka
 * ruk vypadá stejně věrohodně, ať patří komukoli.
 *
 * Hrdina se proto píše první a vlastními slovy, ne jako identifikátor.
 */

/** Jak se jmenuje karta v textu, který čte člověk: "2c" zůstává "2c". */
function spotTitle(rule: TurnStrategyRule): string {
  const spot = rule.spot;
  if (spot === undefined) return rule.sourceDirectory;
  const [solved, ...siblings] = spot.turnCards;
  const alsoFor = siblings.length === 0 ? "" : ` (a stejně pro ${siblings.join(", ")})`;
  const depth = spot.potBB === undefined || spot.stackBehindBB === undefined
    ? ""
    : `, pot ${spot.potBB} BB, za tím ${spot.stackBehindBB} BB`;
  // Flopový pack žádnou turn kartu nemá a renderer to neošetřoval, takže výpis
  // psal doslova "turn undefined". Vypadá to jako chybějící data, přitom je to
  // správně: na flopu se ta karta ještě nerozdala.
  const street = solved === undefined ? "" : `, turn ${solved}${alsoFor}`;
  return `flop ${spot.flop.join(" ")}${street}${depth}`;
}

/**
 * Akce tak, jak ji čte pokerista, ne jak ji zapsal solver.
 *
 * Solver píše `BET 17.000000`: šest desetinných míst, která nic neznamenají, a
 * částku v **žetonech**, kdežto celý produkt mluví v blindech. Kdo výpis čte
 * hodiny, převádí si to v hlavě u každého řádku.
 *
 * Blind se nebere z konfigurace, ale dopočítá se z toho pravidla: `potChips`
 * děleno `potBB`. Obě čísla nese každé pravidlo (ověřeno na všech 10 558
 * dodávaných), takže převod nemá kde selhat a nemusí se hádat. Poměr uvnitř
 * rodiny mírně kolísá - 6,494 proti 6,522 - ale to je zaokrouhlení `potBB` na
 * desetiny, ne jiný blind; po převodu na desetinu blindu ten rozdíl zmizí.
 *
 * Procenta potu se doplňují jen u sázky. `RAISE 133` znamená "na 133", ne "o
 * 133", takže podíl by se vztahoval k jinému potu, než jaký má čtenář před
 * očima; u zvýšení se proto uvádí jen částka v blindech.
 *
 * Když by převod nešel, částka se výslovně označí za žetony. Tvářit se, že je
 * to blindy, je horší než přiznat jednotku, kterou produkt jinde nepoužívá.
 */
export function readableAction(
  action: string,
  spot?: { potChips?: number; potBB?: number },
  options: { withPotShare?: boolean } = {},
): string {
  const match = /^(BET|RAISE)\s+([\d.]+)$/i.exec(action.trim());
  if (match === null) return action.trim();
  const verb = match[1].toUpperCase();
  const chips = Number(match[2]);

  const potChips = spot?.potChips;
  const potBB = spot?.potBB;
  const blind = potChips !== undefined && potBB !== undefined && potBB > 0
    ? potChips / potBB
    : undefined;

  if (blind === undefined || blind <= 0) {
    const raw = Number.isInteger(chips) ? String(chips) : chips.toFixed(1);
    return `${verb} ${raw} žetonů`;
  }

  const bb = chips / blind;
  const amount = `${bb.toFixed(1)} BB`;
  const withPotShare = options.withPotShare ?? true;
  if (verb !== "BET" || !withPotShare || potChips === undefined || potChips <= 0) {
    return `${verb} ${amount}`;
  }
  return `${verb} ${amount} (${Math.round((chips / potChips) * 100)} % potu)`;
}

/** Podíl kombinací, které v tomhle pravidle sázejí. */
export function bettingShare(rule: TurnStrategyRule): number {
  let total = 0;
  let bets = 0;
  for (const bucket of rule.buckets) {
    total += bucket.combos;
    if (/^(BET|RAISE|ALL)/i.test(bucket.action)) bets += bucket.combos;
  }
  return total === 0 ? 0 : bets / total;
}

/**
 * Tři ukázky, které se od sebe liší.
 *
 * Dřív se braly první tři pravidla v pořadí, v jakém je generátor zapsal - a to
 * je pořadí podle dosahu v rámci desky, takže všechny tři často pocházely z
 * jedné desky a lišily se jen turnovou kartou. Čtenář pak viděl tutéž situaci
 * třikrát a o rodině se nedozvěděl nic.
 *
 * Berou se proto tři, které něco vypovídají: nejčastěji dosahovaná (to hráč
 * potká), nejsázivější a nejméně sázivá. Chyba ve strategii se pozná na krajích,
 * ne uprostřed.
 */
export function digestSamples(rules: readonly TurnStrategyRule[]): {
  label: string;
  rule: TurnStrategyRule;
}[] {
  if (rules.length === 0) return [];
  const byReach = [...rules].sort((left, right) => (right.spot?.reach ?? 0) - (left.spot?.reach ?? 0));
  const byBetting = [...rules].sort((left, right) => bettingShare(right) - bettingShare(left));
  const picked: { label: string; rule: TurnStrategyRule }[] = [];
  const seen = new Set<TurnStrategyRule>();
  const add = (label: string, rule: TurnStrategyRule | undefined) => {
    if (rule === undefined || seen.has(rule)) return;
    seen.add(rule);
    picked.push({ label, rule });
  };
  add("nejčastěji dosahovaný spot", byReach[0]);
  add("nejvíc sázející spot", byBetting[0]);
  add("nejmíň sázející spot", byBetting[byBetting.length - 1]);
  return picked;
}

/**
 * Kbelíky za celou rodinu podle toho, jak často třída napříč deskami sází.
 *
 * Většinová akce na třídu tady nefunguje. Check je převažující akce skoro všude,
 * takže by většina vyšla na check u každé jediné třídy a rodinová mřížka by byla
 * jednolitá plocha jednoho znaku - technicky pravdivá a k ničemu.
 *
 * Zajímavý je tvar sázecí range: které ruce sázejí na většině desek, které jen
 * občas a které nikdy. To se do jednoho znaku vejde jako pásmo, a právě tenhle
 * tvar odhalí chybu, kterou jednotlivé pravidlo neprozradí - třeba že se sází
 * nejsilnějšími i nejslabšími a nic mezi tím, nebo naopak že sází jen střed.
 */
export function familyBettingBands(
  rules: readonly TurnStrategyRule[],
): { action: string; handClasses: string[]; combos: number }[] {
  const perClass = new Map<string, { seen: number; bet: number }>();
  for (const rule of rules) {
    for (const bucket of rule.buckets) {
      const bets = /^(BET|RAISE|ALL)/i.test(bucket.action);
      for (const handClass of bucket.handClasses) {
        const row = perClass.get(handClass) ?? { seen: 0, bet: 0 };
        row.seen += 1;
        if (bets) row.bet += 1;
        perClass.set(handClass, row);
      }
    }
  }

  const combosOf = (hand: string) => (hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12);
  const bands: { action: string; test: (share: number) => boolean }[] = [
    { action: "sází na většině desek", test: (share) => share >= 0.5 },
    { action: "sází na části desek", test: (share) => share >= 0.15 },
    { action: "sází výjimečně", test: (share) => share > 0 },
    { action: "nikdy nesází", test: () => true },
  ];

  const byBand = new Map<string, { handClasses: string[]; combos: number }>();
  for (const [handClass, row] of perClass) {
    const share = row.seen === 0 ? 0 : row.bet / row.seen;
    const band = bands.find((candidate) => candidate.test(share))!;
    const bucket = byBand.get(band.action) ?? { handClasses: [], combos: 0 };
    bucket.handClasses.push(handClass);
    bucket.combos += combosOf(handClass);
    byBand.set(band.action, bucket);
  }
  // Pořadí pásem, ne podle velikosti: čtenář čte mřížku odshora dolů a chce, aby
  // nejagresivnější pásmo mělo první znak bez ohledu na to, kolik ruk v něm je.
  return bands
    .filter((band) => byBand.has(band.action))
    .map((band) => ({ action: band.action, ...byBand.get(band.action)! }));
}

/** Věta o tom, čí strategii čtenář vidí, nebo přiznání, že to nevíme. */
export function heroSentence(rule: TurnStrategyRule | undefined): string {
  const hero = rule?.spot?.hero;
  if (hero === undefined) {
    // Bez hrdiny se výpis nesmí tvářit, že ví, koho ukazuje. Čtenář, který
    // neví, čí strategii čte, nemá co schvalovat.
    return "čí strategie: NEZNÁMÁ - tenhle pack nenese identitu hráče, nečti ho jako by ji nesl";
  }
  const position = hero.side === "OOP" ? "mimo pozici" : "v pozici";
  const acting = hero.facingBet ? "čelí sázce" : "na tahu první";
  const role = hero.isAggressor ? "byl preflopový agresor" : "preflopovou iniciativu nemá";
  return `čteš strategii: ${hero.seat} (${position}) proti ${hero.villainSeat}, ${acting}, ${role}`;
}

/**
 * Rozhodnutí, která rodina drží, od nejdosahovanějšího.
 *
 * Rodina jich drží víc než jedno od chvíle, kdy se z podhry začaly číst i uzly
 * pod kořenem. Míchat je do jednoho obrázku znamená dívat se na několik různých
 * her najednou: rozdělení akcí by hlásilo `CALL` vedle `BET` a mřížka by
 * skládala range hráče, který sází, s range hráče, který se rozhoduje o
 * dorovnání. Čtenář by nad tím vydal verdikt, aniž by kterékoli z těch
 * rozhodnutí doopravdy viděl - a verdikt zvedá rodinu do produkce.
 */
export function digestDecisions(
  rules: readonly TurnStrategyRule[],
): { hero: string; rules: TurnStrategyRule[] }[] {
  const groups = new Map<string, TurnStrategyRule[]>();
  for (const rule of rules) {
    const key = heroSentence(rule);
    const bucket = groups.get(key) ?? [];
    bucket.push(rule);
    groups.set(key, bucket);
  }
  const reachOf = (group: readonly TurnStrategyRule[]) => (
    group.reduce((sum, rule) => sum + (rule.spot?.reach ?? 0), 0)
  );
  return [...groups]
    .map(([hero, group]) => ({ hero, rules: group }))
    .sort((left, right) => reachOf(right.rules) - reachOf(left.rules));
}

/**
 * Souhrn rodiny ke čtení člověkem.
 *
 * Bere jen to, co doopravdy čte - důvěru, rodinu a pravidla. Pravidla jsou
 * u všech tří ulic kompatibilní, takže tenhle tvar sedí na flopový, turnový
 * i riverový pack; vyžadovat celý `TurnStrategyPack` by nutilo volajícího
 * k přetypování, které TypeScript stejně odmítá.
 */
export function renderTurnFamilyDigest(
  pack: {
    confidence: TurnStrategyPack["confidence"];
    familyIds: readonly string[];
    rules: readonly TurnStrategyRule[];
  },
  contentHash: string,
): string {
  const first = pack.rules[0];
  const lines: string[] = [];
  const decisions = digestDecisions(pack.rules);
  lines.push(`${pack.familyIds[0]}`);
  // Vzor se píše s vysvětlením, co pojmenovává. Sám o sobě svádí číst ho jako
  // hráče na tahu, a to je záměna, která už jednou byla chyba v kódu.
  lines.push(
    `  spot: ${first?.positionPattern} (vzor jmenuje preflopovou akci, ne hráče na tahu)`
    + `, ${first?.potType}, ${first?.node}, ${first?.stackBB}BB`,
  );
  lines.push(`  pravidel ${pack.rules.length}, důvěra ${pack.confidence}, otisk ${contentHash}`);
  lines.push(
    `  rodina drží ${decisions.length} různých rozhodnutí a čtou se odděleně:`
    + " smíchat je znamená dívat se na několik různých her najednou.",
  );

  for (const [index, decision] of decisions.entries()) {
    lines.push(`\n  ── ${index + 1}/${decisions.length}: ${decision.hero}`);
    lines.push(`     ${decision.rules.length} pravidel`);

    // Rozdělení akcí odhalí obrácené znaménko: rozhodnutí, kde hráč bez
    // iniciativy sází ve třech čtvrtinách případů, je špatně, i kdyby každé
    // jednotlivé pravidlo vypadalo rozumně.
    // Převádí se po pravidlech, ne po řetězci akce. Tatáž `BET 17` znamená v
    // jiném spotu jiný podíl potu, ale v blindech vyjde stejně, takže se sloučí
    // správně a bez rodinové konstanty.
    const byAction = new Map<string, number>();
    for (const rule of decision.rules) {
      for (const bucket of rule.buckets) {
        // Bez podílu potu. Souhrn sčítá desky s různými poty, takže tatáž
        // sázka by vyšla na dva řádky s různými procenty a rozdělení by se
        // roztříštilo. V blindech se slučuje správně; podíl potu patří k
        // legendě konkrétní desky, kde je pot jediný.
        const label = readableAction(bucket.action, rule.spot, { withPotShare: false });
        byAction.set(label, (byAction.get(label) ?? 0) + bucket.combos);
      }
    }
    const totalCombos = [...byAction.values()].reduce((sum, value) => sum + value, 0) || 1;
    lines.push("     rozdělení akcí podle kombinací:");
    for (const [action, combos] of [...byAction].sort((a, b) => b[1] - a[1])) {
      // Bez potu: souhrn míchá spoty s různými poty, viz `readableAction`.
      lines.push(`       ${action.padEnd(26)} ${((combos / totalCombos) * 100).toFixed(1)} %`);
    }

    lines.push("     jak často která ruka sází nebo zvyšuje napříč deskami:");
    lines.push(renderHandGridBlock(
      familyBettingBands(decision.rules),
      "     ",
      { preserveOrder: true },
    ));

    const sample = digestSamples(decision.rules)[0];
    if (sample !== undefined) {
      lines.push(`     ${sample.label}: ${spotTitle(sample.rule)}`);
      lines.push(`     (${sample.rule.sourceDirectory})`);
      // Tady je pot jediný, takže procenta potu platí a doplní se.
      lines.push(renderHandGridBlock(
        sample.rule.buckets.map((bucket) => ({
          ...bucket,
          action: readableAction(bucket.action, sample.rule.spot),
        })),
        "       ",
      ));
    }
  }

  lines.push("\n  Přijetím říkáš, že tahle strategie je k trénování v pořádku;");
  lines.push("  rodina tím jde z LOW na MEDIUM a smí do produkce.");
  lines.push("  Verdikt:");
  lines.push(`    npm run mtt:turn-review -- --family=${pack.familyIds[0]} --accept --reviewer="jméno"`);
  lines.push(`    npm run mtt:turn-review -- --family=${pack.familyIds[0]} --needs-work --note="co je špatně"`);
  return lines.join("\n");
}
