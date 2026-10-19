import { describe, expect, it } from "vitest";
import { vaultSection } from "../blocks";
import type { VaultBlock, VaultPage } from "../types";
import {
  cueDrillsIn,
  dayIndex,
  drillsForTheDay,
  examplesLine,
  hashOf,
  orderDrillOf,
  scrubberOpeningMoment,
  type CueDrill,
} from "./drills";
import cuesFile from "../../academy/content/cues.json";
import type { CueMoment } from "../../academy/types";

const b = (kind: VaultBlock["kind"], text: string): VaultBlock => ({ key: `k-${text}`, kind, text });

describe("dayIndex", () => {
  it("is the same all day, inside the range, and nothing is stored", () => {
    expect(dayIndex("2026-10-19", 11)).toBe(dayIndex("2026-10-19", 11));
    for (const day of ["2026-10-19", "2026-10-20", "2026-12-31"]) {
      const i = dayIndex(day, 11);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(11);
    }
  });

  it("moves from one day to the next over a week", () => {
    const week = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
    expect(new Set(week.map((d) => dayIndex(d, 11))).size).toBeGreaterThan(2);
  });

  it("answers 0 when there is nothing to pick from", () => {
    expect(dayIndex("2026-10-19", 0)).toBe(0);
    expect(dayIndex("2026-10-19", Number.NaN)).toBe(0);
  });

  it("hashOf is a plain 32-bit number", () => {
    expect(hashOf("touch and go")).toBe(hashOf("touch and go"));
    expect(Number.isInteger(hashOf("x"))).toBe(true);
  });
});

describe("cueDrillsIn", () => {
  const sections = [
    vaultSection("moment-0", "Before you start", [b("para", "SEE INDIVIDUAL EXERCISE SCRIPTS")]),
    vaultSection(
      "moment-6",
      "Lower turnaround, where the stack touches",
      [b("para", "Most effective during the eccentric."), b("cue", "Barely touch, barely start"), b("cue", "Crawl out of the bottom")],
      "Lower Turnaround (movements where weight stack touches - ex. leg press, chest press, overhead)",
    ),
    vaultSection("leaf-rep", "The rep", [b("line", "Upper turnaround: click at the end stop.")]),
  ];

  it("keeps the moments with lines to say, their examples and their phrasebook index", () => {
    const drills = cueDrillsIn(sections);
    expect(drills).toHaveLength(1);
    expect(drills[0]).toMatchObject({ section: 1, title: "Lower turnaround, where the stack touches", cues: [1, 2], notes: [0], moment: 6 });
    expect(examplesLine(drills[0].examples)).toBe("Leg press, chest press, overhead");
  });

  it("can ask for more lines before a moment counts", () => {
    expect(cueDrillsIn(sections, { min: 3 })).toEqual([]);
  });
});

describe("orderDrillOf", () => {
  const page = {
    sections: [
      vaultSection("money", "When money is the problem", [
        b("para", "Only when money is truly the problem, and in this order:"),
        b("bullet", "The guarantee."),
        b("bullet", "The lowest rate on the shortest commitment."),
      ]),
    ],
  } as unknown as VaultPage;

  it("reads a lead-in line and its list, in the page's order", () => {
    expect(orderDrillOf(page, "money")).toEqual({ section: 0, lead: 0, steps: [1, 2] });
  });

  it("is null for a section the page does not have, or no page", () => {
    expect(orderDrillOf(page, "guarantee")).toBeNull();
    expect(orderDrillOf(null, "money")).toBeNull();
  });
});

describe("the drill of the day and the scrubber beside it", () => {
  const cues = (cuesFile as unknown as { cues: CueMoment[] }).cues;

  it("knows the moment the Overview's scrubber opens on: the gradual load-up", () => {
    const at = scrubberOpeningMoment(cues, "endStop");
    expect(at).not.toBeNull();
    expect(cues[at!].moment).toMatch(/^to begin the exercise/i);
    expect(scrubberOpeningMoment(null, "endStop")).toBeNull();
    expect(scrubberOpeningMoment([], "squeeze")).toBeNull();
  });

  it("leaves that moment out of the day's drills, never all of them", () => {
    const d = (moment: number | null): CueDrill => ({ section: moment ?? 99, title: `m${moment}`, examples: [], cues: [0, 1, 2], notes: [], moment });
    const drills = [d(1), d(2), d(3), d(null)];
    expect(drillsForTheDay(drills, 2).map((x) => x.moment)).toEqual([1, 3, null]);
    expect(drillsForTheDay(drills, null)).toBe(drills);
    expect(drillsForTheDay([d(2)], 2).map((x) => x.moment)).toEqual([2]);
  });
});
