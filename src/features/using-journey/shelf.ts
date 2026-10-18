/**
 * Using Journey — the trainers' guide to the app (AJ, Oct 18 2026: "1a 2a 3b").
 *
 * One short page per thing a trainer does, in `docs/using-journey/`. Claude
 * writes the pages and AJ approves each one. This file is the pure half: it
 * reads a page's header, counts its words, finds builder words that must never
 * reach a trainer, and fingerprints the words AJ approved. No React, no
 * Firebase, no file system: the test and `scripts/using-journey-check.ts` read
 * the files and hand the text in.
 *
 * The Academy is Max Strength's method in corporate's words; this shelf is how
 * the app works, in Claude's words with AJ's yes. The two are never mixed.
 */

/** A page's status: a draft waits for AJ; an approved page has his yes. */
export type PageStatus = "draft" | "approved";

export interface PageHeader {
  title: string;
  /** The one question the page answers, in a trainer's words. */
  question: string;
  /** The folders and files of the screens the page describes. Never shown to a trainer. */
  covers: string[];
  status: PageStatus;
  /** When AJ approved it ("2026-10-20"), and the fingerprint of the words he approved. */
  approvedOn?: string;
  approvedPrint?: string;
}

export interface Page {
  header: PageHeader;
  /** The words a trainer reads: everything after the header. */
  body: string;
}

/** The reasons a page's header can't be read, one per problem. */
export type HeaderProblem = string;

/** A page's words, within these limits. "Short pages in floor words." */
export const MIN_WORDS = 120;
export const MAX_WORDS = 350;

/**
 * Words a trainer might write that look like code: kept so the code-word check
 * doesn't trip on them. `iPad` is the only camel-case word on the floor.
 */
const ALLOWED_MIXED_CASE = new Set(["iPad", "iPads", "iOS"]);

/** Builder words that mean nothing on the floor. Matched as whole words, any case. */
const BUILDER_WORDS = [
  "Firestore",
  "Firebase",
  "webhook",
  "cron",
  "API",
  "JSON",
  "localStorage",
  "React",
  "Vite",
  "component",
  "render",
  "query",
  "schema",
  "endpoint",
  "repo",
  "commit",
];

const normalize = (text: string) => text.replace(/\r\n/g, "\n");

/**
 * Splits a page into its header and its words. The header is the block
 * between the first two `---` lines, one `key: value` per line.
 */
export function readPage(text: string): { page?: Page; problems: HeaderProblem[] } {
  const src = normalize(text);
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(src);
  if (!match) return { problems: ["no header: a page starts with a --- block"] };
  const fields = new Map<string, string>();
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue;
    const at = line.indexOf(":");
    if (at < 0) return { problems: [`header line "${line}" has no "key: value"`] };
    fields.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  const problems: HeaderProblem[] = [];
  const title = fields.get("title") ?? "";
  const question = fields.get("question") ?? "";
  const covers = (fields.get("covers") ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const status = fields.get("status") ?? "";
  if (!title) problems.push("no title");
  if (!question) problems.push("no question");
  if (!question.endsWith("?")) problems.push("the question doesn't end with a question mark");
  if (covers.length === 0) problems.push("covers names no screen");
  if (status !== "draft" && status !== "approved") problems.push(`status is "${status}", not draft or approved`);

  let approvedOn: string | undefined;
  let approvedPrint: string | undefined;
  const approved = fields.get("approved") ?? "";
  if (approved) {
    const a = /^(\d{4}-\d{2}-\d{2}) (?:·|-) ([0-9a-f]{8})$/.exec(approved);
    if (!a) problems.push(`approved is "${approved}", not "yyyy-mm-dd · fingerprint"`);
    else [, approvedOn, approvedPrint] = a;
  }
  if (status === "approved" && !approvedPrint) problems.push("approved, but with no date and fingerprint");

  if (problems.length) return { problems };
  return {
    page: {
      header: { title, question, covers, status: status as PageStatus, approvedOn, approvedPrint },
      body: match[2],
    },
    problems,
  };
}

/** The words of a page's body, ignoring Markdown marks. */
export function wordCount(body: string): number {
  return normalize(body)
    .replace(/[#*_>|-]+/g, " ")
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

/**
 * Anything in a page's words that reads like the code rather than the floor:
 * code marks, file names, camel-case or snake-case names, and builder words.
 * Each is returned once, as found.
 */
export function codeWords(body: string): string[] {
  const text = normalize(body);
  const found = new Set<string>();
  if (text.includes("`")) found.add("`");
  for (const m of text.matchAll(/\b[\w-]+\/[\w./-]+/g)) {
    // "Today / Coming up" has spaces; a path has none. "Left / right" is fine.
    if (/\.(tsx?|md|json|css)\b|^src\b|^docs\b|^scripts\b/.test(m[0])) found.add(m[0]);
  }
  for (const m of text.matchAll(/\b[\w-]+\.(tsx?|md|json|css|js)\b/g)) found.add(m[0]);
  for (const m of text.matchAll(/\b[a-z]+[A-Z][A-Za-z]*\b/g)) {
    if (!ALLOWED_MIXED_CASE.has(m[0])) found.add(m[0]);
  }
  for (const m of text.matchAll(/\b[A-Za-z]+_[A-Za-z_]+\b/g)) found.add(m[0]);
  for (const word of BUILDER_WORDS) {
    const re = new RegExp(`\\b${word}\\b`, "i");
    const m = re.exec(text);
    if (m) found.add(m[0]);
  }
  return [...found];
}

/**
 * The fingerprint of a page's words: FNV-1a over the body with line ends and
 * trailing space evened out, as eight hex digits. It is not a secret, only a
 * way to tell that the words changed after AJ approved them.
 */
export function fingerprint(body: string): string {
  const text = normalize(body)
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Whether trainers may read this page: approved, and its words unchanged since. */
export function isApprovedAsWritten(page: Page): boolean {
  return page.header.status === "approved" && page.header.approvedPrint === fingerprint(page.body);
}
