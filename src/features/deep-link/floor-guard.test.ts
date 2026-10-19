/**
 * TEAMS IS NEVER ONE TAP FROM A SET (the Teams link round, Oct 19 2026).
 *
 * Nothing in features/deep-link can be reached from the floor: the Active
 * Session, the briefing, the Wrap-up, the watching view, the grid, the open
 * session. And the header row and the avatar menu that AppContent hands the
 * session screens carry no Share, Copy link or Teams control. A link that
 * arrives during a session waits for Finish (decide.ts); this holds the
 * other half, so no later round puts a door back on the floor by accident.
 *
 * Lazy imports count: a screen that lazy-loads a door still has that door.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, appFilesUnder, chainWords, reachable } from "./__tests__/import-graph";

const FLOOR: string[] = [
  "components/WorkoutTrackerView.tsx",
  "features/briefing/BriefingScreen.tsx",
  "components/WrapUpScreen.tsx",
  "features/session-record/WatchingSession.tsx",
  "features/session-record/NothingOnScreen.tsx",
  ...appFilesUnder("features/journey-grid"),
  ...appFilesUnder("features/open-session"),
];

describe("the floor never reaches a Journey link's doors", () => {
  it("names the floor", () => {
    expect(FLOOR.length).toBeGreaterThan(10);
  });

  for (const root of ["components/WorkoutTrackerView.tsx", "features/briefing/BriefingScreen.tsx", "components/WrapUpScreen.tsx", "features/session-record/WatchingSession.tsx"]) {
    it(`${root} reaches nothing in features/deep-link`, () => {
      const graph = reachable([root]);
      const hits = [...graph.entries()].filter(([file]) => file.startsWith("features/deep-link/"));
      expect(hits.map(([, chain]) => chainWords(chain)), "cut the import, or fill the slot from a host off the floor").toEqual([]);
    });
  }

  it("the grid and the open session reach nothing in features/deep-link", () => {
    const graph = reachable([...appFilesUnder("features/journey-grid"), ...appFilesUnder("features/open-session")]);
    const hits = [...graph.entries()].filter(([file]) => file.startsWith("features/deep-link/"));
    expect(hits.map(([, chain]) => chainWords(chain))).toEqual([]);
  });
});

/** The text of `const NAME = ` up to the next `const ` at two spaces of indent: the whole element it draws. */
function blockOf(source: string, name: string): string {
  const start = source.indexOf(`\n  const ${name} = `);
  expect(start, `AppContent.tsx defines ${name}`).toBeGreaterThan(-1);
  // The element ends where the next statement at the function's own indent begins.
  const end = Math.min(
    ...["\n  const ", "\n  if (", "\n  return ", "\n  /*", "\n  //", "\n  useEffect("]
      .map((s) => source.indexOf(s, start + 1))
      .filter((i) => i > start),
  );
  expect(end).toBeGreaterThan(start);
  const block = source.slice(start, end);
  expect(block.length, `${name} is a few hundred lines at most`).toBeLessThan(20_000);
  return block;
}

describe("the session screens' header row and avatar menu carry no Teams control", () => {
  const appContent = readFileSync(join(SRC, "AppContent.tsx"), "utf8");
  for (const name of ["headerRightControls", "headerTrainerDropdown"]) {
    it(`${name} has no Share, Copy link, Teams or deep-link control`, () => {
      const block = blockOf(appContent, name);
      expect(block).not.toMatch(/deep-link|Copy link|CopyShareLink|copyPlainLink|\bShare\b|Teams/);
    });
  }
  it("the session screens still take that header row and menu", () => {
    expect(appContent).toMatch(/rightControls=\{headerRightControls\}/);
    expect(appContent).toMatch(/trainerDropdown=\{headerTrainerDropdown\}/);
  });
});
