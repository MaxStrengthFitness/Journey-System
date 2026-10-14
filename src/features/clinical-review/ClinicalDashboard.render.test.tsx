// @vitest-environment jsdom
/**
 * Mounts the Kaizen Deep Dive with a report built from synthetic sessions.
 *
 * It proves the frame: the title, the fixed "it can be wrong" line above
 * everything, the panel ORDER the owner decided (stalls → readiness →
 * attendance → pain & Pulse → time under tension → heat map), that no
 * tonnage figure survives anywhere on the page, and that a level under
 * three sessions reads "needs 3" instead of a number.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, ExerciseLog, WorkoutSession } from "../../types";

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: {}, functions: {} }));

import { buildReport } from "./report";
import { ClinicalDashboard, DEEP_DIVE_TITLE } from "./ClinicalDashboard";
import { RANGE_PRESETS, rangePresets } from "./ClinicalReviewTab";
import { DEEP_DIVE_CAVEAT } from "./panels";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  mounted.push({ root, host });
  return host;
}

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

const day = (offset: number): string => {
  const d = new Date(2026, 5, 1);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Twelve sessions: six legacy, six on the Dial; Leg Press parked at 100 lb for the last six. */
function synthetic() {
  const sessions: WorkoutSession[] = [];
  const logs: ExerciseLog[] = [];
  for (let i = 0; i < 12; i++) {
    const date = day(i * 3);
    const off = i % 4 === 1;
    sessions.push({
      id: `s${i}`,
      clientId: "c1",
      status: "Completed",
      date,
      trainerInitials: "AJ",
      preSessionCheckIn: i < 6 ? { sleepQuality: off ? "poor" : "optimal" } : { readiness: { sleep: off ? -2 : 1 } },
      ...(i < 6 ? { clientFeel: "Good" } : { dose: 0 }),
    } as WorkoutSession);
    logs.push({ id: `l${i}`, sessionId: `s${i}`, machineId: "leg-press", weight: String(i < 6 ? 88 + i * 2 : 100), reps: "8", repQuality: off ? 1 : 2, totalTimeUnderLoad: 80 } as ExerciseLog);
    logs.push({ id: `m${i}`, sessionId: `s${i}`, machineId: "chest", weight: "50", reps: "10", repQuality: 2 } as ExerciseLog);
  }
  return { sessions, logs };
}

const client = { id: "c1", firstName: "Judy", lastName: "Kaizen" } as Client;

