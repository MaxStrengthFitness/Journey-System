// @vitest-environment jsdom
/**
 * The Now Bar's last line, MOUNTED (the Now Bar pad round, Oct 20 2026).
 * Next going round says "Back to"; with every machine done the bar offers
 * End session first, orange, and Add another machine beside it (AJ: "both
 * end session and add machines should pop up in the now bar").
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SessionNowBar, type SessionNowBarProps } from "./SessionNowBar";
import type { JourneyRow } from "./types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row: JourneyRow = {
  machine: { id: "leg_press", name: "LEG PRESS", group: "Lower Body" },
  sets: {},
  prescribedWeight: 150,
};

let root: Root | null = null;
let host: HTMLElement | null = null;
function mount(p: Partial<SessionNowBarProps>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<SessionNowBar row={row} history={[]} onChange={vi.fn()} {...p} />));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("The Now Bar's last line", () => {
  it("says Back to when Next has gone round to a machine above this one", () => {
    const el = mount({ nextName: "CHEST PRESS", nextWraps: true, onNext: vi.fn() });
    expect(el.querySelector(".jg-nb__next")!.textContent).toContain("Back to");
    expect(el.querySelector(".jg-nb__next")!.textContent).toContain("CHEST PRESS");
  });

  it("says Next going forward", () => {
    const el = mount({ nextName: "CHEST PRESS", onNext: vi.fn() });
    expect(el.querySelector(".jg-nb__nextlbl")!.textContent).toBe("Next");
  });

  it("with every machine done, offers End session first and Add another machine beside it", () => {
    const onEndSession = vi.fn();
    const onAddMachine = vi.fn();
    const el = mount({ allDone: true, onEndSession, onAddMachine });
    const done = el.querySelector(".jg-nb__done")!;
    const buttons = Array.from(done.querySelectorAll("button"));
    expect(buttons[0].textContent).toContain("End session");
    expect(buttons[0].className).toBe("jg-nb__finish");
    expect(buttons[1].textContent).toContain("Add another machine");
    act(() => buttons[0].click());
    expect(onEndSession).toHaveBeenCalledTimes(1);
    act(() => buttons[1].click());
    expect(onAddMachine).toHaveBeenCalledTimes(1);
  });

  it("keeps the plan's next machine on offer when every machine is done", () => {
    const el = mount({ allDone: true, onEndSession: vi.fn(), onAddMachine: vi.fn(), planNext: { id: "hip", name: "HIP ABDUCTION" }, onAddPlanned: vi.fn() });
    expect(el.querySelector(".jg-nb__done")!.textContent).toContain("HIP ABDUCTION");
  });

  it("offers no End session until every machine is done", () => {
    const el = mount({ nextName: "CHEST PRESS", onNext: vi.fn(), onEndSession: vi.fn() });
    expect(el.querySelector('[data-testid="nb-end"]')).toBeNull();
  });

  it("End session is the logo orange with navy words, as the session bar's Finish", () => {
    const css = readFileSync(resolve(__dirname, "journey-grid.css"), "utf8");
    const rule = css.match(/\n\.jg-nb__finish \{([^}]*)\}/)![1];
    expect(rule).toContain("background: var(--jg-go)");
    expect(rule).toContain("color: var(--jg-go-on)");
  });
});

describe("Off today: a small button, and a second tap (AJ, Oct 20 2026)", () => {
  it("asks once more before it takes the machine off, and Keep leaves it", () => {
    const onTakeOff = vi.fn();
    const el = mount({ onTakeOff });
    const off = el.querySelector<HTMLButtonElement>('[data-testid="nb-takeoff"]')!;
    expect(off.textContent).toContain("Off today");
    act(() => off.click());
    expect(onTakeOff).not.toHaveBeenCalled();
    expect(el.textContent).toContain("Take off today?");
    const keep = Array.from(el.querySelectorAll("button")).find((b) => b.textContent === "Keep")!;
    act(() => keep.click());
    expect(onTakeOff).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="nb-takeoff"]')).not.toBeNull();

    act(() => el.querySelector<HTMLButtonElement>('[data-testid="nb-takeoff"]')!.click());
    act(() => el.querySelector<HTMLButtonElement>('[data-testid="nb-takeoff-yes"]')!.click());
    expect(onTakeOff).toHaveBeenCalledWith("leg_press");
  });

  it("is not offered once anything is recorded on the machine today, so a set is never taken off with it", () => {
    const withReps = mount({ onTakeOff: vi.fn(), value: { weight: 150, reps: 8, seconds: null, isTSC: false, quality: 2 } });
    expect(withReps.querySelector('[data-testid="nb-takeoff"]')).toBeNull();
    act(() => root?.unmount());
    host?.remove();
    const skipped = mount({ onTakeOff: vi.fn(), value: { weight: 150, reps: null, seconds: null, isTSC: false, quality: null, outcome: "skipped" } });
    expect(skipped.querySelector('[data-testid="nb-takeoff"]')).toBeNull();
  });

  it("is 40px to tap and never crimson", () => {
    // A Windows checkout has CRLF line ends; the patterns below expect LF.
    const css = readFileSync(resolve(__dirname, "journey-grid.css"), "utf8").replace(/\r\n/g, "\n");
    const rule = css.match(/\n\.jg-nb__off,\n\.jg-nb__offbtn \{([^}]*)\}/)![1];
    expect(rule).toContain("min-height: 40px");
    expect(css.match(/\n\.jg-nb__off \{([^}]*)\}/)![1]).not.toContain("q-poor");
  });
});
