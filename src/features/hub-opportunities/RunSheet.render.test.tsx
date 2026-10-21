// @vitest-environment jsdom
/**
 * The Run-sheet, MOUNTED (CLAUDE.md: only a render test proves a screen
 * mounts). It builds every entry, sections and chips during render.
 *
 *   - one row per client booked that day, the sort's sentence in one column
 *   - a sort tap changes the sentence in place, and a second tap reverses
 *   - filter chips carry counts and a zero is not drawn
 *   - "Can't tell yet" is folded last and opens on a tap
 *   - a row opens in place into three slots, and its buttons call the Hub's
 *   - everything is asked about the SELECTED day
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import type { RenewalSettingsState } from "../renewals/useRenewalSettings";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("../renewals/useRenewalSettings", async () => {
  const { DEFAULT_RENEWAL_SETTINGS } = await import("../renewals/settings");
  const state: RenewalSettingsState = {
    settings: DEFAULT_RENEWAL_SETTINGS,
    saved: true,
    ownPackageTable: false,
    forStudioId: "westlake",
    loading: false,
    error: null,
  };
  return { useRenewalSettings: () => state };
});

import { RunSheet } from "./RunSheet";
import { useDayMoments, type DayMomentsProps } from "./use-day-moments";
import { NOW, STUDIOS, TODAY, eastern, makeBooking, makeClient } from "../client-directory/fixtures";
import type { Trainer } from "../../types";
import type { FordEntry } from "../ford/types";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  document.body.innerHTML = "";
  try {
    window.localStorage.clear();
  } catch {
    // no storage here
  }
});

const ME = { id: "t-me", fullName: "Sam Rivera" } as unknown as Trainer;
const PIP = { id: "t-pip", fullName: "Pippin Took" } as unknown as Trainer;

const clients = [
  makeClient({ id: "ruth", firstName: "Ruth", lastName: "Alvarez", dateOfBirth: "1946-10-01", sessionCount: 99, clientsNumberOfVisitsAtSite: 3 }),
  makeClient({ id: "harold", firstName: "Harold", lastName: "Kim", lastSessionDate: "2026-09-24", mindbodyServices: { s: { serviceId: 1, name: "96 PIF", count: 96, remaining: 40 } } as never }),
  makeClient({ id: "arwen", firstName: "Arwen", lastName: "Ohl", clientsNumberOfVisitsAtSite: 304 }),
];

const schedules = [
  makeBooking({ clientId: "ruth", start: eastern(TODAY, "15:00"), trainerId: "t-me", trainerName: "Sam Rivera" }),
  makeBooking({ clientId: "harold", start: eastern(TODAY, "16:00"), trainerId: "t-pip", trainerName: "Pippin Took" }),
  makeBooking({ clientId: "arwen", start: eastern(TODAY, "17:00"), trainerId: "t-pip", trainerName: "Pippin Took" }),
  makeBooking({ clientId: "ruth", start: eastern("2026-10-01", "09:00"), trainerId: "t-me", trainerName: "Sam Rivera" }),
];

type MountProps = DayMomentsProps & { onOpenProfile: (id: string) => void; onStartSession: (id: string) => void };

/** The Hub works the day out once (use-day-moments) and hands the Run-sheet its entries. */
function WithTheDay(props: MountProps) {
  const { entries, entriesOn, input } = useDayMoments(props);
  return <RunSheet day={props.day} entries={entries} weekDays={[props.day]} entriesOn={entriesOn} rowsById={input.rowsById} today={TODAY} onOpenProfile={props.onOpenProfile} onStartSession={props.onStartSession} />;
}

