import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../types";
import { historyOf, historyShown, stretchWords } from "./history";

const s = (date: string, routineId: string | null, status = "Completed"): WorkoutSession =>
  ({ id: `${date}-${routineId}`, date, routineId, status, clientId: "c1" }) as unknown as WorkoutSession;
const routines = [
  { id: "a", name: "Strength" },
  { id: "b", name: "Upper" },
  { id: "p", name: "Post-surgery" },
];

describe("the history strip", () => {
  it("one stretch per routine run in a row, A and B alternating read as a pair, oldest first", () => {
    const list = [
      s("2026-01-05", "a"),
      s("2026-01-08", "b"),
      s("2026-01-12", "a"),
      s("2026-01-15", "b"),
      s("2026-06-02", "p"),
      s("2026-06-09", "p"),
      s("2026-06-16", "p"),
    ];
    const h = historyOf(list, routines);
    expect(h.map((x) => [x.name, x.sessions, x.current])).toEqual([
      ["Strength + Upper", 4, false],
      ["Post-surgery", 3, true],
    ]);
    expect(historyShown(h)).toBe(true);
    expect(stretchWords(h[0])).toBe("Strength + Upper · Jan 2026 · 4 sessions");
    expect(stretchWords(h[1])).toBe("Post-surgery · Jun– · 3 sessions");
  });

  it("skips a session with no routine recorded, and one not finished: never 'no routine'", () => {
    const h = historyOf([s("2026-01-05", null), s("2026-01-06", "a", "In Progress"), s("2026-01-07", "a")], routines);
    expect(h).toHaveLength(1);
    expect(h[0].sessions).toBe(1);
  });

  it("is not drawn below two routines or the named minimum of sessions", () => {
    expect(historyShown(historyOf([s("2026-01-05", "a"), s("2026-02-05", "p")], routines))).toBe(false);
    expect(historyShown(historyOf([1, 2, 3, 4, 5, 6, 7].map((d) => s(`2026-01-0${d}`, "a")), routines))).toBe(false);
  });

  it("names a routine Journey no longer holds as such, never by its id", () => {
    expect(historyOf([s("2026-01-05", "gone")], routines)[0].name).toBe("A routine no longer on file");
  });
});
