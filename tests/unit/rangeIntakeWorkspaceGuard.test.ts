import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("range:intake:guard CLI", () => {
  it("hlida raw intake workspace pred commitnutim privatnich vstupu", () => {
    const result = runGuard();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Range intake workspace guard");
    expect(result.stdout).toContain("valid: true");
    expect(result.stdout).toContain("raw folder: Agents/range-intake/raw");
    expect(result.stdout).toContain("tracked raw files: 2");
    expect(result.stdout).toContain("tracked: Agents/range-intake/raw/.gitignore");
    expect(result.stdout).toContain("tracked: Agents/range-intake/raw/README.md");
    expect(result.stdout).not.toContain("error:");
    expect(result.stdout).not.toContain("normalized.json");
    expect(result.stdout).not.toContain("permission.json");
  });
});

function runGuard() {
  return spawnSync(command(), commandArgs(), {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: false,
  });
}

function command(): string {
  return process.platform === "win32" ? "cmd" : "npm";
}

function commandArgs(): string[] {
  const npmArgs = ["run", "range:intake:guard"];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
