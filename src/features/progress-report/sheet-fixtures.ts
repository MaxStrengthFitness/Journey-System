/**
 * Sample reports for the one-page sheet: its tests and the headless print
 * check (harness/report-print). Made-up clients, shaped like the canvas
 * AJ chose from (Oct 13 2026): A, a goal to hit with everything on; C,
 * everyday strength with no InBody, accolades or 4 P's; D, body
 * composition; a brand-new client; and one with far too much to say.
 */
import type { ProgressReport } from "../../types";
import { DEFAULT_INBODY_VARIATION } from "../inbody/variation";
import type { InBodyScan } from "../inbody/types";
import type { SheetInputs } from "./sheet-from-report";
import { emptyAssessment } from "../subjective-report/scoring";

const P = (score: number, note = "") => ({ score, note, talkingPoints: [] });

export function baseReport(over: Partial<ProgressReport> = {}): ProgressReport {
  return {
    id: "rep-7f3k2q9a",
    clientId: "client-dana",
    trainerId: "t-alex",
    trainerName: "Alex Rivera",
    date: "2026-10-13",
    status: "Finalized",
    attendance: {
      score: 0,
      totalSessions: 213,
      avgDuration: 0,
      punctuality: "",
      narrative:
        "Dana, three years in and you are stronger on every machine you do than the day you walked in. Thank you for showing up twice a week: it is why these numbers moved.",
      firstSessionDate: "2023-11-27",
      totalVolume: 412880,
      totalReps: 6240,
      totalGoodReps: 318,
      unrecordedSets: 931,
      avgRestDays: 3.2,
      customStartDate: "",
      toggles: { totalSessions: true, totalVolume: true, totalReps: true, totalGoodReps: true, avgRestDays: true, avgDuration: true },
    },
    highlights: [
      { label: "Leg Press", machineId: "m-leg-press", metricType: "strength_gain", headline: "+36%", detail: "180 → 245 lb over 41 sessions", percentageIncrease: 36, startValue: "180", currentValue: "245" },
      { label: "Pulldown", machineId: "m-pulldown", metricType: "consistent_quality", headline: "12 in a row", detail: "Top-quality sets, August to October" },
      { label: "Every session", metricType: "consistency", headline: "2.1 a week", detail: "For 26 weeks, against a goal of 2" },
    ],
    performanceMatrix: {
      posture: P(60, "Shoulders stay down on the Pulldown now."),
      pace: P(80, "Ten seconds each way, every rep."),
      path: P(40, "Keep the knees tracking over the toes on the Leg Press."),
      purpose: P(100, "You know exactly why you are here."),
    },
    milestones: { originalWhy: "", smartGoal: "" },
    strategy: { primaryPlan: "", focusAreas: "" },
    roadmap: { trackType: "goals", goalActions: ["Add 2 lb on the Leg Press after eight clean reps."], machinePlan: "" },
    machineProgression: {
      includedMachineIds: ["lp", "pd", "cp", "cr", "lc", "op", "lu", "ha", "ab", "ex", "di", "pu", "bi", "lr"],
      rows: [
        ["lp", "Leg Press", 180, 245, 36],
        ["pd", "Pulldown", 90, 120, 33],
        ["cp", "Chest Press", 70, 92, 31],
        ["cr", "Compound Row", 60, 78, 30],
        ["lc", "Leg Curl", 52, 66, 27],
        ["op", "Overhead Press", 40, 50, 25],
        ["lu", "Lumbar", 120, 148, 23],
        ["ha", "Hip Abduction", 80, 96, 20],
        ["ab", "Abdominal", 60, 70, 17],
        ["ex", "Leg Extension", 70, 80, 14],
        ["di", "Seated Dip", 60, 68, 13],
        ["pu", "Pullover", 70, 78, 11],
        ["bi", "Bicep", 30, 32, 7],
        ["lr", "Lateral Raise", 20, 21, 5],
      ].map(([machineId, label, startWeight, currentWeight, percentageIncrease]) => ({
        machineId: machineId as string,
        label: label as string,
        startWeight: startWeight as number,
        currentWeight: currentWeight as number,
        percentageIncrease: percentageIncrease as number,
      })),
    },
    goals: {
      originalWhy: "Keep up with my grandkids on the ski trip.",
      previousGoal: "Leg Press 230 lb",
      previousGoalOutcome: "achieved",
      previousGoalNote: "You reached 245 lb in September.",
      nextGoal: "Leg Press 260 lb, at the same ten-second pace",
      nextGoalTargetDate: "2027-01-11",
      followUpDate: "2027-01-11",
      checkpoints: [
        { id: "c1", text: "Two sessions a week, holidays included.", done: false },
        { id: "c2", text: "Knees over the second toe, all the way down.", done: false },
      ],
    },
    trainerNotes:
      "Every machine is up, and your form is holding as the weight climbs. Keep the two-a-week rhythm and January will be another step up.",
    createdAt: null,
    ...over,
  };
}

