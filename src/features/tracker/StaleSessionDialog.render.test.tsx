// @vitest-environment jsdom
/**
 * The question before a stale session is carried on with, mounted: its third
 * answer (the Atlas answers, Oct 2 2026), "Finish it as it was".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StaleSessionDialog } from "./StaleSessionDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const session = { id: "s-old", date: "2026-09-29", startTime: new Date(2026, 8, 29, 9, 0) } as never;

async function mount(props: Partial<Parameters<typeof StaleSessionDialog>[0]>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StaleSessionDialog
        open
        clientFirstName="Judy"
        session={session}
        begunMachines={3}
        todayKey="2026-10-02"
        onResume={vi.fn()}
        onStartNew={vi.fn()}
        {...props}
      />,
    );
  });
}
const button = (text: string) => Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === text);

describe("StaleSessionDialog", () => {
  it("asks about an abandoned OPEN session too: no client named, Who's this? still there (the whole-branch review, Oct 9 2026)", async () => {
    const onResume = vi.fn();
    const onStartNew = vi.fn();
    await mount({ clientFirstName: null, begunMachines: null, onResume, onStartNew });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Your open session was never finished");
    expect(text).toContain("Who's this? is still there");
    expect(text).not.toMatch(/profile|null|undefined/);
    expect(button("Finish it as it was")).toBeUndefined();
    await act(async () => button("Resume it")!.click());
    expect(onResume).toHaveBeenCalledTimes(1);
    await act(async () => button("Start a new session")!.click());
    expect(onStartNew).toHaveBeenCalled();
  });

  it("offers Finish it as it was as a third answer, and says what it does", async () => {
    const onFinishAsItWas = vi.fn();
    const onStartNew = vi.fn();
    await mount({ onFinishAsItWas, onStartNew });
    expect(button("Resume it")).toBeTruthy();
    expect(button("Start a new session")).toBeTruthy();
    const finish = button("Finish it as it was")!;
    expect(finish).toBeTruthy();
    // Each answer says what it does beneath it (the sessions round, Oct 12 2026).
    expect(document.body.textContent).toContain("Saved under Tue, Sep 29 as");
    expect(document.body.textContent).toContain("with what was logged.");
    await act(async () => finish.click());
    expect(onFinishAsItWas).toHaveBeenCalledTimes(1);
    expect(onStartNew).not.toHaveBeenCalled();
  });

  it("holds Finish it as it was until the client's machine totals have answered", async () => {
    const onFinishAsItWas = vi.fn();
    await mount({ onFinishAsItWas, finishAsItWasReady: false });
    expect(button("Finish it as it was")).toBeUndefined();
    const waiting = button("Reading the machines…")!;
    expect(waiting).toBeTruthy();
    expect(waiting.disabled).toBe(true);
    await act(async () => waiting.click());
    expect(onFinishAsItWas).not.toHaveBeenCalled();
    // The other two answers never wait.
    expect(button("Resume it")!.disabled).toBe(false);
    expect(button("Start a new session")!.disabled).toBe(false);
  });

  it("keeps the two answers when no host offers the third", async () => {
    await mount({});
    expect(button("Finish it as it was")).toBeUndefined();
    expect(button("Resume it")).toBeTruthy();
  });
});

/* ── Anyone at the studio (the sessions round, Oct 12 2026) ────────────── */
describe("StaleSessionDialog for anyone at the studio", () => {
  const press = async (b: HTMLElement | undefined) => {
    if (!b) throw new Error("button not found");
    await act(async () => b.click());
  };
  const escape = async () => {
    await act(async () => {
      const target = (document.activeElement as HTMLElement | null) ?? document.body;
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
  };

  it("never says \"your\" to someone else, and offers Not now instead of Start a new session", async () => {
    await mount({ clientFirstName: null, begunMachines: 2, mine: false, starterName: "Sam", onNotNow: vi.fn() });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Sam's open session was never finished");
    expect(text).not.toMatch(/your/i);
    expect(text).toContain("2 machines logged");
    expect(button("Not now")).toBeTruthy();
    expect(button("Start a new session")).toBeUndefined();
    expect(text).toContain("Carry on in it. It becomes yours to finish.");
  });

  it("an open session with no name for its trainer: \"An open session was never finished\"", async () => {
    await mount({ clientFirstName: null, begunMachines: null, mine: false, onNotNow: vi.fn() });
    expect(document.body.textContent).toContain("An open session was never finished");
  });

  it("never offers Finish it as it was for an open session, whatever the host passes", async () => {
    await mount({ clientFirstName: null, begunMachines: null, onFinishAsItWas: vi.fn() });
    expect(button("Finish it as it was")).toBeUndefined();
  });

  it("Escape on someone else's session is Not now: nothing starts", async () => {
    const onNotNow = vi.fn();
    const onStartNew = vi.fn();
    await mount({ clientFirstName: null, begunMachines: null, mine: false, onNotNow, onStartNew });
    await escape();
    expect(onNotNow).toHaveBeenCalledTimes(1);
    expect(onStartNew).not.toHaveBeenCalled();
  });

  it("Escape on the trainer's own session is still Start a new session, as before", async () => {
    const onNotNow = vi.fn();
    const onStartNew = vi.fn();
    await mount({ onNotNow, onStartNew });
    await escape();
    expect(onStartNew).toHaveBeenCalledTimes(1);
    expect(onNotNow).not.toHaveBeenCalled();
  });

  it("Discard asks a second time, and only that second Discard discards", async () => {
    const onDiscard = vi.fn();
    await mount({ onDiscard });
    const order = Array.from(document.body.querySelectorAll("button")).map((b) => b.textContent?.trim());
    // Never the first answer, and below Resume.
    expect(order.indexOf("Discard it")).toBeGreaterThan(order.indexOf("Resume it"));
    expect(order[0]).not.toBe("Discard it");
    await press(button("Discard it"));
    expect(onDiscard).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Discard this session?");
    expect(document.body.textContent).toContain("Every set logged in it will be deleted. This can't be undone.");
    await press(button("Keep it"));
    expect(onDiscard).not.toHaveBeenCalled();
    expect(button("Discard it")).toBeTruthy();
    await press(button("Discard it"));
    await press(button("Discard"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("someone else's: checks the session first, says who was last on it today, and \"active\" holds the Discard back", async () => {
    const onDiscard = vi.fn();
    let answer!: (v: "active" | "ok") => void;
    const checkDiscard = vi.fn(() => new Promise<"active" | "ok">((r) => (answer = r)));
    await mount({ mine: false, starterName: "Sam", lastActive: "2:14 PM", onDiscard, checkDiscard, onNotNow: vi.fn() });
    await press(button("Discard it"));
    expect(checkDiscard).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Discard Sam's session?");
    expect(document.body.querySelector('[data-testid="stale-last-on-it"]')!.textContent).toBe(
      "Sam was last on it at 2:14 PM and may still be with the client. Check with Sam first.",
    );
    const checking = button("Checking…")!;
    expect(checking.disabled).toBe(true);
    await act(async () => answer("active"));
    expect(document.body.textContent).toContain("It's been active since you opened this. Check with Sam first.");
    const held = button("Discard")!;
    expect(held.disabled).toBe(true);
    await press(held);
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("someone else's, checked and still left open: the second Discard discards", async () => {
    const onDiscard = vi.fn();
    await mount({ mine: false, starterName: "Sam", onDiscard, checkDiscard: async () => "ok", onNotNow: vi.fn() });
    await press(button("Discard it"));
    expect(document.body.querySelector('[data-testid="stale-last-on-it"]')).toBeNull();
    await press(button("Discard"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("a session at another studio is described, never cleared from here", async () => {
    await mount({ mine: false, starterName: "Sam", leftOpenAt: "Solon", onDiscard: vi.fn(), onFinishAsItWas: vi.fn(), onNotNow: vi.fn() });
    expect(document.body.textContent).toContain("Left open at Solon");
    expect(button("Resume it")).toBeUndefined();
    expect(button("Discard it")).toBeUndefined();
    expect(button("Finish it as it was")).toBeUndefined();
    expect(button("Not now")).toBeTruthy();
  });

  /* The review and attack, Oct 12 2026. */
  it("says Paused or At End Session above Discard, in both questions", async () => {
    await mount({ onDiscard: vi.fn(), quietNote: "Paused since 2:10 PM." });
    expect(document.body.textContent).toContain("Paused since 2:10 PM. Deletes it and every set in it.");
    await press(button("Discard it"));
    expect(document.body.querySelector('[data-testid="stale-quiet-note"]')!.textContent).toBe("Paused since 2:10 PM.");
  });

  it("someone else's session left open today: no Discard, and the words say when and why", async () => {
    const words = "Sam's session can be discarded from tomorrow, in case it was finished on an iPad that's offline. Today it can be resumed or finished as it was.";
    await mount({ mine: false, starterName: "Sam", onDiscard: vi.fn(), onFinishAsItWas: vi.fn(), onNotNow: vi.fn(), discardWaits: words });
    expect(button("Discard it")).toBeUndefined();
    expect(document.body.querySelector('[data-testid="stale-discard-waits"]')!.textContent).toBe(words);
    expect(button("Resume it")).toBeTruthy();
    expect(button("Finish it as it was")).toBeTruthy();
  });
});
