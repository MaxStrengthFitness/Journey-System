// @vitest-environment jsdom
/**
 * Standard → Academy questions, mounted (Ask the Academy, phase 3, Oct 19
 * 2026). The reads and the mark are stood in for. What it pins: the same
 * question asked again is one row with how often and where; a flagged answer
 * shows the trainer's reason and the answer behind a tap; a mark marks every
 * entry in the row and reads again; a failed read says so, never "All clear".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { StoredEntry } from "../ask-academy/head-office";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let entries: Record<string, StoredEntry[]> = {};
let failRead = false;
const marked: [string[], string][] = [];
vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("../ask-academy/head-office", async (orig) => ({
  ...(await orig<typeof import("../ask-academy/head-office")>()),
  readEntries: vi.fn(async (mark: string) => {
    if (failRead) throw new Error("offline");
    return entries[mark] ?? [];
  }),
  markEntries: vi.fn(async (ids: string[], mark: string) => {
    marked.push([ids, mark]);
  }),
}));

const { AcademyQuestionsPage } = await import("./AcademyQuestionsPage");

const e = (id: string, question: string, studioId: string, at: number, over: Partial<StoredEntry> = {}): StoredEntry => ({
  id, question, reason: "not_covered", studioId, day: "2026-10-19", mark: "open", at, ...over,
});
const STUDIOS = [{ id: "solon", name: "Solon" }, { id: "westlake", name: "westlake" }];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  entries = {};
  failRead = false;
  marked.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const text = () => host.textContent ?? "";

describe("Academy questions", () => {
  it("makes a question asked again one row, and shows a flagged answer with its reason", async () => {
    entries.open = [
      e("1", "The leg press squeaks", "solon", 1),
      e("2", "The leg press squeaks", "westlake", 2),
      e("3", "How hard after months off?", "solon", 3, { reason: "flagged", why: "Wrong page.", answer: "“A quote” (EIH)" }),
    ];
    act(() => root.render(<AcademyQuestionsPage studios={STUDIOS} />));
    await flush();
    expect(text()).toContain("Waiting for a mark · 2");
    expect(text()).toContain("Asked twice · westlake, Solon");
    expect(text()).toContain("Answer flagged wrong");
    expect(text()).toContain("“Wrong page.”");
    expect(host.querySelector("details")?.textContent).toContain("The answer the trainer saw");
  });

  it("marks every entry in the row, and reads again", async () => {
    entries.open = [e("1", "Late clients?", "solon", 1), e("2", "late clients", "solon", 2)];
    const onChanged = vi.fn();
    act(() => root.render(<AcademyQuestionsPage studios={STUDIOS} onChanged={onChanged} />));
    await flush();
    const studioCall = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Studio's call") as HTMLButtonElement;
    entries.open = [];
    await act(async () => studioCall.click());
    await flush();
    expect(marked).toEqual([[["2", "1"], "studio"]]);
    expect(onChanged).toHaveBeenCalled();
    expect(text()).toContain("All clear.");
  });

  it("says a failed read is unknown, never all clear", async () => {
    failRead = true;
    act(() => root.render(<AcademyQuestionsPage studios={STUDIOS} />));
    await flush();
    expect(text()).toContain("couldn't be read");
    expect(text()).not.toContain("All clear");
  });
});