const scan = (testedAt: string, weightLb: number, skeletalMuscleMassLb: number, bodyFatMassLb: number, percentBodyFat: number): InBodyScan =>
  ({ id: testedAt, testedAt, weightLb, skeletalMuscleMassLb, bodyFatMassLb, percentBodyFat }) as InBodyScan;

export const SCANS_DANA: InBodyScan[] = [scan("2026-01-12", 168.6, 59.7, 52.6, 31.5), scan("2026-05-04", 165.0, 60.9, 48.8, 29.6), scan("2026-10-01", 162.4, 61.8, 45.6, 28.1)];

const PULSE = {
  assessment: { ...emptyAssessment(), coachSummary: "Sleep and energy are up since July, and the low back feels better since Lumbar went in." },
  previous: null,
  date: "2026-10-06",
};

export function inputsFor(report: ProgressReport, over: Partial<SheetInputs> = {}): SheetInputs {
  return {
    report,
    client: { firstName: "Dana", lastName: "Whitfield", trainingFocus: null },
    studioName: "Strongsville Ohio",
    coachName: "Alex Rivera",
    coachRole: "Life Transformer",
    sessionWords: { total: "Total Sessions", first: "First Session", useFirst: "Use First Session", before: null },
    joined: new Date("2023-11-27T12:00:00"),
    previousReportDay: "2026-07-14",
    scans: SCANS_DANA,
    variation: DEFAULT_INBODY_VARIATION,
    pulse: PULSE,
    ...over,
  };
}

/** A: a goal to hit, every module ticked. */
export const FULL = inputsFor(baseReport({ focus: { kind: "goal" }, modules: ["thanks", "stats", "accolades", "machines", "fourps", "body", "pulse", "goals", "plan", "coach"] }));

/** C: everyday strength; no InBody, accolades or 4 P's on file. */
export const EVERYDAY = inputsFor(
  baseReport({
    focus: { kind: "everyday" },
    highlights: [],
    performanceMatrix: { posture: P(0), pace: P(0), path: P(0), purpose: P(0) },
  }),
  { scans: [], client: { firstName: "Ruth", lastName: "Calloway", trainingFocus: { kind: "everyday" } } },
);

/** D: body composition. */
export const BODY = inputsFor(baseReport({ focus: { kind: "body" } }), { client: { firstName: "Jordan", lastName: "Hale", trainingFocus: { kind: "body" } } });

/** A brand-new client: six sessions, nothing rated, no scans, no Pulse. */
export const NEW_CLIENT = inputsFor(
  baseReport({
    attendance: { ...baseReport().attendance, totalSessions: 6, totalVolume: 0, totalReps: 0, totalGoodReps: 0, avgRestDays: 0, unrecordedSets: 0, narrative: "" },
    highlights: [],
    performanceMatrix: { posture: P(0), pace: P(0), path: P(0), purpose: P(0) },
    machineProgression: { includedMachineIds: [], rows: [] },
    goals: { originalWhy: "Feel steady on the stairs again.", previousGoal: "", previousGoalOutcome: null, previousGoalNote: "", nextGoal: "", nextGoalTargetDate: "", followUpDate: "", checkpoints: [] },
    roadmap: { trackType: "maintenance", selectedHabits: [] },
    trainerNotes: "",
  }),
  { scans: [], pulse: null, previousReportDay: null },
);

/** Everything ticked and far too much written. */
export const OVERFULL = inputsFor(
  baseReport({
    focus: { kind: "goal" },
    modules: ["thanks", "stats", "accolades", "machines", "fourps", "body", "pulse", "goals", "plan", "coach"],
    attendance: { ...baseReport().attendance, narrative: "So much to say. ".repeat(80) },
    trainerNotes: "And a very long closing note. ".repeat(60),
  }),
);
