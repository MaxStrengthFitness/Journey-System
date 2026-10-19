/**
 * Phasing Routine B in, the pure half (the routine builder round, Oct 19
 * 2026). AJ: "we need to have the ability to phase it in IF WE WANT TO, not
 * automatic", and "if we want to plan it out as an individual or as a team so
 * i can make sure the plan is followed".
 *
 * A trainer builds the B they want (the target) and, instead of saving it
 * whole, phases it in from where B stands (the base: Routine B as saved, or
 * Routine A when B has nothing yet). The difference becomes steps, each a
 * week and an owner (a named trainer, or anyone). Routine B's `machineIds`
 * stays what the client does now: the base with the steps ticked done so far
 * (`runningB`). Nothing makes a step by itself: a person ticks it. Anyone
 * makes, changes or drops the plan (AJ's "2a": "anyone can make or change
 * the plan too").
 *
 * Kept on Routine B's plan as `plan.phase` (`PhasePlan`, a map no rule
 * checks the keys of). Dates are the studio's days, `YYYY-MM-DD`, worked out
 * in UTC so no time zone moves them.
 */

/** One step: a machine swapped in for another, added, or taken out. */
export interface PhaseStep {
  /** The machine B gives up (absent for an addition). */
  from?: string;
  /** The machine B takes on (absent for a machine taken out). */
  to?: string;
  /** The Monday of the week it is planned for, `YYYY-MM-DD`. */
  week: string;
  /** Who owns it: a trainer's record id and name, or absent for anyone. */
  ownerId?: string;
  ownerName?: string;
  /** When it was ticked done, the studio's day, and by whom (the Auth uid, then the name). */
  doneAt?: string;
  doneByUid?: string;
  doneByName?: string;
}

export interface PhasePlan {
  /** Where B started from: Routine B as it was, or a copy of Routine A. */
  base: string[];
  /** The B the trainer built, where the steps end. */
  target: string[];
  steps: PhaseStep[];
  madeByUid: string;
  madeByName?: string;
  /** The studio's day it was made, `YYYY-MM-DD`. */
  madeAt: string;
}

/* ── Days ─────────────────────────────────────────────────────────────── */

