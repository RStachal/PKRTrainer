import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildTurnStrategyRule } from "../src/data/ranges/turnStrategyRuleBuilder";
import { buildTurnStrategyPack } from "../src/data/ranges/turnStrategyPack";
import { TURN_COVERAGE_TARGET, type TurnFamilyEvidence } from "../src/data/ranges/turnReviewGate";

/**
 * Write a turn strategy pack module from a review-ready family.
 *
 *   npm run mtt:turn-pack -- --family=MTT9_25BB_CO_BB_SRP_CBET_LOWSPR [--write]
 *
 * One family per run and one board per turn card, deliberately. The eleven
 * families hold 35,144 subgames between them; emitting all of it would put
 * megabytes of solved strategy in front of a bundle budget that exists because
 * the app is used on phones. A family is the unit a reviewer works in anyway.
 *
 * Without --write it reports what it would emit, so the size is known before
 * anything lands.
 */

const ROOT = "artifacts/decomposition";
const OUT_DIR = "src/data/ranges/turn";
const MANIFEST_PATH = "src/data/ranges/turnSolvedManifest.generated.ts";
const PROFILE_KEY = "FULL_RING_9|REGULAR|CHIP_EV|TURN";

/**
 * Solved turns kept per family.
 *
 * A family holds several hundred of them and each costs about a kilobyte built.
 * Three hundred fills a third of a chunk's five-hundred-and-twelve-kilobyte
 * limit, which leaves room for the family to grow when a reviewer asks for a
 * board that was dropped.
 */
const RULE_BUDGET = 300;

interface ManifestEntry { familyId: string; packId: string; slug: string }

/**
 * The file a plan item was written to.
 *
 * The decomposition names a subgame for its flop line and turn card:
 * `BET 17.000000` and `CALL` on a `2c` becomes `BET17_CALL__2c.json`. The
 * mapping is the writer's, and reconstructing it here is the only link between a
 * plan item and the strategy it planned.
 */
/** "AhKs" to "AKs", so a node's combinations can be compared with a plan's range. */
function handClassOfCombo(combo: string): string | undefined {
  if (combo.length < 4) return undefined;
  const [rankOne, suitOne, rankTwo, suitTwo] = combo;
  if (rankOne === rankTwo) return `${rankOne}${rankTwo}`;
  return `${rankOne}${rankTwo}${suitOne === suitTwo ? "s" : "o"}`;
}

/**
 * Which player a solved node belongs to, decided by its hand classes.
 *
 * The directory name cannot answer this. `MTT9_25BB_CO_BB_SRP_CBET_LOWSPR` names
 * the flop c-bet that defines the family, and the turn node inside it turned out
 * to hold the big blind's strategy for acting first after calling that c-bet -
 * so filing by name would have shown the cutoff's seat the big blind's answers.
 *
 * The plan states both ranges at every turn it planned, `oop` and `ip`, which is
 * the solve's own record of who holds what. Overlap decides it. The two ranges
 * are not disjoint - both players hold sixes on a board with a six - so the test
 * is which side the node's classes are more contained in, and by enough of a
 * margin that the answer is not a coin toss.
 */
function heroSideOfNode(
  node: { strategy?: { strategy?: Record<string, unknown> } },
  item: { oop?: Record<string, number>; ip?: Record<string, number> },
): { side: "OOP" | "IP"; confidence: number } | undefined {
  const combos = Object.keys(node.strategy?.strategy ?? {});
  const classes = new Set(
    combos.map(handClassOfCombo).filter((item): item is string => item !== undefined),
  );
  if (classes.size === 0) return undefined;

  const containment = (range?: Record<string, number>) => {
    if (range === undefined) return 0;
    const keys = new Set(Object.keys(range));
    let inside = 0;
    for (const handClass of classes) if (keys.has(handClass)) inside += 1;
    return inside / classes.size;
  };

  const oop = containment(item.oop);
  const ip = containment(item.ip);
  const [side, best, other] = oop >= ip
    ? ["OOP" as const, oop, ip]
    : ["IP" as const, ip, oop];

  // Contained in one side and clearly better contained than in the other. A node
  // that fits both equally has not been identified, and shipping it would be a
  // coin toss over which player's strategy a reader is shown.
  if (best < HERO_CONTAINMENT_FLOOR) return undefined;
  if (best - other < HERO_CONTAINMENT_MARGIN) return undefined;
  return { side, confidence: Math.round(best * 1000) / 1000 };
}

