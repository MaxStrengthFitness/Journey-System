// @vitest-environment jsdom
/**
 * ADMINS → WAITING TO BE LET IN, MOUNTED (Oct 16 2026).
 *
 *   · every studio's pending sign-ups on one list, the studio beside the name;
 *   · it says it is checking until the requests are read, never "nobody";
 *   · a tap opens the same approval editor as People & access, starting at
 *     the studio they asked for;
 *   · no Mindbody call: no studio is picked, so the staff list is never fetched.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "u-admin" } }, functions: {} }));

const fake = vi.hoisted(() => ({
  requests: [] as { id: string; data: Record<string, unknown> }[],
  fetches: 0,
  answer: true,
}));

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    collection: ref,
    doc: ref,
    query: (q: unknown) => q,
    where: () => ({}),
    onSnapshot: (_target: unknown, next: (s: unknown) => void) => {
      if (!fake.answer) return () => {};
      const docs = fake.requests.map((r) => ({ id: r.id, data: () => r.data }));
      const t = setTimeout(() => next({ docs }), 0);
      return () => clearTimeout(t);
    },
    setDoc: async () => {},
    updateDoc: async () => {},
    arrayUnion: (...v: unknown[]) => v,
    arrayRemove: (...v: unknown[]) => v,
  };
});

vi.mock("../../../lib/authed-fetch", () => ({
  authedFetch: async () => {
    fake.fetches += 1;
    return { ok: true, json: async () => ({ staff: [] }) };
  },
}));

vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));

import type { Studio, Trainer } from "../../../types";
import { WaitingPage } from "./WaitingPage";

const studios = [
  { id: "solon", name: "Solon", mindbodySiteId: "5746957" },
  { id: "strongsville", name: "Strongsville", mindbodySiteId: "29068" },
] as Studio[];

const admin = {
  id: "u-admin",
  authUid: "u-admin",
  fullName: "Ada Admin",
  initials: "AA",
  role: "Admin",
  primaryHomeStudioId: "strongsville",
  accessibleStudioIds: ["strongsville"],
  activeGuestStudioIds: [],
} as unknown as Trainer;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <WaitingPage authTrainer={admin} trainers={[admin]} studios={studios} />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  fake.requests = [];
  fake.fetches = 0;
  fake.answer = true;
});

describe("Waiting to be let in", () => {
  it("lists every studio's requests with the studio beside each name, and calls Mindbody for nothing", async () => {
    fake.requests = [
      { id: "r1", data: { status: "Pending", fullName: "Nia New", email: "nia@x.com", userId: "u-nia", requestedStudioId: "solon" } },
      { id: "r2", data: { status: "Pending", fullName: "Zoe Zed", email: "zoe@x.com", userId: "u-zoe", requestedStudioId: "strongsville" } },
    ];
    const el = await mount();
    const rows = [...el.querySelectorAll('[data-testid="waiting-row"]')];
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining("Nia New"), expect.stringContaining("Zoe Zed")]);
    expect(rows[0].textContent).toContain("Solon");
    expect(rows[1].textContent).toContain("Strongsville");
    expect(el.textContent).toContain("2 people waiting");
    expect(fake.fetches).toBe(0);
  });

  it("says it is checking until the requests are read, never that nobody waits", async () => {
    fake.answer = false;
    const el = await mount();
    expect(el.textContent).toContain("Checking");
    expect(el.textContent).not.toContain("Nobody is waiting");
  });

  it("says nobody is waiting once the read answers empty", async () => {
    const el = await mount();
    expect(el.textContent).toContain("Nobody is waiting");
  });

  it("opens the approval editor at the studio they asked for", async () => {
    fake.requests = [{ id: "r1", data: { status: "Pending", fullName: "Nia New", email: "nia@x.com", userId: "u-nia", requestedStudioId: "solon" } }];
    const el = await mount();
    const row = el.querySelector('[data-testid="waiting-row"]') as HTMLButtonElement;
    await act(async () => row.click());
    expect(el.textContent).toContain("Approve");
    const home = [...el.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "solon"));
    expect(home?.value).toBe("solon");
  });
});