function parseYmd(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function ymdOf(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

const DAY = 86_400_000;

/** The Monday of a day's week; the day itself when it can't be read. */
export function weekOf(ymd: string): string {
  const ms = parseYmd(ymd);
  if (ms === null) return ymd;
  const dow = new Date(ms).getUTCDay(); // 0 Sunday
  const back = (dow + 6) % 7;
  return ymdOf(ms - back * DAY);
}

/** A day some weeks on. */
export function weeksAfter(ymd: string, weeks: number): string {
  const ms = parseYmd(ymd);
  return ms === null ? ymd : ymdOf(ms + weeks * 7 * DAY);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 26". */
export function dayWords(ymd: string): string {
  const ms = parseYmd(ymd);
  if (ms === null) return ymd;
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/* ── Steps ────────────────────────────────────────────────────────────── */

/**
 * The steps from one B to another, in the order the target has them: each
 * machine leaving B is paired with a machine joining it, in order, as a swap;
 * what is left over is an addition or a machine taken out. Order alone is
 * not a step: the last step lands the target's order.
 */
export function stepsBetween(base: readonly string[], target: readonly string[]): { from?: string; to?: string }[] {
  const leaving = base.filter((id) => !target.includes(id));
  const joining = target.filter((id) => !base.includes(id));
  const out: { from?: string; to?: string }[] = [];
  const n = Math.max(leaving.length, joining.length);
  for (let i = 0; i < n; i++) {
    const from = leaving[i];
    const to = joining[i];
    out.push({ ...(from ? { from } : null), ...(to ? { to } : null) });
  }
  return out;
}

/** A new plan: the steps one a week from this week, each owned by anyone. */
export function phasePlanOf(input: {
  base: readonly string[];
  target: readonly string[];
  todayYmd: string;
  who: { uid: string; name?: string };
}): PhasePlan {
  const first = weekOf(input.todayYmd);
  return {
    base: [...input.base],
    target: [...input.target],
    steps: stepsBetween(input.base, input.target).map((s, i) => ({ ...s, week: weeksAfter(first, i) })),
    madeByUid: input.who.uid,
    ...(input.who.name?.trim() ? { madeByName: input.who.name.trim() } : null),
    madeAt: input.todayYmd,
  };
}

/** The steps spread one a week again, from the first step's week. */
export function spreadWeekly(steps: readonly PhaseStep[], fromYmd: string): PhaseStep[] {
  const first = weekOf(fromYmd);
  return steps.map((s, i) => ({ ...s, week: weeksAfter(first, i) }));
}

export function isDone(step: PhaseStep): boolean {
  return !!step.doneAt;
}

/**
 * What B runs now: the base with every step done so far made, a swap in the
 * place of the machine it replaces, an addition after the machine it follows
 * in the target (else first); once every step is done, the target itself, in
 * its order.
 */
export function runningB(plan: Pick<PhasePlan, "base" | "target" | "steps">): string[] {
  if (plan.steps.length > 0 && plan.steps.every(isDone)) return [...plan.target];
  let out = [...plan.base];
  for (const s of plan.steps) {
    if (!isDone(s)) continue;
    if (s.from && s.to) {
      const at = out.indexOf(s.from);
      if (at >= 0 && !out.includes(s.to)) out[at] = s.to;
      else if (at >= 0) out = out.filter((id) => id !== s.from);
      else if (!out.includes(s.to)) out = insertAfterTarget(out, s.to, plan.target);
    } else if (s.from) {
      out = out.filter((id) => id !== s.from);
    } else if (s.to && !out.includes(s.to)) {
      out = insertAfterTarget(out, s.to, plan.target);
    }
  }
  return out;
}

function insertAfterTarget(list: string[], id: string, target: readonly string[]): string[] {
  const at = target.indexOf(id);
  for (let i = at - 1; i >= 0; i--) {
    const before = list.indexOf(target[i]);
    if (before >= 0) return [...list.slice(0, before + 1), id, ...list.slice(before + 1)];
  }
  return [id, ...list];
}

/** A step ticked done (or undone, `done` false) by the signed-in person on the studio's day. */
export function tickedStep(
  plan: PhasePlan,
  index: number,
  done: boolean,
  who: { uid: string; name?: string },
  todayYmd: string,
): PhasePlan {
  return {
    ...plan,
    steps: plan.steps.map((s, i) => {
      if (i !== index) return s;
      if (!done) {
        const { doneAt: _a, doneByUid: _b, doneByName: _c, ...rest } = s;
        return rest;
      }
      return { ...s, doneAt: todayYmd, doneByUid: who.uid, ...(who.name?.trim() ? { doneByName: who.name.trim() } : null) };
    }),
  };
}

/** Every step still to come made at once (Finish now). */
export function finishedNow(plan: PhasePlan, who: { uid: string; name?: string }, todayYmd: string): PhasePlan {
  let out = plan;
  plan.steps.forEach((s, i) => {
    if (!isDone(s)) out = tickedStep(out, i, true, who, todayYmd);
  });
  return out;
}

/* ── Where it stands ──────────────────────────────────────────────────── */

export interface PhaseStatus {
  done: number;
  of: number;
  /** The first step not done yet, and its index. */
  next: (PhaseStep & { index: number }) | null;
  /** The next step's week has come. */
  due: boolean;
  /** The next step's week has passed (today is a later week). */
  behind: boolean;
  complete: boolean;
}

export function phaseStatus(plan: Pick<PhasePlan, "steps">, todayYmd: string): PhaseStatus {
  const done = plan.steps.filter(isDone).length;
  const at = plan.steps.findIndex((s) => !isDone(s));
  const next = at >= 0 ? { ...plan.steps[at], index: at } : null;
  const thisWeek = weekOf(todayYmd);
  return {
    done,
    of: plan.steps.length,
    next,
    due: !!next && next.week <= thisWeek,
    behind: !!next && next.week < thisWeek,
    complete: plan.steps.length > 0 && at < 0,
  };
}

/** A step in words: "Leg Curl for Leg Press", "Add Leg Curl", "Take out Leg Press". */
export function stepWords(step: Pick<PhaseStep, "from" | "to">, nameOf: (id: string) => string): string {
  if (step.from && step.to) return `${nameOf(step.to)} for ${nameOf(step.from)}`;
  if (step.to) return `Add ${nameOf(step.to)}`;
  if (step.from) return `Take out ${nameOf(step.from)}`;
  return "";
}

export function ownerWords(step: Pick<PhaseStep, "ownerName">): string {
  return step.ownerName?.trim() || "Anyone";
}

/**
 * B's one line while a plan runs: "Phasing in · 1 of 2 done · next: Chest/Pec
 * Fly for Overhead Press, week of Nov 2 · Sarah", with "· behind" once that
 * week has passed, or "Phased in" once every step is done.
 */
export function phaseLine(plan: Pick<PhasePlan, "steps">, todayYmd: string, nameOf: (id: string) => string): string {
  const st = phaseStatus(plan, todayYmd);
  if (st.complete) return `Phased in · all ${st.of} done`;
  if (!st.next) return "Phasing in";
  return [
    `Phasing in · ${st.done} of ${st.of} done`,
    `next: ${stepWords(st.next, nameOf)}, week of ${dayWords(st.next.week)}`,
    ownerWords(st.next),
    ...(st.behind ? ["behind"] : []),
  ].join(" · ");
}

/**
 * The briefing's line while a step is due (AJ: "so i can make sure the plan
 * is followed"): "Routine B · Leg Curl for Leg Press is due this week ·
 * Sarah", or "… was due the week of Oct 19 · behind". Nothing before a
 * step's week, and nothing once every step is done. It says; it never makes
 * the step.
 */
export function phaseDueWords(plan: Pick<PhasePlan, "steps">, todayYmd: string, nameOf: (id: string) => string): string | null {
  const st = phaseStatus(plan, todayYmd);
  if (!st.next || !st.due) return null;
  const what = stepWords(st.next, nameOf);
  return st.behind
    ? `Routine B · ${what} was due the week of ${dayWords(st.next.week)} · ${ownerWords(st.next)} · behind`
    : `Routine B · ${what} is due this week · ${ownerWords(st.next)}`;
}

/** A plan as it comes back from the database: a value that isn't usable is no plan, never a guess. */
export function phaseOf(raw: unknown): PhasePlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);
  const base = ids(r.base);
  const target = ids(r.target);
  if (!base || !target || !Array.isArray(r.steps) || typeof r.madeByUid !== "string") return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  const steps: PhaseStep[] = [];
  for (const s of r.steps) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const week = str(o.week);
    if (!week || (!str(o.from) && !str(o.to))) continue;
    const step: PhaseStep = { week };
    for (const k of ["from", "to", "ownerId", "ownerName", "doneAt", "doneByUid", "doneByName"] as const) {
      const v = str(o[k]);
      if (v) step[k] = v;
    }
    steps.push(step);
  }
  return {
    base,
    target,
    steps,
    madeByUid: r.madeByUid,
    ...(str(r.madeByName) ? { madeByName: str(r.madeByName) } : null),
    madeAt: str(r.madeAt) ?? "",
  };
}
