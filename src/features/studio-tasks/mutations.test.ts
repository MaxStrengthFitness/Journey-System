/**
 * ONE SHAPE FOR A STATUS CHANGE (the studio map, phase 4, Oct 2026): the
 * cleaning checklist's markWiped completes a wipe-chore row with
 * `statusPayloadFor`, so it must be exactly what setManyTaskStatuses writes.
 */
import { describe, expect, it, vi } from "vitest";

const sets = vi.hoisted(() => [] as { path: string; data: Record<string, unknown> }[]);
vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    ...real,
    doc: ref,
    collection: ref,
    serverTimestamp: () => "SERVER_TIME",
    writeBatch: () => ({
      set: (r: { path: string }, data: Record<string, unknown>) => sets.push({ path: r.path, data }),
      commit: async () => {},
    }),
  };
});

const { setManyTaskStatuses, statusPayloadFor } = await import("./mutations");

const planned = {
  id: "tpl-wipe_2026-10-12_m-leg-press",
  templateId: "tpl-wipe",
  localDate: "2026-10-12",
  shift: "pm" as const,
  machineId: "m-leg-press",
  title: "Wipe down every machine",
  category: "cleaning",
  kind: "machine" as const,
};
const location = { scope: "studio" as const, studioId: "solon" };
const author = { id: "t-sara", name: "Sara" };

describe("statusPayloadFor", () => {
  it("is the payload setManyTaskStatuses writes, field for field", async () => {
    sets.length = 0;
    await setManyTaskStatuses({ location, planned: [planned], status: "done", author });
    expect(sets).toHaveLength(1);
    expect(sets[0].path).toBe(`studios/solon/taskInstances/${planned.id}`);
    expect(sets[0].data).toEqual(statusPayloadFor(planned, location, "done", author));
    expect(sets[0].data).toMatchObject({ status: "done", completedBy: author, machineId: "m-leg-press", studioId: "solon" });
  });

  it("clears who finished it when a row opens again", () => {
    expect(statusPayloadFor(planned, location, "open", author)).toMatchObject({ status: "open", completedAt: null, completedBy: null });
  });
});
