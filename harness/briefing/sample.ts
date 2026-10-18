/**
 * A made-up client for the briefing preview, shaped like a long-standing
 * client on Routine A: Dana Sample, 111 sessions, six machines, a Heads up, a
 * Follow up next time question. Nobody's real data. It never ships.
 *
 *   ?seen=1       Sam (the trainer signed in) trained Dana since the Heads up,
 *                 so it is one quiet line
 *   &flags=1      a low-back flag, so Before you start has a limit
 */
import type { Client, Machine, Routine, Trainer, WorkoutSession } from "../../src/types";

const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const dayKey = (days: number) => ago(days).toISOString().slice(0, 10);

export const TRAINER = { id: "t-preview", fullName: "Sam Lee", initials: "SL", role: "LifeTransformer" } as unknown as Trainer;

/* A floor in walking order. */
export const FLOOR: Machine[] = [
  ["m-hip-add", "Hip Adduction"],
  ["m-hip-abd", "Hip Abduction"],
  ["m-leg-press", "Leg Press"],
  ["m-ext", "Leg Extension"],
  ["m-leg-curl", "Leg Curl"],
  ["m-compound-row", "Compound Row"],
  ["m-pullover", "Seated Pullover"],
  ["m-pulldown", "Pulldown"],
  ["m-chest-press", "Chest Press"],
  ["m-dip", "Seated Dip"],
  ["m-lateral-raise", "Lateral Raise"],
  ["m-lumbar", "Lumbar"],
  ["m-neck", "Neck Extension"],
].map(([id, name]) => ({ id, name }) as Machine);

export const CLIENT = {
  id: "c-sample",
  firstName: "Dana",
  lastName: "Sample",
  gender: "Female",
  homeStudioId: "s-sample",
  sessionCount: 111,
  historyIsComplete: true,
  clinicalFlags: params.get("flags") === "1" ? ["gen-low-back"] : [],
  currentMachineMetrics: {
    "m-hip-add": { weight: 154, reps: 8 },
    "m-hip-abd": { weight: 52, reps: 10 },
    "m-leg-press": { weight: 142, reps: 9 },
    "m-compound-row": { weight: 70, reps: 9 },
    "m-dip": { weight: 60, reps: 9 },
    "m-lumbar": { weight: 44, reps: 8 },
    "m-pullover": { weight: 140, seconds: 90, isTSC: true },
  },
} as unknown as Client;

export const ROUTINES: Routine[] = [
  { id: "rA", clientId: "c-sample", name: "Routine A", machineIds: ["m-hip-add", "m-hip-abd", "m-leg-press", "m-compound-row", "m-dip", "m-lumbar"] } as Routine,
];

const session = (id: string, days: number, trainerId: string) =>
  ({
    id,
    clientId: "c-sample",
    status: "Completed",
    routineId: "rA",
    sessionType: "Standard",
    trainerId,
    trainerInitials: trainerId === TRAINER.id ? "SL" : "JM",
    date: dayKey(days),
    startTime: ago(days),
    endTime: ago(days),
  }) as unknown as WorkoutSession;

export const SESSIONS: WorkoutSession[] =
  params.get("seen") === "1"
    ? [session("s1", 2, TRAINER.id), session("s2", 9, "t-jess")]
    : [session("s1", 2, "t-jess"), session("s2", 9, "t-jess")];

/** What a read of `path` answers, for stubs/firestore.ts. */
export function PREVIEW_DOCS(path: string): Record<string, unknown>[] {
  if (path === "journalEntries") {
    return [
      {
        id: "hu1",
        clientId: "c-sample",
        studioId: "s-sample",
        kind: "general",
        category: "health",
        body: "Left knee sore after moving house at the weekend. Easy on the leg press.",
        importance: "elevated",
        machineId: null,
        focusId: null,
        sessionId: null,
        origin: "manual",
        authorId: "t-jess",
        authorInitials: "JM",
        authorName: "Jess Moreno",
        occurredAt: ago(5),
        createdAt: ago(5),
        updatedAt: ago(5),
        effectiveFrom: null,
        effectiveUntil: null,
        resolvedAt: null,
        isArchived: false,
        searchTags: [],
      },
    ];
  }
  /* Sam's own notebook (the briefing's "Just for me", phase 4). */
  if (path === "trainers/uid-preview/notes") {
    return [
      {
        id: "n1",
        title: "Dana Sample — working notes",
        body: "",
        kind: "note",
        folderId: null,
        clientIds: ["c-sample"],
        clientNames: { "c-sample": "Dana Sample" },
        pinned: false,
        sharedWith: null,
        log: [{ id: "j1", at: ago(4).getTime(), text: "Guardians bet: ask how it went", clientId: "c-sample" }],
        updatedAt: ago(4),
      },
    ];
  }
  if (path === "clients/c-sample/ford") {
    return [
      {
        id: "f1",
        clientId: "c-sample",
        studioId: "s-sample",
        pillar: "family",
        body: "Daughter's wedding in Napa",
        followUp: "How was the wedding?",
        followUpBy: "Jess Moreno",
        followUpAt: ago(3),
        occurredAt: ago(30),
        isArchived: false,
      },
    ];
  }
  return [];
}

/* Eight sessions on Routine A, every three or four days, the weights edging
   up: what the grid under "How they've been doing" draws. Made up. */
const START_WEIGHT: Record<string, number> = { "m-hip-add": 140, "m-hip-abd": 44, "m-leg-press": 128, "m-compound-row": 62, "m-dip": 52, "m-lumbar": 38 };
export const LOGS = Array.from({ length: 8 }, (_, i) => {
  const days = 2 + i * 3.5;
  const sid = `h${i}`;
  return Object.entries(START_WEIGHT).map(([machineId, w], j) => ({
    id: `${sid}-${j}`,
    sessionId: sid,
    clientId: "c-sample",
    machineId,
    outcome: "performed",
    weight: String(w + (7 - i) * 2),
    reps: String(8 + ((i + j) % 3)),
    createdAt: ago(days),
  }));
}).flat() as unknown as import("../../src/types").ExerciseLog[];
