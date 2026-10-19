import { describe, expect, it } from "vitest";
import type { MarkedBlock } from "../types";
import { hiddenWords, runLabels } from "./lines";

const line = (label: string | undefined, opts: Partial<MarkedBlock> = {}): MarkedBlock => ({
  key: `k-${Math.random()}`,
  kind: "line",
  text: "Words",
  label,
  notes: [],
  hidden: false,
  ...opts,
});

describe("runLabels", () => {
  it("says a label once over the run that shares it, again when it changes", () => {
    const blocks = [line("Clinical warning"), line("Clinical warning"), line("Who it is not for"), line("Clinical warning")];
    expect(runLabels(blocks)).toEqual([true, false, true, true]);
  });

  it("never draws a label that only repeats the section's title, nor one on a hidden line", () => {
    expect(runLabels([line("Set up"), line("Set up")], "Set up")).toEqual([false, false]);
    expect(runLabels([line("Stop", { hidden: true }), line("Stop")])).toEqual([false, true]);
  });

  it("draws no label for a heading or a line without one", () => {
    expect(runLabels([line(undefined), line("Pace", { kind: "heading" })])).toEqual([false, false]);
  });
});

describe("hiddenWords", () => {
  it("says how many crossed-out lines are hidden, one and many", () => {
    expect(hiddenWords(1)).toBe("1 crossed-out line hidden");
    expect(hiddenWords(3)).toBe("3 crossed-out lines hidden");
  });
});
