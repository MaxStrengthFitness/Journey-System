/**
 * A REAL REPORT AS THE ONE-PAGE SHEET: the facts, the fit, the words.
 *
 * Pure. The view and the editor hand it the report, the client, the reads
 * they already make (InBody scans, the Pulse snapshot) and the words they
 * already use (the session tile's, lib/history-claims.ts), and get back the
 * page's availability (for the editor's checklist), its fit, and the
 * SheetModel ReportSheet draws. Nothing here prints a default sentence the
 * trainer didn't write: no narrative, no tile, no closing note is made up.
 */
import type { Client, ProgressReport } from "../../types";
import type { ReportSessionWords } from "../../lib/history-claims";
import { reportCards } from "./accolades";
import { FOUR_PS, P_TITLES, masteryWord, rankFromScore, toneFromRank, type PTone } from "./four-ps";
import { GOAL_OUTCOME_LABELS } from "./steps";
import { snapshotLine } from "./focus-history";
import {
  MACHINE_ROWS,
  availability,
  fitPage,
  focusLine,
  focusOf,
  pageChoiceOf,
  pageRows,
  tickedModules,
  type Availability,
  type Density,
  type Fit,
  type ModuleId,
  type PageContent,
  type PageFacts,
  type TrainingFocus,
} from "./report-page";
import type { SheetModel, SheetTone } from "./sheet-model";
import type { InBodyScan } from "../inbody/types";
import { changeBetween, changeTone, formatChange, formatMeasure, reportInBody, type MeasureKey } from "../inbody/scans";
import { callChange, type InBodyVariation } from "../inbody/variation";
import { answeredCount, summarize, type PreviousAssessmentRef } from "../subjective-report/scoring";
import { studioDateKey } from "../../lib/studio-time";
import type { SubjectiveAssessment } from "../subjective-report/types";

export interface SheetInputs {
  report: ProgressReport;
  client: Pick<Client, "firstName" | "lastName" | "trainingFocus">;
  studioName: string;
  coachName: string;
  coachRole: string | null;
  /** The session tile's words (history-claims.ts reportSessionWords). */
  sessionWords: ReportSessionWords;
  /** The day the client started (joined.ts), when known. */
  joined: Date | null;
  /** The previous finalized report's day; null for a first report; "unknown" while it is read, when the read failed, or when it isn't among the reports read. */
  previousReportDay: string | null | "unknown";
  /** A machine's name by its id, for the plan's target machine. */
  machineName?: (id: string) => string | null;
  /** The client's InBody scans; null while they are read, "failed" when the read failed. */
  scans: InBodyScan[] | null | "failed";
  variation: InBodyVariation;
  /** The Pulse the page prints; null when there is none, "reading" while it is read, "failed" when it couldn't be. */
  pulse: { assessment: SubjectiveAssessment; previous: PreviousAssessmentRef | null; date: string } | null | "reading" | "failed";
}

export interface SheetPlan {
  /** The order the page follows: the focus chosen, else A goal to hit's. */
  focus: TrainingFocus;
  /** The focus a trainer chose (the report's, else the client's); null when nobody has. Only this one is ever printed or saved. */
  chosen: TrainingFocus | null;
  avail: Record<ModuleId, Availability>;
  /** What is ticked: the focus's defaults the data has, with the trainer's changes (`pageChoice`). */
  ticked: ModuleId[];
  rows: ModuleId[][];
  fit: Fit;
  /** What the estimate measured, for the print check to set beside the drawing. */
  content: PageContent;
  model: SheetModel;
  /** What the screen shows beyond the page (ReportScreen): the paper's room is not the screen's. */
  screen: ScreenExtras;
}

/**
 * The client view on screen draws the same modules as the page, in the same
 * order, with what the paper had no room for: every ticked machine and every
 * step of the plan (the page shows the first six or eight, and four), the
 * coaching focus history and the trainer's highlights saved with the report,
 * the scans' days, and the whole Pulse (SubjectiveClientCopy).
 */
export interface ScreenExtras {
  machines: { label: string; start: string; now: string; change: string; pct: string; tone: SheetTone }[];
  plan: string[];
  /** "Pace · achieved after 3 weeks · set by AJ", from the report's focusSnapshot. */
  focusLines: string[];
  /** The 4 P's notes the trainer included in the summary (performanceMatrix.includedNotes). */
  highlights: string[];
  /** The first and the latest InBody scan's days, when there are scans. */
  bodyDays: { first: string | null; latest: string | null } | null;
  /** The Pulse the page prints from, whole, or null. */
  pulse: { assessment: SubjectiveAssessment; previous: PreviousAssessmentRef | null; date: string } | null;
}

