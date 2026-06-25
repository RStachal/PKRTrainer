import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CI workflows", () => {
  it("PR CI pouziva lockfile, plny technicky gate a oddeleny MTT data report", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

    expect(workflow).toContain("node-version: 22");
    expect(workflow).toContain("run: npm ci");
    expect(workflow).toContain("run: npm run typecheck");
    expect(workflow).toContain("npm test -- --reporter=default --reporter=junit");
    expect(workflow).toContain("npm run mtt:refresh-registry -- --check");
    expect(workflow).toContain("npm run mtt:registry-integrity");
    expect(workflow).toContain("npm run range:intake:guard");
    expect(workflow).toContain("npm run verify:ranges");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm run bundle:budget");
    expect(workflow).toContain("npm run verify:precache");
    expect(workflow).toContain("npm run e2e:chrome");
    expect(workflow).toContain("npm run e2e:chrome:production-fixture");
    expect(workflow).toContain("path: artifacts/e2e-*");
    expect(workflow).toContain("mtt-data-status:");
    expect(workflow).toContain("continue-on-error: true");
    expect(workflow).toContain("npm run mtt:handoff");
    expect(workflow).toContain("artifacts/mtt-*-report.json");
    expect(workflow).toContain("artifacts/range-intake*-report.json");
    expect(workflow).toContain("artifacts/e2e-android-preflight/report.json");
    expect(workflow).toContain("path: dist");
  });

  it("release tag vyzaduje striktni release check pred uploadem dist", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");
    const gate = workflow.indexOf("run: npm run release:check");
    const upload = workflow.indexOf("name: Upload verified release build");

    expect(workflow).toContain('      - "v*"');
    expect(workflow).toContain("node-version: 22");
    expect(workflow).toContain("run: npm ci");
    expect(gate).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(gate);
    expect(workflow).not.toContain("continue-on-error");
  });
});
