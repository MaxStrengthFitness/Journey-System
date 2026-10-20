// @vitest-environment jsdom
/**
 * THE STAFF EDITOR MOUNTS for a request with no name, and a studio-access
 * request never offers "Approve and create the account". That button writes
 * a whole trainers/{uid}, and the person behind a studio-access request
 * already has one, so approving it would replace their account.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));

const writes: Array<{ path: string; data: Record<string, unknown> }> = [];

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    doc: ref,
    arrayUnion: (...v: unknown[]) => v,
    arrayRemove: (...v: unknown[]) => v,
    setDoc: async (target: { path: string }, data: Record<string, unknown>) => {
      writes.push({ path: target.path, data });
    },
    updateDoc: async (target: { path: string }, data: Record<string, unknown>) => {
      writes.push({ path: target.path, data });
    },
    // A save is one batch since the sign-in email round: each update lands at commit.
    writeBatch: () => {
      const held: Array<{ path: string; data: Record<string, unknown> }> = [];
      return {
        update: (target: { path: string }, data: Record<string, unknown>) => void held.push({ path: target.path, data }),
        commit: async () => void writes.push(...held),
      };
    },
  };
});
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));

import type { Studio } from "../../../types";
import { StaffEditor } from "./StaffEditor";
import { NAME_NOT_GIVEN, buildStaffRoster, type AccessRequest, type StaffRow } from "./roster";

const studios = [
  { id: "westlake", name: "Westlake" },
  { id: "solon", name: "Solon" },
] as Studio[];

const rowFor = (req: AccessRequest): StaffRow =>
  buildStaffRoster({ trainers: [], mindbodyStaff: [], requests: [req], studioId: "westlake" })[0];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(row: StaffRow, extra: Partial<Parameters<typeof StaffEditor>[0]> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <StaffEditor
          row={row}
          studios={studios}
          activeStudioId="westlake"
          assignableRoles={["LifeTransformer", "HeadTrainer", "StudioLeader"]}
          canChangeRole
          lockHomeStudio
          grantStudioId="westlake"
          onDone={() => {}}
          {...extra}
        />
      </StrictMode>,
    );
  });
  return host;
}

const buttons = (el: Element) => [...el.querySelectorAll("button")].map((b) => b.textContent ?? "");

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  writes.length = 0;
});

describe("StaffEditor", () => {
  it("mounts a nameless studio-access request, says what it is, and offers no approval", async () => {
    const el = await mount(
      rowFor({ id: "r1", type: "studio_access", trainerId: "uid-x", studioId: "westlake", status: "Pending" }),
    );
    expect(el.textContent).toContain(NAME_NOT_GIVEN);
    expect(el.textContent).toContain("already has an account");
    expect(el.textContent).toContain("asked to work at Westlake");
    expect(buttons(el).some((b) => b.includes("Approve and create the account"))).toBe(false);
    expect(writes).toEqual([]);
  });

  it("offers the studio tier's roles once each, by name (voice review follow-up, Sep 27 2026)", async () => {
    const el = await mount(
      rowFor({ id: "r3", fullName: "Nia New", email: "nia@example.com", status: "Pending", userId: "uid-nia" }),
    );
    const options = [...el.querySelectorAll("option")].map((o) => o.textContent);
    expect(options.slice(0, 3)).toEqual(["Life Transformer", "Head Trainer", "Studio Leader"]);
    expect(new Set(options).size).toBe(options.length);
    // The grant says what it really opens. Studio is read by everyone who
    // works there since the voice review notes (Sep 28 2026); the grant is
    // what lets someone change it.
    expect(el.textContent).toContain("Opens Team at Westlake, and lets them change its studio settings and machines");
  });

  it("still offers approval for a sign-up", async () => {
    const el = await mount(
      rowFor({ id: "r2", fullName: "Jeff Tomaszewski", email: "jeff@example.com", status: "Pending", userId: "uid-new" }),
    );
    expect(el.textContent).toContain("Jeff Tomaszewski");
    expect(el.textContent).not.toContain("already has an account");
    expect(buttons(el).some((b) => b.includes("Approve and create the account"))).toBe(true);
  });

  it("lets a leader keep a person's full name, email and Mindbody Staff ID, writing only what changed (Oct 2 2026)", async () => {
    const row = buildStaffRoster({
      trainers: [
        {
          id: "uid-sam",
          authUid: "uid-sam",
          fullName: "Sam Lee",
          email: "sam@example.com",
          initials: "SL",
          role: "LifeTransformer",
          primaryHomeStudioId: "westlake",
          accessibleStudioIds: ["westlake"],
          systemStatus: "active",
        } as never,
      ],
      mindbodyStaff: [],
      requests: [],
      studioId: "westlake",
    }).find((r) => r.trainer?.id === "uid-sam")!;
    const el = await mount(row);
    const field = (label: string) =>
      [...el.querySelectorAll(".adm-field")].find((f) => f.querySelector("label")?.textContent?.startsWith(label))?.querySelector("input") as HTMLInputElement;
    const type = async (input: HTMLInputElement, value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    expect(field("Full name").value).toBe("Sam Lee");
    expect(field("Signs in as").value).toBe("sam@example.com");
    await type(field("Full name"), "Samantha Lee");
    await type(field("Mindbody Staff ID"), "100000123");
    await act(async () => {
      [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Save access"))!.click();
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe("trainers/uid-sam");
    expect(writes[0].data).toMatchObject({ fullName: "Samantha Lee", mindbodyStaffId: "100000123", mindbodyLinked: true });
    expect(writes[0].data).not.toHaveProperty("email");
  });
});

/*
 * WHICH EMAIL SIGNS IN AS WHOM (the sign-in email round, Oct 20 2026;
 * features/sign-in-email). AJ: a sign-in must land on the person's own
 * record, the one with their Mindbody id, never a new one.
 */
