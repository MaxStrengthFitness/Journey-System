// @vitest-environment jsdom
/**
 * MY WEEK, MOUNTED (the phone minimalist round, Oct 19 2026): seven
 * headings in one scroll, Today and Tomorrow by name, each day's count or
 * its read state, the rows as the day list draws them, a free day said on
 * My week, and the Now line on today alone.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PhoneWeekList } from "./PhoneWeekList";
import { planWeekList } from "./week-list";
import type { DayBlock } from "./day-list";
import type { DayReadState } from "../../lib/schedule-window";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

type B = DayBlock & { name: string };
const block = (key: string, name: string, columnId: string, from: number): B => ({ key, name, columnId, span: { from, to: from + 30 }, staff: false });
const TODAY = "2026-10-19";
const DAYS = [
  { key: "2026-10-19", blocks: [block("a", "Trisha Patel", "aj", 7 * 60), block("b", "Kathy Ader", "sam", 10 * 60 + 30)], columnOrder: ["aj", "sam"] },
  { key: "2026-10-20", blocks: [], columnOrder: ["aj", "sam"] },
  { key: "2026-10-21", blocks: [block("c", "Judy Gibson", "aj", 12 * 60)], columnOrder: ["aj", "sam"] },
];

function mount({ mineOnly, read = () => "ready" as DayReadState, nowMin = 8 * 60 }: { mineOnly: string | null; read?: (d: string) => DayReadState; nowMin?: number | null }) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const days = planWeekList({ days: DAYS, mineOnly, todayKey: TODAY, nowMin });
  act(() =>
    root!.render(
      <StrictMode>
        <PhoneWeekList
          days={days}
          todayKey={TODAY}
          nowMin={nowMin}
          mineOnly={mineOnly !== null}
          readState={read}
          renderCard={(b, day) => <div className="card" data-day={day}>{b.name}</div>}
          withWords={(b) => (mineOnly ? null : b.columnId === "aj" ? "with you" : "with Sam")}
          scrollTo={null}
        />
      </StrictMode>,
    ),
  );
}

const heads = () => Array.from(host!.querySelectorAll(".ph-week__head")).map((h) => h.textContent);
const rowsOf = (day: string) => Array.from(host!.querySelectorAll(`[data-day="${day}"] .ph-day__list > li`)).map((li) => li.textContent);

describe("PhoneWeekList", () => {
  it("heads every day, Today and Tomorrow by name, with its count, and keeps a free day", () => {
    mount({ mineOnly: null });
    expect(heads()).toEqual(["Today · Mon 192 booked", "Tomorrow · Tue 20Nothing booked", "Wed 211 booked"]);
    expect(host!.querySelectorAll(".ph-week__day").length).toBe(3);
  });

  it("draws each day's rows as the day list does, Now on today alone, and whose under the time on Everyone", () => {
    mount({ mineOnly: null });
    expect(rowsOf("2026-10-19")).toEqual(["7AMwith youTrisha Patel", "Now", "10:30AMwith SamKathy Ader"]);
    expect(rowsOf("2026-10-21")).toEqual(["12PMwith youJudy Gibson"]);
  });

  it("narrows to your own on My week, counts yours, and says a free day is free of you", () => {
    mount({ mineOnly: "aj" });
    expect(heads()).toEqual(["Today · Mon 191 booked", "Tomorrow · Tue 20Nothing booked", "Wed 211 booked"]);
    expect(rowsOf("2026-10-19")).toEqual(["7AMTrisha Patel", "Now"]);
    expect(host!.querySelector('[data-day="2026-10-20"] .ph-week__free')?.textContent).toBe("Nobody booked with you.");
  });

  it("says a day still being read, or one that couldn't be, under its heading, never Nothing booked", () => {
    mount({ mineOnly: "aj", read: (d) => (d === "2026-10-20" ? "loading" : d === "2026-10-21" ? "failed" : "ready") });
    expect(heads()).toEqual(["Today · Mon 191 booked", "Tomorrow · Tue 20Reading…", "Wed 21Couldn’t load the bookings"]);
    expect(host!.querySelector('[data-day="2026-10-20"] .ph-week__free')).toBeNull();
  });

  it("hands each card its day, so a tap can pick that day", () => {
    mount({ mineOnly: null });
    expect(host!.querySelector('[data-day="2026-10-21"] .card')?.getAttribute("data-day")).toBe("2026-10-21");
  });
});
