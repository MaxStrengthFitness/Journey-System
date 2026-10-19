/**
 * A JOURNEY LINK CARRIES NO CLIENT DETAIL (the Teams link round, Oct 19 2026).
 *
 * This folder reads an id and opens a place. It must never reach the parts
 * of the app that hold what is said about a client: the notes, FORD, Pulse,
 * renewals, InBody, the Deep Dive, the leaders' client states. A link that
 * could carry any of that would be a link that leaks it.
 */
import { describe, expect, it } from "vitest";
import { appFilesUnder, chainWords, reachable } from "./__tests__/import-graph";

const NEVER: Record<string, string> = {
  "features/client-notes/": "what is written about a client",
  "features/ford/": "a client's family, occupation, recreation and dreams",
  "features/subjective-report/": "Pulse, the living assessment",
  "features/renewals/": "a client's package and renewal",
  "features/inbody/": "a client's body composition",
  "features/clinical-review/": "the Kaizen Deep Dive",
  "features/admin/journey/": "the leaders' client states",
};

describe("features/deep-link imports no client detail", () => {
  const roots = appFilesUnder("features/deep-link");
  it("has files to guard", () => {
    expect(roots.length).toBeGreaterThan(5);
  });
  for (const [folder, what] of Object.entries(NEVER)) {
    it(`never reaches ${folder} (${what})`, () => {
      const graph = reachable(roots);
      const hits = [...graph.entries()].filter(([file]) => file.startsWith(folder));
      expect(
        hits.map(([, chain]) => chainWords(chain)),
        `features/deep-link reaches ${folder}: cut the import`,
      ).toEqual([]);
    });
  }
});
