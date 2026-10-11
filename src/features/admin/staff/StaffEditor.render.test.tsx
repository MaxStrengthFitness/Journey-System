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
    expect(field("Email").value).toBe("sam@example.com");
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