/** Share of a node's classes that must sit inside the range claimed for it. */
const HERO_CONTAINMENT_FLOOR = 0.9;
/** How much better the winning side must fit than the losing one. */
const HERO_CONTAINMENT_MARGIN = 0.05;

/**
 * The two seats a family names, and which of them acts last after the flop.
 *
 * Postflop order runs SB, BB, then UTG round to the button, so the later a seat
 * sits in that order the more often it is in position - with the blinds first
 * rather than last, which is the whole reason this cannot be read off the
 * preflop order.
 */
const POSTFLOP_ORDER = ["SB", "BB", "UTG", "UTG_1", "UTG_2", "LJ", "HJ", "CO", "BTN"];

function seatsOfFamily(
  directoryName: string,
): { oop: string; ip: string; aggressor: string } | undefined {
  const match = /^MTT9_\d+BB_([A-Z0-9_]+?)_([A-Z0-9_]+?)_(SRP|3BP)/.exec(directoryName);
  if (match === null) return undefined;
  const [first, second, potType] = [match[1], match[2], match[3]];
  const rank = (seat: string) => POSTFLOP_ORDER.indexOf(seat);
  if (rank(first) < 0 || rank(second) < 0) return undefined;
  // The name lists the seats in the order they acted before the flop. In a
  // single-raised pot that makes the first one the raiser; in a three-bet pot
  // the first opened and the second raised them, so the aggressor is the second.
  const aggressor = potType === "3BP" ? second : first;
  const seats = rank(first) < rank(second)
    ? { oop: first, ip: second }
    : { oop: second, ip: first };
  return { ...seats, aggressor };
}

function subgameFileName(item: { line?: string[]; turn: string }): string {
  const line = (item.line ?? []).map((action) => {
    const sized = /^(BET|RAISE|ALLIN|ALL_IN)\s+([\d.]+)$/i.exec(action.trim());
    if (sized === null) return action.trim().toUpperCase().replace(/\s+/g, "");
    return `${sized[1].toUpperCase()}${Math.round(Number(sized[2]))}`;
  }).join("_");
  return `${line}__${item.turn}.json`;
}

/**
 * Rewrite the manifest with this family added, keeping the others.
 *
 * Families arrive one run at a time, so regenerating the manifest from scratch
 * each run would delete the previous ones. The existing entries are read back
 * out of the file rather than tracked separately: the file is the record of what
 * has been built, and a second record would be a second thing to get wrong.
 */
function writeManifestEntry(added: ManifestEntry): void {
  const existing: ManifestEntry[] = [];
  if (existsSync(MANIFEST_PATH)) {
    const source = readFileSync(MANIFEST_PATH, "utf8");
    const pattern = /familyId: "([^"]+)",\s*\n\s*packId: "([^"]+)",[\s\S]*?import\("\.\/turn\/([^"]+)\.generated"\)/g;
    for (const match of source.matchAll(pattern)) {
      existing.push({ familyId: match[1], packId: match[2], slug: match[3] });
    }
  }
  const entries = [...existing.filter((item) => item.familyId !== added.familyId), added]
    .sort((left, right) => left.familyId.localeCompare(right.familyId));

  const body = entries.map((entry) => `  {
    familyId: "${entry.familyId}",
    packId: "${entry.packId}",
    profileKey: "${PROFILE_KEY}",
    load: () => import("./turn/${entry.slug}.generated").then((module) => module.turnPack),
  },`).join("\n");

  writeFileSync(MANIFEST_PATH, `// Generated by \`npm run mtt:turn-pack -- --write\`.
// Do not edit by hand.

import type { TurnStrategyPack } from "./turnStrategyPack";

export interface SolvedTurnManifestEntry {
  familyId: string;
  packId: string;
  profileKey: string;
  load(): Promise<TurnStrategyPack>;
}

export const solvedTurnManifest: readonly SolvedTurnManifestEntry[] = [
${body}
];
`, "utf8");
}

