// @vitest-environment jsdom
/**
 * "Booked here, filed at another studio", MOUNTED (Oct 20 2026): drawn only
 * when there is someone to move, it asks twice before filing her, and a
 * refusal from the server is shown, not swallowed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hook = vi.hoisted(() => ({ value: { notices: [] as unknown[], truncated: false, loading: false, failed: false, move: vi.fn(async (_id: string): Promise<string | null> => null) } }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("./useHomeStudioNotices", () => ({ useHomeStudioNotices: () => hook.value }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => toast }));

import { HomeStudioNotice } from "./HomeStudioNotice";
import type { Trainer } from "../../types";

const STRONG = "BVDDRe5AqQZFihRLW0vK";
const leader = { id: "t1", fullName: "L", initials: "L", role: "HeadTrainer", primaryHomeStudioId: STRONG } as Trainer;
const trainer = { ...leader, role: "LifeTransformer" } as Trainer;
const meg = { clientId: "100005050", name: "Meg Pauly", here: 4, lastAt: "2026-10-18T15:00:00.000Z", homeStudioId: "w", homeStudioName: "westlake" };

let root: Root | null = null;
function mount(t: Trainer) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<HomeStudioNotice studioId={STRONG} studioName="Strongsville Ohio" authTrainer={t} tz="America/New_York" />));
  return host;
}
const press = (host: HTMLElement, label: RegExp) => {
  const b = [...host.querySelectorAll("button")].find((x) => label.test(x.textContent ?? ""));
  if (!b) throw new Error(`no button ${label}`);
  return act(async () => {
    b.click();
  });
};

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
  hook.value = { notices: [], truncated: false, loading: false, failed: false, move: vi.fn(async () => null) };
  toast.success.mockClear();
  toast.error.mockClear();
});

describe("HomeStudioNotice", () => {
  it("draws nothing when there is no one to move, or the read failed", () => {
    expect(mount(leader).innerHTML).toBe("");
    act(() => root?.unmount());
    hook.value = { ...hook.value, failed: true };
    expect(mount(leader).innerHTML).toBe("");
  });

  it("draws nothing for a trainer who cannot move anyone", () => {
    hook.value = { ...hook.value, notices: [meg] };
    expect(mount(trainer).innerHTML).toBe("");
  });

  it("names her and where she is filed, then asks twice before moving", async () => {
    hook.value = { ...hook.value, notices: [meg] };
    const host = mount(leader);
    expect(host.textContent).toContain("Booked here, filed at another studio: 1");
    await press(host, /^Show$/);
    expect(host.textContent).toContain("Meg Pauly");
    expect(host.textContent).toContain("Filed at westlake. 4 bookings here lately");
    await press(host, /Move to Strongsville Ohio/);
    expect(hook.value.move).not.toHaveBeenCalled();
    await press(host, /Yes, file her at Strongsville Ohio/);
    expect(hook.value.move).toHaveBeenCalledWith("100005050");
    expect(toast.success).toHaveBeenCalledWith("Meg Pauly is now filed at Strongsville Ohio.");
  });

  it("shows the server's refusal instead of a success", async () => {
    hook.value = { ...hook.value, notices: [meg], move: vi.fn(async () => "She also trains at the studio she is filed at.") };
    const host = mount(leader);
    await press(host, /^Show$/);
    await press(host, /Move to/);
    await press(host, /Yes, file her/);
    expect(toast.error).toHaveBeenCalledWith("She also trains at the studio she is filed at.");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
