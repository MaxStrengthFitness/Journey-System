/**
 * A client's stash and two equipped slots (the routine library round, Oct 23
 * 2026; docs/rounds/2026-10-20-routine-library.md §10).
 *
 * AJ: each client has a stash of their own named routines, and two are
 * equipped at once, slot A and slot B, "both full weapons". Sessions
 * alternate between them (routines/next-routine.ts, unchanged).
 *
 * Until this round A and B were found by NAME ("Routine A", "Routine B",
 * `matchesRoutineLetter`), so a routine couldn't be renamed without losing its
 * slot. Now the client carries `routineSlots: { a, b }`, the routine ids, and
 * a routine read beside them carries the slot it is in (`inSlot`), which
 * `matchesRoutineLetter` answers from first. So the 60-odd places that ask
 * "is this Routine A?" keep asking it, and get the slot's answer.
 *
 * - A slot holds the routine its id names. A slot not written, written null,
 *   or naming a routine not in the list (retired, or still arriving) holds
 *   the routine NAMED for it, as before: nobody's routines change meaning the
 *   day this ships, and every older writer that makes a "Routine A" or a
 *   "Routine B" for an empty slot (Start, the Wrap-up's Next time, the Edit
 *   routine drawer, a planned B) still lands in that slot.
 * - So a routine named "Routine A" or "Routine B" never sits in the stash:
 *   the one move that stashes a routine renames a letter-named one on the way
 *   out (`stashedName`: "Routine A · until Oct 23 2026").
 * - A retired routine is never in a slot.
 *
 * Pure: no React, no Firestore.
 */
import type { Routine, RoutineSlots } from "../../types";
import { type RoutineLetter } from "../../lib/routine-utils";

export type SlotKey = "a" | "b";

export const LETTER_OF: Record<SlotKey, RoutineLetter> = { a: "A", b: "B" };
export const KEY_OF: Record<RoutineLetter, SlotKey> = { A: "a", B: "b" };

/** A name the old way: "Routine A", "A" (either case, either spacing). */
export function letterByName(routine: Pick<Routine, "name"> | null | undefined): RoutineLetter | null {
  const name = typeof routine?.name === "string" ? routine.name.trim().toLowerCase() : "";
  if (name === "a" || name === "routine a") return "A";
  if (name === "b" || name === "routine b") return "B";
  return null;
}

function real(r: Routine): boolean {
  return !!r.id && !r.id.startsWith("temp-");
}

/** A stored slots value read safely: only string ids and nulls, nothing else. */
export function slotsOf(raw: unknown): RoutineSlots | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: RoutineSlots = {};
  for (const k of ["a", "b"] as const) {
    if (!(k in o)) continue;
    const v = o[k];
    if (v === null) out[k] = null;
    else if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return "a" in out || "b" in out ? out : null;
}

/**
 * Which routine is in each slot: the routine the stored id names, else the
 * routine named for the slot, as before. Never a retired routine, and never
 * one routine in both.
 */
export function resolvedSlots(routines: readonly Routine[], raw: unknown): { a: string | null; b: string | null } {
  const slots = slotsOf(raw);
  const live = routines.filter((r) => real(r) && !r.archived);
  const byId = (id: string | null | undefined) => (id ? (live.find((r) => r.id === id)?.id ?? null) : null);
  const byName = (letter: RoutineLetter, not: (string | null)[]) =>
    live.find((r) => !not.includes(r.id ?? null) && letterByName(r) === letter)?.id ?? null;
  const idA = byId(slots?.a);
  const idB = idA && slots?.b === idA ? null : byId(slots?.b);
  const a = idA ?? byName("A", [idB]);
  const b = idB ?? byName("B", [a]);
  return { a, b: b === a ? null : b };
}

/**
 * The name a routine takes as it leaves its slot for the stash: a letter name
 * ("Routine A", "B") would put it back in an empty slot, so it becomes
 * "Routine A · until Oct 23 2026"; any other name is kept.
 */
