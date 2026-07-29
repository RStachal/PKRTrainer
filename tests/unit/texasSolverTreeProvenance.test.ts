import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

interface BoardRow {
  boardId: string;
  rootBetSizes: number[];
  matchedSets: string[];
  profile: "FULL_TREE" | "REDUCED_TREE" | "AMBIGUOUS" | "UNKNOWN";
  /** What the root bet sizes alone would have said. Corroboration only. */
  sizeProfile: "FULL_TREE" | "REDUCED_TREE" | "AMBIGUOUS" | "UNKNOWN";
  disagrees: boolean;
}

interface Report {
  counts: {
    families: number;
    boards: number;
    fullTree: number;
    reducedTree: number;
    ambiguous: number;
    unknown: number;
    mixedFamilies: number;
    sizeTestCouldNotDecide: number;
    sizeTestDisagreed: number;
  };
  families: Array<{ familyId: string; boardRows: BoardRow[] }>;
}

const FAMILY = "MTT9_TEST_FAMILY";
let root: string;
let outputRoot: string;
let paramRoot: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pkrtrainer-tree-provenance-"));
  outputRoot = join(root, "output");
  paramRoot = join(root, "parameters");
  mkdirSync(join(outputRoot, FAMILY, "raw"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("mtt:texas-solver-tree-provenance CLI", () => {
  it("finds a family holding one board of each tree", () => {
    // The whole point of the audit: an aggregate built over both is blending two
    // different games. Told apart by what the boards ARE - the reduced one has a
    // turn node whose only action is CHECK - not by which bet sizes they carry.
    writeParamSet("pkrtrainer_mtt_beta_min_board_review_v1", 157, [50]);
    writeParamSet("pkrtrainer_mtt_low_memory_beta_min_board_review_v1", 157, [33]);
    writeBoard("K83r", [79, 1500]);
    writeBoardWithSuppressedDonk("A72r", [52, 1500]);

    const report = invokeJson();

    expect(report.counts).toMatchObject({ boards: 2, fullTree: 1, reducedTree: 1 });
    expect(boardRow(report, "K83r").profile).toBe("FULL_TREE");
    expect(boardRow(report, "A72r").profile).toBe("REDUCED_TREE");
    expect(report.counts.mixedFamilies).toBe(1);
    // Here the two signals agree, which is the ordinary case.
    expect(report.counts.sizeTestDisagreed).toBe(0);
  });

  it("uses each parameter set's own pot rather than a shared one", () => {
    // safe_flops uses pot 57, so its 50% bet is 29 rather than 25. Attributing
    // it with another set's pot would misclassify the board.
    writeParamSet("pkrtrainer_mtt_safe_flops_v1", 57, [50]);
    writeParamSet("pkrtrainer_mtt_beta_min_board_review_v1", 50, [50]);
    writeParamSet("pkrtrainer_mtt_low_memory_beta_min_board_review_v1", 50, [33]);
    writeBoard("Q72r", [29, 379]);

    const report = invokeJson();

    const row = boardRow(report, "Q72r");
    expect(row.profile).toBe("FULL_TREE");
    expect(row.matchedSets).toEqual(["pkrtrainer_mtt_safe_flops_v1"]);
  });

  it("resolves a root the parameter sets cannot separate by reading the turn", () => {
    // The two trees are identical at the flop, so whenever both sets predict the
    // same root bet the root test can say nothing. It used to stop there and
    // report AMBIGUOUS, which left 226 of 577 real boards unclassified - invisible
    // to the tree-mixing guard and never selected for re-solve. The board's own
    // turn structure decides it instead: this fixture has no suppressed donk node,
    // so it is a full tree.
    writeParamSet("pkrtrainer_mtt_beta_min_board_review_v1", 50, [33]);
    writeParamSet("pkrtrainer_mtt_low_memory_beta_min_board_review_v1", 50, [33]);
    writeBoard("J54mono", [17, 125]);

    const report = invokeJson();

    expect(boardRow(report, "J54mono").profile).toBe("FULL_TREE");
    expect(boardRow(report, "J54mono").sizeProfile).toBe("AMBIGUOUS");
    expect(report.counts).toMatchObject({
      fullTree: 1,
      reducedTree: 0,
      sizeTestCouldNotDecide: 1,
      sizeTestDisagreed: 0,
    });
  });

  it("resolves the same unseparable root to reduced when the donk node is suppressed", () => {
    writeParamSet("pkrtrainer_mtt_beta_min_board_review_v1", 50, [33]);
    writeParamSet("pkrtrainer_mtt_low_memory_beta_min_board_review_v1", 50, [33]);
    // A reduced tree declares no turn donk size, so the solver emits that node
    // with CHECK as its only legal action - something a full tree never does.
    writeBoardWithSuppressedDonk("J54mono", [17, 125]);

    const report = invokeJson();

    expect(boardRow(report, "J54mono").profile).toBe("REDUCED_TREE");
    expect(report.counts).toMatchObject({ fullTree: 0, reducedTree: 1, ambiguous: 0 });
  });

  it("still classifies a board no parameter set explains", () => {
    // This is the case a deliberately coarser tree lands in: solved with bet
    // sizes no recorded set predicts, while being a full tree in every way that
    // matters. Answering UNKNOWN would hide it from the mixing guard and keep it
    // out of every re-solve batch, so the structure decides and the sizes only
    // record that they could not have.
    writeParamSet("pkrtrainer_mtt_beta_min_board_review_v1", 50, [50]);
    writeBoard("T84r", [999]);

    const report = invokeJson();

    expect(boardRow(report, "T84r").profile).toBe("FULL_TREE");
    expect(boardRow(report, "T84r").sizeProfile).toBe("UNKNOWN");
    expect(boardRow(report, "T84r").disagrees).toBe(false);
    expect(report.counts.sizeTestCouldNotDecide).toBe(1);
  });

  it("raises a hand when the sizes contradict the structure", () => {
    // The cross-check earns its keep here. A set that says review-only against a
    // board whose turn structure is full means one of the two signals has
    // drifted, and that is a question for a person rather than something to
    // resolve quietly in favour of either one.
    writeParamSet("pkrtrainer_mtt_low_memory_beta_min_board_review_v1", 50, [33]);
    writeBoard("A72r", [17, 125]);

    const report = invokeJson();

    expect(boardRow(report, "A72r").profile).toBe("FULL_TREE");
    expect(boardRow(report, "A72r").sizeProfile).toBe("REDUCED_TREE");
    expect(boardRow(report, "A72r").disagrees).toBe(true);
    expect(report.counts.sizeTestDisagreed).toBe(1);
  });

  it("rejects an unknown option", () => {
    const result = invoke("--unknown");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --unknown");
  });
});

function writeParamSet(setName: string, pot: number, oopFlopBetPercents: readonly number[]): void {
  const dir = join(paramRoot, setName);
  mkdirSync(dir, { recursive: true });
  const lines = [
    `set_pot ${pot}`,
    "set_effective_stack 1500",
    "set_board Ks,8h,3d",
    `set_bet_sizes oop,flop,bet,${oopFlopBetPercents.join(",")}`,
    // IP sizes must not reach the root, so a distinctive value is used here.
    "set_bet_sizes ip,flop,bet,90",
    "build_tree",
    "start_solve",
    `dump_result pkrtrainer_${FAMILY}_K83r.json`,
    "",
  ].join("\n");
  // One parameter file per board id keeps the discovery pattern realistic.
  for (const board of ["K83r", "A72r", "Q72r", "J54mono", "T84r"]) {
    writeFileSync(join(dir, `01_${FAMILY}_${board}.txt`), lines, "utf8");
  }
}

/** A dump whose root matches, but which carries the reduced tree's turn marker. */
function writeBoardWithSuppressedDonk(boardId: string, rootBetSizes: readonly number[]): void {
  const actions = ["CHECK", ...rootBetSizes.map((size) => `BET ${size}.000000`)]
    .map((item) => `"${item}"`)
    .join(",");
  const turn = '{"actions":["CHECK"],"childrens":{},"node_type":"action_node"}';
  const body = `{"actions":[${actions}],"childrens":{"turn":${turn}},"node_type":"action_node"}`;
  writeFileSync(join(outputRoot, FAMILY, "raw", `pkrtrainer_${FAMILY}_${boardId}.json`), body, "utf8");
}

function writeBoard(boardId: string, rootBetSizes: readonly number[]): void {
  const actions = ["CHECK", ...rootBetSizes.map((size) => `BET ${size}.000000`)]
    .map((item) => `"${item}"`)
    .join(",");
  const body = `{"actions":[${actions}],"childrens":{},"node_type":"action_node"}`;
  writeFileSync(join(outputRoot, FAMILY, "raw", `pkrtrainer_${FAMILY}_${boardId}.json`), body, "utf8");
}

function boardRow(report: Report, boardId: string): BoardRow {
  const family = report.families.find((item) => item.familyId === FAMILY);
  const row = family?.boardRows.find((item) => item.boardId === boardId);
  if (row === undefined) throw new Error(`Board missing from report: ${boardId}`);
  return row;
}

function invokeJson(...args: string[]): Report {
  const result = invoke("--json", ...args);
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as Report;
}

function invoke(...args: string[]) {
  return spawnSync(process.execPath, [
    "node_modules/vite-node/vite-node.mjs",
    "scripts/auditTexasSolverTreeProvenance.mts",
    `--output-root=${outputRoot}`,
    `--param-root=${paramRoot}`,
    ...args,
  ], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}
