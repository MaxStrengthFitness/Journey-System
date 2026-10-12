/**
 * The session screen reads a WINDOW of a client's sessions, never all of them
 * (the history-ready round, Oct 12 2026). A client with years of FileMaker
 * history behind them had every session read at every Start; the window is
 * the journal's own query (the newest 40), older ones come a page at a time
 * when the machine card asks. This holds the line: every query the tracker
 * makes of `sessions` by client carries a limit.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SOURCE = fs.readFileSync(path.resolve(__dirname, "WorkoutTrackerView.tsx"), "utf-8");

/** Every `query(...)` call in the source, with its balanced parentheses. */
function queries(src: string): string[] {
  const out: string[] = [];
  let at = src.indexOf("query(");
  while (at >= 0) {
    let depth = 0;
    let end = at + "query".length;
    for (; end < src.length; end += 1) {
      if (src[end] === "(") depth += 1;
      else if (src[end] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(at, end + 1));
    at = src.indexOf("query(", end);
  }
  return out;
}

describe("the session screen's reads of a client's sessions", () => {
  const bySession = queries(SOURCE).filter((q) => /collection\(db,\s*"sessions"\)/.test(q) && /where\("clientId"/.test(q));

  it("finds the queries it guards", () => {
    // The window, the open check, and Load older's page: if this falls, the guard has lost its way.
    expect(bySession.length).toBeGreaterThanOrEqual(3);
  });

  it("never reads all of a client's sessions: every query has a limit", () => {
    for (const q of bySession) expect([q.replace(/\s+/g, " "), /limit\(/.test(q)]).toEqual([q.replace(/\s+/g, " "), true]);
  });

  it("reads the window as the journal's own query, so one listener serves both", () => {
    expect(SOURCE).toMatch(/const SESSION_WINDOW = SESSION_SUMMARY_LIMIT;/);
    expect(SOURCE).toMatch(/orderBy\("date", "desc"\),\s*limit\(SESSION_WINDOW\)/);
  });
});
