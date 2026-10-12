// @vitest-environment jsdom
/**
 * The Client Directory's open sessions left open, MOUNTED (the sessions
 * round, Oct 12 2026; AJ: "Anyone can clear a session"): one bounded server
 * read when the Directory opens, a row per open session left open with
 * Open, and a read the server didn't answer said as "couldn't check", never
 * as none.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import type { RenewalSettingsState } from "../renewals/useRenewalSettings";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "westlake", availableStudios: [] }),
}));
vi.mock("../renewals/useRenewalSettings", async () => {
  const { DEFAULT_RENEWAL_SETTINGS } = await import("../renewals/settings");
  const state: RenewalSettingsState = {
    settings: DEFAULT_RENEWAL_SETTINGS,
    saved: true,
    ownPackageTable: false,
    forStudioId: "westlake",
    loading: false,
    error: null,
  };
  return { useRenewalSettings: () => state };
});
vi.mock("../admin/journey/inactive-store", () => ({
  useInactiveMarks: () => ({ marks: new Map(), loading: false, failed: false }),
}));
vi.mock("../studio-settings/useStudioSettings", async () => {
  const { resolveAll } = await import("../studio-settings/resolve");
  const all = resolveAll({ studio: null, company: null });
  return { useStudioSettings: () => ({ all, loading: false, failed: false, value: (k: keyof typeof all) => all[k].value, source: () => "app", studioValues: null, companyValues: null }) };
});

const fake = vi.hoisted(() => ({
  sessions: [] as Array<Record<string, unknown>>,
  fails: false,
  fromCache: false,
  reads: [] as Array<Array<Record<string, unknown>>>,
}));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    collection: (_db: unknown, path: string) => ({ path }),
    query: (_c: unknown, ...cs: Array<Record<string, unknown>>) => ({ cs }),
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    orderBy: (field: string, dir: string) => ({ orderBy: field, dir }),
    limit: (n: number) => ({ limit: n }),
    getDocsFromServer: async (q: { cs: Array<Record<string, unknown>> }) => {
      fake.reads.push(q.cs);
      if (fake.fails) throw new Error("unavailable");
      const docs = fake.sessions.map((d) => ({ id: String(d.id), data: () => d }));
      return { docs, size: docs.length, empty: docs.length === 0, metadata: { fromCache: fake.fromCache } };
    },
  };
});

import { ClientDirectory } from "./ClientDirectory";
import { NOW, STUDIOS, makeClient } from "./fixtures";
import type { Trainer } from "../../types";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  document.body.innerHTML = "";
});
beforeEach(() => {
  document.body.innerHTML = "";
  fake.sessions = [];
  fake.fails = false;
  fake.fromCache = false;
  fake.reads = [];
});

const ME = { id: "t-me", fullName: "Sam Rivera", primaryHomeStudioId: "westlake" } as unknown as Trainer;
const KIM = { id: "t-kim", fullName: "Kim Lee", primaryHomeStudioId: "westlake" } as unknown as Trainer;

async function mount(onOpenOpenSession?: (id: string, to: string) => void) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <ClientDirectory
          clients={[makeClient({ id: "zp", firstName: "Zelda", lastName: "Price" })]}
          onSelectClient={() => {}}
          onStartOpenSession={() => {}}
          onOpenOpenSession={onOpenOpenSession}
          authTrainer={ME}
          uid="uid-me"
          rosterStatus="ready"
          schedules={[]}
          schedulesFetchedAt={NOW.getTime()}
          sessions={[]}
          sessionsKnown
          trainers={[ME, KIM]}
          studios={STUDIOS as never}
          now={NOW}
        />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host;
}

describe("the Directory's open sessions left open", () => {
  it("lists another trainer's open session left open here, with Open, and reads only this studio's open sessions", async () => {
    fake.sessions = [
      { id: "s-kim", status: "In-Progress", isUnassigned: true, hostedAtStudioId: "westlake", trainerId: "t-kim", trainerInitials: "KL", createdAt: new Date(Date.now() - 3 * 3_600_000), lastHeartbeatAt: new Date(Date.now() - 2 * 3_600_000) },
      { id: "s-live", status: "In-Progress", isUnassigned: true, hostedAtStudioId: "westlake", trainerId: "t-me", createdAt: new Date(), lastHeartbeatAt: new Date() },
    ];
    const opened: unknown[][] = [];
    const host = await mount((...a) => opened.push(a));
    const list = host.querySelector<HTMLElement>(".cd-left-open")!;
    expect(list).not.toBeNull();
    const rows = [...list.querySelectorAll("li")];
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain("Open session · Kim · Left open · last active");
    const where = fake.reads[0].filter((c) => "field" in c).map((c) => [c.field, c.value]);
    expect(where).toEqual([
      ["hostedAtStudioId", "westlake"],
      ["isUnassigned", true],
      ["status", "In-Progress"],
    ]);
    const open = [...rows[0].querySelectorAll("button")].find((b) => b.textContent?.trim() === "Open")!;
    await act(async () => open.click());
    expect(opened).toEqual([["s-kim", "directory"]]);
  });

  it("says it couldn't check, and lists nothing, when the read fails or only the cache answered", async () => {
    fake.fails = true;
    let host = await mount(() => {});
    expect(host.querySelector("[data-testid='left-open-unknown']")?.textContent).toBe("Couldn't check for open sessions nobody finished.");
    expect(host.querySelector(".cd-left-open")).toBeNull();
    document.body.innerHTML = "";
    fake.fails = false;
    fake.fromCache = true;
    fake.sessions = [{ id: "s-kim", status: "In-Progress", isUnassigned: true, hostedAtStudioId: "westlake", trainerId: "t-kim", createdAt: new Date(Date.now() - 3 * 3_600_000) }];
    host = await mount(() => {});
    expect(host.querySelector("[data-testid='left-open-unknown']")).not.toBeNull();
    expect(host.querySelector(".cd-left-open")).toBeNull();
  });

  it("reads nothing without a door", async () => {
    await mount(undefined);
    expect(fake.reads).toEqual([]);
  });
});
