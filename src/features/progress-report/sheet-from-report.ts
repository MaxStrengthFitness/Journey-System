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
import {
  MACHINE_ROWS,
  availability,
  defaultModules,
  fitPage,
  focusLine,
  focusOf,
  isModuleId,
  pageRows,
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
import { summarize, type PreviousAssessmentRef } from "../subjective-report/scoring";
import type { SubjectiveAssessment } from "../subjective-report/types";

export interface SheetInputs {
  report: ProgressReport;
  client: Pick<Client, "firstName" | "lastName" | "trainingFocus">;
  studioName: string;
  coachName: string;
  coachRole: string | null;
  /** The session tile's words (history-claims.ts reportSessionWords). */
  sessionWords: ReportSessionWords;
  /** The day Mindbody says the client started (joined.ts), when known. */
  joined: Date | null;
  /** The previous finalized report's day, or null for a first report. */
  previousReportDay: string | null;
  /** The client's InBody scans; null while they are read, "failed" when the read failed. */
  scans: InBodyScan[] | null | "failed";
  variation: InBodyVariation;
  /** The Pulse the page prints; null when there is none, "reading" while it is read, "failed" when it couldn't be. */
  pulse: { assessment: SubjectiveAssessment; previous: PreviousAssessmentRef | null; date: string } | null | "reading" | "failed";
}

export interface SheetPlan {
  focus: TrainingFocus;
  avail: Record<ModuleId, Availability>;
  /** What is ticked (the report's own list, else the focus's defaults the data has). */
  ticked: ModuleId[];
  rows: ModuleId[][];
  fit: Fit;
  /** What the estimate measured, for the print check to set beside the drawing. */
  content: PageContent;
  model: SheetModel;
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

/** The focus the report prints with: its own, else the client's, else A goal to hit. */
export function reportFocus(report: Pick<ProgressReport, "focus">, client: Pick<Client, "trainingFocus">): TrainingFocus {
  return focusOf(report.focus) ?? focusOf(client.trainingFocus) ?? { kind: "goal" };
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

function planItems(report: ProgressReport): string[] {
  const items: string[] = [];
  for (const c of report.goals?.checkpoints ?? []) if (clean(c.text)) items.push(clean(c.text));
  const rm = report.roadmap;
  if (rm?.trackType === "maintenance") {
    for (const h of rm.selectedHabits ?? []) if (clean(h) && h !== "Other") items.push(clean(h));
    if (rm.routineChangeRequested && clean(rm.routineModifications)) items.push(clean(rm.routineModifications));
  } else if (rm?.trackType === "goals") {
    for (const g of rm.goalActions ?? []) if (clean(g)) items.push(clean(g));
    if (clean(rm.machinePlan)) items.push(clean(rm.machinePlan));
  } else if (rm?.trackType === "refinement") {
    if (clean(rm.refinementFocusArea)) items.push(`Focus on ${clean(rm.refinementFocusArea)}.`);
    if (clean(rm.routineIntervention)) items.push(clean(rm.routineIntervention));
  }
  return items.slice(0, 4);
}

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
  const focus = reportFocus(report, input.client);
  const tiles = statTiles(report);
  const cards = reportCards(report.highlights);
  const mrows = machineRows(report);
  const rated = FOUR_PS.filter((p) => rankFromScore(report.performanceMatrix?.[p]?.score) !== null);
  const body = Array.isArray(input.scans) ? bodyCells(input.scans, report.date, input.variation) : null;
  const printedPulse = input.pulse && typeof input.pulse === "object" ? input.pulse : null;
  const pulse = printedPulse ? pulseLines(printedPulse.assessment, printedPulse.previous) : [];
  const g = report.goals;
  const why = clean(g?.originalWhy);
  const lastGoal = clean(g?.previousGoal);
  const nextGoal = clean(g?.nextGoal);
  const plan = planItems(report);
  const coach = clean(report.trainerNotes);
  const sessions = report.attendance.toggles?.totalSessions === false ? null : realStat(report.attendance.totalSessions);

  const facts: PageFacts = {
    sessions,
    statTiles: tiles.length,
    accolades: cards.length,
    machines: mrows.length,
    ratedPs: rated.length,
    bodyScans: input.scans === null ? null : input.scans === "failed" ? "failed" : body?.count ?? 0,
    pulse: input.pulse === "reading" ? null : input.pulse === "failed" ? "failed" : pulse.length > 0,
    goals: !!(why || lastGoal || nextGoal),
    plan: plan.length > 0,
    coach: !!coach,
  };
  const avail = availability(facts);
  const stored = (report.modules ?? []).filter(isModuleId);
  const ticked = report.modules ? stored : defaultModules(focus.kind, avail);
  const rows = pageRows(focus.kind, ticked, avail);
  const narrative = clean(report.attendance.narrative);
  const content: PageContent = {
    narrativeChars: narrative.length,
    machineRows: mrows.length,
    machineNarrativeChars: clean(report.machineProgression?.narrative).length,
    accoladeHero: cards.map((c) => c.hero.length),
    accoladeContext: cards.map((c) => c.context.length),
    pNotes: rated.map((p) => clean(report.performanceMatrix[p]?.note).length),
    pulseLines: pulse.map((l) => (l.label ? l.label.length + 2 : 0) + l.text.length),
    goals: { why: why.length, last: lastGoal.length, lastNote: clean(g?.previousGoalNote).length, next: nextGoal.length },
    planItems: plan.map((it) => it.length),
    coachChars: coach.length,
    hasFocusLine: true,
  };
  const fit = fitPage(rows, content);
  const density: Density = fit.density ?? "condensed";

  const shownRows = mrows.slice(0, MACHINE_ROWS[density]);
  const words = input.sessionWords;
  const firstDay = longDay(report.attendance.customStartDate || report.attendance.firstSessionDate);
  // One line beside the coach's name: short words, so it never wraps.
  const subParts = [
    input.joined ? `Since ${longDay(input.joined.toISOString().slice(0, 10))}` : null,
    input.previousReportDay ? `Last report ${longDay(input.previousReportDay)}` : "First report",
  ].filter(Boolean);

  const model: SheetModel = {
    density,
    rows,
    studioName: input.studioName,
    dateLabel: longDay(report.date) ?? report.date,
    clientName: `${input.client.firstName} ${input.client.lastName}`.trim(),
    subline: subParts.join(" · ") || null,
    focusLine: focusLine(focus),
    coachName: input.coachName,
    coachRole: input.coachRole,
    reportRef: `MSF-${report.id ? report.id.slice(-8).toUpperCase() : "DRAFT"}`,
    thanks: sessions !== null
      ? {
          sessions: sessions.toLocaleString("en-US"),
          sessionsWord: "sessions",
          sessionsSub: [firstDay ? `${words.first === "Since" ? "since" : "since your first,"} ${firstDay}` : null, words.before].filter(Boolean).join(" · ") || null,
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
            next: nextGoal ? { goal: nextGoal, by: g?.nextGoalTargetDate ? `By ${longDay(g.nextGoalTargetDate)}` : null } : null,
          }
        : undefined,
    plan: plan.length ? { title: "Your plan", items: plan, checkIn: g?.followUpDate ? `Next check-in ${longDay(g.followUpDate)}` : null } : undefined,
    coach: coach ? { title: "From your coach", text: coach } : undefined,
  };

  return { focus, avail, ticked, rows, fit, content, model };
}
