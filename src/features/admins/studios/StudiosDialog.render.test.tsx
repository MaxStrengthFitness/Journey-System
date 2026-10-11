// @vitest-environment jsdom
/**
 * WHERE A PERSON WORKS MOUNTS — a studio's Team on the Admins dashboard: the
 * Studios button on each row, giving someone a second studio, taking them off
 * this studio's team, the home studio refused with what to do instead, and
 * only the lists that changed written, then one Activity line per studio.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const writes: Array<{ op: string; path: string; data?: unknown }> = [];

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "adm" } }, functions: {} }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));
vi.mock("../../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "westlake",
    activeStudio: { id: "westlake", name: "Westlake", timezone: "America/New_York" },
    availableStudios: [],
    setActiveStudioId: () => {},
    isChangingStudio: false,
  }),
}));

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => {
    const first = parts[0] as { path?: string } | undefined;
    const base = first && typeof first === "object" && typeof first.path === "string" ? [first.path] : [];
    const path = [...base, ...parts.filter((p) => typeof p === "string")].join("/");
    return { path, id: path.split("/").pop() ?? "id" };
  };
  const emptySnap = { docs: [], size: 0, empty: true, forEach: () => {}, docChanges: () => [], metadata: { fromCache: false } };
  const emptyDoc = { exists: () => false, data: () => undefined, id: "id", metadata: { fromCache: false } };
  return {
    collection: ref,
    collectionGroup: ref,
    doc: ref,
    query: (q: unknown) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    documentId: () => "__name__",
    onSnapshot: (_t: unknown, a: unknown, b?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      const t = setTimeout(() => next(emptySnap), 0);
      return () => clearTimeout(t);
    },
    getDocs: async () => emptySnap,
    getDoc: async () => emptyDoc,
    getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
    updateDoc: async (r: { path: string }, data: unknown) => void writes.push({ op: "update", path: r.path, data }),
    setDoc: async (r: { path: string }, data: unknown) => void writes.push({ op: "set", path: r.path, data }),
    addDoc: async (r: { path: string }, data: unknown) => {
      writes.push({ op: "add", path: r.path, data });
      return { id: "new" };
    },
    deleteDoc: async () => {},
    arrayUnion: (...v: unknown[]) => ({ union: v }),
    arrayRemove: (...v: unknown[]) => ({ remove: v }),
    serverTimestamp: () => "now",
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
  };
});

import { StudioTeam } from "./StudioTeam";
import { StudiosDialog } from "./StudiosDialog";
import type { Studio, Trainer } from "../../../types";

const tz = "America/New_York";
const studios = [
  { id: "westlake", name: "Westlake", timezone: tz },
  { id: "solon", name: "Solon", timezone: tz },
  { id: "strongsville", name: "Strongsville", timezone: tz },
  { id: "demo-studio", name: "Demo Studio", timezone: tz, isDemo: true },
] as unknown as Studio[];
const admin = { id: "adm", fullName: "Ada Admin", initials: "AA", role: "Admin", primaryHomeStudioId: "westlake", accessibleStudioIds: [], activeGuestStudioIds: [] } as unknown as Trainer;
const glorfindel = { id: "glo", fullName: "Glorfindel", initials: "GL", role: "StudioLeader", primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"], activeGuestStudioIds: [] } as unknown as Trainer;
const beregond = {
  id: "ber",
  fullName: "Beregond",
  initials: "BE",
  role: "LifeTransformer",
  primaryHomeStudioId: "solon",
  accessibleStudioIds: ["solon", "westlake"],
  activeGuestStudioIds: [],
  managedStudioIds: ["westlake"],
} as unknown as Trainer;
const trainers = [admin, glorfindel, beregond];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  writes.length = 0;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const settle = async (ms = 20) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

async function mount(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<StrictMode>{node}</StrictMode>);
  });
  await settle();
  return host;
}

async function click(el: Element | null | undefined) {
  expect(el, "element to click").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

async function choose(select: HTMLSelectElement | null, value: string) {
  expect(select, "select").toBeTruthy();
  await act(async () => {
    select!.value = value;
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const button = (el: ParentNode, text: string) => [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim() === text);
const dialogFor = (name: string) => document.querySelector<HTMLElement>(`[role="alertdialog"][aria-label="Where ${name} works and what they own"]`)!;

const team = (onSaved = vi.fn()) => (
  <StudioTeam studio={studios[0]} studios={studios} trainers={trainers} clients={[]} authTrainer={admin} onRolesChanged={onSaved} />
);

describe("Studios on a studio's Team", () => {
  it("is on every row, yours included, beside Change role", async () => {
    const el = await mount(team());
    expect(el.querySelector('[aria-label="Studios: Ada Admin"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Studios: Beregond"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Change role: Beregond"]')).not.toBeNull();
  });

  it("takes someone off this studio's team: also-works-at and the grant come off, home stays, then the record", async () => {
    const saved = vi.fn();
    const el = await mount(team(saved));
    await click(el.querySelector('[aria-label="Studios: Beregond"]'));
    const dialog = dialogFor("Beregond");
    expect(dialog.textContent).toContain("Home studio: Solon.");
    expect(dialog.textContent).toContain("Westlakealso works there");
    // Demo Mode is never offered; the home studio isn't either.
    const options = [...dialog.querySelectorAll<HTMLOptionElement>("#hq-studio-add option")].map((o) => o.value);
    expect(options).toEqual(["", "strongsville"]);
    expect(button(dialog, "Save studios")!.disabled).toBe(true);

    await click(button(dialog, "Take off Westlake's team"));
    expect(dialog.textContent).toContain("Beregond comes off the team at Westlake, and no longer helps run it.");
    expect(dialog.textContent).toContain("Nothing they did there is deleted");
    await click(button(dialog, "Save studios"));

    expect(writes[0]).toEqual({
      op: "update",
      path: "trainers/ber",
      data: { accessibleStudioIds: { remove: ["westlake"] }, managedStudioIds: { remove: ["westlake"] } },
    });
    expect(writes[1]).toMatchObject({
      op: "add",
      path: "activity",
      data: { studioId: "westlake", kind: "assisted-change", what: "Took Beregond off Westlake's team.", by: { uid: "adm", name: "Ada Admin" } },
    });
    expect(writes).toHaveLength(2);
    expect(saved).toHaveBeenCalled();
    expect(document.querySelector('[aria-label="Where Beregond works and what they own"]')).toBeNull();
  });

  it("gives someone a second studio, written as that one studio added", async () => {
    const el = await mount(team());
    await click(el.querySelector('[aria-label="Studios: Glorfindel"]'));
    const dialog = dialogFor("Glorfindel");
    expect(dialog.textContent).toContain("Home studio only.");
    await choose(dialog.querySelector<HTMLSelectElement>("#hq-studio-add"), "solon");
    await click(button(dialog, "Add"));
    expect(dialog.textContent).toContain("Solonto add");
    expect(dialog.textContent).toContain("Glorfindel joins the team at Solon");
    await click(button(dialog, "Save studios"));
    expect(writes[0]).toEqual({ op: "update", path: "trainers/glo", data: { accessibleStudioIds: { union: ["solon"] } } });
    expect(writes[1]).toMatchObject({ path: "activity", data: { studioId: "solon", what: "Added Glorfindel to Solon's team: also works there." } });
  });

  it("never takes the home studio away, and says what to do instead", async () => {
    const el = await mount(team());
    await click(el.querySelector('[aria-label="Studios: Glorfindel"]'));
    const dialog = dialogFor("Glorfindel");
    expect(button(dialog, "Take off Westlake's team")).toBeUndefined();
    expect(dialog.textContent).toContain("Westlake is Glorfindel's home studio, so it can't be taken away here");
    expect(dialog.textContent).toContain("Operations → Setup → People & access");
  });

  it("closes on Cancel without a write", async () => {
    const el = await mount(team());
    await click(el.querySelector('[aria-label="Studios: Beregond"]'));
    const dialog = dialogFor("Beregond");
    await click(dialog.querySelector('[aria-label="Take Beregond off Westlake\'s team"]'));
    await click(button(dialog, "Cancel"));
    expect(document.querySelector('[aria-label="Where Beregond works and what they own"]')).toBeNull();
    expect(writes).toEqual([]);
  });
});

/*
 * OWNS THIS STUDIO (the franchise partition, Oct 2026). The one control that
 * makes a studio a franchise owner's: offered for a role that runs its own
 * studios, never at their home, held until Save, and written in the same
 * update as "Also works at" when owning brings them to work there.
 */