describe("StaffEditor: who signs in as whom", () => {
  const august = (id: string, fullName: string, over: Record<string, unknown> = {}) =>
    ({
      id,
      fullName,
      initials: "XX",
      role: "LifeTransformer",
      primaryHomeStudioId: "westlake",
      accessibleStudioIds: ["westlake"],
      mindbodyStaffId: "100000059",
      ...over,
    }) as never;
  const kayla = august("kaylaAugustRecord001", "Kayla Sharratt");
  const kyle = august("kyleAugustRecord0001", "Kyle McManus", { email: "kyle@maxstrengthfitness.com", mindbodyStaffId: "100000071" });
  const field = (el: Element, label: string) =>
    [...el.querySelectorAll(".adm-field")].find((f) => f.querySelector("label")?.textContent?.startsWith(label));
  const type = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  /** A button by its words: the exact words first (a dialog's "Link"), else the start of them. */
  const press = async (el: Element, text: string) => {
    const all = [...el.ownerDocument.querySelectorAll("button")];
    const button = all.find((b) => b.textContent?.trim() === text) ?? all.find((b) => b.textContent?.trim().startsWith(text));
    await act(async () => {
      button!.click();
    });
  };

  it("shows Mindbody's address beside Journey's, copies it only on a tap, and opens the claim on save", async () => {
    const row = buildStaffRoster({
      trainers: [kayla],
      mindbodyStaff: [{ id: "100000059", fullName: "Kayla Sharratt", email: "Kayla@MaxStrengthFitness.com" }],
      requests: [],
      studioId: "westlake",
    }).find((r) => r.trainer)!;
    expect(row.email).toBeUndefined();
    const el = await mount(row, { people: [kayla, kyle], viewerIsAdmin: true });
    const box = field(el, "Signs in as")!;
    expect((box.querySelector("input") as HTMLInputElement).value).toBe("");
    expect(box.textContent).toContain("Mindbody has kayla@maxstrengthfitness.com");
    await press(el, "Use this");
    expect((box.querySelector("input") as HTMLInputElement).value).toBe("kayla@maxstrengthfitness.com");
    await press(el, "Save access");
    expect(writes).toHaveLength(1);
    expect(writes[0].data).toMatchObject({ email: "kayla@maxstrengthfitness.com", pendingClaim: true });
  });

  it("asks before moving an address another person holds, then moves it in one batch", async () => {
    const row = buildStaffRoster({ trainers: [kayla, kyle], mindbodyStaff: [], requests: [], studioId: "westlake" }).find(
      (r) => r.trainer?.id === "kaylaAugustRecord001",
    )!;
    const el = await mount(row, { people: [kayla, kyle], viewerIsAdmin: true });
    await type(field(el, "Signs in as")!.querySelector("input") as HTMLInputElement, "KYLE@maxstrengthfitness.com");
    await press(el, "Save access");
    expect(writes).toEqual([]);
    expect(document.body.textContent).toContain("kyle@maxstrengthfitness.com is on Kyle McManus's record");
    await press(el, "Move it");
    expect(writes.map((w) => w.path)).toEqual(["trainers/kaylaAugustRecord001", "trainers/kyleAugustRecord0001"]);
    expect(writes[0].data).toMatchObject({ email: "kyle@maxstrengthfitness.com", pendingClaim: true });
    expect(writes[1].data).toEqual({ email: "" });
  });

  it("refuses half an address", async () => {
    const row = buildStaffRoster({ trainers: [kayla], mindbodyStaff: [], requests: [], studioId: "westlake" }).find((r) => r.trainer)!;
    const el = await mount(row, { people: [kayla], viewerIsAdmin: true });
    await type(field(el, "Signs in as")!.querySelector("input") as HTMLInputElement, "kayla@");
    await press(el, "Save access");
    expect(writes).toEqual([]);
  });

  it("links a sign-in request to the record it suggests, making nothing new", async () => {
    const austin = august("austinAugustRecord01", "Austin Jurgens", { mindbodyStaffId: "100000012" });
    const row = buildStaffRoster({
      trainers: [kayla, austin],
      mindbodyStaff: [],
      requests: [{ id: "uid-aj", fullName: "Austin Jurgens", email: "ajurgens@maxstrengthfitness.com", status: "Pending", userId: "uid-aj" }],
      studioId: "westlake",
    }).find((r) => r.request)!;
    const el = await mount(row, { people: [kayla, austin], viewerIsAdmin: true });
    const who = field(el, "Who is this?")!;
    expect((who.querySelector("select") as HTMLSelectElement).value).toBe("t:austinAugustRecord01");
    expect(who.textContent).toContain("Suggested: the address is their first initial and last name");
    // Linking keeps the record's own role and studio: the approval fields step aside.
    expect(field(el, "Role")).toBeUndefined();
    await press(el, "Link to Austin Jurgens");
    await press(el, "Link");
    expect(writes).toEqual([
      { path: "trainers/austinAugustRecord01", data: { email: "ajurgens@maxstrengthfitness.com", pendingClaim: true } },
      { path: "access_requests/uid-aj", data: expect.objectContaining({ status: "Approved", approvedTrainerId: "austinAugustRecord01" }) },
    ]);
  });

  it("approves someone on Mindbody's staff list into an account that carries their Mindbody id", async () => {
    const dom = { id: "100000006", fullName: "Dominic Coduti" };
    const row = buildStaffRoster({
      trainers: [],
      mindbodyStaff: [dom],
      requests: [{ id: "uid-dom", fullName: "Dom C", email: "dcoduti@maxstrengthfitness.com", status: "Pending", userId: "uid-dom" }],
      studioId: "westlake",
    }).find((r) => r.request)!;
    const el = await mount(row, { people: [], mindbodyStaffOnly: [dom], viewerIsAdmin: true });
    expect((field(el, "Who is this?")!.querySelector("select") as HTMLSelectElement).value).toBe("mb:100000006");
    await press(el, "Approve and create the account");
    await press(el, "Approve");
    expect(writes[0].path).toBe("trainers/uid-dom");
    expect(writes[0].data).toMatchObject({ mindbodyStaffId: "100000006", mindbodyLinked: true, email: "dcoduti@maxstrengthfitness.com" });
  });

  it("suggests no one when nothing fits, and approves a new person as before", async () => {
    const row = rowFor({ id: "r9", fullName: "Nia New", email: "nia@example.com", status: "Pending", userId: "uid-nia" });
    const el = await mount(row, { people: [kayla], viewerIsAdmin: true });
    expect((field(el, "Who is this?")!.querySelector("select") as HTMLSelectElement).value).toBe("new");
    expect(buttons(el).some((b) => b.includes("Approve and create the account"))).toBe(true);
  });
});

