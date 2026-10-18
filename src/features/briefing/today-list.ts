/**
 * TODAY'S LIST — the briefing's machines for today, as one list a trainer
 * acts on (the briefing round, Oct 17 2026; AJ's handoff, question 2: "Swap
 * a machine out, or add one in: quick edit to today's routine").
 *
 * AJ, Oct 16 2026: "just let alone to add one machine onto the pre-session
 * briefing is like five or six clicks ... maybe two at max, three. But
 * definitely not more than four." The list makes add two taps (+ Add a
 * machine, the machine), swap two (Swap, the machine) and take out one (×,
 * with Undo). This file is the pure half; TodayList.tsx draws it.
 *
 * Ids. Today's ids are kept as they came (a routine may hold any of the
 * three id schemes), and what this file adds is the floor's own id, the one
 * the session's floor uses. Only the Academy's tables (substitutes, order
 * rules) are asked in canonical ids, and their answers are mapped back to
 * this floor's ids before anything reaches the list.
 *
 * Nothing here writes. Every change is today's only: Start hands the list up
 * and the routine is never touched (routine-builder/session-scope.test.ts).
 */
import { canonicalMachineId } from "../catalog/machine-identity";
import { analyzeRoutine, substitutesFor, type Violation } from "../routine-builder/engine";
import type { MachineHistoryEntry } from "../routine-builder/types";

export interface FloorEntry {
  id: string;
  name?: string;
}