async function mount(over: Partial<MountProps> = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const calls = { open: [] as string[], start: [] as string[] };
  const props: MountProps = {
    day: TODAY,
    now: NOW,
    schedules,
    clients,
    sessions: [],
    sessionsKnown: true,
    studios: STUDIOS,
    activeStudioId: "westlake",
    authTrainer: ME,
    uid: "uid-me",
    trainers: [ME, PIP],
    criticalFor: () => [],
    onOpenProfile: (id) => calls.open.push(id),
    onStartSession: (id) => calls.start.push(id),
    ...over,
  };
  await act(async () => {
    root.render(
      <StrictMode>
        <WithTheDay {...props} />
      </StrictMode>,
    );
  });
  return { host, root, calls };
}

const rows = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>(".ho-row")].map((r) => r.dataset.clientId);
const sentence = (host: HTMLElement, id: string) => host.querySelector(`.ho-row[data-client-id="${id}"] .ho-sentence`)?.textContent;
const chips = (host: HTMLElement, id: string) => [...host.querySelectorAll(`.ho-row[data-client-id="${id}"] .ho-chip`)].map((c) => c.textContent);
const button = (host: HTMLElement, selector: string, text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>(selector)].find((b) => b.textContent?.startsWith(text));

async function click(el: Element | null | undefined) {
  expect(el, "element to click").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

describe("RunSheet", () => {
  it("lists every client booked on the day, one row each, by time", async () => {
    const { host } = await mount();
    expect(rows(host)).toEqual(["ruth", "harold", "arwen"]);
    expect(sentence(host, "ruth")).toBe("3:00 \u2013 3:30 PM");
    expect(host.querySelector('.ho-row[data-client-id="ruth"] .ho-when')?.textContent).toBe("3:00 PM \u00b7 with you");
    expect(chips(host, "ruth")).toEqual(["100th today", "Turns 80 Thu"]);
  });

  it("one row of lenses: each says how many clients it holds, and Birthday soon picks by the birthday", async () => {
    const { host } = await mount();
    const lensLabels = [...host.querySelectorAll(".ho-lens")].map((l) => l.textContent);
    expect(lensLabels[0]).toBe("Coming in3");
    expect(lensLabels).toHaveLength(5);
    expect(host.querySelectorAll(".ho-filter, .ho-seg-btn[aria-label]").length).toBe(0);
    await click(button(host, ".ho-lens", "Birthday soon"));
    expect(rows(host)).toEqual(["ruth"]);
    expect(sentence(host, "ruth")).toContain("Turns 80");
    // Back to the day's list.
    await click(button(host, ".ho-lens", "Coming in"));
    expect(rows(host)).toEqual(["ruth", "harold", "arwen"]);
  });

  it("My clients is booked with me today", async () => {
    const { host } = await mount();
    await click(button(host, ".ho-seg-btn", "My clients"));
    expect(rows(host)).toEqual(["ruth"]);
  });

  it("a row opens in place into three slots, and its buttons call the Hub's handlers", async () => {
    const { host, calls } = await mount();
    await click(host.querySelector('.ho-row[data-client-id="ruth"] .ho-rowbtn'));
    const titles = [...host.querySelectorAll(".ho-slot-title")].map((t) => t.textContent);
    expect(titles).toEqual(["Where things stand", "Something to say", "Watch"]);
    expect(host.querySelector(".ho-open")?.textContent).toContain("Turns 80 on Thursday, Oct 1.");
    expect(host.querySelector(".ho-open")?.textContent).toContain("Nothing to watch.");
    await click(button(host, ".ho-action", "Open profile"));
    await click(button(host, ".ho-action", "Start session"));
    expect(calls).toEqual({ open: ["ruth"], start: ["ruth"] });
  });

  it("asks everything about the selected day, not today", async () => {
    const { host } = await mount({ day: "2026-10-01" });
    expect(rows(host)).toEqual(["ruth"]);
    expect(chips(host, "ruth")).toEqual(["Turns 80 today"]);
  });
});

describe("RunSheet: the after-hours and calmer-controls cleanup (Oct 20 2026)", () => {
  it("after the last booking, Earlier today is the only section and starts open; a tap folds it", async () => {
    const { host } = await mount({ now: eastern(TODAY, "20:00") });
    const head = button(host, ".ho-sechead", "Earlier today");
    expect(head?.getAttribute("aria-expanded")).toBe("true");
    expect(rows(host)).toEqual(["ruth", "harold", "arwen"]);
    await click(head);
    expect(rows(host)).toEqual([]);
    expect(button(host, ".ho-sechead", "Earlier today")?.getAttribute("aria-expanded")).toBe("false");
  });

  it("in the daytime nothing starts open that did not before", async () => {
    const { host } = await mount();
    expect(button(host, ".ho-sechead", "Earlier today")).toBeUndefined();
    expect(rows(host)).toEqual(["ruth", "harold", "arwen"]);
  });

  it("a lens nobody is in still opens, and says why it is empty", async () => {
    const { host } = await mount({ clients: [makeClient({ id: "ruth", firstName: "Ruth", lastName: "Alvarez" })], schedules: [schedules[0]] });
    expect(host.querySelectorAll(".ho-row").length).toBe(1);
    await click(button(host, ".ho-lens", "Critical note"));
    expect(host.querySelector(".ho-empty")?.textContent).toContain("Critical note");
  });

  it("says which clients a lens looks at, and nothing under Coming in", async () => {
    const { host } = await mount();
    expect(host.querySelector(".ho-line")).toBeNull();
    await click(button(host, ".ho-lens", "Birthday soon"));
    expect(host.querySelector(".ho-line")?.textContent).toContain("next 7 days");
    await click(button(host, ".ho-lens", "Coming in"));
    expect(host.querySelector(".ho-line")).toBeNull();
  });
});

describe("RunSheet: All stars (wave 2 hub)", () => {
  it("her opened row says it with its proof", async () => {
    const { host } = await mount({ allStarOf: (id) => (id === "arwen" ? { clientId: id, weeksIn: 25, perWeek: 2 } : null) });
    await click(host.querySelector('.ho-row[data-client-id="arwen"] .ho-rowbtn'));
    expect(host.querySelector(".ho-open")?.textContent).toContain("All star: in 25 of the last 26 weeks, about twice a week.");
  });

  it("with no marks, nothing is said", async () => {
    const { host } = await mount();
    await click(host.querySelector('.ho-row[data-client-id="arwen"] .ho-rowbtn'));
    expect(host.textContent).not.toContain("All star");
  });
});

describe("RunSheet: Get to know (wave 2 hub)", () => {
  const PARTY = {
    id: "f-party",
    clientId: "harold",
    studioId: "westlake",
    pillar: "recreation",
    body: "Hosting the Hobbiton party on Wednesday",
    subject: "the party",
    eventDate: eastern("2026-09-30", "00:00"),
    recurrence: "none",
    occurredAt: eastern("2026-09-01", "10:00"),
    isArchived: false,
  } as unknown as FordEntry;

  it("is a chip, and a sentence under Something to say", async () => {
    const { host } = await mount({ fordFor: (id) => (id === "harold" ? [PARTY] : []) });
    expect(chips(host, "harold")).toEqual(["Ask: the party · Wed"]);
    await click(host.querySelector('.ho-row[data-client-id="harold"] .ho-rowbtn'));
    expect(host.querySelector(".ho-open")?.textContent).toContain("Ask about: Hosting the Hobbiton party on Wednesday — Wednesday, Sep 30 (Recreation, noted Sep 1).");
  });

  it("a FORD read that couldn't answer says so once, and her row never says 'Nothing special today'", async () => {
    const { host } = await mount({ fordFor: () => null });
    expect(host.querySelector(".ho-line")?.textContent).toContain("Couldn’t check FORD for 3 clients, so something to ask about may be missing.");
    await click(host.querySelector('.ho-row[data-client-id="harold"] .ho-rowbtn'));
    const opened = host.querySelector(".ho-open")?.textContent ?? "";
    expect(opened).toContain("Couldn’t check FORD for something to ask about — the FORD page has it.");
    expect(opened).not.toContain("Nothing special today.");
  });
});