/* ------------------------------------------------------------------ */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "October 13, 2026" from a day key; the key itself when it isn't one. */
export function longDay(key: string | null | undefined): string | null {
  if (!key) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key);
  if (!m) return key;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

const monthYear = (key: string) => {
  const m = /^(\d{4})-(\d{2})/.exec(key);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : key;
};

const realStat = (v: number | undefined | null): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

const clean = (s: string | null | undefined) => (typeof s === "string" ? s.trim() : "");

const fromPTone = (t: PTone): SheetTone => (t === "ok-strong" ? "ok" : t === "none" ? "plain" : t);

/**
 * The focus a trainer chose for this report: its own, else the client's.
 * Null when nobody has chosen one: the page then follows A goal to hit's
 * order (`reportFocus`) but never prints it, and nothing saves it.
 */
export function chosenFocus(report: Pick<ProgressReport, "focus">, client: Pick<Client, "trainingFocus">): TrainingFocus | null {
  return focusOf(report.focus) ?? focusOf(client.trainingFocus);
}

/** The order the page follows: the chosen focus, else A goal to hit's. */
export function reportFocus(report: Pick<ProgressReport, "focus">, client: Pick<Client, "trainingFocus">): TrainingFocus {
  return chosenFocus(report, client) ?? { kind: "goal" };
}

/* ------------------------------------------------------------------ */

function statTiles(report: ProgressReport) {
  const a = report.attendance;
  const on = (k: keyof NonNullable<typeof a.toggles>) => a.toggles?.[k] !== false;
  const recorded = a.unrecordedSets ? " (recorded)" : "";
  const tiles: NonNullable<SheetModel["stats"]> = [];
  const add = (key: keyof NonNullable<typeof a.toggles>, label: string, v: number | undefined, unit?: string, tone?: SheetTone) => {
    const n = realStat(v);
    if (on(key) && n !== null) tiles.push({ label, value: n.toLocaleString("en-US"), unit, tone });
  };
  add("totalVolume", `Volume${recorded}`, a.totalVolume, "lb");
  add("totalReps", `Reps${recorded}`, a.totalReps);
  add("totalGoodReps", "Top-quality reps", a.totalGoodReps, undefined, "ok");
  add("avgRestDays", "Average rest", a.avgRestDays, "days");
  add("avgDuration", "Session length", a.avgDuration, "min");
  return tiles;
}

function machineRows(report: ProgressReport) {
  const mp = report.machineProgression;
  if (!mp) return [];
  const byId = new Map(mp.rows.map((r) => [r.machineId, r]));
  return mp.includedMachineIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
}

/**
 * Everything the trainer wrote on the Blueprint step, in the order the client
 * reads a plan: the checkpoints, then the track's own lines. A line the goals
 * module already says (the SMART goal as the next goal, the anchor as the why
 * they started) is not said twice.
 */
function planItems(report: ProgressReport, machineName?: (id: string) => string | null): string[] {
  const items: string[] = [];
  for (const c of report.goals?.checkpoints ?? []) if (clean(c.text)) items.push(clean(c.text));
  const rm = report.roadmap;
  const target = rm?.targetMachineId && machineName ? clean(machineName(rm.targetMachineId)) : "";
  const same = (a: string, b: string | null | undefined) => a.toLowerCase() === clean(b).toLowerCase();
  if (rm?.trackType === "maintenance") {
    for (const h of rm.selectedHabits ?? []) if (clean(h) && h !== "Other") items.push(clean(h));
    if (rm.routineChangeRequested && clean(rm.routineModifications)) items.push(clean(rm.routineModifications));
  } else if (rm?.trackType === "goals") {
    const smart = clean(rm.smartGoal);
    if (smart && !same(smart, report.goals?.nextGoal)) items.push(`Goal: ${smart}`);
    const anchor = clean(rm.emotionalAnchor);
    if (anchor && !same(anchor, report.goals?.originalWhy)) items.push(`Why it matters: “${anchor}”`);
    if (target) items.push(`Target machine: ${target}.`);
    for (const g of rm.goalActions ?? []) if (clean(g)) items.push(clean(g));
    if (clean(rm.machinePlan)) items.push(clean(rm.machinePlan));
  } else if (rm?.trackType === "refinement") {
    if (clean(rm.refinementFocusArea)) items.push(`Focus on ${clean(rm.refinementFocusArea)}.`);
    if (target) items.push(`Target machine: ${target}.`);
    if (clean(rm.routineIntervention)) items.push(clean(rm.routineIntervention));
  }
  return items;
}

