// Blanks left in a draft for the user to fill, written as [like this].

/** "[Your UEI]"-style blanks left to fill, in order, without repeats. Links ([text](url)) and checkboxes don't count. */
export function findPlaceholders(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\[([^[\]\n]{2,120})\](?!\()/g)) {
    const inner = m[1]!.replace(/\\+$/, "").trim();
    if (/^[xX ]$/.test(inner) || /^\d+$/.test(inner)) continue;
    out.add(`[${inner}]`);
  }
  return [...out];
}
