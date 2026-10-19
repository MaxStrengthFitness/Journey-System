import { describe, expect, it } from "vitest";
import cuesFile from "../academy/content/cues.json";
import type { CueMoment } from "../academy/types";
import { cueMomentLabel } from "./cue-label";
import { cueLabel } from "./graph";
import { CUE_TITLES } from "./rep-phases";

const cues = (cuesFile as unknown as { cues: CueMoment[] }).cues;

describe("one name for each cue moment", () => {
  it("gives every moment in the real phrasebook a short, distinct name in sentence case", () => {
    const labels = cues.map((c) => cueMomentLabel(c.moment));
    expect(new Set(labels).size).toBe(cues.length);
    for (const l of labels) {
      expect(l.length).toBeLessThanOrEqual(52);
      expect(l).toMatch(/^[A-Z][^A-Z]*$/);
    }
  });

  it("is the map's node label too", () => {
    for (const c of cues) expect(cueLabel(c.moment)).toBe(cueMomentLabel(c.moment));
  });

  it("says each turnaround the way the machine page's cue sections do", () => {
    const by = (test: RegExp) => cueMomentLabel(cues.find((c) => test.test(c.moment))!.moment);
    expect(by(/^Lower Turnaround.*stack touches/)).toBe(CUE_TITLES.lowerTouch);
    expect(by(/^Lower Turnaround.*does not touch/)).toBe(CUE_TITLES.lowerNoTouch);
    expect(by(/^Upper Turnaround.*with an end stop/)).toBe(CUE_TITLES.upperEndStop);
    expect(by(/^Upper Turnaround.*include a squeeze/)).toBe(CUE_TITLES.upperSqueeze);
    expect(by(/^Final descent/)).toBe(CUE_TITLES.finalDescent);
    expect(by(/^Carefully unload/)).toBe(CUE_TITLES.unload);
    expect(by(/apparent task failure/)).toBe(CUE_TITLES.failure);
  });

  it("keeps a code in capitals and calms the rest", () => {
    expect(cueMomentLabel("Speed of Motion")).toBe("Speed of motion");
    expect(cueMomentLabel("Using the LP (ex. one)")).toBe("Using the LP");
    expect(cueMomentLabel("  ")).toBe("");
  });
});