/** "154 lb · 8 reps", "52 lb", "90 sec"; null when there is nothing on file. */
export function lastTimeWords(h: MachineHistoryEntry | null | undefined): string | null {
  if (!h) return null;
  const filled = (v: unknown) => v !== null && v !== undefined && v !== "";
  const parts: string[] = [];
  if (filled(h.lastWeight)) parts.push(`${h.lastWeight} lb`);
  if (filled(h.lastReps)) parts.push(`${h.lastReps} ${h.lastUnit === "sec" ? "sec" : "reps"}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * What + Add a machine offers: the plan's next machine first when today
 * doesn't have it, then the rest of the floor in its own (walking) order.
 * Never a machine already on today's list, nor one the client can't do.
 */
export function addChoices(input: {
  today: readonly string[];
  floor: readonly FloorEntry[];
  nextInPlan?: string | null;
  held?: readonly string[];
}): { next: string | null; rest: string[] } {
  const out = new Set([...input.today, ...(input.held ?? [])]);
  const onFloor = new Set(input.floor.map((m) => m.id));
  const next = input.nextInPlan && onFloor.has(input.nextInPlan) && !out.has(input.nextInPlan) ? input.nextInPlan : null;
  const rest: string[] = [];
  for (const m of input.floor) {
    if (!m.id || out.has(m.id) || m.id === next || rest.includes(m.id)) continue;
    rest.push(m.id);
  }
  return { next, rest };
}

/** Today's list with one more machine at the end; a machine already on it is not listed twice. */
export function addTo(today: readonly string[], id: string): string[] {
  return today.includes(id) ? [...today] : [...today, id];
}

/** A swap offered as a set: the machines that would go in, in order. */
export interface SwapSet {
  /** This floor's ids, in the Academy's order, only those not already running today. */
  ids: string[];
}

/**
 * What Swap offers for one machine on today's list:
 *  - `planned`: Routine B's next swap, when it replaces this machine (Round 2's
 *    B, built over time; F7's words);
 *  - `documented`: the Academy's substitutes for it (Leg Press → Leg Extension
 *    + Hip Abduction + Lumbar), only sets this floor has, only their members
 *    not already running today;
 *  - `rest`: every other machine on the floor, in walking order.
 */
export function swapChoices(input: {
  target: string;
  today: readonly string[];
  floor: readonly FloorEntry[];
  nameOf: (id: string) => string;
  held?: readonly string[];
  nextSwap?: { replaces: string; with: string } | null;
}): { planned: string | null; documented: SwapSet[]; rest: string[] } {
  const { target, today, floor, nameOf } = input;
  const running = new Set(today);
  const held = new Set(input.held ?? []);
  const floorIds = new Set(floor.map((m) => m.id));
  /* The floor by canonical id, so the Academy's answer comes back as this floor's ids. */
  const byCanon = new Map<string, string>();
  for (const m of floor) {
    const c = canonicalMachineId(m.id, m.name);
    if (c && !byCanon.has(c)) byCanon.set(c, m.id);
  }
  const canonFloor = [...byCanon.keys()];

  const planned =
    input.nextSwap &&
    input.nextSwap.replaces === target &&
    floorIds.has(input.nextSwap.with) &&
    !running.has(input.nextSwap.with) &&
    !held.has(input.nextSwap.with)
      ? input.nextSwap.with
      : null;

  const documented: SwapSet[] = [];
  const seen = new Set<string>();
  for (const option of substitutesFor(canonicalMachineId(target, nameOf(target)), canonFloor)) {
    if (!option.availableHere) continue;
    const ids = option.machineIds
      .map((c) => byCanon.get(c))
      .filter((id): id is string => !!id && id !== target && !running.has(id) && !held.has(id));
    const key = ids.join("+");
    if (ids.length === 0 || seen.has(key)) continue;
    seen.add(key);
    documented.push({ ids });
  }

  const rest: string[] = [];
  for (const m of floor) {
    if (!m.id || m.id === target || running.has(m.id) || held.has(m.id) || m.id === planned || rest.includes(m.id)) continue;
    rest.push(m.id);
  }
  return { planned, documented, rest };
}

/** Put one or more machines where another was. Its place is kept, and nothing is listed twice. */
export function swapIn(today: readonly string[], target: string, replacements: readonly string[]): string[] {
  const at = today.indexOf(target);
  if (at === -1) return [...today];
  const incoming = replacements.filter((id, i) => replacements.indexOf(id) === i && (id === target || !today.includes(id)));
  return [...today.slice(0, at), ...incoming, ...today.slice(at + 1)];
}

/** What × took out, so Undo can put it back where it was. */
export interface TakenOut {
  id: string;
  at: number;
}

export function takeOut(today: readonly string[], id: string): { next: string[]; undo: TakenOut | null } {
  const at = today.indexOf(id);
  if (at === -1) return { next: [...today], undo: null };
  return { next: today.filter((m) => m !== id), undo: { id, at } };
}

/** Undo: the machine back in its place, unless it has come back some other way since. */
export function putBack(today: readonly string[], undo: TakenOut): string[] {
  if (today.includes(undo.id)) return [...today];
  const at = Math.min(Math.max(undo.at, 0), today.length);
  return [...today.slice(0, at), undo.id, ...today.slice(at)];
}

/** Reorder: one machine moved from one place to another. */
export function moveTo(today: readonly string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= today.length || to >= today.length) return [...today];
  const next = [...today];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** An order rule today trips, said once under the list, with its fix in this floor's ids. */
export interface OrderWarning {
  key: string;
  title: string;
  severity: Violation["severity"];
  /** The first fix the Academy offers ("Move Abdominals before Lumbar"), already applied to today's list. */
  fix: { label: string; next: string[] } | null;
}

/**
 * The Academy's order rules over today's list (Lumbar straight into Leg
 * Press, and the rest), asked in canonical ids and answered in today's own.
 * Today they hid behind Edit as "⚠ 1"; now they show without a tap. A fix
 * that would bring in a machine this floor doesn't have is not offered.
 */
export function orderWarnings(
  today: readonly string[],
  nameOf: (id: string) => string,
  floor: readonly FloorEntry[] = [],
): OrderWarning[] {
  const canon = today.map((id) => canonicalMachineId(id, nameOf(id)) || id);
  const back = new Map<string, string>();
  canon.forEach((c, i) => {
    if (!back.has(c)) back.set(c, today[i]);
  });
  for (const m of floor) {
    const c = canonicalMachineId(m.id, m.name);
    if (c && !back.has(c)) back.set(c, m.id);
  }
  // Every name a fix may say, the floor's too ("Swap Leg Press → Leg Extension", never "→ LE").
  const names: Record<string, string> = {};
  for (const [c, id] of back) names[c] = nameOf(id);
  const { violations } = analyzeRoutine(canon, { names });
  return violations.map((v) => {
    const first = v.fixes[0];
    let fix: OrderWarning["fix"] = null;
    if (first) {
      const applied = first.apply([...canon]);
      const reachable = applied.every((c) => back.has(c));
      const next = applied.map((c) => back.get(c) ?? c);
      if (reachable && next.join("|") !== today.join("|")) fix = { label: first.label, next };
    }
    return { key: `${v.ruleId}-${v.indices.join("-")}`, title: v.title, severity: v.severity, fix };
  });
}