describe("ClinicalDashboard (Kaizen Deep Dive)", () => {
  it("frames the page with the caveat and draws the panels in the decided order", async () => {
    const { sessions, logs } = synthetic();
    const report = buildReport({
      client,
      machines: [{ id: "leg-press", name: "Leg Press" } as any, { id: "chest", name: "Chest Press" } as any],
      trainers: [],
      sessions,
      logs,
      incidents: [],
      pulseHistory: null,
      range: { preset: "custom", from: day(0), to: day(40) },
    });
    const host = await mount(
      <ClinicalDashboard report={report} clientName="Judy Kaizen" presets={RANGE_PRESETS} onPreset={() => {}} onRegenerate={() => {}} />,
    );
    const text = host.textContent ?? "";
    expect(text).toContain(DEEP_DIVE_TITLE);
    expect(text).toContain(DEEP_DIVE_CAVEAT);
    // The caveat sits above every panel.
    const caveat = host.querySelector(".cr-caveat")!;
    const firstSection = host.querySelector("section.cr-section")!;
    expect(caveat.compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const titles = Array.from(host.querySelectorAll("h3.cr-section__title")).map((h) => h.textContent);
    expect(titles).toEqual([
      "What moves the needle",
      "Progression stalls",
      "Readiness vs output",
      "Attendance rhythm",
      "Effort, lately",
      "Pain & incidents, and the Pulse",
      "Time under tension",
      "Where form breaks",
    ]);

    // Tonnage is retired: no "lb moved", no tonnage tile, no tonnage outcome.
    expect(text).not.toMatch(/tonnage/i);
    expect(text).not.toMatch(/lb moved/i);
    // The stall reads as a sentence.
    expect(text).toMatch(/Leg Press — 100 lb for 6 sessions since/);
    // The Pulse read failed → "unavailable", never "no Pulse".
    expect(text).toContain("Pulse history unavailable");
    // A level under three sessions shows "needs 3", not a number.
    expect(text).toContain("needs 3");
    // Effort, lately (Oct 2 2026): no session carries the effort rating yet,
    // so the sample says so in words — the legacy dose is never read as effort.
    expect(host.querySelector('[data-testid="effort-trend"]')!.textContent).toMatch(/^Not enough data yet: 0 of the 6 rated workouts/);
  });

  it("says when her effort has been lower lately, from the Wrap-up's ratings", async () => {
    const { sessions, logs } = synthetic();
    const efforts = [1, 0, 1, 0, 0, 1, 0, -1, -1, 0, -2];
    const rated = sessions.map((s, i) =>
      i < sessions.length - efforts.length ? s : ({ ...s, effort: efforts[i - (sessions.length - efforts.length)] } as WorkoutSession),
    );
    const report = buildReport({
      client,
      machines: [{ id: "leg-press", name: "Leg Press" } as any, { id: "chest", name: "Chest Press" } as any],
      trainers: [],
      sessions: rated,
      logs,
      incidents: [],
      pulseHistory: null,
      range: { preset: "custom", from: day(0), to: day(40) },
    });
    const host = await mount(
      <ClinicalDashboard report={report} clientName="Judy Kaizen" presets={RANGE_PRESETS} onPreset={() => {}} onRegenerate={() => {}} />,
    );
    const panel = host.querySelector('[data-testid="effort-trend"]')!;
    expect(panel.getAttribute("data-status")).toBe("declining");
    expect(panel.textContent).toContain("Judy's effort has been lower lately");
  });
});

/*
 * The widest range (Sep 24 2026, lib/history-claims.ts). A trend drawn from
 * the day Journey first saw a client is not her whole story, so "All time"
 * is said only when Journey holds all of it.
 */
describe("ClinicalDashboard's widest range and a client's past", () => {
  const allRangeReport = (sessions: WorkoutSession[] = [], logs: ExerciseLog[] = []) =>
    buildReport({
      client,
      machines: [{ id: "leg-press", name: "Leg Press" } as any, { id: "chest", name: "Chest Press" } as any],
      trainers: [],
      sessions,
      logs,
      incidents: [],
      pulseHistory: null,
      range: { preset: "all", from: null, to: day(40) },
    });

  it("says 'All time' only when Journey holds her whole story", async () => {
    const { sessions, logs } = synthetic();
    const host = await mount(
      <ClinicalDashboard
        report={allRangeReport(sessions, logs)}
        clientName="Judy Kaizen"
        presets={rangePresets("complete")}
        coverage="complete"
        onPreset={() => {}}
        onRegenerate={() => {}}
      />,
    );
    expect(host.querySelector(".cr-bar__meta")?.textContent).toContain("All time");
    expect(Array.from(host.querySelectorAll(".cr-bar .cr-seg__btn")).map((b) => b.textContent)).toContain("All time");
  });

  it("says 'All in Journey' for everyone else, on the bar, the buttons and the empty state", async () => {
    for (const coverage of ["partial", "unknown", undefined] as const) {
      const { sessions, logs } = synthetic();
      const host = await mount(
        <ClinicalDashboard
          report={allRangeReport(sessions, logs)}
          clientName="Judy Kaizen"
          presets={rangePresets(coverage)}
          coverage={coverage}
          onPreset={() => {}}
          onRegenerate={() => {}}
        />,
      );
      expect(host.querySelector(".cr-bar__meta")?.textContent).toContain("All in Journey");
      const buttons = Array.from(host.querySelectorAll(".cr-bar .cr-seg__btn")).map((b) => b.textContent);
      expect(buttons).toContain("All in Journey");
      expect(buttons).not.toContain("All time");

      const empty = await mount(
        <ClinicalDashboard
          report={allRangeReport()}
          clientName="Judy Kaizen"
          presets={rangePresets(coverage)}
          coverage={coverage}
          onPreset={() => {}}
          onRegenerate={() => {}}
        />,
      );
      expect(empty.querySelector(".cr-empty")?.textContent).toContain("pick All in Journey");
    }
  });

  it("says what the sessions from before Journey can show, claims nothing about them, and gives the stalls one line (Oct 14 2026)", async () => {
    const { sessions, logs } = synthetic();
    // The first six as the FileMaker import writes them: weight and reps, no check-in.
    const mixed = sessions.map((s, i) => (i < 6 ? ({ ...s, legacy_filemaker_id: `fm:c1:${s.date}`, preSessionCheckIn: undefined, clientFeel: undefined } as WorkoutSession) : s));
    const report = buildReport({
      client,
      machines: [{ id: "leg-press", name: "Leg Press" } as any, { id: "chest", name: "Chest Press" } as any],
      trainers: [],
      sessions: mixed,
      logs,
      incidents: [],
      pulseHistory: null,
      range: { preset: "custom", from: day(0), to: day(40) },
    });
    // Time under tension is drawn from the first session Journey recorded, not across the imported weeks.
    expect(report.tutPeriod).toBe("week");
    expect(report.tutWeeks.length).toBeLessThan(report.weeks.length);
    expect(report.tutWeeks[0].weekStart >= report.weeks[report.weeks.length - report.tutWeeks.length].weekStart).toBe(true);
    const host = await mount(
      <ClinicalDashboard report={report} clientName="Judy Kaizen" presets={RANGE_PRESETS} onPreset={() => {}} onRegenerate={() => {}} />,
    );
    const text = host.textContent ?? "";
    const line = host.querySelector('[data-testid="before-journey"]')!;
    expect(line.textContent).toMatch(/^6 of these 12 sessions are from before Journey: weights, reps and hold times only\. Rep quality, time under tension, the Dial and pain count from \w{3} \d+, over the 6 sessions Journey recorded\.$/);
    // Pain: nothing is said about the imported visits but that they carry no record.
    expect(text).toContain("6 of 6 sessions Journey recorded raised nothing. The 6 from before Journey carry no pain record.");
    expect(text).toContain("Nothing hurt, nothing was flagged and no incident was filed in the sessions Journey recorded.");
    // The dials: of the six sessions Journey recorded, every one asked.
    expect(text).toContain("of sessions in Journey asked sleep, energy, recovery, stress or a region");
    // Both machines sit at one load: one finding, a door down to them, and a question, never advice.
    const stalls = [...host.querySelectorAll(".cr-insight")].find((c) => /machines at the same weight/.test(c.textContent ?? ""))!;
    expect(stalls.textContent).toContain("2 machines at the same weight for 6 sessions or more");
    expect(stalls.textContent).toContain("Worth asking why.");
    expect(text).not.toMatch(/deliberate progression|cadence change|pushing it back up/i);
    const go = stalls.querySelector<HTMLButtonElement>(".cr-insight__go")!;
    expect(go.textContent).toContain("See Progression stalls");
    const scrolled = vi.fn();
    const target = host.querySelector<HTMLElement>("#cr-stalls")!;
    expect(target.querySelector("h3")?.textContent).toBe("Progression stalls");
    target.scrollIntoView = scrolled;
    await act(async () => go.click());
    expect(scrolled).toHaveBeenCalled();
    // It lands below the report's sticky bar, and the section takes the focus.
    expect(target.style.scrollMarginTop).toMatch(/^\d+px$/);
    expect(document.activeElement).toBe(target);
  });

  it("says nothing about before Journey when every session is Journey's", async () => {
    const { sessions, logs } = synthetic();
    const report = buildReport({
      client,
      machines: [{ id: "leg-press", name: "Leg Press" } as any, { id: "chest", name: "Chest Press" } as any],
      trainers: [],
      sessions,
      logs,
      incidents: [],
      pulseHistory: null,
      range: { preset: "custom", from: day(0), to: day(40) },
    });
    const host = await mount(
      <ClinicalDashboard report={report} clientName="Judy Kaizen" presets={RANGE_PRESETS} onPreset={() => {}} onRegenerate={() => {}} />,
    );
    expect(host.querySelector('[data-testid="before-journey"]')).toBeNull();
    expect(host.textContent).not.toContain("in Journey");
  });
});
