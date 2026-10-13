// @vitest-environment jsdom
/**
 * The client view on screen, MOUNTED (Oct 13 2026): the same modules as the
 * printed page in the same order, the page's pairs side by side, and the
 * detail the paper had no room for (every machine, the coaching focus, the
 * trainer's highlights). Nothing here is a sentence the trainer didn't write.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReportScreen, screenRows } from "./ReportScreen";
import { planSheet } from "./sheet-from-report";
import { EVERYDAY, FULL, NEW_CLIENT, baseReport, choiceFor, inputsFor } from "./sheet-fixtures";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function draw(inputs: Parameters<typeof planSheet>[0]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const plan = planSheet(inputs);
  act(() => root!.render(<ReportScreen plan={plan} clientFirstName={inputs.client.firstName} />));
  return { el: host, plan };
}

const modules = (el: HTMLElement) => [...el.querySelectorAll("[data-module]")].map((n) => n.getAttribute("data-module"));

describe("the client view on screen", () => {
  it("draws the page's modules in the page's order, its pairs side by side", () => {
    const { el, plan } = draw(FULL);
    expect(modules(el)).toEqual(plan.rows.flat());
    const paired = [...el.querySelectorAll(".rsc-row[data-two]")].map((r) => r.getAttribute("data-row"));
    expect(paired).toEqual(screenRows(plan).filter((r) => r.length === 2).map((r) => r.join("+")));
    expect(paired).toContain("body+pulse");
    expect(el.querySelector(".rsc-name")?.textContent).toBe("Dana Whitfield");
    expect(el.textContent).toContain("Training for A goal to hit");
  });

  it("gives a long machines table a row of its own, its partner on the next", () => {
    const { el, plan } = draw(FULL);
    expect(plan.rows).toContainEqual(["machines", "fourps"]);
    const rows = [...el.querySelectorAll(".rsc-row")].map((r) => r.getAttribute("data-row"));
    expect(rows).toContain("machines");
    expect(rows[rows.indexOf("machines") + 1]).toBe("fourps");
  });

  it("shows every ticked machine, where the page has room for eight", () => {
    const { el, plan } = draw(FULL);
    const rows = el.querySelectorAll('[data-module="machines"] tbody tr');
    expect(rows).toHaveLength(plan.screen.machines.length);
    expect(plan.screen.machines.length).toBeGreaterThan(plan.model.machines!.rows.length);
    expect(el.querySelector('[data-module="machines"] .rsc-title__aside')?.textContent).toBe(`${rows.length} machines`);
  });

  it("follows the client's focus: everyday strength leads with how they feel, and has no InBody, accolades or 4 P's", () => {
    const { el } = draw(EVERYDAY);
    expect(modules(el)).toEqual(["thanks", "pulse", "machines", "goals", "plan", "coach"]);
  });

  it("adds the coaching focus history and the trainer's highlights to the 4 P's", () => {
    const report = baseReport({
      focus: { kind: "goal" },
      pageChoice: choiceFor("goal", ["fourps"]),
      focusSnapshot: [{ category: "Pace", status: "passed", weeks: 3, trainerInitials: "AR" }],
    });
    report.performanceMatrix = { ...report.performanceMatrix, includedNotes: ["Kept the lower turnaround slow all session."] };
    const { el } = draw(inputsFor(report));
    const ps = el.querySelector('[data-module="fourps"]')!;
    expect(ps.textContent).toContain("Pace — achieved after 3 weeks · set by AR");
    expect(ps.textContent).toContain("“Kept the lower turnaround slow all session.”");
  });

  it("shows the mastery word of each rated P and its bar, never a number, and leaves an unrated P off", () => {
    const report = baseReport({ focus: { kind: "goal" }, pageChoice: choiceFor("goal", ["fourps"]) });
    report.performanceMatrix = {
      ...report.performanceMatrix,
      posture: { ...report.performanceMatrix.posture, score: 80, note: "Chin stayed tucked all set" },
      pace: { ...report.performanceMatrix.pace, score: 20, note: "" },
      path: { ...report.performanceMatrix.path, score: 0, note: "" },
      purpose: { ...report.performanceMatrix.purpose, score: 0, note: "" },
    };
    const { el } = draw(inputsFor(report));
    const ps = el.querySelector('[data-module="fourps"]')!;
    expect([...ps.querySelectorAll(".rsc-p__word")].map((w) => w.textContent)).toEqual(["Strong", "Needs work"]);
    expect(ps.querySelector(".rsc-ps")?.textContent).not.toMatch(/\d/);
    expect(ps.textContent).toContain("Chin stayed tucked all set");
    const filled = (tone: string) => ps.querySelectorAll(`.rsc-p[data-tone="${tone}"] [data-on]`).length;
    expect(filled("ok")).toBe(4);
    expect(filled("alert")).toBe(1);
  });

  it("draws only the accolades with real data, and none at all for an old report's blank slots", () => {
    const blank = baseReport({
      focus: { kind: "goal" },
      pageChoice: choiceFor("goal", ["accolades", "thanks"]),
      highlights: [
        { label: "", startValue: "", currentValue: "" },
        { label: "", metricType: "strength_gain" },
        { label: "", metricType: "strength_gain", percentageIncrease: 0 },
      ],
    });
    expect(modules(draw(inputsFor(blank)).el)).toEqual(["thanks"]);
    act(() => root?.unmount());
    host?.remove();

    const some = baseReport({
      focus: { kind: "goal" },
      pageChoice: choiceFor("goal", ["accolades"]),
      highlights: [
        { label: "", metricType: "strength_gain", percentageIncrease: 0 },
        { label: "Leg Press", machineId: "leg", percentageIncrease: 25, startValue: "100 lbs", currentValue: "125 lbs" },
      ],
    });
    const { el } = draw(inputsFor(some));
    expect(el.querySelectorAll(".rsc-accolade")).toHaveLength(1);
    expect(el.textContent).toContain("+25%");
    expect(el.textContent).not.toMatch(/undefined|NaN|Movement Slot|\+0%/i);
  });

  it("says nothing the trainer didn't write: no default praise, no dashes, no empty module", () => {
    const { el } = draw(NEW_CLIENT);
    expect(modules(el)).toEqual(["thanks", "goals"]);
    expect(el.querySelector(".rsc-quote")).toBeNull();
    expect(el.textContent).not.toContain("—");
    expect(el.textContent).not.toMatch(/incredible work|clinical|neurological/i);
  });

  it("uses no Tailwind text size or palette colour, and cuts no name short", () => {
    const { el } = draw(FULL);
    const classes = [...el.querySelectorAll("[class]")].map((n) => n.getAttribute("class") ?? "").join(" ");
    expect(classes).not.toMatch(/\btext-(xs|sm|base|lg|xl|\[)/);
    expect(classes).not.toMatch(/\b(emerald|amber|sky|slate|orange|rose|blue)-\d/);
    expect(classes).not.toMatch(/\b(truncate|line-clamp-\d)\b/);
  });
});
