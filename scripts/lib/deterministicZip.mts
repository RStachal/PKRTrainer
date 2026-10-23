import { createHash } from "node:crypto";
import { unzipSync, zipSync, type Zippable } from "fflate";

const FIXED_ZIP_MTIME = new Date(2000, 0, 1, 0, 0, 0);

export interface DeterministicZipSource {
  path: string;
  bytes: Uint8Array;
}

export interface DeterministicZipEntryReport {
  path: string;
  bytes: number;
  sha256: string;
}

export interface DeterministicZipReport {
  valid: boolean;
  archiveBytes: number;
  archiveSha256: string;
  entries: readonly DeterministicZipEntryReport[];
  errors: readonly string[];
}

export function buildDeterministicZip(
  sources: readonly DeterministicZipSource[],
): Uint8Array {
  const normalized = normalizeSources(sources);
  const files: Zippable = {};
  for (const source of normalized) {
    files[source.path] = [source.bytes, {
      attrs: 0o644 << 16,
      level: 9,
      mtime: FIXED_ZIP_MTIME,
      os: 3,
    }];
  }
  return zipSync(files, {
    attrs: 0o644 << 16,
    level: 9,
    mtime: FIXED_ZIP_MTIME,
    os: 3,
  });
}

export function reconcileDeterministicZip(
  archive: Uint8Array,
  sources: readonly DeterministicZipSource[],
): DeterministicZipReport {
  const normalized = normalizeSources(sources);
  const expected = new Map(normalized.map((source) => [source.path, source]));
  const extracted = unzipSync(archive);
  const actualPaths = Object.keys(extracted).sort((left, right) => left.localeCompare(right));
  const expectedPaths = [...expected.keys()];
  const errors: string[] = [];

  for (const path of expectedPaths) {
    const actual = extracted[path];
    const source = expected.get(path)!;
    if (actual === undefined) {
      errors.push(`Archive is missing ${path}.`);
      continue;
    }
    if (actual.byteLength !== source.bytes.byteLength) {
      errors.push(`Archive size differs for ${path}.`);
      continue;
    }
    if (sha256(actual) !== sha256(source.bytes)) {
      errors.push(`Archive SHA-256 differs for ${path}.`);
    }
  }
  for (const path of actualPaths) {
    if (!expected.has(path)) errors.push(`Archive contains unexpected entry ${path}.`);
  }

  return {
    valid: errors.length === 0 && stableStringify(actualPaths) === stableStringify(expectedPaths),
    archiveBytes: archive.byteLength,
    archiveSha256: sha256(archive),
    entries: normalized.map((source) => ({
      path: source.path,
      bytes: source.bytes.byteLength,
      sha256: sha256(source.bytes),
    })),
    errors,
  };
}

function normalizeSources(
  sources: readonly DeterministicZipSource[],
): DeterministicZipSource[] {
  if (sources.length === 0) throw new Error("A release archive must contain at least one file.");
  const normalized = sources.map((source) => ({
    path: canonicalArchivePath(source.path),
    bytes: source.bytes,
  })).sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(normalized.map((source) => source.path)).size !== normalized.length) {
    throw new Error("Release archive contains duplicate canonical paths.");
  }
  return normalized;
}

function canonicalArchivePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.endsWith("/") ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe release archive path: ${path}`);
  }
  return normalized;
}

function sha256(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}