const familyArg = process.argv.find((item) => item.startsWith("--family="));
const write = process.argv.includes("--write");
const family = familyArg?.split("=")[1];

if (family === undefined) {
  console.error("Usage: npm run mtt:turn-pack -- --family=<FAMILY_ID> [--write]");
  process.exitCode = 2;
} else if (!existsSync(ROOT)) {
  console.error(`${ROOT} is absent; nothing to build from.`);
  process.exitCode = 1;
} else {
  const directories = readdirSync(ROOT).filter((name) => name.startsWith(`${family}__`));
  const evidence: TurnFamilyEvidence = {
    familyId: family, boards: 0, plannedItems: 0, writtenItems: 0,
    minCoverage: 1, coverageTarget: TURN_COVERAGE_TARGET, sampledRules: [],
  };
  const rules = [];
  let unidentified = 0;

  for (const directory of directories) {
    const planPath = join(ROOT, directory, "plan.json");
    if (!existsSync(planPath)) continue;
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    const files = readdirSync(join(ROOT, directory))
      .filter((name) => name.endsWith(".json") && name !== "plan.json");
    evidence.boards += 1;
    evidence.plannedItems += (plan.items ?? []).length;
    evidence.writtenItems += files.length;
    evidence.minCoverage = Math.min(evidence.minCoverage, plan.coverageAchieved ?? 0);

    // One rule per solved turn, keyed to the exact board it was solved on.
    //
    // The plan is what ties a subgame file to its board, its turn card, the flop
    // line that led there and the pot at that node. Reading the files alone would
    // produce rules that know their family but not their turn, and a resolver
    // holding those has no way to refuse a board nobody solved.
    // The blind, in chips. The plan states the root stack in chips and the family
    // name states it in big blinds, so their ratio is the only place the two unit
    // systems meet. Without it nothing downstream can deal a spot at the depth it
    // was actually solved at.
    const seats = seatsOfFamily(directory);
    const familyStackBB = Number(/_(\d+)BB_/.exec(directory)?.[1] ?? 0);
    const chipsPerBB = familyStackBB > 0 && plan.stack > 0 ? plan.stack / familyStackBB : 0;
    const inBB = (chips: number) => (
      chipsPerBB > 0 ? Math.round((chips / chipsPerBB) * 10) / 10 : undefined
    );

    for (const item of plan.items ?? []) {
      const fileName = subgameFileName(item);
      const path = join(ROOT, directory, fileName);
      if (!existsSync(path)) continue;
      const node = JSON.parse(readFileSync(path, "utf8"));
      const potChips = item.pot ?? plan.pot ?? 0;
      const stackChips = item.stack ?? plan.stack ?? 0;
      const potBB = inBB(potChips);
      const stackBehindBB = inBB(stackChips);

      // Whose node this is, from the solve rather than from the name. An item
      // whose side cannot be established is left out: a rule filed under the
      // wrong seat shows one player the other's answers, wearing a label that
      // says a solver produced them.
      const side = seats === undefined ? undefined : heroSideOfNode(node, item);
      if (side === undefined) {
        unidentified += 1;
        continue;
      }
      const actions: string[] = node.actions ?? [];
      const seat = side.side === "OOP" ? seats!.oop : seats!.ip;
      const hero = {
        side: side.side,
        seat,
        villainSeat: side.side === "OOP" ? seats!.ip : seats!.oop,
        isAggressor: seat === seats!.aggressor,
        confidence: side.confidence,
        // A node offering a fold has a bet in front of it; one offering a check
        // does not. This is the node's own shape, not a reading of the name.
        facingBet: actions.some((action) => /^FOLD$/i.test(action.trim())),
      };

      const rule = buildTurnStrategyRule(directory, node, {
        hero,
        flop: (plan.board ?? []) as string[],
        turnCards: [item.turn, ...(item.represents ?? []).filter((card: string) => card !== item.turn)],
        priorLine: item.line ?? [],
        potChips,
        stackChips,
        ...(potBB === undefined ? {} : { potBB }),
        ...(stackBehindBB === undefined ? {} : { stackBehindBB }),
        reach: item.reach ?? 0,
      });
      if (rule) rules.push(rule);
    }
  }

  // Highest reach first within each board, then one board at a time until the
  // budget fills.
  //
  // Sorting the whole family by reach and cutting looks right and is not: the
  // first attempt kept 300 turns spread over eleven of the thirty three solved
  // flops, because a board where the flop line is taken often has higher reach on
  // every one of its turns than a board where it is taken rarely. That buries
  // twenty two boards a player will still be dealt. Taking turns from each board
  // in rotation spends the same budget across all of them, and within a board it
  // still spends it on the turns that actually arrive.
  const byBoard = new Map<string, typeof rules>();
  for (const rule of rules) {
    const key = rule.sourceDirectory;
    const bucket = byBoard.get(key) ?? [];
    bucket.push(rule);
    byBoard.set(key, bucket);
  }
  for (const bucket of byBoard.values()) {
    bucket.sort((left, right) => (right.spot?.reach ?? 0) - (left.spot?.reach ?? 0));
  }
  const kept: typeof rules = [];
  const queues = [...byBoard.values()];
  for (let round = 0; kept.length < RULE_BUDGET; round += 1) {
    let placed = 0;
    for (const queue of queues) {
      if (round >= queue.length) continue;
      if (kept.length >= RULE_BUDGET) break;
      kept.push(queue[round]);
      placed += 1;
    }
    if (placed === 0) break;
  }
  const dropped = rules.length - kept.length;
  rules.length = 0;
  rules.push(...kept);
  evidence.sampledRules = rules.slice(0, 1);
  if (dropped > 0) console.log(`  ${dropped} lower-reach turns dropped to fit the rule budget`);

  // Who the kept turns belong to, printed every run. This is the fact the
  // directory name could not be trusted for, so it is reported rather than
  // assumed - a family whose seats read wrongly should be visible here before
  // anything is written.
  const identities = new Map<string, number>();
  for (const rule of rules) {
    const hero = rule.spot?.hero;
    if (hero === undefined) continue;
    const key = `${hero.side} ${hero.seat} vs ${hero.villainSeat}, `
      + `${hero.facingBet ? "facing a bet" : "first to act"}`;
    identities.set(key, (identities.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...identities].sort()) {
    console.log(`  hero: ${key} - ${count} turns`);
  }
  if (unidentified > 0) {
    console.log(`  ${unidentified} turns left out: could not establish whose strategy the node holds`);
  }

  const result = buildTurnStrategyPack({
    id: `mtt-full-ring-9-turn-solved-${family.toLowerCase().replace(/_/g, "-")}-v1`,
    createdAt: new Date().toISOString().slice(0, 10),
    evidence,
    rules,
  });

  if (!result.ok) {
    console.error(result.reason);
    process.exitCode = 1;
  } else {
    const module = [
      "// Generated by `npm run mtt:turn-pack -- --write`.",
      "// Solved turn content; confidence stays LOW until a player reviews it.",
      'import type { TurnStrategyPack } from "../turnStrategyPack";',
      "",
      `export const turnPack: TurnStrategyPack = ${JSON.stringify(result.pack, null, 2)};`,
      "",
    ].join("\n");
    const slug = family.toLowerCase().replace(/_/g, "-");
    const outPath = join(OUT_DIR, `${slug}.generated.ts`);
    console.log(`family ${family}`);
    console.log(`  boards ${evidence.boards}, rules ${rules.length}, module ${(module.length / 1024).toFixed(0)} KB`);
    console.log(`  ${write ? "written" : "would write"}: ${outPath}`);
    if (write) {
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, module, "utf8");
      writeManifestEntry({ familyId: family, packId: result.pack.id, slug });
      console.log(`  manifest updated: ${MANIFEST_PATH}`);
    }
  }
}
