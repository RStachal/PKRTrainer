import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { JSDOM, VirtualConsole } from "jsdom";
import { describe, expect, it } from "vitest";

describe("mtt:texas-solver-viewer CLI", () => {
  it("builds a source-safe reviewer index with working family and status filters", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-review-viewer-"));
    const input = join(directory, "review.report.json");
    const secondInput = join(directory, "review.second.report.json");
    const otherFamilyInput = join(directory, "review.other-family.report.json");
    const output = join(directory, "viewer.html");
    const waves = join(directory, "OWNER_REVIEW_WAVES.md");
    const readiness = join(directory, "mechanical-readiness.json");
    try {
      const report = {
        valid: true,
        status: "NEEDS_REVIEW",
        productionReady: false,
        familyId: "MTT9_50BB_BTN_BB_SRP",
        nodeHistory: ["CHECK"],
        counts: { rawFiles: 1, parsedFiles: 1, blockedFiles: 0, combos: 12, handClasses: 3 },
        files: [{
          boardId: "A72r",
          comboCount: 12,
          handClassCount: 3,
          nodeType: "action_node",
          player: 0,
          handClasses: {
            AJs: { comboCount: 1, averageByAction: { CHECK: 0.2, BET_25: 0.8 }, dominantAction: "BET_25", dominantFrequency: 0.8 },
          },
        }],
        anomalies: [],
        blockers: ["Human poker review is required."],
      };
      writeFileSync(input, JSON.stringify(report, null, 2), "utf8");
      writeFileSync(secondInput, JSON.stringify({ ...report, nodeHistory: ["BET_25"] }, null, 2), "utf8");
      writeFileSync(otherFamilyInput, JSON.stringify({ ...report, familyId: "MTT9_OTHER_FAMILY", nodeHistory: [] }, null, 2), "utf8");
      writeFileSync(waves, "# Owner review waves\n\n## Wave 2\n\n- MTT9_50BB_BTN_BB_SRP: NEEDS_REVIEW\n\n## Wave 3\n\n- MTT9_OTHER_FAMILY: NEEDS_REVIEW\n", "utf8");
      writeFileSync(readiness, JSON.stringify({
        basis: "REVIEW_ONLY_EVIDENCE_NOT_POKER_APPROVAL",
        rows: [
          {
            familyId: "MTT9_50BB_BTN_BB_SRP",
            evidenceValid: true,
            boardCount: 12,
            cohortCount: 6,
            largestCohortShare: 0.25,
            mechanicalShapeReady: true,
            nextGate: "HUMAN_POKER_REVIEW",
          },
          {
            familyId: "MTT9_OTHER_FAMILY",
            evidenceValid: true,
            boardCount: 8,
            cohortCount: 5,
            largestCohortShare: 0.375,
            mechanicalShapeReady: false,
            nextGate: "MORE_EVIDENCE_REQUIRED",
          },
        ],
      }, null, 2), "utf8");

      const result = runViewer(`--input=${input}`, `--input=${secondInput}`, `--input=${otherFamilyInput}`, `--output=${output}`, `--waves=${waves}`, `--readiness=${readiness}`);

      expect(result.status).toBe(0);
      const html = readFileSync(output, "utf8");
      expect(html).toContain('id="family-filter"');
      expect(html).toContain('id="status-filter"');
      expect(html).toContain('id="wave-filter"');
      expect(html).toContain('id="mechanical-filter"');
      expect(html).toContain('<option value="2" selected>Wave 2 (1)</option>');
      expect(html).toContain('<option value="3">Wave 3 (1)</option>');
      expect(html).toContain("<dt>Families</dt><dd>2</dd>");
      expect(html).toContain('id="download-owner-decisions"');
      expect(html).toContain('id="import-owner-decisions"');
      expect(html).toContain('id="copy-owner-commands"');
      expect(html).toContain('id="next-incomplete-decision"');
      expect(html).toContain('id="owner-reviewer"');
      expect(html).toContain("Mechanical context 1/2");
      expect(html).toContain("Mechanical readiness is reduced-tree, review-only context.");
      expect(html).toContain('data-mechanical-ready="true"');
      expect(html).toContain('data-mechanical-ready="false"');
      expect(html).toContain("12 boards / 6 cohorts / 25.0% max cohort");
      expect(html).toContain("Next: HUMAN_POKER_REVIEW");
      expect(html).toContain("pkrtrainer-texas-solver-owner-decisions-v1");
      expect(html).toContain("RECORD_TEXAS_SOLVER_OWNER_REVIEW_BATCH");
      expect(html).toContain("localStorage.setItem");
      expect(html).toContain('data-review-card');
      expect(html).toContain('data-status="NEEDS_REVIEW"');
      expect(html).toContain('data-wave="2"');
      expect(html).toContain("Review evidence only.");
      expect(html).toContain("overflow-wrap: anywhere");
      expect(html).toContain("minmax(min(260px, 100%), 1fr)");
      expect(html).toContain("Human poker review is required.");
      expect(html).not.toContain('"strategy"');
      const embeddedScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
      expect(embeddedScript).toBeDefined();
      expect(() => new Function(embeddedScript!)).not.toThrow();

      const jsdomErrors: string[] = [];
      const virtualConsole = new VirtualConsole();
      virtualConsole.on("jsdomError", (error) => jsdomErrors.push(error.message));
      const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/reviewer", virtualConsole });
      const document = dom.window.document;
      expect((document.getElementById("wave-filter") as HTMLSelectElement).value).toBe("2");
      const waveFilter = document.getElementById("wave-filter") as HTMLSelectElement;
      const mechanicalFilter = document.getElementById("mechanical-filter") as HTMLSelectElement;
      waveFilter.value = "ALL";
      mechanicalFilter.value = "NEEDS_EVIDENCE";
      mechanicalFilter.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      expect([...document.querySelectorAll<HTMLElement>("[data-owner-row]")].filter((candidate) => !candidate.hidden).map((candidate) => candidate.dataset.family)).toEqual(["MTT9_OTHER_FAMILY"]);
      mechanicalFilter.value = "ALL";
      waveFilter.value = "2";
      waveFilter.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      const reviewer = document.getElementById("owner-reviewer") as HTMLInputElement;
      const row = document.querySelector<HTMLElement>("[data-owner-row]")!;
      expect(document.getElementById("owner-progress")?.textContent).toContain("0/1 complete");
      reviewer.value = "Owner";
      reviewer.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      (row.querySelector("[data-owner-decision]") as HTMLSelectElement).value = "yes";
      (row.querySelector("[data-owner-scope]") as HTMLInputElement).value = "Current reviewed family only";
      row.querySelector("[data-owner-scope]")!.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      expect(document.getElementById("owner-progress")?.textContent).toContain("0/1 complete, 1 needs details");
      expect(row.querySelector("[data-owner-caveats]")?.getAttribute("aria-invalid")).toBe("true");
      (row.querySelector("[data-owner-caveats]") as HTMLInputElement).value = "None";
      row.querySelector("[data-owner-caveats]")!.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      expect(document.getElementById("owner-progress")?.textContent).toContain("1/1 complete");
      expect(row.classList.contains("owner-row--complete")).toBe(true);
      const storageKey = document.querySelector<HTMLElement>("[data-owner-root]")!.dataset.storageKey!;
      const draft = JSON.parse(dom.window.localStorage.getItem(storageKey)!);
      expect(draft.schemaVersion).toBe("pkrtrainer-texas-solver-owner-decisions-v1");
      expect(draft.decisions.find((decision: { familyId: string }) => decision.familyId === "MTT9_50BB_BTN_BB_SRP")).toMatchObject({
        familyId: "MTT9_50BB_BTN_BB_SRP",
        reviewer: "Owner",
        decision: "yes",
        scope: "Current reviewed family only",
        caveats: "None",
      });
      const exported = JSON.parse((dom.window as unknown as { serializeOwnerDecisions(): string }).serializeOwnerDecisions());
      expect(exported.decisions).toHaveLength(1);
      expect(exported.decisions[0].familyId).toBe("MTT9_50BB_BTN_BB_SRP");
      expect(jsdomErrors).toEqual([]);
      dom.window.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a family assigned to more than one review wave", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-review-viewer-waves-"));
    const input = join(directory, "review.report.json");
    const output = join(directory, "viewer.html");
    const waves = join(directory, "OWNER_REVIEW_WAVES.md");
    try {
      writeFileSync(input, JSON.stringify({
        valid: true,
        status: "NEEDS_REVIEW",
        productionReady: false,
        familyId: "MTT9_DUPLICATE",
        counts: {},
        files: [],
        anomalies: [],
        blockers: [],
      }), "utf8");
      writeFileSync(waves, "## Wave 1\n- MTT9_DUPLICATE: NEEDS_REVIEW\n## Wave 2\n- MTT9_DUPLICATE: NEEDS_REVIEW\n", "utf8");

      const result = runViewer(`--input=${input}`, `--output=${output}`, `--waves=${waves}`);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Owner review waves contain duplicate family: MTT9_DUPLICATE");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects mechanical context that could be mistaken for poker approval", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-review-viewer-readiness-"));
    const input = join(directory, "review.report.json");
    const output = join(directory, "viewer.html");
    const readiness = join(directory, "mechanical-readiness.json");
    try {
      writeFileSync(input, JSON.stringify({
        valid: true,
        status: "NEEDS_REVIEW",
        productionReady: false,
        familyId: "MTT9_READINESS_BOUNDARY",
        counts: {},
        files: [],
        anomalies: [],
        blockers: [],
      }), "utf8");
      writeFileSync(readiness, JSON.stringify({ basis: "POKER_APPROVAL", rows: [] }), "utf8");

      const result = runViewer(`--input=${input}`, `--output=${output}`, `--readiness=${readiness}`, "--no-waves");

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("must use REVIEW_ONLY_EVIDENCE_NOT_POKER_APPROVAL basis");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("renders memory-safe evidence without owner decision controls", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-review-viewer-evidence-"));
    const input = join(directory, "review.evidence.json");
    const output = join(directory, "viewer.html");
    try {
      writeFileSync(input, JSON.stringify({
        valid: true,
        status: "REVIEW_ONLY_EVIDENCE",
        productionReady: false,
        reviewOnlyTreeProfile: "MEMORY_SAFE_REVIEW_ONLY",
        familyId: "MTT9_REVIEW_ONLY",
        nodeHistory: [],
        counts: { rawFiles: 1, parsedFiles: 1, blockedFiles: 0, combos: 1, handClasses: 1 },
        files: [{
          boardId: "AKQtt",
          comboCount: 1,
          handClassCount: 1,
          nodeType: "action_node",
          player: 1,
          handClasses: {
            AJs: { comboCount: 1, averageByAction: { CHECK: 0.25, BET_25: 0.75 }, dominantAction: "BET_25", dominantFrequency: 0.75 },
          },
        }],
        anomalies: [],
        blockers: [],
      }, null, 2), "utf8");

      const result = runViewer(`--input=${input}`, `--output=${output}`, "--no-waves");
      expect(result.status).toBe(0);
      const html = readFileSync(output, "utf8");
      expect(html).toContain("Owner Decisions Disabled");
      expect(html).toContain("MEMORY_SAFE_REVIEW_ONLY");
      expect(html).toContain("REVIEW_ONLY_EVIDENCE");
      expect(html).not.toContain('id="owner-reviewer"');
      expect(html).not.toContain('id="mechanical-filter"');

      const jsdomErrors: string[] = [];
      const virtualConsole = new VirtualConsole();
      virtualConsole.on("jsdomError", (error) => jsdomErrors.push(error.message));
      const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/evidence", virtualConsole });
      expect(dom.window.document.querySelectorAll("[data-owner-row]")).toHaveLength(0);
      expect(dom.window.document.querySelectorAll("[data-review-report]")).toHaveLength(1);
      expect(jsdomErrors).toEqual([]);
      dom.window.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function runViewer(...args: string[]) {
  const npmArgs = ["run", "mtt:texas-solver-viewer", "--", ...args];
  return spawnSync(process.platform === "win32" ? "cmd" : "npm", process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
}