describe("Owns, in the same dialog", () => {
  const olive = {
    id: "oli",
    fullName: "Olive Owner",
    initials: "OO",
    role: "FranchiseOwner",
    primaryHomeStudioId: "solon",
    accessibleStudioIds: ["solon"],
    activeGuestStudioIds: ["westlake"],
  } as unknown as Trainer;
  const dialog = (person: Trainer, onSaved = vi.fn(), studio = studios[0]) => (
    <StudiosDialog person={person} studio={studio} studios={studios} byName="Ada Admin" onClose={() => {}} onSaved={onSaved} />
  );
  const ownsBox = (el: ParentNode) =>
    [...el.querySelectorAll<HTMLLabelElement>("label.hq-sheet__check")].find((l) => (l.textContent ?? "").startsWith("Owns"))?.querySelector("input") ?? null;

  it("offers Owns to a franchise owner, not to a Life Transformer, and not at their home studio", async () => {
    await mount(dialog(olive));
    expect(dialogFor("Olive Owner").textContent).toContain("Owns Westlake");
    expect(ownsBox(dialogFor("Olive Owner"))).not.toBeNull();
    act(() => root?.unmount());
    host?.remove();

    await mount(dialog(beregond));
    expect(ownsBox(dialogFor("Beregond"))).toBeNull();
    expect(dialogFor("Beregond").textContent).toContain("Owning a studio counts for a Franchise Owner or a studio leader role");
    act(() => root?.unmount());
    host?.remove();

    await mount(dialog(olive, vi.fn(), studios[1]));
    expect(ownsBox(dialogFor("Olive Owner"))).toBeNull();
    expect(dialogFor("Olive Owner").textContent).toContain("Their home studio: they run it already.");
  });

  it("writes ownedStudioIds and Also works at together, both arrayUnion, for someone not yet working there, then the record", async () => {
    const saved = vi.fn();
    await mount(dialog(olive, saved));
    const d = dialogFor("Olive Owner");
    await click(ownsBox(d));
    expect(d.textContent).toContain("Olive Owner will run Westlake");
    expect(d.textContent).toContain("Westlake is added to where they work, so they can see its cross-train visitors.");
    await click(button(d, "Save studios"));
    expect(writes[0]).toEqual({
      op: "update",
      path: "trainers/oli",
      data: { accessibleStudioIds: { union: ["westlake"] }, ownedStudioIds: { union: ["westlake"] } },
    });
    const grant = writes.find((w) => w.path === "activity" && (w.data as { kind?: string }).kind === "admin-grant");
    expect(grant).toMatchObject({
      data: { studioId: "westlake", what: "Made Olive Owner an owner of Westlake: they run it as its leaders do." },
    });
    expect(saved).toHaveBeenCalled();
  });

  it("writes only ownedStudioIds when they already work there", async () => {
    const working = { ...olive, accessibleStudioIds: ["solon", "westlake"], activeGuestStudioIds: [] } as unknown as Trainer;
    await mount(dialog(working));
    const d = dialogFor("Olive Owner");
    await click(ownsBox(d));
    await click(button(d, "Save studios"));
    expect(writes[0]).toEqual({ op: "update", path: "trainers/oli", data: { ownedStudioIds: { union: ["westlake"] } } });
  });

  it("takes ownership off, leaving Also works at, and says they still work there", async () => {
    const owning = { ...olive, accessibleStudioIds: ["solon", "westlake"], activeGuestStudioIds: [], ownedStudioIds: ["westlake", "strongsville"] } as unknown as Trainer;
    await mount(dialog(owning));
    const d = dialogFor("Olive Owner");
    expect(d.textContent).toContain("Also owns Strongsville.");
    expect(ownsBox(d)!.checked).toBe(true);
    await click(ownsBox(d));
    expect(d.textContent).toContain("Olive Owner no longer runs Westlake. Nothing they did there is deleted.");
    expect(d.textContent).toContain("They still work at Westlake (Also works at, above)");
    await click(button(d, "Save studios"));
    expect(writes[0]).toEqual({ op: "update", path: "trainers/oli", data: { ownedStudioIds: { remove: ["westlake"] } } });
  });
});