/** How many of the plan's items the page has room for. */
const PLAN_ITEMS_ON_PAGE = 4;

const BODY_ROWS: { key: MeasureKey; label: string }[] = [
  { key: "percentBodyFat", label: "Body fat" },
  { key: "bodyFatMassLb", label: "Fat mass" },
  { key: "skeletalMuscleMassLb", label: "Muscle" },
  { key: "weightLb", label: "Weight" },
];

function bodyCells(scans: InBodyScan[], reportDate: string, variation: InBodyVariation) {
  const view = reportInBody(scans, reportDate);
  if (!view) return null;
  const { latest, first, count } = view;
  const cells = BODY_ROWS.filter((r) => typeof latest[r.key] === "number").map((r) => {
    const delta = first ? changeBetween(first, latest, r.key) : null;
    const called = delta === null ? "none" : callChange(r.key, delta, variation);
    const tone = changeTone(r.key, delta, variation);
    return {
      label: r.label,
      now: formatMeasure(latest[r.key], r.key),
      from: first ? formatMeasure(first[r.key], r.key) : undefined,
      // A change the scanner can't tell from itself is never printed as progress.
      change: delta === null ? "first scan" : delta === 0 ? "no change" : called === "within" ? "about the same" : formatChange(delta, r.key),
      tone: (tone === "good" ? "ok" : tone === "watch" ? "warn" : "plain") as SheetTone,
    };
  });
  const scansWord = `${count} scan${count === 1 ? "" : "s"}`;
  return {
    count,
    firstDay: first ? longDay(first.testedAt) : null,
    latestDay: longDay(latest.testedAt),
    title: first ? `Your body, ${monthYear(first.testedAt)} to ${monthYear(latest.testedAt)}` : "Your body",
    sub: `InBody · ${scansWord}`,
    short: first ? `Your body · ${scansWord} since ${monthYear(first.testedAt)}` : `Your body · ${scansWord}`,
    cells,
  };
}

function pulseLines(assessment: SubjectiveAssessment, previous: PreviousAssessmentRef | null) {
  const s = summarize(assessment, previous);
  const lines: { label: string | null; text: string }[] = [];
  if (s.largestImprovement) {
    lines.push({ label: "Biggest win", text: `${s.largestImprovement.title}, better since ${longDay(previous?.date) ?? "last time"}.` });
  }
  if (s.largestOpportunity) lines.push({ label: "One thing to work on", text: `${s.largestOpportunity.title}.` });
  if (clean(assessment.coachSummary)) lines.push({ label: "In short", text: clean(assessment.coachSummary) });
  return lines.slice(0, 3);
}

/* ------------------------------------------------------------------ */

