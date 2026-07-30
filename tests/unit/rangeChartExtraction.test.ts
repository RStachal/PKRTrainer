import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The owner's purchased chart packs are 210 images and a hand grid is 169 cells.
// Reading them by eye is how a range that looks right ends up grading players
// against the wrong hands, so they are sampled. These tests hold the two
// properties that make the sampling trustworthy rather than merely plausible.

const repoRoot = path.resolve(__dirname, "../..");
const extractor = path.join(repoRoot, "scripts/extractRangeChartGrid.ps1");
const detector = path.join(repoRoot, "scripts/detectRangeChartGrids.ps1");
// The charts live outside the repository - they are licensed material, not ours
// to commit - so these run only where the owner has them.
const chart = "C:/Users/stachal/Downloads/archivedwl-359/RYE/openraising 10-20bb/openraising 10-20bb bu-sb.png";
const runnable = process.platform === "win32" && existsSync(extractor) && existsSync(chart);

function powershell(script: string, ...args: string[]): string {
  return execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-File", script, ...args],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
}

describe.runIf(runnable)("range chart extraction", () => {
  it("covers all 169 hand classes exactly once", () => {
    // The check that catches a misplaced grid. Wrong offsets still produce
    // output - they just describe different cells - and the first time this was
    // pointed at a chart it had not been measured for, KK and QQ came back in the
    // fold bucket. A complete, duplicate-free 169 is what says the grid was found.
    const output = powershell(extractor, "-Image", chart, "-Left", "362", "-Top", "128", "-Cell", "45.6");
    const hands = output
      .split(/\r?\n/)
      .filter((line) => line.startsWith("#"))
      .flatMap((line) => line.slice(line.indexOf(" x")).replace(/^\s*x\d+\s*/, "").split(", "))
      .map((hand) => hand.trim())
      .filter((hand) => hand.length > 0);

    expect(hands.length).toBe(169);
    expect(new Set(hands).size).toBe(169);
  });

  it("resolves the chart into the actions its legend names", () => {
    // Five groups: the four actions the legend lists, plus folds. More than that
    // means the gradient split one fill; fewer means two actions were merged.
    const output = powershell(extractor, "-Image", chart, "-Left", "362", "-Top", "128", "-Cell", "45.6");
    const groups = output.split(/\r?\n/).filter((line) => line.startsWith("#"));

    expect(groups.length).toBe(5);
    // The openraise band is the premiums, which is checkable against the image.
    const openraise = groups.find((line) => line.startsWith("#D87878"));
    expect(openraise).toBeDefined();
    for (const hand of ["AA", "AKs", "KK", "QQ", "JJ", "TT"]) {
      expect(openraise, hand).toContain(hand);
    }
  });

  it("finds the grids on a page without being told where", () => {
    const output = powershell(detector, "-Image", chart);
    const grids = output.split(/\r?\n/).filter((line) => line.trim().startsWith("grid"));

    expect(grids.length).toBe(2);
    for (const grid of grids) {
      // Cells are not square on these pages. Borrowing the column pitch for the
      // rows is what made every earlier attempt drift a full cell over thirteen
      // steps, so the two are asserted apart.
      const cellX = Number(/-CellX ([\d.]+)/.exec(grid)?.[1]);
      const cellY = Number(/-CellY ([\d.]+)/.exec(grid)?.[1]);
      expect(cellX, grid).toBeGreaterThan(44.5);
      expect(cellX, grid).toBeLessThan(45.5);
      expect(cellY, grid).toBeGreaterThan(46);
      expect(cellY, grid).toBeLessThan(46.6);
      expect(cellY - cellX, grid).toBeGreaterThan(0.8);
    }
  });

  it("reads the same range from detected geometry as from measured geometry", () => {
    // The check that makes the detector usable in batch: what it finds has to
    // agree with what a person measured by hand, or the automation is only
    // confidently wrong at scale.
    const detected = powershell(detector, "-Image", chart)
      .split(/\r?\n/)
      .find((line) => line.trim().startsWith("grid"));
    expect(detected).toBeDefined();
    const args = (detected ?? "").trim().replace(/^grid\s+/, "").split(/\s+/);

    const auto = powershell(extractor, "-Image", chart, ...args);
    const byHand = powershell(extractor, "-Image", chart, "-Left", "362", "-Top", "128", "-Cell", "45.6");

    const openraise = (text: string) => text.split(/\r?\n/).find((line) => line.startsWith("#D87878"));
    expect(openraise(auto)).toBe(openraise(byHand));
    expect(auto.split(/\r?\n/).filter((l) => l.startsWith("#")).length).toBe(5);
  });

});