export function stashedName(routine: Pick<Routine, "name">, todayYmd: string): string | null {
  const letter = letterByName(routine);
  if (!letter) return null;
  const m = todayYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const when = m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])} ${m[1]}` : todayYmd;
  return `Routine ${letter} · until ${when}`;
}

/**
 * The routines with the slot each is in (`inSlot`), so `matchesRoutineLetter`
 * answers from the slots. With no `routineSlots` at all the list is handed
 * back read by name, any stray `inSlot` taken off. The profile's `temp-`
 * stand-ins are left to their names.
 */
export function withSlots<T extends Routine>(routines: readonly T[], raw: unknown): T[] {
  if (!slotsOf(raw)) {
    return routines.map((r) => {
      if (r.inSlot === undefined) return r;
      const { inSlot: _drop, ...rest } = r;
      return rest as T;
    });
  }
  const { a, b } = resolvedSlots(routines, raw);
  return routines.map((r) => {
    if (!real(r)) {
      if (r.inSlot === undefined) return r;
      const { inSlot: _drop, ...rest } = r;
      return rest as T;
    }
    const inSlot: Routine["inSlot"] = r.id === a ? "A" : r.id === b ? "B" : null;
    return r.inSlot === inSlot ? r : { ...r, inSlot };
  });
}

/** The routine equipped in a slot, or null. */
export function slotRoutine<T extends Routine>(routines: readonly T[], raw: unknown, key: SlotKey): T | null {
  const ids = resolvedSlots(routines, raw);
  const id = ids[key];
  return id ? (routines.find((r) => r.id === id) ?? null) : null;
}

/** The stash: every routine not in a slot and not retired, by name. */
export function stashOf<T extends Routine>(routines: readonly T[], raw: unknown): T[] {
  const { a, b } = resolvedSlots(routines, raw);
  return routines
    .filter((r) => real(r) && !r.archived && r.id !== a && r.id !== b)
    .sort((x, y) => (x.name || "").localeCompare(y.name || ""));
}

/** Retired routines, by name: kept, never deleted, brought back by a person. */
export function retiredOf<T extends Routine>(routines: readonly T[]): T[] {
  return routines.filter((r) => real(r) && !!r.archived).sort((x, y) => (x.name || "").localeCompare(y.name || ""));
}

/**
 * The slots after a routine is equipped in one: a routine already in the
 * other slot swaps places with what was here (a routine can't sit in both).
 * Null empties the slot (slot B only: an empty A has no session to run).
 */
export function equipped(
  now: { a: string | null; b: string | null },
  key: SlotKey,
  routineId: string | null,
): { a: string | null; b: string | null } {
  if (key === "a" && !routineId) return now;
  const other: SlotKey = key === "a" ? "b" : "a";
  const next = { ...now, [key]: routineId };
  if (routineId && now[other] === routineId) next[other] = now[key];
  if (next.a && next.a === next.b) next.b = null;
  return next;
}

/**
 * What a slot change writes on the client: each slot by its own field path,
 * only those that differ from what is stored (or that were never written, so
 * the first save pins both), never the whole map. Emptying slot B turns B off
 * (`isRoutineBActive`: an empty B alternated into is a session of nothing);
 * filling it never turns B on. A whole B is planned ahead while off (AJ, Oct
 * 23 2026), and a trainer turns it on.
 */
export function slotsPatch(
  raw: unknown,
  routines: readonly Routine[],
  next: { a: string | null; b: string | null },
  isBActive: boolean,
): Record<string, string | boolean | null> {
  const stored = slotsOf(raw);
  const patch: Record<string, string | boolean | null> = {};
  for (const k of ["a", "b"] as const) {
    const written = !!stored && k in stored;
    if (!written || (stored![k] ?? null) !== next[k]) patch[`routineSlots.${k}`] = next[k];
  }
  const resolved = resolvedSlots(routines, raw);
  if (Object.keys(patch).length === 0 && resolved.a === next.a && resolved.b === next.b) return {};
  if (!next.b && isBActive) patch.isRoutineBActive = false;
  return patch;
}

/** The fields that equipping writes, or nothing when nothing changes. */
export function hasChange(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).length > 0;
}

/**
 * A new routine's name: "Routine 1", "Routine 2" … the first not taken
 * (§8's smaller default), until a person renames it.
 */
export function nextRoutineName(routines: readonly Pick<Routine, "name">[]): string {
  const taken = new Set(routines.map((r) => (r.name || "").trim().toLowerCase()));
  for (let n = 1; ; n++) {
    const name = `Routine ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/** A routine's name checked: trimmed, at most 60 characters, unique for the client (another routine's name refused). */
