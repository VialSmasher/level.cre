export function normalizeSubmarketName(name: string): string {
  return (name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

// Returns unique submarket names (case-insensitive),
// preserving the first-seen original casing and order.
export function uniqueSubmarketNames(list: string[] | undefined | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  if (!Array.isArray(list)) return out;
  for (const raw of list) {
    const original = (raw || "").trim();
    if (!original) continue;
    const key = normalizeSubmarketName(original);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(original);
  }
  return out;
}