/*
 * WHAT A ROW OFFERS THE VIEWER (the franchise partition, Oct 2026;
 * edit-limits.ts). Under the partition's rules your own role and studios are
 * head office's, a person based at a studio you don't lead is read only, and
 * an owner's role is changed only on Admins → Change role. The editor offers
 * none of what the rules would refuse, and a save never sends a locked field.
 */
describe("StaffEditor offers only what the viewer may save", () => {
  const trainer = (over: Record<string, unknown>) =>
    ({
      initials: "XX",
      role: "LifeTransformer",
      primaryHomeStudioId: "westlake",
      accessibleStudioIds: ["westlake"],
      activeGuestStudioIds: [],
      systemStatus: "active",
      ...over,
    }) as never;
  const rowOf = (t: { id: string }) =>
    buildStaffRoster({ trainers: [t as never], mindbodyStaff: [], requests: [], studioId: null }).find(
      (r) => r.trainer?.id === t.id,
    )!;
  const select = (el: Element, label: string) =>
    [...el.querySelectorAll(".adm-field")].find((f) => f.querySelector("label")?.textContent?.startsWith(label))?.querySelector("select") as
      | HTMLSelectElement
      | undefined;
  const input = (el: Element, label: string) =>
    [...el.querySelectorAll(".adm-field")].find((f) => f.querySelector("label")?.textContent?.startsWith(label))?.querySelector("input") as
      | HTMLInputElement
      | undefined;

  const leader = trainer({ id: "uid-lee", authUid: "uid-lee", fullName: "Lee Leader", email: "lee@example.com", role: "StudioLeader" });

  it("on the live leader's own row on My Studio → Team: the role is locked, no grant, and Save sends neither", async () => {
    const el = await mount(rowOf(leader), { viewer: leader, viewerIsAdmin: false });
    expect(select(el, "Role")!.disabled).toBe(true);
    expect(el.textContent).not.toContain("Can manage My Studio");
    expect(el.textContent).toContain("Your own role and studios are set by head office.");
    await act(async () => {
      const i = input(el, "Initials")!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(i, "LL");
      i.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Save access"))!.click();
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].data).toMatchObject({ initials: "LL" });
    expect(writes[0].data).not.toHaveProperty("role");
    expect(writes[0].data).not.toHaveProperty("managedStudioIds");
  });

  it("on an owner's own row on Operations → People: the home studio select is locked", async () => {
    const owner = trainer({ id: "uid-own", fullName: "Olive Owner", role: "FranchiseOwner", ownedStudioIds: ["solon"] });
    const el = await mount(rowOf(owner), { viewer: owner, viewerIsAdmin: false, lockHomeStudio: false, grantStudioId: null });
    expect(select(el, "Home studio")!.disabled).toBe(true);
    expect(select(el, "Role")!.disabled).toBe(true);
  });

  it("on an administrator's own row: everything is open", async () => {
    const admin = trainer({ id: "uid-ada", fullName: "Ada Admin", role: "Admin" });
    const el = await mount(rowOf(admin), {
      viewer: admin,
      viewerIsAdmin: true,
      lockHomeStudio: false,
      assignableRoles: ["LifeTransformer", "HeadTrainer", "StudioLeader", "StudioOwner", "Owner", "Admin"],
    });
    expect(select(el, "Role")!.disabled).toBe(false);
    expect(select(el, "Home studio")!.disabled).toBe(false);
    expect(el.textContent).toContain("Can manage My Studio");
    expect(el.querySelector(".adm-notice")?.textContent ?? "").not.toContain("head office");
  });

  it("a franchise owner of Westlake opening a guest based at Solon sees the row read only, with no Save", async () => {
    const viewer = trainer({ id: "uid-own", fullName: "Olive Owner", role: "FranchiseOwner", primaryHomeStudioId: "willoughby", ownedStudioIds: ["westlake"] });
    const guest = trainer({ id: "uid-gail", fullName: "Gail Guest", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"], activeGuestStudioIds: ["westlake"] });
    const el = await mount(rowOf(guest), { viewer, viewerIsAdmin: false });
    expect(el.textContent).toContain("Gail is based at Solon, so that studio's leaders make changes.");
    expect(buttons(el).some((b) => b.includes("Save access"))).toBe(false);
    expect(input(el, "Full name")!.disabled).toBe(true);
    expect(select(el, "Role")!.disabled).toBe(true);
  });

  it("an administrator opening an owner's row: the role is locked, with the Change role line", async () => {
    const admin = trainer({ id: "uid-ada", fullName: "Ada Admin", role: "Admin" });
    const owner = trainer({ id: "uid-own", fullName: "Olive Owner", role: "FranchiseOwner", ownedStudioIds: ["solon"] });
    const el = await mount(rowOf(owner), {
      viewer: admin,
      viewerIsAdmin: true,
      assignableRoles: ["LifeTransformer", "HeadTrainer", "StudioLeader", "StudioOwner", "Owner", "Admin"],
    });
    expect(select(el, "Role")!.disabled).toBe(true);
    expect(el.textContent).toContain("Change role");
    expect(buttons(el).some((b) => b.includes("Save access"))).toBe(true);
  });

  it("never makes a request row read only: the approval path has its own checks", async () => {
    const el = await mount(
      rowFor({ id: "r9", fullName: "Nia New", email: "nia@example.com", status: "Pending", userId: "uid-nia" }),
      { viewer: leader, viewerIsAdmin: false },
    );
    expect(buttons(el).some((b) => b.includes("Approve and create the account"))).toBe(true);
    expect(select(el, "Role")!.disabled).toBe(false);
  });

  // The attack review (Oct 10 2026): in Demo Mode, My Studio → Team offered
  // a demo trainer the grant, and the rules refuse every such save (a demo
  // trainer's managedStudioIds is pinned empty, and no one's led studios
  // include 'demo-studio'). A franchise owner was newly refused under the
  // partition; leaders and trainers already were.
  for (const viewer of [
    trainer({ id: "uid-own", fullName: "Olive Owner", role: "FranchiseOwner", ownedStudioIds: ["solon"] }),
    trainer({ id: "uid-lee2", fullName: "Lee Leader", role: "StudioLeader" }),
    trainer({ id: "uid-tia", fullName: "Tia Trainer", role: "LifeTransformer" }),
  ]) {
    it(`in Demo Mode on My Studio → Team (${(viewer as { role: string }).role}): a demo trainer's row draws no grant, and Save sends none`, async () => {
      const demo = trainer({
        id: "demo-trainer-lt",
        fullName: "Dee Demo",
        isDemo: true,
        primaryHomeStudioId: "demo-studio",
        accessibleStudioIds: ["demo-studio"],
      });
      const el = await mount(rowOf(demo), { viewer, viewerIsAdmin: false, activeStudioId: "demo-studio", grantStudioId: "demo-studio" });
      expect(el.textContent).not.toContain("Can manage My Studio");
      await act(async () => {
        const i = input(el, "Initials")!;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(i, "ZZ");
        i.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Save access"))!.click();
      });
      expect(writes).toHaveLength(1);
      expect(writes[0].data).toMatchObject({ initials: "ZZ" });
      expect(writes[0].data).not.toHaveProperty("managedStudioIds");
    });
  }
});
