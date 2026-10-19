// @vitest-environment jsdom
/**
 * THE HUB'S TOP, MOUNTED (calm Hub round, Sep 28 2026): the week with each
 * day's count (zero left out) and a dot for a day to celebrate, Today when
 * you are elsewhere, Tasks as a door that never shows a grey 0 while
 * loading, the chips that light the grid, the spotlight's bar, and the Key.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DayHeader, DaySummary, KeySheet, type DayHeaderProps, type DaySummaryProps } from "./DayHeader";
import type { StripDay } from "./day-summary";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = "";
  root = null;
  host = null;
});

function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<StrictMode>{node}</StrictMode>));
  return host;
}

const DAYS: StripDay[] = [
  { key: "2026-09-27", weekday: "Sun", date: 27, count: null, celebrate: false, isToday: false },
  { key: "2026-09-28", weekday: "Mon", date: 28, count: 57, celebrate: true, isToday: true },
  { key: "2026-09-29", weekday: "Tue", date: 29, count: 47, celebrate: false, isToday: false },
];

function header(over: Partial<DayHeaderProps> = {}) {
  const calls = { layer: [] as string[], day: [] as string[], tasks: 0, key: 0 };
  const el = render(
    <DayHeader
      layer="schedule"
      onLayer={(l) => calls.layer.push(l)}
      days={DAYS}
      selected="2026-09-28"
      onSelectDay={(d) => calls.day.push(d)}
      openTasks={3}
      onOpenTasks={() => (calls.tasks += 1)}
      onOpenKey={() => (calls.key += 1)}
      {...over}
    />,
  );
  return { el, calls };
}

const btn = (el: HTMLElement, text: string) => [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes(text));

describe("the week and the doors", () => {
  it("shows each day's count, leaves an empty day without a number, and dots a day to celebrate", () => {
    const { el } = header();
    const days = [...el.querySelectorAll<HTMLButtonElement>(".hd-day")];
    expect(days.map((d) => d.textContent)).toEqual(["Sun 27", "Mon 2857", "Tue 2947"]);
    expect(days[1].getAttribute("aria-selected")).toBe("true");
    expect(days[1].querySelector(".hd-dot")).toBeTruthy();
    expect(days[2].querySelector(".hd-dot")).toBeNull();
    expect(days[0].getAttribute("aria-label")).toBe("Sun 27, nothing booked");
  });

  it("offers Today only when you are on another day, and moves the day", () => {
    expect(btn(header().el, "Today")).toBeUndefined();
    act(() => root?.unmount());
    const { el, calls } = header({ selected: "2026-09-29" });
    act(() => btn(el, "Today")!.click());
    act(() => el.querySelectorAll<HTMLButtonElement>(".hd-day")[2].click());
    expect(calls.day).toEqual(["2026-09-28", "2026-09-29"]);
  });

  it("makes Tasks a door, with its count, and never a grey 0 while they load", () => {
    const { el, calls } = header();
    expect(btn(el, "Tasks")?.textContent).toBe("Tasks3");
    act(() => btn(el, "Tasks")!.click());
    expect(calls.tasks).toBe(1);
    act(() => root?.unmount());
    expect(btn(header({ openTasks: null }).el, "Tasks")?.textContent).toBe("Tasks");
  });

  it("opens the Key", () => {
    const { el, calls } = header();
    act(() => btn(el, "Key")!.click());
    expect(calls.key).toBe(1);
  });
});

function summary(over: Partial<DaySummaryProps> = {}) {
  const calls = { spot: [] as Array<string | null>, next: 0, list: 0 };
  const el = render(
    <DaySummary
      title="Monday, Sep 28"
      spot={null}
      spotText=""
      onSpot={(f) => calls.spot.push(f)}
      onNext={() => (calls.next += 1)}
      onAsList={() => (calls.list += 1)}
      {...over}
    />,
  );
  return { el, calls };
}

describe("the line under the bar: only what the bar and the week don't say", () => {
  it("draws nothing on a day whose bookings were read (the command bar, Oct 3 2026)", () => {
    expect(summary().el.querySelector(".hd-sum")).toBeNull();
  });

  it("says a day whose bookings couldn't be read, or are still being read", () => {
    expect(summary({ bookings: "failed" }).el.querySelector(".hd-sum-words")?.textContent).toBe("Monday, Sep 28 · couldn't load the bookings");
    act(() => root?.unmount());
    expect(summary({ bookings: "loading" }).el.querySelector(".hd-sum-words")?.textContent).toBe("Monday, Sep 28 · reading the bookings\u2026");
  });

  it("ends the same line with Focus: Me | Everyone, for someone with a column (hub cherry round)", () => {
    const picked: string[] = [];
    const { el } = summary({ focus: { value: "me", onChange: (f) => picked.push(f) } });
    const seg = el.querySelector('[role="group"][aria-label="Focus"]');
    expect([...seg!.querySelectorAll("button")].map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["My day", "true"],
      ["Everyone", "false"],
    ]);
    act(() => btn(el, "Everyone")!.click());
    expect(picked).toEqual(["everyone"]);
    // The switch is the line's only thing on a read day.
    expect(el.querySelector(".hd-sum")?.lastElementChild?.className).toBe("hd-focus");
  });

  it("offers no switch without a column, nor on the spotlight's bar", () => {
    expect(summary().el.querySelector(".hd-focus")).toBeNull();
    act(() => root?.unmount());
    expect(summary({ spot: "celebrate", spotText: "3 to celebrate", focus: { value: "me", onChange: () => {} } }).el.querySelector(".hd-focus")).toBeNull();
  });

  it("turns into the spotlight's bar: what it shows, Next, the list, and Done", () => {
    const { el, calls } = summary({ spot: "celebrate", spotText: "3 to celebrate: 2 birthdays, 1 milestone" });
    expect(el.querySelector(".hd-spot-words")?.textContent).toBe("Showing 3 to celebrate: 2 birthdays, 1 milestone on the grid");
    act(() => btn(el, "Next")!.click());
    act(() => btn(el, "See them as a list")!.click());
    act(() => btn(el, "Done")!.click());
    expect(calls).toEqual({ spot: [null], next: 1, list: 1 });
  });
});

describe("the Key", () => {
  it("says every mark and state in words when open", () => {
    const onClose = vi.fn();
    render(<KeySheet open onClose={onClose} />);
    const text = document.body.textContent || "";
    expect(text).toContain("The Key");
    expect(text).toContain("No waiver signed.");
    expect(text).toContain("Not working.");
  });

  it("says the grid's states in the order a day runs, each with its swatch, and Now as \"its time has come\" (the cards round, Oct 17 2026)", () => {
    render(<KeySheet open onClose={() => {}} />);
    const lists = [...document.querySelectorAll(".hd-key-list")];
    const grid = [...lists[lists.length - 1].querySelectorAll("li")];
    expect(grid.map((li) => [li.querySelector(".hd-swatch")?.getAttribute("data-state"), li.querySelector("strong")?.textContent])).toEqual([
      ["live", "Coming up."],
      ["now", "Now."],
      ["in-session", "In session."],
      ["done", "Done · Late cancel."],
      ["not-logged", "Not logged."],
      ["left-open", "Left open · Paused · At End Session."],
      ["past", "Over, no word."],
      ["unlinked", "Not synced yet."],
      ["unlinked", "Unassigned."],
      ["staff", "Not a session."],
      ["off", "Not working."],
    ]);
    const words = (name: string) => grid.find((li) => li.querySelector("strong")?.textContent === name)?.textContent ?? "";
    // Not "its half hour": a 45-minute consult, and the five minutes after a slot, are Now too.
    expect(words("Now.")).toContain("Its time has come and no session has started in Journey yet.");
    expect(words("Now.")).not.toContain("half hour");
    expect(words("Not logged.")).toContain("Before the studio starts logging in Journey, it steps back like Done and keeps its words.");
    expect(words("Over, no word.")).toContain("It never says Not logged on a guess.");
    // Every state the Key names has its swatch drawn in the stylesheet.
    const css = readFileSync(resolve(__dirname, "day-header.css"), "utf8");
    for (const state of new Set(grid.map((li) => li.querySelector(".hd-swatch")?.getAttribute("data-state")))) {
      expect(css, String(state)).toContain(`.hd-swatch[data-state="${state}"]`);
    }
  });

  it("says a narrow card's four symbols, each drawn beside its word, after the grid's states (the narrow cards round, phase 3)", () => {
    render(<KeySheet open onClose={() => {}} />);
    const row = document.querySelector(".hd-key-narrow");
    expect(row?.tagName).toBe("P");
    // The row AJ's design names, then one sentence: what a narrow card shows, and where the rest is.
    expect(row?.textContent).toMatch(/^On a narrow card: Done · Not logged · Left open · Late cancel\. /);
    expect(row?.textContent).toContain("one mark and a symbol for what happened");
    expect(row?.textContent).toContain("the client’s initials");
    expect(row?.textContent).toContain("Tap it for the rest.");
    const syms = [...row!.querySelectorAll(".hd-key-sym")];
    expect(syms.map((s) => s.getAttribute("data-sym"))).toEqual(["done", "not-logged", "left-open", "late-cancel"]);
    // A symbol is a picture of its word, which follows it: unheard, and never wrapped away from it.
    for (const s of syms) {
      expect(s.getAttribute("aria-hidden")).toBe("true");
      expect(s.parentElement?.classList.contains("hd-key-sym-item")).toBe(true);
    }
    expect(syms.map((s) => s.querySelector("svg")?.getAttribute("class"))).toEqual(["lucide lucide-check", "lucide lucide-circle", "lucide lucide-pause", "lucide lucide-x"]);
    // After the grid's states: the last list is still the grid's (the test above), and the row is not a state.
    const lists = [...document.querySelectorAll(".hd-key-list")];
    expect(lists[lists.length - 1].compareDocumentPosition(row!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Each symbol has its ink in the stylesheet.
    const css = readFileSync(resolve(__dirname, "day-header.css"), "utf8");
    for (const sym of ["done", "not-logged", "left-open", "late-cancel"]) expect(css, sym).toContain(`.hd-key-sym[data-sym="${sym}"]`);
  });

  it("explains the ✎ Ask about, and says its words stay off the card (wave 2 hub)", () => {
    render(<KeySheet open onClose={() => {}} />);
    const row = [...document.querySelectorAll(".hd-key-list li")].find((li) => li.textContent?.startsWith("Ask about."));
    expect(row?.textContent).toContain("never on the card");
    expect(row?.querySelector(".hs-g")?.getAttribute("data-family")).toBe("get-to-know");
  });
});

describe("the chips, with Get to know (wave 2 hub)", () => {
  it("draws the chips in the bar, Get to know after the others, and lights its cards", () => {
    const spots: string[] = [];
    const { el } = header({
      chips: [
        { id: "read-first", label: "Read first", count: 1 },
        { id: "celebrate", label: "Celebrate", count: 3 },
        { id: "get-to-know", label: "Get to know", count: 2 },
      ],
      onSpot: (f) => spots.push(f),
    });
    // One command bar (Oct 3 2026): the layers, the chips, then the tools, on one surface.
    const bar = el.querySelector(".hd-bar")!;
    expect([...bar.children].map((c) => c.className)).toEqual(["hl-switch", "hd-rule", "hd-chips", "hd-gap", "hd-rule hd-rule--tools", "hd-tools"]);
    expect([...el.querySelectorAll(".hd-chip")].map((c) => c.textContent)).toEqual(["Read first 1", "Celebrate 3", "Get to know 2"]);
    // The word can hide when the bar is narrow; a screen reader always hears it.
    expect(el.querySelectorAll(".hd-chip")[1].getAttribute("aria-label")).toBe("Celebrate: 3. Light them up on the grid");
    expect(el.querySelectorAll(".hd-chip")[2].querySelector(".hd-fam")?.getAttribute("data-family")).toBe("get-to-know");
    act(() => btn(el, "Get to know")!.click());
    expect(spots).toEqual(["get-to-know"]);
  });

  it("draws no chips, and no hairline for them, on a day without any", () => {
    const { el } = header({ chips: [], onSpot: () => {} });
    expect(el.querySelector(".hd-chips")).toBeNull();
    expect(el.querySelectorAll(".hd-bar .hd-rule")).toHaveLength(1);
  });
});
