// @vitest-environment jsdom
/**
 * The unfinished-session notice, MOUNTED (Sep 24 2026): an abandoned
 * session is said out loud on the profile. Since the sessions round (Oct 12
 * 2026; AJ: "Anyone can clear a session") it has Resume or finish beside
 * Discard, and a session left at another studio is described with no
 * buttons.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StaleSessionNotice } from "./StaleSessionNotice";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(ui));
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

const yesterdays = {
  id: "sess-yesterday",
  status: "In-Progress",
  date: "2026-09-23",
  trainerInitials: "JC",
  startTime: new Date("2026-09-23T13:04:00Z"), // 9:04 AM Eastern
};

const button = (host: HTMLElement, label: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => (b.textContent ?? "").includes(label));

describe("StaleSessionNotice", () => {
  it("says when and by whom the session started, once", async () => {
    const host = await mount(
      <StaleSessionNotice session={yesterdays} todayKey="2026-09-24" onResume={() => {}} onDiscard={() => {}} />,
    );
    const text = host.querySelector("p")?.textContent ?? "";
    expect(text).toBe("Unfinished session · Started yesterday at 9:04 AM by JC.");
    // "Unfinished" is said once (the review, L28).
    expect(text.match(/nfinished/g)?.length).toBe(1);
  });

  it("Resume or finish and Discard hand the choice up — the notice deletes nothing itself", async () => {
    const onResume = vi.fn();
    const onDiscard = vi.fn();
    const host = await mount(
      <StaleSessionNotice session={yesterdays} todayKey="2026-09-24" onResume={onResume} onDiscard={onDiscard} />,
    );
    const resume = button(host, "Resume or finish")!;
    const discard = button(host, "Discard it")!;
    // iPad-first: nothing tappable under 40px, and the words wrap rather than clip.
    for (const b of [resume, discard]) {
      expect(b.className).toContain("min-h-10");
      expect(b.className).not.toMatch(/\btruncate\b|whitespace-nowrap/);
    }
    await act(async () => resume.click());
    expect(onResume).toHaveBeenCalledTimes(1);
    await act(async () => discard.click());
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("describes a session left at another studio, with no buttons", async () => {
    const host = await mount(
      <StaleSessionNotice
        session={yesterdays}
        todayKey="2026-09-24"
        onResume={() => {}}
        onDiscard={() => {}}
        elsewhereStudioName="Solon"
      />,
    );
    expect(host.querySelector("p")?.textContent).toBe(
      "Unfinished session · Left open at Solon · Started yesterday at 9:04 AM by JC.",
    );
    expect(host.querySelectorAll("button").length).toBe(0);
  });
});
