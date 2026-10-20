// @vitest-environment jsdom
/**
 * The Now Bar's own number pad, MOUNTED (the Now Bar pad round, Oct 20 2026;
 * AJ: "i hate the keyboard on devices ... use our own keyboard so the screen
 * stops getting pushed around"). The fields never raise the iPad's keyboard;
 * a tap opens the pad over the bottom bar, the first key replaces the
 * number, Switch walks weight → reps, and Done leaves the field, which sends
 * what was typed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SessionNowBar } from "./SessionNowBar";
import type { JourneyRow, LiveSet } from "./types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const legPress: JourneyRow = {
  machine: { id: "leg_press", name: "LEG PRESS", group: "Lower Body" },
  sets: {},
  prescribedWeight: 150,
};
const chest: JourneyRow = {
  machine: { id: "chest_press", name: "CHEST PRESS", group: "Push" },
  sets: {},
  prescribedWeight: 80,
};

let root: Root | null = null;
let host: HTMLElement | null = null;

type Props = { row?: JourneyRow; value?: LiveSet; onChange: (id: string, p: Partial<LiveSet>) => void; onCommit?: (id: string) => void };
function render(p: Props) {
  act(() => {
    root!.render(<SessionNowBar row={p.row ?? legPress} value={p.value} history={[]} onChange={p.onChange} onCommit={p.onCommit} />);
  });
}
function mount(p: Props) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  render(p);
  return host;
}

const pad = () => document.querySelector<HTMLElement>('[data-testid="now-pad"]');
const key = (label: string) =>
  Array.from(pad()!.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label,
  )!;
const press = (label: string) => act(() => key(label).click());

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("The Now Bar's number pad", () => {
  it("never raises the iPad's keyboard: every field the pad types into says inputMode none", () => {
    const el = mount({ onChange: vi.fn() });
    const fields = el.querySelectorAll<HTMLInputElement>(".jg-nb__weight, .jg-nb__outin");
    expect(fields.length).toBe(2);
    fields.forEach((f) => expect(f.getAttribute("inputmode")).toBe("none"));
    expect(pad()).toBeNull();
  });

  it("opens on a tap of the weight, on the page itself (over the bottom bar), and the first key replaces the number", () => {
    const onChange = vi.fn();
    const el = mount({ onChange });
    const weight = el.querySelector<HTMLInputElement>(".jg-nb__weight")!;
    act(() => weight.focus());
    expect(pad()).not.toBeNull();
    expect(pad()!.parentElement).toBe(document.body);
    expect(pad()!.getAttribute("aria-label")).toBe("Number pad: Weight");

    press("5");
    expect(onChange).toHaveBeenLastCalledWith("leg_press", { weight: 5 });
    press("0");
    expect(onChange).toHaveBeenLastCalledWith("leg_press", { weight: 50 });
    expect(weight.value).toBe("50");
    press("Point");
    press("5");
    expect(onChange).toHaveBeenLastCalledWith("leg_press", { weight: 50.5 });
  });

  it("walks from the weight to the reps, which take no point, and types the count", () => {
    const onChange = vi.fn();
    const el = mount({ onChange });
    act(() => el.querySelector<HTMLInputElement>(".jg-nb__weight")!.focus());
    press("Go to Reps");
    const reps = el.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]')!;
    expect(document.activeElement).toBe(reps);
    expect(pad()!.getAttribute("aria-label")).toBe("Number pad: Reps");
    expect(Array.from(pad()!.querySelectorAll("button")).some((b) => b.getAttribute("aria-label") === "Point")).toBe(false);

    press("1");
    press("2");
    expect(onChange).toHaveBeenLastCalledWith("leg_press", { reps: 12 });
    press("Backspace");
    expect(onChange).toHaveBeenLastCalledWith("leg_press", { reps: 1 });
  });

  it("Done leaves the field: what was typed is sent, and the pad closes", () => {
    const onCommit = vi.fn();
    const el = mount({ onChange: vi.fn(), onCommit });
    act(() => el.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]')!.focus());
    press("1");
    press("Done");
    expect(onCommit).toHaveBeenCalledWith("leg_press");
    expect(pad()).toBeNull();
  });

  it("closes when the trainer moves to another machine, sending what was typed", () => {
    const onCommit = vi.fn();
    const el = mount({ onChange: vi.fn(), onCommit });
    act(() => el.querySelector<HTMLInputElement>(".jg-nb__weight")!.focus());
    expect(pad()).not.toBeNull();
    render({ row: chest, onChange: vi.fn(), onCommit });
    expect(pad()).toBeNull();
    expect(onCommit).toHaveBeenCalled();
  });

  it("goes with the count field when the set becomes Practice", () => {
    const el = mount({ onChange: vi.fn() });
    act(() => el.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]')!.focus());
    expect(pad()).not.toBeNull();
    render({ value: { weight: 150, reps: null, seconds: null, isTSC: false, quality: null, outcome: "practice" }, onChange: vi.fn() });
    expect(pad()).toBeNull();
  });

  it("a hardware keyboard still types into the field", () => {
    const onChange = vi.fn();
    const el = mount({ onChange });
    const reps = el.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]')!;
    act(() => reps.focus());
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(reps, "9");
      reps.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith("leg_press", { reps: 9 });
    press("0");
    expect(onChange).toHaveBeenLastCalledWith("leg_press", { reps: 90 });
  });
});
