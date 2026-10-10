/**
 * CLAUDE.MD STAYS SHORT (the CLAUDE.md trim, Oct 9 2026; AJ: "1a 2a 3a").
 *
 * Every session and every helper reads CLAUDE.md in full before doing
 * anything. By Oct 9 2026 it had grown to 114,812 characters, because each
 * round added its files, dates and tests to its map row and its decision.
 * The trim cut each map row to one line (the detail went into the feature's
 * README) and each long decision to its rule in AJ's words, with the full
 * text in docs/DECISIONS.md. This test keeps it that way: when it fails, move
 * the detail out (to the README, docs/DECISIONS.md or docs/KNOWN-TRAPS.md)
 * rather than raising a limit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const claude = read("CLAUDE.md");
const decisionsDoc = read("docs/DECISIONS.md");

/** The whole file. It was 41,827 characters after the trim. */
const MAX_FILE = 45_000;
/** One map row, both cells. */
const MAX_MAP_ROW = 320;
/** One decision, with its link. */
const MAX_DECISION = 650;

function section(heading: string): string {
  const start = claude.indexOf(`\n## ${heading}`);
  if (start < 0) throw new Error(`CLAUDE.md has no "## ${heading}" section`);
  const next = claude.indexOf("\n## ", start + 4);
  return claude.slice(start, next < 0 ? undefined : next);
}

/** GitHub's anchor for a heading: lower case, punctuation dropped, spaces to hyphens. */
const slugOf = (heading: string) =>
  heading.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().replace(/ /g, "-");

describe("CLAUDE.md stays short", () => {
  it(`is at most ${MAX_FILE.toLocaleString("en-US")} characters`, () => {
    expect(
      claude.length,
      "CLAUDE.md is read in full by every session: move detail into a README, docs/DECISIONS.md or docs/KNOWN-TRAPS.md",
    ).toBeLessThanOrEqual(MAX_FILE);
  });

  it(`keeps every map row to one line of at most ${MAX_MAP_ROW} characters`, () => {
    const rows = section("Where things are")
      .split("\n")
      .filter((l) => l.startsWith("| ") && !l.startsWith("| What |") && !l.startsWith("| ---"));
    expect(rows.length).toBeGreaterThan(40);
    const long = rows.filter((r) => r.length > MAX_MAP_ROW).map((r) => `${r.length}: ${r.slice(0, 80)}`);
    expect(long, "a map row points at a folder; its files and history belong in that folder's README").toEqual([]);
  });

  it(`keeps every decision to at most ${MAX_DECISION} characters`, () => {
    const decisions = section("Decisions already made").split("\n").filter((l) => l.startsWith("- "));
    expect(decisions.length).toBeGreaterThan(50);
    const long = decisions.filter((d) => d.length > MAX_DECISION).map((d) => `${d.length}: ${d.slice(0, 80)}`);
    expect(long, "a decision here is the rule in AJ's words; its history, files and tests go in docs/DECISIONS.md").toEqual([]);
  });
});

describe("CLAUDE.md and docs/DECISIONS.md stay together", () => {
  const headings = [...decisionsDoc.matchAll(/^### (.+)$/gm)].map((m) => slugOf(m[1]));
  const links = [...claude.matchAll(/docs\/DECISIONS\.md#([a-z0-9-]+)/g)].map((m) => m[1]);

  it("has no two entries with the same heading", () => {
    expect(headings.filter((h, i) => headings.indexOf(h) !== i)).toEqual([]);
  });

  it("links every shortened decision to an entry that exists", () => {
    expect(links.length).toBeGreaterThan(30);
    expect(links.filter((l) => !headings.includes(l))).toEqual([]);
  });

  it("has no entry that CLAUDE.md no longer links to", () => {
    expect(
      headings.filter((h) => !links.includes(h)),
      "an entry here whose short form left CLAUDE.md: remove both together, or link it again",
    ).toEqual([]);
  });
});
