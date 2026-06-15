const PLACEHOLDER_TEXT_PATTERN = /\b(?:TODO|TBD|FIXME|FILL_ME|REPLACE_ME|CHANGEME|PLACEHOLDER)\b/i;

export function findPlaceholderStringPaths(value: unknown): string[] {
  const out: string[] = [];
  visitPlaceholderStrings(value, "$", out);
  return out;
}

function visitPlaceholderStrings(value: unknown, path: string, out: string[]): void {
  if (typeof value === "string") {
    if (PLACEHOLDER_TEXT_PATTERN.test(value)) out.push(path);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitPlaceholderStrings(item, `${path}[${index}]`, out));
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    visitPlaceholderStrings(child, `${path}.${key}`, out);
  }
}