export function planSheet(input: SheetInputs): SheetPlan {
  const { report } = input;
  const chosen = chosenFocus(report, input.client);
  const focus: TrainingFocus = chosen ?? { kind: "goal" };
  const tiles = statTiles(report);
  const cards = reportCards(report.highlights);
  const mrows = machineRows(report);
  const rated = FOUR_PS.filter((p) => rankFromScore(report.performanceMatrix?.[p]?.score) !== null);
  const body = Array.isArray(input.scans) ? bodyCells(input.scans, report.date, input.variation) : null;
  // A Pulse prints when the client answered anything (as the old client copy
  // did); its lines are the win, the one thing to work on and the summary,
  // and a first Pulse with none of those still says it is on file.
  const printedPulse = input.pulse && typeof input.pulse === "object" && answeredCount(input.pulse.assessment) > 0 ? input.pulse : null;
  const pulseFound = printedPulse ? pulseLines(printedPulse.assessment, printedPulse.previous) : [];
  const pulse = printedPulse && pulseFound.length === 0 ? [{ label: null, text: "Your Pulse is on file with the coaching team." }] : pulseFound;
  const g = report.goals;
  const why = clean(g?.originalWhy);
  const lastGoal = clean(g?.previousGoal);
  const nextGoal = clean(g?.nextGoal);
  const planAll = planItems(report, input.machineName);
  const checkIn = g?.followUpDate ? `Next check-in ${longDay(g.followUpDate)}` : null;
  const plan = planAll.slice(0, PLAN_ITEMS_ON_PAGE);
  const coach = clean(report.trainerNotes);
  const sessions = report.attendance.toggles?.totalSessions === false ? null : realStat(report.attendance.totalSessions);

  // The next check-in is the plan's last line. With no plan to say (every new
  // report has a check-in 90 days out) it goes under the next goal instead of
  // taking a row of its own; only with neither does the plan carry it alone.
  const checkInWithGoal = plan.length === 0 && !!checkIn && !!nextGoal;
  const sameDay = !!g?.followUpDate && g.followUpDate === g?.nextGoalTargetDate;
  const narrative = clean(report.attendance.narrative);
  const facts: PageFacts = {
    sessions,
    narrative: !!narrative,
    statTiles: tiles.length,
    accolades: cards.length,
    machines: mrows.length,
    ratedPs: rated.length,
    bodyScans: input.scans === null ? null : input.scans === "failed" ? "failed" : body?.count ?? 0,
    pulse: input.pulse === "reading" ? null : input.pulse === "failed" ? "failed" : !!printedPulse,
    goals: !!(why || lastGoal || nextGoal),
    plan: plan.length > 0 || (!!checkIn && !nextGoal),
    coach: !!coach,
  };
  const avail = availability(facts);
  // A Pulse-only report is its Pulse and nothing else, as it always was.
  const ticked = report.isCheckInOnly ? (["pulse"] as ModuleId[]) : tickedModules(focus.kind, avail, pageChoiceOf(report.pageChoice));
  const rows = pageRows(focus.kind, ticked, avail);
  const content: PageContent = {
    narrativeChars: narrative.length,
    machineRows: mrows.length,
    machineNarrativeChars: clean(report.machineProgression?.narrative).length,
    accoladeHero: cards.map((c) => c.hero.length),
    accoladeContext: cards.map((c) => c.context.length),
    pNotes: rated.map((p) => clean(report.performanceMatrix[p]?.note).length),
    pulseLines: pulse.map((l) => (l.label ? l.label.length + 2 : 0) + l.text.length),
    goals: {
      why: why.length,
      last: lastGoal.length,
      lastNote: clean(g?.previousGoalNote).length,
      next: nextGoal.length,
      checkIn: checkInWithGoal && !sameDay ? (checkIn ?? "").length : 0,
    },
    planItems: plan.map((it) => it.length),
    coachChars: coach.length,
    hasFocusLine: !!chosen,
  };
  const fit = fitPage(rows, content);
  const density: Density = fit.density ?? "condensed";

  const shownRows = mrows.slice(0, MACHINE_ROWS[density]);
  const words = input.sessionWords;
  // What the count counts from, said as history-claims.ts allows: "your first
  // session" only when Journey holds the whole story and the window starts
  // there; a window the trainer chose, or Journey's first session for a client
  // older than Journey, is only "since" its day.
  // (The recalculation stores the first session's day as the start when none
  // was chosen, so a start that IS the first session is not a chosen one.)
  const start = report.attendance.customStartDate;
  const custom = start && start !== report.attendance.firstSessionDate ? longDay(start) : null;
  const firstDay = custom ?? longDay(report.attendance.firstSessionDate);
  const wholeStory = !custom && words.first !== "Since";
  // One line beside the coach's name: short words, so it never wraps.
  const subParts = [
    // The studio's day, never the UTC one (a first visit at 7:30 PM is that day).
    input.joined ? `Since ${longDay(studioDateKey(input.joined))}` : null,
    // A read that hasn't answered says nothing, never "First report".
    input.previousReportDay === "unknown" ? null : input.previousReportDay ? `Last report ${longDay(input.previousReportDay)}` : "First report",
  ].filter(Boolean);

  const model: SheetModel = {
    density,
    rows,
    studioName: input.studioName,
    dateLabel: longDay(report.date) ?? report.date,
    clientName: `${input.client.firstName} ${input.client.lastName}`.trim(),
    subline: subParts.join(" · ") || null,
    focusLine: focusLine(chosen),
    coachName: input.coachName,
    coachRole: input.coachRole,
    reportRef: `MSF-${report.id ? report.id.slice(-8).toUpperCase() : "DRAFT"}`,
    thanks: sessions !== null || narrative
      ? {
          sessions: sessions !== null ? sessions.toLocaleString("en-US") : null,
          sessionsWord: wholeStory ? "sessions in all" : "sessions",
          sessionsSub: [firstDay ? `${wholeStory ? "since your first session," : "since"} ${firstDay}` : null, words.before].filter(Boolean).join(" · ") || null,
          quote: narrative,
          signedBy: input.coachName.split(" ")[0] ?? input.coachName,
        }
      : undefined,
    stats: tiles,
    accolades: cards.map((c) => ({
      label: [c.title, c.label].filter(Boolean).join(" · "),
      hero: c.hero,
      context: c.context,
      tone: c.tone === "gain" ? "gain" : c.tone === "quality" ? "ok" : "plain",
    })),
    machines: mrows.length
      ? {
          title: focus.kind === "everyday" ? "Stronger where it counts" : focus.kind === "body" ? "The strength behind it" : "Machines, start to now",
          rows: shownRows.map((r) => {
            const delta = r.currentWeight - r.startWeight;
            const pct = `${r.percentageIncrease > 0 ? "+" : ""}${r.percentageIncrease}%`;
            return {
              label: r.label,
              start: `${r.startWeight} lb`,
              now: `${r.currentWeight} lb`,
              change: density === "condensed" ? `${delta > 0 ? "+" : ""}${delta} · ${pct.replace("+", "")}` : pct,
              tone: (delta > 0 ? "gain" : "plain") as SheetTone,
            };
          }),
          note: mrows.length > shownRows.length ? `${shownRows.length} of ${mrows.length} machines shown` : null,
          narrative: clean(report.machineProgression?.narrative) || null,
        }
      : undefined,
    fourps: rated.map((p) => {
      const entry = report.performanceMatrix[p];
      const rank = rankFromScore(entry?.score);
      return { title: P_TITLES[p], word: masteryWord(rank), tone: fromPTone(toneFromRank(rank)), rank, note: clean(entry?.note) || null };
    }),
    body: body ? { title: body.title, sub: body.sub, short: body.short, cells: body.cells } : undefined,
    pulse:
      pulse.length && printedPulse
        ? { title: focus.kind === "everyday" || focus.kind === "pain-free" ? "How you are feeling" : "Your Pulse", sub: longDay(printedPulse.date), lines: pulse }
        : undefined,
    goals:
      why || lastGoal || nextGoal
        ? {
            why: why || null,
            last: lastGoal
              ? {
                  goal: lastGoal,
                  outcome: g?.previousGoalOutcome ? GOAL_OUTCOME_LABELS[g.previousGoalOutcome] : null,
                  outcomeTone: g?.previousGoalOutcome === "achieved" ? "ok" : g?.previousGoalOutcome === "stalled" ? "warn" : "plain",
                  note: clean(g?.previousGoalNote) || null,
                }
              : null,
            next: nextGoal
              ? {
                  goal: nextGoal,
                  by: g?.nextGoalTargetDate
                    ? `By ${longDay(g.nextGoalTargetDate)}${checkInWithGoal && sameDay ? ", our next check-in" : ""}`
                    : null,
                  checkIn: checkInWithGoal && !(sameDay && g?.nextGoalTargetDate) ? checkIn : null,
                }
              : null,
          }
        : undefined,
    plan: plan.length || (checkIn && !nextGoal) ? { title: "Your plan", items: plan, checkIn } : undefined,
    coach: coach ? { title: "From your coach", text: coach } : undefined,
  };

  const screen: ScreenExtras = {
    machines: mrows.map((r) => {
      const delta = r.currentWeight - r.startWeight;
      return {
        label: r.label,
        start: `${r.startWeight} lb`,
        now: `${r.currentWeight} lb`,
        change: `${delta > 0 ? "+" : ""}${delta} lb`,
        pct: `${r.percentageIncrease > 0 ? "+" : ""}${r.percentageIncrease}%`,
        tone: (delta > 0 ? "gain" : "plain") as SheetTone,
      };
    }),
    plan: planAll,
    focusLines: (report.focusSnapshot ?? []).map(snapshotLine),
    highlights: (report.performanceMatrix?.includedNotes ?? []).map(clean).filter(Boolean),
    bodyDays: body ? { first: body.firstDay, latest: body.latestDay } : null,
    pulse: pulse.length ? printedPulse : null,
  };

  return { focus, chosen, avail, ticked, rows, fit, content, model, screen };
}