export function nameProblem(name: string, routines: readonly Pick<Routine, "id" | "name">[], selfId?: string | null): string | null {
  const n = name.trim();
  if (!n) return "Give it a name.";
  if (n.length > 60) return "Keep the name to 60 characters.";
  const clash = routines.find((r) => r.id !== selfId && (r.name || "").trim().toLowerCase() === n.toLowerCase());
  return clash ? `${first(n)} is already the name of another routine.` : null;
}

function first(n: string): string {
  return `"${n}"`;
}

/** Distinct machines across two lists, in first-seen order (the "13 vs 11" fix). */
export function distinctMachines(...lists: readonly (readonly string[])[]): string[] {
  const out: string[] = [];
  for (const list of lists) for (const id of list) if (!out.includes(id)) out.push(id);
  return out;
}

export interface SlotMove {
  /** The client's fields: each slot by its field path (and B off when B is emptied). */
  patch: Record<string, string | boolean | null>;
  /** Routines renamed by the move, so no letter name sits where its letter doesn't. */
  renames: { id: string; name: string }[];
  /** The slots after the move. */
  after: { a: string | null; b: string | null };
}

/**
 * Equipping a routine in a slot (or emptying slot B), worked out: the slots
 * after it, what the client writes, and the renames that keep a letter name
 * honest. A letter-named routine leaving for the stash takes its dated name
 * (`stashedName`); one swapped into the other slot takes that slot's letter
 * name when no other routine has it. The first move on a client pins both
 * slots, so a later rename never loses one.
 */
export function slotMove(
  routines: readonly Routine[],
  raw: unknown,
  key: SlotKey,
  routineId: string | null,
  isBActive: boolean,
  todayYmd: string,
): SlotMove {
  const before = resolvedSlots(routines, raw);
  const after = equipped(before, key, routineId);
  const patch = slotsPatch(raw, routines, after, isBActive);
  const renames: { id: string; name: string }[] = [];
  const named = (id: string) => routines.find((r) => r.id === id);
  for (const id of [before.a, before.b]) {
    if (!id) continue;
    const r = named(id);
    if (!r) continue;
    const letter = letterByName(r);
    if (!letter) continue;
    const now: RoutineLetter | null = after.a === id ? "A" : after.b === id ? "B" : null;
    if (now === letter) continue;
    if (now === null) {
      const name = stashedName(r, todayYmd);
      if (name) renames.push({ id, name: uniqueName(name, routines, id) });
    } else {
      const want = `Routine ${now}`;
      const taken = routines.some((x) => x.id !== id && (x.name || "").trim().toLowerCase() === want.toLowerCase() && !renamedAway(x.id, renames));
      const otherLetterNamed = routines.find((x) => x.id !== id && letterByName(x) === now);
      // The routine that held that letter is renamed too (it moved or left), so the name is free once it does.
      if (!taken || (otherLetterNamed && (after.a === otherLetterNamed.id || after.b === otherLetterNamed.id || renamedAway(otherLetterNamed.id, renames)))) {
        renames.push({ id, name: want });
      }
    }
  }
  return { patch, renames, after };
}

function renamedAway(id: string | undefined, renames: { id: string }[]): boolean {
  return !!id && renames.some((r) => r.id === id);
}

/** A name made unique among the client's routines: "Name", else "Name (2)", "Name (3)" … */
export function uniqueName(name: string, routines: readonly Pick<Routine, "id" | "name">[], selfId?: string | null): string {
  const taken = new Set(routines.filter((r) => r.id !== selfId).map((r) => (r.name || "").trim().toLowerCase()));
  if (!taken.has(name.trim().toLowerCase())) return name.trim();
  for (let n = 2; ; n++) {
    const next = `${name.trim()} (${n})`;
    if (!taken.has(next.toLowerCase())) return next;
  }
}

/**
 * Pinning the slots as they read now, before a change that would otherwise
 * move one (a letter-named routine renamed in its slot): the client's fields,
 * or nothing when both are written already.
 */
export function pinPatch(routines: readonly Routine[], raw: unknown): Record<string, string | null> {
  const stored = slotsOf(raw);
  const now = resolvedSlots(routines, raw);
  const patch: Record<string, string | null> = {};
  for (const k of ["a", "b"] as const) {
    if (!stored || !(k in stored) || (stored[k] ?? null) !== now[k]) patch[`routineSlots.${k}`] = now[k];
  }
  return patch;
}
