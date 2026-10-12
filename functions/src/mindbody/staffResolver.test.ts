import { describe, it, expect } from "vitest";
import { Firestore } from "firebase-admin/firestore";
import {
  findTrainersByStaffId,
  resolveStaffAtSite,
  resolveTrainerAtStudio,
  resolveTrainerByStaffId,
} from "./staffResolver";

type Row = { id: string; mindbodyStaffId?: unknown } & Record<string, unknown>;
type Where = [string, string, unknown];

/**
 * Minimal Firestore stand-in: enough of collection().where().limit().get()
 * to exercise the queries, with a strict `===` so the string/number split this
 * resolver exists to survive is actually reproduced, and `array-contains`.
 * `queries` is every where() value in order (the first tests' view);
 * `ran` is every query that was run, as its filters.
 */
function createMockFirestore(rows: Row[]): Firestore & { queries: unknown[]; ran: Where[][] } {
  const queries: unknown[] = [];
  const ran: Where[][] = [];
  const api = {
    queries,
    ran,
    collection(name: string) {
      if (name !== "trainers") throw new Error(`unexpected collection ${name}`);
      const build = (matches: Row[], wheres: Where[]) => ({
        where(field: string, op: string, value: unknown) {
          queries.push(value);
          const keep =
            op === "array-contains"
              ? (r: Row) => Array.isArray(r[field]) && (r[field] as unknown[]).includes(value)
              : (r: Row) => r[field] === value;
          return build(matches.filter(keep), [...wheres, [field, op, value]]);
        },
        limit(n: number) {
          return build(matches.slice(0, n), wheres);
        },
        async get() {
          ran.push(wheres);
          return {
            size: matches.length,
            empty: matches.length === 0,
            docs: matches.map((r) => ({ id: r.id, data: () => r })),
            forEach(cb: (d: { id: string; data: () => Row }) => void) {
              matches.forEach((r) => cb({ id: r.id, data: () => r }));
            },
          };
        },
      });
      return build(rows, []) as any;
    },
  };
  return api as unknown as Firestore & { queries: unknown[]; ran: Where[][] };
}

describe("resolveTrainerByStaffId", () => {
  it("matches a trainer whose staff id is stored as a string", async () => {
    const db = createMockFirestore([{ id: "uid-aj", mindbodyStaffId: "100000012" }]);
    expect(await resolveTrainerByStaffId(db, "100000012")).toEqual({
      kind: "matched",
      trainerId: "uid-aj",
    });
  });

  it("matches a legacy trainer whose staff id was stored as a number", async () => {
    // Firestore's == is type-strict, so the string query alone would miss this.
    const db = createMockFirestore([{ id: "uid-legacy", mindbodyStaffId: 100000012 }]);
    expect(await resolveTrainerByStaffId(db, "100000012")).toEqual({
      kind: "matched",
      trainerId: "uid-legacy",
    });
    expect(db.queries).toEqual(["100000012", 100000012]);
  });

  it("accepts a numeric staff id from the payload", async () => {
    const db = createMockFirestore([{ id: "uid-aj", mindbodyStaffId: "42" }]);
    expect(await resolveTrainerByStaffId(db, 42)).toEqual({ kind: "matched", trainerId: "uid-aj" });
  });

  it("reports unlinked rather than creating anything", async () => {
    // A trainer document is an RBAC principal. An unknown staff member waits
    // in limbo for a human, it does not get minted by a webhook.
    const db = createMockFirestore([{ id: "uid-aj", mindbodyStaffId: "1" }]);
    expect(await resolveTrainerByStaffId(db, "999")).toEqual({ kind: "unlinked" });
  });

  it("reports ambiguity instead of picking one", async () => {
    const db = createMockFirestore([
      { id: "uid-a", mindbodyStaffId: "7" },
      { id: "uid-b", mindbodyStaffId: "7" },
    ]);
    const result = await resolveTrainerByStaffId(db, "7");
    expect(result.kind).toBe("ambiguous");
    expect(result.kind === "ambiguous" && result.trainerIds.sort()).toEqual(["uid-a", "uid-b"]);
  });

  it("does not query at all for a blank staff id", async () => {
    const db = createMockFirestore([]);
    expect(await resolveTrainerByStaffId(db, "   ")).toEqual({ kind: "unlinked" });
    expect(db.queries).toEqual([]);
  });

  it("skips the numeric query when the id is not numeric", async () => {
    const db = createMockFirestore([]);
    await resolveTrainerByStaffId(db, "abc");
    expect(db.queries).toEqual(["abc"]);
  });
});

