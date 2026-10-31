export type GlossaryTerm = { term: string; definition: string | null; category: string | null };

const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

export function normalizeGlossaryTerms(value: unknown): GlossaryTerm[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): GlossaryTerm[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.term !== "string" || !row.term.trim()) return [];
    return [{
      term: row.term.trim(),
      definition: typeof row.definition === "string" ? row.definition.trim() || null : null,
      category: typeof row.category === "string" ? row.category.trim() || null : null,
    }];
  });
}

export function matchCaptionTerms(caption: string, terms: GlossaryTerm[]): GlossaryTerm[] {
  const candidates: Array<{ term: GlossaryTerm; start: number; end: number }> = [];
  for (const term of terms) {
    const escapedTerm = term.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(escapedTerm, "giu");
    for (const match of caption.matchAll(expression)) {
      const start = match.index;
      const end = start + match[0].length;
      const before = Array.from(caption.slice(0, start)).pop();
      const after = Array.from(caption.slice(end))[0];
      if ((before && WORD_CHARACTER.test(before)) || (after && WORD_CHARACTER.test(after))) continue;
      candidates.push({ term, start, end });
    }
  }

  candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start || a.term.term.localeCompare(b.term.term));
  const selected: Array<{ term: GlossaryTerm; start: number; end: number }> = [];
  const seenTerms = new Set<string>();
  for (const candidate of candidates) {
    const key = candidate.term.term.toLocaleLowerCase();
    if (seenTerms.has(key) || selected.some((item) => candidate.start < item.end && candidate.end > item.start)) continue;
    selected.push(candidate);
    seenTerms.add(key);
  }
  return selected.sort((a, b) => a.start - b.start).map(({ term }) => term);
}
