// @vitest-environment jsdom
/**
 * Ask the Academy's screen, mounted (phase 2, Oct 18 2026). The call to the
 * server is stood in for, so this pins what a trainer sees: the Ask row only
 * once two words are typed and nothing asked until it is tapped; "Reading the
 * Academy…" while waiting; each answer's line over the Academy's words, a
 * quote's page opening that page with the quote; the clearance line first,
 * marked; not covered, disagreeing pages and a failure each in one sentence,
 * with Try again asking once more.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AskResult } from "./ask";
import type { AskReply } from "./client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const replies: AskReply[] = [];
const asked: string[] = [];
vi.mock("./client", () => ({
  askTheAcademy: vi.fn(async (q: string) => {
    asked.push(q);
    return replies.shift() ?? { result: null, error: "no reply queued" };
  }),
}));

const sent: Record<string, unknown>[] = [];
let sendOk = true;
vi.mock("./head-office", async (orig) => ({
  ...(await orig<typeof import("./head-office")>()),
  sendToHeadOffice: vi.fn(async (entry: Record<string, unknown>) => (sent.push(entry), sendOk)),
}));
vi.mock("../../firebase", () => ({ db: {} }));

const { AskAnswer, AskRow, asksWorthOffering } = await import("./AskAnswer");

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  replies.length = 0;
  asked.length = 0;
  sent.length = 0;
  sendOk = true;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const text = () => host.textContent ?? "";
const button = (label: string) => Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(label)) as HTMLButtonElement;

const breathing: AskResult = {
  kind: "answered",
  health: false,
  points: [{ says: "Keep them breathing.", quotes: [{ text: "Breathe freely throughout the set.", pageId: "topic:mastery-breathing", page: "Mastery Series › Breathing", title: "Breathing" }] }],
};

describe("the Ask row", () => {
  it("shows once two words are typed, and asks only when tapped", () => {
    expect(asksWorthOffering("breath")).toBe(false);
    expect(asksWorthOffering("  holds   breath ")).toBe(true);
    const onAsk = vi.fn();
    act(() => root.render(<AskRow query="breath" onAsk={onAsk} />));
    expect(host.querySelector("button")).toBeNull();
    act(() => root.render(<AskRow query="holds their breath" onAsk={onAsk} />));
    expect(text()).toContain("Ask the Academy");
    expect(text()).toContain("“holds their breath”");
    expect(onAsk).not.toHaveBeenCalled();
    act(() => host.querySelector("button")!.click());
    expect(onAsk).toHaveBeenCalledTimes(1);
  });
});

describe("the answer", () => {
  it("says it is reading, then shows the line over the Academy's words; a page opens with its quote", async () => {
    replies.push({ result: breathing, error: "" });
    const onOpenQuote = vi.fn();
    act(() => root.render(<AskAnswer studioId="solon" question="My client holds their breath" onBack={() => {}} onOpenQuote={onOpenQuote} />));
    expect(text()).toContain("Reading the Academy…");
    await flush();
    expect(asked).toEqual(["My client holds their breath"]);
    expect(text()).toContain("Keep them breathing.");
    expect(text()).toContain("Breathe freely throughout the set.");
    act(() => button("Mastery Series › Breathing").click());
    expect(onOpenQuote).toHaveBeenCalledWith({ kind: "academy-topic", id: "mastery-breathing" }, "Breathe freely throughout the set.");
  });

  it("puts a health answer's clearance line first, marked", async () => {
    replies.push({
      result: {
        kind: "answered",
        health: true,
        clearanceLed: true,
        points: [{ says: "Not before clearance.", quotes: [{ text: "does not have medical clearance, we WILL NOT TRAIN OR INVOLVE THE AFFECTED AREA.", pageId: "topic:variations-timed-static-contraction-tsc", page: "Variations › TSC", title: "TSC" }] }],
      },
      error: "",
    });
    act(() => root.render(<AskAnswer studioId="solon" question="Knee replacement" onBack={() => {}} onOpenQuote={() => {}} />));
    await flush();
    expect(host.querySelector(".aa__point--caution")?.textContent).toContain("Clearance first");
  });

  it("says plainly when the Academy doesn't cover it, or its pages disagree", async () => {
    replies.push({ result: { kind: "not_covered" }, error: "" });
    act(() => root.render(<AskAnswer studioId="solon" question="What is Demo Mode for?" onBack={() => {}} onOpenQuote={() => {}} />));
    await flush();
    expect(text()).toContain("The Academy doesn't cover this yet.");
    act(() => root.unmount());
    root = createRoot(host);
    replies.push({ result: { kind: "conflicting" }, error: "" });
    act(() => root.render(<AskAnswer studioId="solon" question="Two pages" onBack={() => {}} onOpenQuote={() => {}} />));
    await flush();
    expect(text()).toContain("The Academy's pages disagree on this. Head office decides.");
  });

  it("shows the server's sentence on a failure, and Try again asks once more", async () => {
    replies.push({ result: null, error: "Ask the Academy isn't switched on yet." });
    replies.push({ result: breathing, error: "" });
    act(() => root.render(<AskAnswer studioId="solon" question="Lower turnaround?" onBack={() => {}} onOpenQuote={() => {}} />));
    await flush();
    expect(text()).toContain("Ask the Academy isn't switched on yet.");
    act(() => button("Try again").click());
    await flush();
    expect(asked).toHaveLength(2);
    expect(text()).toContain("Keep them breathing.");
  });

  it("goes back to the search", async () => {
    replies.push({ result: breathing, error: "" });
    const onBack = vi.fn();
    act(() => root.render(<AskAnswer studioId="solon" question="q here" onBack={onBack} onOpenQuote={() => {}} />));
    await flush();
    act(() => (host.querySelector('[aria-label="Back to search"]') as HTMLButtonElement).click());
    expect(onBack).toHaveBeenCalled();
  });
});

describe("a line that only repeats its quote", () => {
  it("is left out, and a line of its own is kept", async () => {
    const { repeatsQuote } = await import("./AskAnswer");
    const quote = [{ text: "If the client has not yet finished their physical therapy and therefore does not have medical clearance, we WILL NOT TRAIN OR INVOLVE THE AFFECTED AREA." }];
    expect(repeatsQuote("If the client has not finished physical therapy and does not have medical clearance, we will not train the affected area.", quote)).toBe(true);
    expect(repeatsQuote("Brief breath holds usually go unnoticed, and happen when effort is greatest.", [{ text: "The brief moments of breath holding almost always go unnoticed by the trainee." }])).toBe(false);
  });
});

describe("head office's list (phase 3)", () => {
  it("sends a question the Academy can't answer once, on its own, and says so; never who asked", async () => {
    replies.push({ result: { kind: "not_covered" }, error: "" });
    act(() => root.render(<AskAnswer studioId="solon" question="The leg press squeaks" onBack={() => {}} onOpenQuote={() => {}} />));
    await flush();
    expect(text()).toContain("Sent to head office's list.");
    expect(sent).toEqual([expect.objectContaining({ question: "The leg press squeaks", reason: "not_covered", studioId: "solon", mark: "open" })]);
    expect(Object.keys(sent[0])).not.toContain("uid");
  });

  it("changes the line when the list refuses it", async () => {
    sendOk = false;
    replies.push({ result: { kind: "conflicting" }, error: "" });
    act(() => root.render(<AskAnswer studioId="solon" question="Two pages" onBack={() => {}} onOpenQuote={() => {}} />));
    await flush();
    await flush();
    expect(text()).toContain("Couldn't reach head office's list.");
  });

  it("flags a wrong answer with the reason, or with none", async () => {
    replies.push({ result: breathing, error: "" });
    act(() => root.render(<AskAnswer studioId="solon" question="Breath?" onBack={() => {}} onOpenQuote={() => {}} />));
    await flush();
    act(() => button("This answer is wrong").click());
    const box = host.querySelector("#aa-why") as HTMLTextAreaElement;
    expect(box).not.toBeNull();
    act(() => button("Send to head office").click());
    await flush();
    expect(text()).toContain("Sent to head office. Thank you.");
    expect(sent).toEqual([expect.objectContaining({ reason: "flagged", question: "Breath?", answer: expect.stringContaining("Breathe freely throughout the set.") })]);
    expect("why" in sent[0]).toBe(false);
  });

  it("keeps Demo Mode's practice off the list, with no link to flag", async () => {
    replies.push({ result: { kind: "not_covered" }, error: "" });
    act(() => root.render(<AskAnswer studioId="demo-studio" question="Practice question" onBack={() => {}} onOpenQuote={() => {}} />));
    await flush();
    expect(sent).toHaveLength(0);
    expect(text()).not.toContain("Sent to head office");
  });
});