const STUDIOS = [
  { id: "westlake", siteId: "29068" },
  { id: "solon", siteId: "5746957" },
];

describe("findTrainersByStaffId", () => {
  it("finds both forms, with no cap, and drops merged-away documents", async () => {
    const db = createMockFirestore([
      { id: "a", mindbodyStaffId: "12", primaryHomeStudioId: "westlake" },
      { id: "b", mindbodyStaffId: 12, primaryHomeStudioId: "solon" },
      { id: "c", mindbodyStaffId: "12" },
      { id: "d", mindbodyStaffId: "12" },
      { id: "e", mindbodyStaffId: "12" },
      { id: "old", mindbodyStaffId: "12", supersededByUid: "a" },
      { id: "z", mindbodyStaffId: "13" },
    ]);
    const found = await findTrainersByStaffId(db, "12");
    expect(found.map((t) => t.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(db.ran).toEqual([[["mindbodyStaffId", "==", "12"]], [["mindbodyStaffId", "==", 12]]]);
  });

  it("does not query for a blank staff id", async () => {
    const db = createMockFirestore([]);
    expect(await findTrainersByStaffId(db, " ")).toEqual([]);
    expect(db.ran).toEqual([]);
  });
});

describe("resolveStaffAtSite", () => {
  it("answers a site no studio is linked to without reading a trainer", async () => {
    const db = createMockFirestore([{ id: "a", mindbodyStaffId: "12", primaryHomeStudioId: "westlake" }]);
    expect(await resolveStaffAtSite(db, "12", "31337", STUDIOS)).toEqual({ kind: "unmapped-site" });
    expect(db.ran).toEqual([]);
  });

  it("five trainers on five sites share the number: the one on the event's site", async () => {
    const studios = [
      ...STUDIOS,
      { id: "s3", siteId: "3" },
      { id: "s4", siteId: "4" },
      { id: "s5", siteId: "5" },
    ];
    const db = createMockFirestore([
      { id: "t1", mindbodyStaffId: "12", primaryHomeStudioId: "s3" },
      { id: "t2", mindbodyStaffId: "12", primaryHomeStudioId: "s4" },
      { id: "t3", mindbodyStaffId: "12", primaryHomeStudioId: "s5" },
      { id: "t4", mindbodyStaffId: "12", primaryHomeStudioId: "westlake" },
      { id: "t5", mindbodyStaffId: 12, primaryHomeStudioId: "solon" },
    ]);
    expect(await resolveStaffAtSite(db, 12, "5746957", studios)).toEqual({
      kind: "matched",
      trainerId: "t5",
      by: "site",
    });
  });

  it("passes the event's names on, for a trainer who works on both sites", async () => {
    const db = createMockFirestore([
      {
        id: "f",
        mindbodyStaffId: "12",
        fullName: "Austin Jurgens",
        primaryHomeStudioId: "westlake",
        accessibleStudioIds: ["solon"],
      },
    ]);
    expect(await resolveStaffAtSite(db, "12", "5746957", STUDIOS, ["austin jurgens"])).toEqual({
      kind: "matched",
      trainerId: "f",
      by: "name",
    });
    expect((await resolveStaffAtSite(db, "12", "5746957", STUDIOS)).kind).toBe("cant-tell");
  });
});

describe("resolveTrainerAtStudio", () => {
  const studioScoped = (wheres: [string, string, unknown][], studioId: string) =>
    wheres.some(
      ([field, op, value]) =>
        value === studioId &&
        ((field === "primaryHomeStudioId" && op === "==") ||
          (field === "accessibleStudioIds" && op === "array-contains")),
    );

  it("finds the trainer whose home is the studio", async () => {
    const db = createMockFirestore([
      { id: "a", mindbodyStaffId: "12", primaryHomeStudioId: "westlake", fullName: "Ann A" },
    ]);
    expect(await resolveTrainerAtStudio(db, "12", "westlake")).toEqual({ id: "a", fullName: "Ann A" });
  });

  it("finds a trainer who also works at the studio", async () => {
    const db = createMockFirestore([
      { id: "g", mindbodyStaffId: "12", primaryHomeStudioId: "solon", accessibleStudioIds: ["westlake"] },
    ]);
    expect(await resolveTrainerAtStudio(db, "12", "westlake")).toEqual({ id: "g", fullName: "" });
  });

  it("two at the studio with the number is no one (today's rule)", async () => {
    const db = createMockFirestore([
      { id: "h", mindbodyStaffId: "12", primaryHomeStudioId: "westlake" },
      { id: "g", mindbodyStaffId: "12", primaryHomeStudioId: "solon", accessibleStudioIds: ["westlake"] },
    ]);
    expect(await resolveTrainerAtStudio(db, "12", "westlake")).toBeNull();
  });

  it("one trainer at home and also listed as working there counts once", async () => {
    const db = createMockFirestore([
      { id: "h", mindbodyStaffId: "12", primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"] },
    ]);
    expect(await resolveTrainerAtStudio(db, "12", "westlake")).toMatchObject({ id: "h" });
  });

  it("three other studios' trainers sorting first never crowd the studio's own out (the old limit of 3)", async () => {
    const db = createMockFirestore([
      { id: "a1", mindbodyStaffId: "12", primaryHomeStudioId: "s1" },
      { id: "a2", mindbodyStaffId: "12", primaryHomeStudioId: "s2" },
      { id: "a3", mindbodyStaffId: "12", primaryHomeStudioId: "s3" },
      { id: "zz", mindbodyStaffId: "12", primaryHomeStudioId: "westlake" },
    ]);
    expect(await resolveTrainerAtStudio(db, "12", "westlake")).toMatchObject({ id: "zz" });
  });

  it("the studio's trainer held as a number is found while two others hold the string (the old early stop)", async () => {
    const db = createMockFirestore([
      { id: "a1", mindbodyStaffId: "12", primaryHomeStudioId: "s1" },
      { id: "a2", mindbodyStaffId: "12", primaryHomeStudioId: "s2" },
      { id: "n", mindbodyStaffId: 12, primaryHomeStudioId: "westlake" },
    ]);
    expect(await resolveTrainerAtStudio(db, "12", "westlake")).toMatchObject({ id: "n" });
  });

  it("a trainer only at another studio is no one here", async () => {
    const db = createMockFirestore([{ id: "a", mindbodyStaffId: "12", primaryHomeStudioId: "solon" }]);
    expect(await resolveTrainerAtStudio(db, "12", "westlake")).toBeNull();
  });

  it("a claimed placeholder never makes the trainer look duplicated", async () => {
    const db = createMockFirestore([
      { id: "p", mindbodyStaffId: "12", primaryHomeStudioId: "westlake", supersededByUid: "uid" },
      { id: "uid", mindbodyStaffId: "12", primaryHomeStudioId: "westlake", fullName: "Live One" },
    ]);
    expect(await resolveTrainerAtStudio(db, "12", "westlake")).toEqual({ id: "uid", fullName: "Live One" });
  });

  it("every query is scoped to the studio; four for a numeric id, two otherwise; none for a blank one", async () => {
    const db = createMockFirestore([]);
    await resolveTrainerAtStudio(db, "12", "westlake");
    expect(db.ran).toHaveLength(4);
    expect(db.ran.every((w) => studioScoped(w, "westlake"))).toBe(true);
    expect(db.ran.every((w) => w.some(([field, op]) => field === "mindbodyStaffId" && op === "=="))).toBe(true);

    const db2 = createMockFirestore([]);
    await resolveTrainerAtStudio(db2, "abc", "westlake");
    expect(db2.ran).toHaveLength(2);

    const db3 = createMockFirestore([]);
    expect(await resolveTrainerAtStudio(db3, "  ", "westlake")).toBeNull();
    expect(await resolveTrainerAtStudio(db3, "12", "")).toBeNull();
    expect(db3.ran).toEqual([]);
  });
});
