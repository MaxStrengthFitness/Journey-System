/**
 * THE RULES' CODE, WITHOUT ITS COMMENTS.
 *
 * `firestore.rules` sits near Firebase's 256 KiB source limit, so its long
 * comments live in `docs/ops/RULES-NOTES.md` (the studio map round, phase 0,
 * Oct 10 2026). Moving a comment must never move a rule, and this is how
 * that is proved: strip the comments from both files and compare.
 *
 * The rules lint has its own stripper, `stripped()`, which also turns every
 * string literal into `''` so it can count braces. That is right for
 * counting and wrong for a proof: a slip inside a role name or a
 * `matches(...)` pattern would pass as identical. This one removes comments
 * ONLY and keeps every string exactly as written.
 */

/** `src` with every `//` and block comment outside a string removed; strings and line breaks kept. */
export function stripRulesComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      // Keep the comment's line breaks, so lines still line up.
      out += src.slice(i, stop).replace(/[^\n]/g, "");
      i = stop;
      continue;
    }
    const ch = src[i];
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== ch && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** The rules' code: comments stripped, then every whitespace-only line dropped. */
export function rulesCodeOf(src: string): string {
  return stripRulesComments(src)
    .split("\n")
    .filter((line) => line.trim() !== "")
    .join("\n");
}

/** Null when the two files hold the same code; otherwise the first line where they differ. */
export function firstCodeDifference(
  before: string,
  after: string,
): { line: number; before: string | null; after: string | null } | null {
  const a = rulesCodeOf(before).split("\n");
  const b = rulesCodeOf(after).split("\n");
  for (let k = 0; k < Math.max(a.length, b.length); k += 1) {
    if (a[k] !== b[k]) return { line: k + 1, before: a[k] ?? null, after: b[k] ?? null };
  }
  return null;
}
