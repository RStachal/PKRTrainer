import { describe, expect, it } from "vitest";
import {
  buildDeterministicZip,
  reconcileDeterministicZip,
} from "../../scripts/lib/deterministicZip.mts";

describe("deterministic FTP ZIP", () => {
  it("creates byte-identical archives independent of source order", () => {
    const sources = [
      { path: "index.html", bytes: bytes("index") },
      { path: "assets/main-a.js", bytes: bytes("main") },
      { path: ".htaccess.example", bytes: bytes("auth") },
    ];

    const first = buildDeterministicZip(sources);
    const second = buildDeterministicZip([...sources].reverse());
    const report = reconcileDeterministicZip(first, sources);

    expect(first).toEqual(second);
    expect(report).toMatchObject({
      valid: true,
      archiveBytes: first.byteLength,
      entries: [
        { path: ".htaccess.example", bytes: 4 },
        { path: "assets/main-a.js", bytes: 4 },
        { path: "index.html", bytes: 5 },
      ],
      errors: [],
    });
  });

  it("detects a source mismatch during post-archive reconciliation", () => {
    const archive = buildDeterministicZip([{ path: "index.html", bytes: bytes("first") }]);
    const report = reconcileDeterministicZip(archive, [
      { path: "index.html", bytes: bytes("other") },
    ]);

    expect(report.valid).toBe(false);
    expect(report.errors).toContain("Archive SHA-256 differs for index.html.");
  });

  it("rejects duplicate, absolute and traversal paths", () => {
    expect(() => buildDeterministicZip([
      { path: "index.html", bytes: bytes("a") },
      { path: "index.html", bytes: bytes("b") },
    ])).toThrow("duplicate canonical paths");
    expect(() => buildDeterministicZip([
      { path: "../private.json", bytes: bytes("x") },
    ])).toThrow("Unsafe release archive path");
    expect(() => buildDeterministicZip([
      { path: "C:\\private.json", bytes: bytes("x") },
    ])).toThrow("Unsafe release archive path");
  });
});

function bytes(value: string): Uint8Array {
  return Buffer.from(value, "utf8");
}
