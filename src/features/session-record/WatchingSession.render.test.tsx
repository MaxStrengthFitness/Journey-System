// @vitest-environment jsdom
/**
 * The watching screen, MOUNTED (the sessions round, Oct 12 2026): a
 * colleague's session keeps Take over; the trainer's own session on another
 * device has Continue on this iPad, asked from its button while the other
 * device saved a moment ago, and asked at once when it has gone quiet. The
 * safe answer, watching, is always the default.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../components/ActiveSessionTimer", () => ({ ActiveSessionTimer: () => null }));

import { WatchingSession } from "./WatchingSession";
import { continueHereWords, takeOverWords, watchWords } from "./watch";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; host: HTMLElement }> = [];

afterEach(() => {
  for (const m of mounted) {
    act(() => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  mounted.push({ root, host });
  return host;
}

const base = {
  clientName: "Judy Daus",
  sessionTag: "#12",
  runnerInitials: "AJ",
  startedLabel: "2:00 PM",
  timer: { startTime: null },
  done: 2,
  total: 6,
};

const button = (label: string) =>
  Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === label) ?? null;

describe("WatchingSession", () => {
  it("a colleague's session: Take over, and no Continue", () => {
    mount(
      <WatchingSession
        {...base}
        words={watchWords({ runner: "JC", takenFromHere: false, online: true })}
        takeOver={takeOverWords({ runner: "JC", clientFirstName: "Judy" })}
        onTakeOver={() => {}}
      >
        <div />
      </WatchingSession>,
    );
    expect(button("Take over")).toBeTruthy();
    expect(button("Continue on this iPad")).toBeNull();
  });

  it("the trainer's own session saved a moment ago on another device: watched, Continue on this iPad in blue, asked from the button", () => {
    const onContinue = vi.fn();
    const host = mount(
      <WatchingSession
        {...base}
        words={watchWords({ runner: "AJ", takenFromHere: false, online: true, sameTrainer: true, recentlySaved: true })}
        takeOver={takeOverWords({ runner: "AJ", clientFirstName: "Judy" })}
        onTakeOver={() => {}}
        continueHere={{ words: continueHereWords({ recentlySaved: true, lastSaved: "2:14 PM" }), askNow: false }}
        onContinueHere={onContinue}
      >
        <div />
      </WatchingSession>,
    );
    expect(host.textContent).toContain("This session is open on another device and was saved a moment ago. You're watching it here.");
    expect(button("Take over")).toBeNull();
    const cont = button("Continue on this iPad")!;
    expect(cont.className).toBe("sr-watch__continue");
    // Not asked until the button is tapped.
    expect(document.body.querySelector('[data-testid="leave-confirm"]')).toBeNull();
    act(() => cont.click());
    expect(document.body.textContent).toContain("Continue this session here?");
    // The default (focused, filled) answer is Keep watching.
    const keep = document.body.querySelector('[data-action="keep-editing"]') as HTMLButtonElement;
    expect(keep.textContent).toBe("Keep watching");
    expect(document.activeElement).toBe(keep);
    act(() => keep.click());
    expect(onContinue).not.toHaveBeenCalled();
    act(() => button("Continue on this iPad")!.click());
    act(() => (document.body.querySelector('[data-action="leave"]') as HTMLButtonElement).click());
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("quieter than that: asked at once, with when it was last saved, Just watch the default", () => {
    const onContinue = vi.fn();
    mount(
      <WatchingSession
        {...base}
        words={watchWords({ runner: "AJ", takenFromHere: false, online: true, sameTrainer: true, recentlySaved: false })}
        takeOver={null}
        onTakeOver={() => {}}
        continueHere={{ words: continueHereWords({ recentlySaved: false, lastSaved: "2:14 PM" }), askNow: true }}
        onContinueHere={onContinue}
      >
        <div />
      </WatchingSession>,
    );
    expect(document.body.textContent).toContain("It was last saved at 2:14 PM on another device.");
    const watch = document.body.querySelector('[data-action="keep-editing"]') as HTMLButtonElement;
    expect(watch.textContent).toBe("Just watch");
    expect(document.activeElement).toBe(watch);
    act(() => watch.click());
    expect(document.body.querySelector('[data-testid="leave-confirm"]')).toBeNull();
    expect(onContinue).not.toHaveBeenCalled();
    // Asked once: watching now, with the button still there.
    expect(button("Continue on this iPad")).toBeTruthy();
  });
});
