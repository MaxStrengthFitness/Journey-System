/**
 * A made-up Solon for the Learning redesign preview. The 20 catalog machines
 * are the app's own (src/data/machine-definitions.ts, generated from the
 * Academy), rostered at "Solon" the way a real studio's roster is, with one
 * machine out of service, one flagged and one page written here. Nobody's
 * real data: the person is "Sam Lee", the notes are invented.
 *
 *   ?role=leader   (default) a Studio Leader at Solon: crosses lines out
 *   ?role=trainer  a Life Transformer: notes, never crosses out
 *   ?role=admin    an administrator: head office (sees the queue)
 *   ?empty=1       no roster: the Catalog's "floor is empty" state
 *   ?flag=0        no flagged machine
 *
 * It must not import firebase/firestore (stubs/firestore.ts imports this).
 */
import { MACHINE_DEFINITION_LIST } from "../../src/data/machine-definitions";
import { DEFAULT_MACHINES } from "../../src/data/default-machines";
import type { Studio, Trainer } from "../../src/types";

const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
const role = params.get("role") ?? "leader";

export const STUDIO_ID = "solon";

export const STUDIO = {
  id: STUDIO_ID,
  name: "Solon",
  timezone: "America/New_York",
  ownerId: "o-preview",
} as unknown as Studio;

/** An administrator is head office; the provider's isAdmin says so (App.tsx's own rule). */
export const IS_ADMIN = role === "admin";

export const TRAINER = {
  id: "t-sam-lee",
  fullName: "Sam Lee",
  initials: "SL",
  role: role === "trainer" ? "LifeTransformer" : role === "admin" ? "Admin" : "StudioLeader",
  primaryHomeStudioId: STUDIO_ID,
  accessibleStudioIds: [STUDIO_ID],
} as unknown as Trainer;

export const GLOBAL_MACHINES = DEFAULT_MACHINES;

/** A Firestore Timestamp, as far as the app reads one. */
const ts = (msAgo: number) => {
  const ms = Date.now() - msAgo;
  return { toMillis: () => ms, toDate: () => new Date(ms), seconds: Math.floor(ms / 1000), nanoseconds: 0 };
};
const DAY = 86_400_000;

/** What a read of `path` answers, for stubs/firestore.ts. Anything else is empty. */
export function PREVIEW_DOCS(path: string): Record<string, unknown>[] {
  if (path === "machines") return MACHINE_DEFINITION_LIST.map((m) => ({ ...m }));
  if (path === `studios/${STUDIO_ID}/roster`) {
    if (params.get("empty") === "1") return [];
    return MACHINE_DEFINITION_LIST.map((m, i) => ({
      id: m.id,
      machineId: m.id,
      studioId: STUDIO_ID,
      source: "catalog",
      basedOn: m.id,
      status: m.id === "m-neck" ? "maintenance" : "active",
      // Why it is out, who said so and when (catalog/out-of-service.ts): the
      // banner at the top of its page says all three.
      ...(m.id === "m-neck"
        ? { outOfService: { reason: "A new cable is on order", by: { uid: "uid-sam", name: "Sam Lee" }, at: ts(2 * DAY) } }
        : {}),
      order: i + 1,
    }));
  }
  if (path === `studios/${STUDIO_ID}/machineCare` && params.get("flag") !== "0") {
    return [
      {
        id: "m-leg-press",
        machineId: "m-leg-press",
        flag: { note: "Left pad sticks at the bottom", by: { id: "t-jess", name: "Jess Moreno" }, at: Date.now() - DAY },
        updatedAt: ts(DAY),
      },
    ];
  }
  if (path === `studios/${STUDIO_ID}/wiki`) {
    return [
      {
        id: "page-first-session",
        studioId: STUDIO_ID,
        kind: "page",
        title: "How we run a first session",
        summary: "What happens in the first twenty minutes at Solon.",
        section: "method",
        blocks: [
          { kind: "heading", text: "Before they arrive" },
          { kind: "para", text: "Read the consult and put the first machines on the list." },
          { kind: "bullet", text: "Greet by name" },
          { kind: "bullet", text: "Walk the floor in order" },
        ],
        machineIds: ["m-chest-press"],
        tags: [],
        authorId: "t-sam-lee",
        authorName: "Sam Lee",
        createdAt: ts(3 * DAY),
        updatedAt: ts(2 * DAY),
      },
    ];
  }
  return [];
}
