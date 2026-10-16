import { describe, expect, it } from "vitest";
import type { Studio, Trainer } from "../../../types";
import { buildStaffRoster, type AccessRequest } from "../../admin/staff/roster";
import { sinceOf, waitingPeople, waitingWhere } from "./waiting";

const studios = [
  { id: "solon", name: "Solon" },
  { id: "strongsville", name: "Strongsville" },
  { id: "westlake", name: "Westlake" },
] as Studio[];

const trainer = (id: string, fullName: string, home: string, email: string): Trainer =>
  ({ id, authUid: id, fullName, email, initials: "XX", role: "LifeTransformer", primaryHomeStudioId: home, accessibleStudioIds: [home], activeGuestStudioIds: [] }) as Trainer;

const trainers = [trainer("u-sam", "Sam Solon", "solon", "sam@x.com")];

const rowsOf = (requests: AccessRequest[]) =>
  buildStaffRoster({ trainers, mindbodyStaff: [], requests, studioId: null, studioIds: null, mindbodyChecked: false });

describe("who is waiting to be let in, every studio", () => {
  it("lists every studio's sign-ups, grouped by the studio asked for, any with none last", () => {
    const people = waitingPeople(
      rowsOf([
        { id: "r1", status: "Pending", fullName: "Zoe Zed", email: "zoe@x.com", userId: "u-zoe", requestedStudioId: "strongsville", createdAt: "2026-10-16T14:00:00Z" },
        { id: "r2", status: "Pending", fullName: "Nia New", email: "nia@x.com", userId: "u-nia", requestedStudioId: "solon" },
        { id: "r3", status: "Pending", fullName: "Old Timer", email: "old@x.com", userId: "u-old" },
      ]),
      studios,
    );
    expect(people.map((p) => [p.name, p.studioName, p.kind])).toEqual([
      ["Nia New", "Solon", "new"],
      ["Zoe Zed", "Strongsville", "new"],
      ["Old Timer", null, "new"],
    ]);
    expect(people[1].since).toBe(Date.parse("2026-10-16T14:00:00Z"));
    expect(people.every((p) => p.row.state === "awaiting-approval")).toBe(true);
  });

  it("leaves out a request whose account already exists, by the roster's own rule", () => {
    const people = waitingPeople(
      rowsOf([{ id: "r1", status: "Pending", fullName: "Sam Solon", email: "sam@x.com", userId: "u-sam", requestedStudioId: "solon" }]),
      studios,
    );
    expect(people).toEqual([]);
  });

  it("says when someone with an account asks for another studio, and where they work now", () => {
    const people = waitingPeople(
      rowsOf([{ id: "sa_u-sam_westlake", type: "studio_access", status: "Pending", trainerId: "u-sam", studioId: "westlake", fullName: "Sam Solon" }]),
      studios,
    );
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ kind: "another-studio", studioName: "Westlake", homeStudioId: "solon", homeStudioName: "Solon" });
  });

  it("counts by studio for Home", () => {
    expect(waitingWhere([{ studioName: "Solon" }, { studioName: null }, { studioName: "Solon" }, { studioName: "Mentor" }])).toEqual([
      "Mentor (1)",
      "Solon (2)",
      "no studio named (1)",
    ]);
  });

  it("reads a request's time as an ISO string or a Firestore timestamp, and nothing else", () => {
    expect(sinceOf("2026-10-16T14:00:00Z")).toBe(Date.parse("2026-10-16T14:00:00Z"));
    expect(sinceOf({ toDate: () => new Date(5) })).toBe(5);
    expect(sinceOf("not a date")).toBeNull();
    expect(sinceOf(undefined)).toBeNull();
  });
});
