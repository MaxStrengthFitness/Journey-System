// @vitest-environment jsdom
/**
 * A set done at its weight with its reps never written down, on the Journey
 * grid (the history-ready round, Oct 12 2026; AJ: "1a", the weight with a
 * dash where the reps go). No "0 reps", no reps arrow, no rating word, and
 * the stylesheet's " reps" word is not added after the dash.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JourneyCell } from "./JourneyCell";
import type { JourneySession, JourneySet } from "./types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SESSION: JourneySession = { id: "s2", sessionNumber: 2, date: "2026-03-08", trainerInitials: "" };
const BEFORE: JourneySet = { sessionId: "s1", outcome: "performed", weight: 70, reps: 9, quality: 2 };
const NOT_RECORDED: JourneySet = { sessionId: "s2", outcome: "performed", weight: 70, repsNotRecorded: true, quality: 2 };

let roots: Root[] = [];
afterEach(() => {
  for (const r of roots) act(() => r.unmount());
  roots = [];
  document.body.innerHTML = "";
});

function draw(set: JourneySet, previous?: JourneySet): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => root.render(<JourneyCell session={SESSION} machineName="Leg Press" set={set} previous={previous} isLatest={false} isSpot={false} isStatHit={false} />));
  return el;
}

describe("a set whose reps were never written down", () => {
  it("shows the weight, a dash where the reps go, and says so to a screen reader", () => {
    const el = draw(NOT_RECORDED, BEFORE);
    const cell = el.querySelector('[role="gridcell"]')!;
    expect(cell.querySelector(".jg-cell__w")?.textContent).toBe("70");
    expect(cell.querySelector(".jg-nr")?.textContent).toBe("–");
    expect(cell.getAttribute("aria-label")).toBe("Leg Press, Mar 8, 2026: 70 lb, reps not recorded");
    // No reps arrow off a count that was never written.
    expect(cell.querySelector(".jg-trend")).toBeNull();
  });

  it("keeps the stylesheet's ' reps' word off the dash", () => {
    const css = readFileSync(resolve(__dirname, "journey-grid.css"), "utf-8");
    const rules = css.match(/\.jg-look \.jg-cell__r:not\(:has\(\.jg-tut\)\)[^{,]*::after/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule).toContain(":not(:has(.jg-nr))");
  });
});