/*
 * CHANGE ROLE TAKES OWNERSHIP OFF WITH A DEMOTION (the franchise partition,
 * Oct 2026, review fix): one write, said before Save, and in the record.
 */
describe("Change role on an owner", () => {
  it("clears ownedStudioIds in the same write when the new role doesn't run studios", async () => {
    const olive = {
      id: "oli",
      fullName: "Olive Owner",
      initials: "OO",
      role: "FranchiseOwner",
      primaryHomeStudioId: "westlake",
      accessibleStudioIds: ["westlake"],
      activeGuestStudioIds: [],
      ownedStudioIds: ["solon", "strongsville"],
    } as unknown as Trainer;
    const el = await mount(
      <StudioTeam studio={studios[0]} studios={studios} trainers={[admin, olive]} clients={[]} authTrainer={admin} onRolesChanged={vi.fn()} />,
    );
    expect(el.textContent).not.toContain("Runs only their home studio until you mark the studios they own");
    await click(el.querySelector('[aria-label="Change role: Olive Owner"]'));
    const d = document.querySelector<HTMLElement>('[role="alertdialog"][aria-label="Change Olive Owner\'s role"]')!;
    await choose(d.querySelector<HTMLSelectElement>("#hq-role-choice"), "LifeTransformer");
    expect(d.textContent).toContain("Olive Owner owns 2 studios.");
    expect(d.textContent).toContain("so Journey takes those off: Solon, Strongsville.");
    await click(button(d, "Save the role"));
    expect(writes[0]).toEqual({ op: "update", path: "trainers/oli", data: { role: "LifeTransformer", ownedStudioIds: [] } });
    expect(writes[1]).toMatchObject({ path: "activity", data: { before: { Owns: "Solon, Strongsville" }, after: { Owns: "none" } } });
  });

  it("tells an administrator when a franchise owner owns nothing yet", async () => {
    const fresh = {
      id: "new",
      fullName: "Fran Fresh",
      initials: "FF",
      role: "FranchiseOwner",
      primaryHomeStudioId: "westlake",
      accessibleStudioIds: ["westlake"],
      activeGuestStudioIds: [],
    } as unknown as Trainer;
    const el = await mount(
      <StudioTeam studio={studios[0]} studios={studios} trainers={[admin, fresh]} clients={[]} authTrainer={admin} onRolesChanged={vi.fn()} />,
    );
    expect(el.textContent).toContain("Runs only their home studio until you mark the studios they own (Studios, on their row).");
  });
});
