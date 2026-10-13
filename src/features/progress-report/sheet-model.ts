/**
 * WHAT THE PRINTED PAGE SAYS, as plain values (report-page.ts decides which
 * modules and how dense; this is their words and numbers). ReportSheet.tsx
 * only draws a SheetModel, so the sheet can be printed from fixtures by the
 * print check and from a real report by the app with the same component.
 *
 * Every field a module needs is optional at the module's level: a module the
 * model has no values for is not drawn, whatever the rows say.
 */
import type { Density, ModuleId } from "./report-page";

export type SheetTone = "gain" | "ok" | "alert" | "warn" | "live" | "plain";

export interface SheetModel {
  density: Density;
  rows: ModuleId[][];
  studioName: string;
  /** "October 13, 2026". */
  dateLabel: string;
  clientName: string;
  /** "With Max Strength since November 27, 2023 · Previous report July 14, 2026". */
  subline: string | null;
  /** "Your focus: …", or null with no focus. */
  focusLine: string | null;
  coachName: string;
  coachRole: string | null;
  /** "MSF-7F3K2Q9A". */
  reportRef: string;

  thanks?: {
    /** The number, or null when the session tile is off and the thank-you prints alone. */
    sessions: string | null;
    /** "sessions" / "sessions in Journey". */
    sessionsWord: string;
    /** "since November 27, 2023", "2 a week, all year" … */
    sessionsSub: string | null;
    quote: string;
    signedBy: string;
  };
  stats?: { label: string; value: string; unit?: string; tone?: SheetTone }[];
  accolades?: { label: string; hero: string; context: string; tone: SheetTone }[];
  machines?: {
    title: string;
    rows: { label: string; start: string; now: string; change: string; tone: SheetTone }[];
    /** "8 of the 14 machines in the report, biggest gain first", when not all print. */
    note: string | null;
    /** The trainer's line about the machines, beside the table on a roomy page. */
    narrative: string | null;
  };
  fourps?: { title: string; word: string; tone: SheetTone; rank: number | null; note: string | null }[];
  body?: {
    title: string;
    sub: string;
    /** The one-line label beside another module, half the page wide: "Your body · 3 scans since January 2026". */
    short: string;
    cells: { label: string; now: string; change: string; tone: SheetTone; from?: string }[];
  };
  pulse?: { title: string; sub: string | null; lines: { label: string | null; text: string }[] };
  goals?: {
    why: string | null;
    last: { goal: string; outcome: string | null; outcomeTone: SheetTone; note: string | null } | null;
    /** `checkIn`: the next check-in, said here when the plan has nothing else to say (it is the plan's line otherwise). */
    next: { goal: string; by: string | null; checkIn: string | null } | null;
  };
  plan?: { title: string; items: string[]; checkIn: string | null };
  coach?: { title: string; text: string };
}

/** Whether a module has its values in the model (the sheet draws nothing for one that hasn't). */
export function modelHas(model: SheetModel, m: ModuleId): boolean {
  switch (m) {
    case "thanks":
      return !!model.thanks;
    case "stats":
      return (model.stats?.length ?? 0) > 0;
    case "accolades":
      return (model.accolades?.length ?? 0) > 0;
    case "machines":
      return (model.machines?.rows.length ?? 0) > 0;
    case "fourps":
      return (model.fourps?.length ?? 0) > 0;
    case "body":
      return (model.body?.cells.length ?? 0) > 0;
    case "pulse":
      return (model.pulse?.lines.length ?? 0) > 0;
    case "goals":
      return !!model.goals && !!(model.goals.why || model.goals.last || model.goals.next);
    case "plan":
      return (model.plan?.items.length ?? 0) > 0 || !!model.plan?.checkIn;
    case "coach":
      return !!model.coach?.text.trim();
  }
}
