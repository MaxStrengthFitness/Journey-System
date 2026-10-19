// @vitest-environment jsdom
/**
 * THE SEAT BELT ON THE GRID'S RAIL (Oct 19 2026). The profile's chart shows a
 * machine's settings as small boxes lined up under Gap, one line, cut where
 * they run out. The belt is not a position, so the boxes leave it out; the
 * row still says it to a screen reader, and the Now Bar and the card show it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { JourneyRow, JourneySession } from "./types";
import { JourneyGrid } from "./JourneyGrid";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class QuietObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= QuietObserver;

const SESSIONS: JourneySession[] = [{ id: "s1", sessionNumber: 1, date: "2026-09-01", trainerInitials: "AJ" }];
const row = (settings: Record<string, string>, settingLabels: Record<string, string>): JourneyRow => ({
  machine: { id: "m-pulldown", name: "Pulldown", group: "Pull", settings, settingLabels },
  sets: { s1: { sessionId: "s1", outcome: "performed", weight: 100, reps: 10, quality: 2 } },
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function draw(r: JourneyRow) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<JourneyGrid sessions={SESSIONS} sections={[{ id: "a", label: "Routine A", rows: [r] }]} />));
  return host;
}

describe("the seat belt on the grid's rail", () => {
  it("leaves the belt out of the position boxes, and still says it", async () => {
    const el = await draw(row({ G: "3", S: "4", Belt: "Off" }, { G: "Gap", S: "Seat", Belt: "Seat belt" }));
    const boxes = [...el.querySelectorAll(".jg-setting:not(.jg-setting--slot)")].map((b) => b.textContent);
    expect(boxes).toEqual(["G3", "S4"]);
    expect(el.querySelector(".jg-machine__btn")!.getAttribute("aria-label")).toContain("Seat belt Off");
  });

  it("draws no boxes at all for a machine with only the belt recorded", async () => {
    const el = await draw(row({ Belt: "On" }, { Belt: "Seat belt" }));
    expect(el.querySelector(".jg-machine__meta")).toBeNull();
  });
});
