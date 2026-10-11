// @vitest-environment jsdom
/**
 * THE STUDIO DETAILS FORM, READ ONLY, NEVER ASKS MINDBODY (the voice review
 * notes, Sep 28 2026).
 *
 * My Studio → Studio opened read only to everyone who works at the studio
 * (AJ: "Leaders edit it; trainers can view it read-only"). The form looks up
 * the locations behind the saved Mindbody Site ID each time it opens, and
 * that lookup is a Mindbody call through our server: a leader needs it to
 * verify a changed id, a reader never does. Left alone, every trainer's visit
 * would have cost a call. Mounted for real, because the lookup is an effect
 * behind a debounce that no pure test can see.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const calls: string[] = [];
vi.mock("../../../lib/authed-fetch", () => ({
  authedFetch: async (url: string) => {
    calls.push(url);
    return { ok: true, json: async () => ({ locations: [{ id: "3", name: "Westlake" }] }) };
  },
}));

const { StudioDetailsForm } = await import("./StudioDetailsForm");
import type { Studio } from "../../../types";

const westlake = {
  id: "westlake",
  name: "Westlake",
  ownerId: "o",
  timezone: "America/New_York",
  mindbodySiteId: "29068",
  mindbodyLocationId: "3",
} as unknown as Studio;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(
  canEdit: boolean,
  studio: Studio = westlake,
  extra: { canEditMindbodyLink?: boolean; onSave?: (patch: Record<string, unknown>) => Promise<void> } = {},
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StudioDetailsForm
        studio={studio}
        studios={[studio]}
        onSave={extra.onSave ?? (async () => {})}
        canEdit={canEdit}
        canEditMindbodyLink={extra.canEditMindbodyLink}
      />,
    );
  });
  // Past the lookup's 600ms debounce, and the reply after it.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 750));
  });
  return host;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
  calls.length = 0;
});

describe("StudioDetailsForm", () => {
  it("never asks Mindbody for someone who can only read it, and still shows the saved ids", async () => {
    const h = await mount(false);
    expect(calls).toEqual([]);
    expect(h.textContent).toContain("Only this studio's leaders and administrators can change these details.");
    expect(h.textContent).toContain("The Mindbody site this studio's bookings come from.");
    const values = [...h.querySelectorAll("input")].map((i) => i.value);
    expect(values).toContain("29068");
    expect(values).toContain("3");
    // Locked: every field sits inside the disabled fieldset.
    expect(h.querySelector("fieldset")?.disabled).toBe(true);
  });

  it("asks Mindbody for a leader, who may change the Site ID (the lookup still works where it is needed)", async () => {
    await mount(true);
    expect(calls).toEqual(["/api/mindbody/locations"]);
  });

  /*
   * The cutover hint says what the date turns on (Oct 10 2026). It used to say
   * every client read as unknown until it was set, which stopped being true on
   * Sep 26 2026, when coverage came from Mindbody's visit count.
   */
  it("says what the cutover date turns on: every session logged in Journey, packages refreshed each night", async () => {
    const unset = await mount(false);
    expect(unset.textContent).toContain(
      "The day this studio moves onto Journey. From then on every session must be logged in Journey, and each night Journey refreshes the studio's packages from Mindbody.",
    );
    expect(unset.textContent).not.toContain("reads as unknown");
    await act(async () => root!.unmount());
    host?.remove();
    root = null;

    const set = await mount(false, { ...westlake, journeyCutoverDate: "2026-10-20" } as Studio);
    expect(set.textContent).toContain(
      "From this day every session here must be logged in Journey, and each night Journey refreshes this studio's packages from Mindbody. A booking nobody logged no longer counts as a visit.",
    );
  });
});

/*
 * THE MINDBODY LINK IS HEAD OFFICE'S (the franchise partition, Oct 2026). The
 * proxy scopes a leader or an owner to the Mindbody sites of the studios they
 * run, so a leader who could repoint the site could reach any site: My Studio
 * shows the Site ID and location locked to them, makes no lookup, and never
 * sends the two fields.
 */
describe("StudioDetailsForm: the Mindbody link", () => {
  const typeInto = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const inputWith = (h: HTMLElement, value: string) => [...h.querySelectorAll("input")].find((i) => i.value === value)!;

  it("shows a leader the Site ID and location locked, and asks Mindbody nothing", async () => {
    const h = await mount(true, westlake, { canEditMindbodyLink: false });
    expect(calls).toEqual([]);
    expect(h.textContent).toContain("Head office sets the Mindbody link (Admins → Studios).");
    const site = inputWith(h, "29068");
    const location = inputWith(h, "3");
    expect(site.closest("fieldset")?.disabled).toBe(true);
    expect(location.closest("fieldset")?.disabled).toBe(true);
    // The rest of the form stays the leader's.
    expect((h.querySelector("#studio-name") as HTMLInputElement).closest("fieldset")?.disabled).toBe(false);
  });

  it("never sends the two fields from a leader's save", async () => {
    const saved: Record<string, unknown>[] = [];
    const h = await mount(true, westlake, { canEditMindbodyLink: false, onSave: async (p) => void saved.push(p) });
    await typeInto(h.querySelector("#studio-name") as HTMLInputElement, "Westlake North");
    await act(async () => {
      [...h.querySelectorAll("button")].find((b) => /^Save/.test(b.textContent ?? ""))!.click();
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: "Westlake North" });
    expect(saved[0]).not.toHaveProperty("mindbodySiteId");
    expect(saved[0]).not.toHaveProperty("mindbodyLocationId");
  });

  it("lets an administrator change them, and looks the site up", async () => {
    const h = await mount(true, westlake, { canEditMindbodyLink: true });
    expect(calls).toEqual(["/api/mindbody/locations"]);
    expect(inputWith(h, "29068").closest("fieldset")?.disabled).toBe(false);
    expect(h.textContent).not.toContain("Head office sets the Mindbody link");
  });

  it("keeps Demo Mode's studio at offline for anyone but head office", async () => {
    const demo = { id: "demo-studio", name: "Demo Mode", isDemo: true, timezone: "America/New_York", mindbodyMode: "offline" } as unknown as Studio;
    const h = await mount(true, demo, { canEditMindbodyLink: false });
    expect(h.textContent).toContain("The practice studio stays off Mindbody.");
    const mode = [...h.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "offline"))!;
    expect(mode.disabled).toBe(true);
    expect(mode.value).toBe("offline");
  });
});
