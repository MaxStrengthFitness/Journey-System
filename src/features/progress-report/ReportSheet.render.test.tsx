// @vitest-environment jsdom
/**
 * The one-page sheet, MOUNTED (Oct 13 2026): the modules a report has are
 * drawn in its focus's order, the ones it hasn't never appear, and nothing
 * on paper is a dash or a made-up sentence.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReportSheet } from "./ReportSheet";
import { planSheet } from "./sheet-from-report";
import { EVERYDAY, FULL, NEW_CLIENT } from "./sheet-fixtures";

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
  const { model } = planSheet(inputs);
  act(() => root!.render(<ReportSheet model={model} />));
  return host;
}

const modules = (el: HTMLElement) => [...el.querySelectorAll("[data-module]")].map((n) => n.getAttribute("data-module"));

describe("the one-page sheet", () => {
  it("draws every ticked module of a full report, in the focus's order", () => {
    const el = draw(FULL);
    expect(modules(el)).toEqual(["thanks", "stats", "accolades", "machines", "fourps", "body", "pulse", "goals", "plan", "coach"]);
    expect(el.textContent).toContain("Your focus: A goal to hit");
    expect(el.textContent).toContain("Dana Whitfield");
    expect(el.querySelectorAll(".rs-table tbody tr")).toHaveLength(8);
    expect(el.querySelector(".rs-sheet")?.getAttribute("data-density")).toBe("condensed");
  });

  it("never draws a module the client hasn't got (everyday strength: no InBody, accolades or 4 P's)", () => {
    const el = draw(EVERYDAY);
    expect(modules(el)).toEqual(["thanks", "pulse", "machines", "goals", "plan", "coach"]);
    expect(el.querySelector(".rs-sheet")?.getAttribute("data-density")).toBe("roomy");
  });

  it("prints no dash and no sentence the trainer didn't write", () => {
    const el = draw(NEW_CLIENT);
    expect(modules(el)).toEqual(["thanks", "goals"]);
    expect(el.querySelector(".rs-quote")).toBeNull();
    expect(el.textContent).not.toContain("—");
    expect(el.textContent).not.toMatch(/not enough data|not recorded/i);
  });
});
