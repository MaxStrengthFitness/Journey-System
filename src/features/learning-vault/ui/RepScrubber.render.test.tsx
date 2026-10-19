// @vitest-environment jsdom
/**
 * THE REP SCRUBBER, MOUNTED (Learning vault redesign, Oct 19 2026).
 *
 * The scrubber does work during render (it carries the thumb across to a
 * new pace or shape in the render itself) and in effects (Play), so it is
 * mounted here: the thumb is moved with the keyboard and the phase under it
 * changes; a tap on a moment's name moves it there; a pace or shape change
 * keeps it on the same moment; Play steps a second at a time when the
 * reader asked for less motion; the cue lines load, show, and open the
 * phrasebook. A small phrasebook fixture stands in for cues.json.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CueMoment } from "../../academy/types";
import type { VaultRoute } from "../types";
import { RepScrubber } from "./RepScrubber";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CUES: CueMoment[] = [
  { moment: "Before you start", phrases: ["SEE INDIVIDUAL EXERCISE SCRIPTS FOR MORE SPECIFIC EXAMPLES"], notes: [] },
  { moment: "To begin the exercise (gradual load up - pushing movement)", phrases: ["Gradually load up.", "Slowly begin"], notes: [] },
  {
    moment: "To begin the exercise - pulling movement",
    phrases: ["After the loading transfer near contracted position (i.e. handoff):", "Slowly begin to straighten your arms."],
    notes: [],
  },
  { moment: "Speed of Motion", phrases: ["Keep the same pace.", "Don't speed up."], notes: [] },
  {
    moment: "Lower Turnaround (movements where weight stack touches - ex. leg press, chest press, overhead) - most effectively used during the eccentric",
    phrases: ["Barely touch, barely start"],
    notes: [],
  },
  {
    moment: "Lower Turnaround (movements where weight stack does not touch - ex. pulldown, row) - most effectively used during the eccentric",
    phrases: ["Seamless."],
    notes: [],
  },
  {
    moment: "Upper Turnaround (movements with an end stop/no squeeze - ex. leg press, chest press, overhead press, seated dip) - need to properly time the click",
    phrases: ["Touch and go"],
    notes: [],
  },
  {
    moment: "Upper Turnaround (movements without an end stop and include a squeeze - ex. row, chest flye) - instructor will need to stop/pause the client",
    phrases: ["Squeeze, [click] unsqueeze, ease out"],
    notes: [],
  },
  { moment: "Final descent", phrases: ["Continue breathing and do not speed up, this is your final descent."], notes: [] },
];

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount(ui: React.ReactElement) {
  await act(async () => root.render(ui));
}

const thumb = () => host.querySelector<HTMLElement>('[role="slider"]')!;
const phaseName = () => host.querySelector(".vtr__phase")?.textContent ?? "";
const clockText = () => host.querySelector(".vtr__clock")?.textContent ?? "";
const button = (label: string) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === label);

async function press(key: string, times = 1) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      thumb().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });
  }
}

async function click(el: HTMLElement | undefined) {
  expect(el).toBeTruthy();
  await act(async () => el!.click());
}

describe("RepScrubber", () => {
  it("opens on the start of the set, with the three shapes as a switch", async () => {
    await mount(<RepScrubber cues={CUES} />);
    expect(phaseName()).toBe("Gradual load-up");
    expect(host.querySelector(".vtr__title")?.textContent).toBe("The repetition");
    const shapes = host.querySelector('[aria-label="How the set begins and turns"]')!;
    expect(Array.from(shapes.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["End stop", "Squeeze", "Handoff"]);
    expect(thumb().getAttribute("aria-valuenow")).toBe("0");
    // A thumb a finger can find: 44px in the stylesheet, focusable here.
    expect(thumb().tabIndex).toBe(0);
  });

  it("moves the thumb with the keyboard, and the phase under it changes", async () => {
    await mount(<RepScrubber cues={CUES} />);
    await press("ArrowRight", 8); // 4 seconds in: past the 3-second load-up
    expect(thumb().getAttribute("aria-valuenow")).toBe("4");
    expect(phaseName()).toBe("Concentric");
    expect(clockText()).toBe("1.0 of 6 s");
    expect(thumb().getAttribute("aria-valuetext")).toBe("Concentric, 4.0 seconds in");
    await press("PageUp");
    expect(phaseName()).toBe("Upper turnaround");
    await press("End");
    expect(phaseName()).toBe("Final descent");
    await press("Home");
    expect(phaseName()).toBe("Gradual load-up");
    await press("ArrowLeft");
    expect(thumb().getAttribute("aria-valuenow")).toBe("0");
  });

  it("shows the rule, its source, and the phrasebook's lines for the moment, each with a way to read more", async () => {
    const opened: VaultRoute[] = [];
    await mount(<RepScrubber cues={CUES} onOpenSource={(r) => opened.push(r)} />);
    expect(host.querySelector(".vtr__rule-text")?.textContent).toMatch(/3 or more seconds/);
    expect(host.querySelector(".vtr__rule .vtr__src-label")?.textContent).toBe("Academy 4.3 · Gradual Load-up");
    expect(Array.from(host.querySelectorAll(".vtr__phrases li")).map((li) => li.textContent)).toEqual(["Gradually load up.", "Slowly begin"]);
    const readIts = Array.from(host.querySelectorAll<HTMLButtonElement>(".vtr__btn--quiet"));
    await click(readIts[0]);
    await click(readIts[1]);
    expect(opened).toEqual([
      { kind: "topic", moduleId: "performance", topicId: "performance-gradual-load-up" },
      { kind: "cueing", moment: 1 },
    ]);
  });

  it("goes to a moment when its name is tapped", async () => {
    await mount(<RepScrubber cues={CUES} />);
    await click(button("Lower turnaround"));
    expect(phaseName()).toBe("Lower turnaround");
    expect(clockText()).toBe("No pause");
    expect(host.querySelector('.vtr__step[aria-pressed="true"]')?.textContent).toBe("Lower turnaround");
    expect(Array.from(host.querySelectorAll(".vtr__phrases li")).map((li) => li.textContent)).toEqual(["Barely touch, barely start"]);
  });

  it("switches shape, and a handoff begins with the handoff and leaves out the phrasebook's lead-in", async () => {
    await mount(<RepScrubber cues={CUES} />);
    await click(button("Handoff"));
    expect(phaseName()).toBe("Handoff");
    expect(Array.from(host.querySelectorAll(".vtr__phrases li")).map((li) => li.textContent)).toEqual([
      "Slowly begin to straighten your arms.",
    ]);
    expect(Array.from(host.querySelectorAll(".vtr__step")).map((b) => b.textContent)).toEqual([
      "Handoff",
      "Eccentric",
      "Lower turnaround",
      "Concentric",
      "Upper turnaround",
      "Final descent",
    ]);
  });

  it("keeps the thumb on the same moment when the pace changes, and says the stroke's own seconds", async () => {
    await mount(<RepScrubber cues={CUES} />);
    await press("ArrowRight", 12); // 6 s: halfway up at the house pace
    expect(clockText()).toBe("3.0 of 6 s");
    await click(button("10"));
    expect(phaseName()).toBe("Concentric");
    expect(clockText()).toBe("5.0 of 10 s");
    expect(host.querySelector(".vtr__cycle")?.textContent).toBe("A rep's cycle: up 10 s, down 10 s");
    // The window is said once; no rep is ever said to be 20 seconds.
    expect(host.textContent).toContain("6 to 10 seconds up and 6 to 10 down");
    expect(host.textContent).not.toMatch(/20[- ]second rep/i);
  });

  it("with a machine, fixes the shape and names the machine", async () => {
    await mount(<RepScrubber shape="squeeze" machineName="LUMBAR" cues={CUES} />);
    expect(host.querySelector('[aria-label="How the set begins and turns"]')).toBeNull();
    expect(host.querySelector(".vtr__machine")?.textContent).toBe("LUMBAR: ");
    await click(button("Upper turnaround"));
    expect(Array.from(host.querySelectorAll(".vtr__phrases li")).map((li) => li.textContent)).toEqual([
      "Squeeze, [click] unsqueeze, ease out",
    ]);
  });

  it("shows the loading mark while the phrasebook loads, and no cue lines when none are given", async () => {
    await mount(<RepScrubber cues={null} />);
    expect(host.querySelector('.vtr__say [role="status"]')).not.toBeNull();
    await mount(<RepScrubber />);
    expect(host.querySelector(".vtr__say")).toBeNull();
    expect(host.querySelector(".vtr__rule-text")).not.toBeNull();
  });

  it("plays a second at a time when the reader asked for less motion, and stops at the end", async () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query.includes("prefers-reduced-motion"),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    vi.useFakeTimers();
    await mount(<RepScrubber cues={CUES} />);
    await click(button("Play"));
    expect(button("Pause")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(thumb().getAttribute("aria-valuenow")).toBe("3");
    expect(phaseName()).toBe("Concentric");
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(phaseName()).toBe("Final descent");
    expect(thumb().getAttribute("aria-valuenow")).toBe("21");
    expect(button("Play again")).toBeTruthy();
    // A key press while playing would have stopped it; Play again starts from the top.
    await click(button("Play again"));
    expect(phaseName()).toBe("Gradual load-up");
  });
});
