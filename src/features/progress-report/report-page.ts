/**
 * THE ONE-PAGE CLIENT COPY: its focus, its modules, and whether it fits.
 *
 * AJ, Oct 13 2026: the printed report was three pages and parts of it could
 * not be read, and "it kind of needs to be modular. So not every single
 * client's progress report is the exact same ... not everyone is training
 * for the same reason". And on the focus list: "a lot of our clients are
 * over 45 years old all the way to 85 so some do it because they need to but
 * the whole point of this progress report is to show people that this is
 * worth it". His answers: the trainer ticks the modules from smart defaults;
 * each report has a focus that leads the page; the focus lives on the client
 * too, so the studio knows what a client trains for.
 *
 * Three rules, each held by report-page.test.ts:
 *   - A module with nothing real to say is never offered, and never prints
 *     (no "—", no "not recorded" on paper). It is listed in the editor with
 *     the reason, so the trainer knows why it is missing.
 *   - The focus decides the ORDER (what leads the page) and the defaults.
 *     The trainer decides what is on it.
 *   - The page is one US Letter sheet. Roomy when the ticked modules fit at
 *     the roomy sizes, condensed when only the condensed ones fit, and
 *     "over" otherwise: the editor says how much to take off before a
 *     finalized report could print onto a second page.
 *
 * The heights below are the sheet's own (ReportSheet.tsx reads SHEET and
 * SIZES), so the estimate and the drawing cannot drift apart. The headless
 * print check (harness/report-print) holds the estimate to the real page.
 */

/* ------------------------------------------------------------------ *
 * The focus
 * ------------------------------------------------------------------ */

export type FocusKind = "everyday" | "pain-free" | "body" | "goal" | "custom";

/** Why a client trains. Lives on the client (`trainingFocus`) and is copied onto each report. */
export interface TrainingFocus {
  kind: FocusKind;
  /** The trainer's own words: the goal itself for "custom", an optional line for any other. */
  words?: string;
}

export const FOCUS_KINDS: readonly FocusKind[] = ["everyday", "pain-free", "body", "goal", "custom"];

/** As the trainer picks it, and as the client reads it ("Your focus: …"). */
export const FOCUS_LABELS: Record<FocusKind, string> = {
  everyday: "Everyday strength and independence",
  "pain-free": "Pain-free movement",
  body: "Body composition",
  goal: "A goal to hit",
  custom: "Their own goal",
};

/** One line under each choice in the picker: what the page leads with. */
export const FOCUS_LEADS: Record<FocusKind, string> = {
  everyday: "Leads with showing up, how they feel, and the strength behind daily life.",
  "pain-free": "Leads with how they feel, then form (the 4 P's), then the machines.",
  body: "Leads with InBody: fat, muscle and weight, then the strength behind it.",
  goal: "Leads with the numbers: accolades and machine gains, then the 4 P's.",
  custom: "Their goal in your words leads; the page follows A goal to hit's order.",
};

export function isFocusKind(v: unknown): v is FocusKind {
  return typeof v === "string" && (FOCUS_KINDS as readonly string[]).includes(v);
}

/** A stored focus, or null when it isn't one (an old report, a typo, an empty custom goal). */
export function focusOf(v: unknown): TrainingFocus | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { kind?: unknown; words?: unknown };
  if (!isFocusKind(o.kind)) return null;
  const words = typeof o.words === "string" ? o.words.trim() : "";
  if (o.kind === "custom" && !words) return null;
  return words ? { kind: o.kind, words } : { kind: o.kind };
}

/** "Your focus: …" on the page and the briefing: the custom goal's own words, else the focus's name. */
export function focusLine(focus: TrainingFocus | null): string | null {
  if (!focus) return null;
  if (focus.kind === "custom") return focus.words ?? null;
  return focus.words ? `${FOCUS_LABELS[focus.kind]}: ${focus.words}` : FOCUS_LABELS[focus.kind];
}

/* ------------------------------------------------------------------ *
 * The modules
 * ------------------------------------------------------------------ */

export type ModuleId = "thanks" | "stats" | "accolades" | "machines" | "fourps" | "body" | "pulse" | "goals" | "plan" | "coach";

export const MODULE_IDS: readonly ModuleId[] = ["thanks", "stats", "accolades", "machines", "fourps", "body", "pulse", "goals", "plan", "coach"];

export const MODULE_LABELS: Record<ModuleId, string> = {
  thanks: "Sessions and your thank-you",
  stats: "The numbers (volume, reps, rest)",
  accolades: "Accolades",
  machines: "Machines, start to now",
  fourps: "The 4 P's",
  body: "Body composition (InBody)",
  pulse: "How they feel (Pulse)",
  goals: "Why they started and the next 90 days",
  plan: "Their plan",
  coach: "Your closing note",
};

export function isModuleId(v: unknown): v is ModuleId {
  return typeof v === "string" && (MODULE_IDS as readonly string[]).includes(v);
}

/** What the page has to say, from the report and the reads the editor already makes. */
export interface PageFacts {
  /** The session tile's number (realStat), null when there isn't one. */
  sessions: number | null;
  /** The trainer's thank-you (the Volume step's narrative): it prints with or without the number. */
  narrative: boolean;
  /** Stat tiles switched on that have a real number. */
  statTiles: number;
  /** Accolade cards that print (accolades.ts reportCards). */
  accolades: number;
  /** Machine rows the trainer ticked on the Machines step. */
  machines: number;
  /** P's rated on the Dial. */
  ratedPs: number;
  /** InBody scans up to the report's date; null while they are being read, "failed" when the read failed. */
  bodyScans: number | null | "failed";
  /** A finalized Pulse with answers; null while it is being read, "failed" when the read failed. */
  pulse: boolean | null | "failed";
  /** Why they started, last time's goal, or the next goal: any of them written. */
  goals: boolean;
  /** A training plan with something in it, or a day to check in again. */
  plan: boolean;
  /** A closing note. */
  coach: boolean;
}

export interface Availability {
  has: boolean;
  /** Why it isn't offered, said to the trainer (never on the page). Null when it is. */
  why: string | null;
  /** Still reading: not offered yet, and not called missing. */
  reading?: boolean;
}

export function availability(f: PageFacts): Record<ModuleId, Availability> {
  const yes = (): Availability => ({ has: true, why: null });
  const no = (why: string): Availability => ({ has: false, why });
  return {
    thanks: f.sessions !== null || f.narrative ? yes() : no("No completed sessions in the report's window yet, and no thank-you written."),
    stats: f.statTiles > 0 ? yes() : no("No number on the Volume step has enough data yet."),
    accolades: f.accolades > 0 ? yes() : no("No accolade the data can back yet (the Accolades step)."),
    machines: f.machines > 0 ? yes() : no("No machines ticked on the Machines step."),
    fourps: f.ratedPs > 0 ? yes() : no("No P rated on the 4 P's step."),
    // A read that failed is unknown, never "none" (CLAUDE.md, Data).
    body:
      f.bodyScans === null
        ? { has: false, why: "Reading their InBody scans…", reading: true }
        : f.bodyScans === "failed"
          ? no("Couldn't read their InBody scans just now.")
          : f.bodyScans > 0
            ? yes()
            : no("No InBody scans on file."),
    pulse:
      f.pulse === null
        ? { has: false, why: "Reading their Pulse…", reading: true }
        : f.pulse === "failed"
          ? no("Couldn't read their Pulse just now.")
          : f.pulse
            ? yes()
            : no("No finalized Pulse with answers yet."),
    goals: f.goals ? yes() : no("No goal written on the Blueprint step yet."),
    plan: f.plan ? yes() : no("No training plan chosen on the Blueprint step yet."),
    coach: f.coach ? yes() : no("No closing note written on the Blueprint step yet."),
  };
}

/**
 * The page, row by row, for each focus. A row of two prints side by side when
 * both are ticked and full width when one is. Every module is in every
 * focus's rows exactly once, so the trainer can tick anything the data has.
 */
export const ROWS: Record<FocusKind, readonly (readonly ModuleId[])[]> = {
  goal: [["thanks"], ["stats"], ["accolades"], ["machines", "fourps"], ["body", "pulse"], ["goals"], ["plan", "coach"]],
  custom: [["thanks"], ["stats"], ["accolades"], ["machines", "fourps"], ["body", "pulse"], ["goals"], ["plan", "coach"]],
  everyday: [["thanks"], ["pulse"], ["machines"], ["accolades"], ["stats"], ["body", "fourps"], ["goals"], ["plan", "coach"]],
  "pain-free": [["thanks"], ["pulse"], ["fourps", "machines"], ["accolades"], ["stats"], ["body"], ["goals"], ["plan", "coach"]],
  body: [["body"], ["thanks"], ["machines", "fourps"], ["accolades"], ["stats"], ["pulse"], ["goals"], ["plan", "coach"]],
};

/** What each focus ticks to start with, when the data has it. */
export const DEFAULTS: Record<FocusKind, readonly ModuleId[]> = {
  goal: ["thanks", "stats", "accolades", "machines", "fourps", "goals", "plan", "coach"],
  custom: ["thanks", "stats", "accolades", "machines", "goals", "plan", "coach"],
  everyday: ["thanks", "pulse", "machines", "goals", "plan", "coach"],
  "pain-free": ["thanks", "pulse", "fourps", "machines", "goals", "plan", "coach"],
  body: ["body", "thanks", "machines", "accolades", "goals", "plan", "coach"],
};

/** The focus's defaults that the data has, in page order. */
export function defaultModules(focus: FocusKind, avail: Record<ModuleId, Availability>): ModuleId[] {
  return pageOrder(focus).filter((m) => DEFAULTS[focus].includes(m) && avail[m].has);
}

/**
 * WHAT THE TRAINER CHANGED ON THE PAGE, kept on the report (`pageChoice`):
 * the modules they ticked beyond the focus's defaults and the defaults they
 * unticked, never the whole list. A whole list saved early froze the page:
 * a closing note or a goal written after a draft save never reached it, and
 * an InBody read still loading at the save left the body off for good. With
 * only the changes kept, a module that gains data later comes in by itself
 * unless the trainer took it off.
 */
export interface PageChoice {
  on: ModuleId[];
  off: ModuleId[];
}

/** A stored choice, read safely (unknown ids dropped). */
export function pageChoiceOf(v: unknown): PageChoice | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { on?: unknown; off?: unknown };
  const ids = (a: unknown) => (Array.isArray(a) ? a.filter(isModuleId) : []);
  return { on: ids(o.on), off: ids(o.off) };
}

/** What is ticked: the focus's defaults the data has, less what the trainer took off, plus what they added that the data has. */
export function tickedModules(focus: FocusKind, avail: Record<ModuleId, Availability>, choice: PageChoice | null): ModuleId[] {
  const off = new Set(choice?.off ?? []);
  const on = new Set(choice?.on ?? []);
  return pageOrder(focus).filter((m) => avail[m].has && !off.has(m) && (DEFAULTS[focus].includes(m) || on.has(m)));
}

/** The choice after the trainer ticks (or unticks) one module. */
export function choiceAfter(choice: PageChoice | null, focus: FocusKind, m: ModuleId, tick: boolean): PageChoice {
  const on = new Set(choice?.on ?? []);
  const off = new Set(choice?.off ?? []);
  const isDefault = DEFAULTS[focus].includes(m);
  if (tick) {
    off.delete(m);
    if (!isDefault) on.add(m);
  } else {
    on.delete(m);
    if (isDefault) off.add(m);
  }
  const order = (set: Set<ModuleId>) => MODULE_IDS.filter((x) => set.has(x));
  return { on: order(on), off: order(off) };
}

/** Every module in the order the focus puts them on the page. */
export function pageOrder(focus: FocusKind): ModuleId[] {
  return ROWS[focus].flat();
}

/**
 * The ticked modules that print, as rows. A ticked module the data no longer
 * has (a machine unticked since, a Pulse not finalized) drops out here, so a
 * stored list can never print an empty box.
 */
export function pageRows(focus: FocusKind, ticked: readonly ModuleId[], avail: Record<ModuleId, Availability>): ModuleId[][] {
  const on = new Set(ticked.filter((m) => avail[m]?.has));
  return ROWS[focus].map((row) => row.filter((m) => on.has(m))).filter((row) => row.length > 0);
}

/* ------------------------------------------------------------------ *
 * The sheet and whether the page fits
 * ------------------------------------------------------------------ */

/**
 * The printed sheet in CSS px (96 to the inch): US Letter less the 0.4in
 * margin the print stylesheet asks for (@page), which every printer can
 * print to. The band and the footer are always there.
 */
export const SHEET = {
  width: 739,
  height: 979,
  margin: "0.4in",
  band: { roomy: 56, condensed: 46 },
  footer: 16,
  padTop: { roomy: 18, condensed: 12 },
  padBottom: { roomy: 4, condensed: 2 },
  gap: { roomy: 14, condensed: 8 },
  side: 8,
} as const;

export type Density = "roomy" | "condensed";

/**
 * Type and box sizes per density, for the sheet and for the estimate. Nothing
 * on paper is under 12px (9pt), the smallest a printed caption reads at.
 */
export const SIZES = {
  roomy: {
    name: 34, body: 14, small: 12.5, line: 1.45, quote: 15, title: 18, titleH: 22, titleGap: 10, cardPad: 12,
    headerH: 64, focusH: 26, rowH: 27, headH: 24, statsH: 70, accoladeH: 100, pRowH: 48, bodyH: 130, goalsH: 108, minBox: 100, thanksMin: 112,
  },
  condensed: {
    name: 28, body: 12.5, small: 12, line: 1.4, quote: 13.5, title: 16, titleH: 20, titleGap: 8, cardPad: 8,
    headerH: 54, focusH: 22, rowH: 19, headH: 20, statsH: 58, accoladeH: 74, pRowH: 42, bodyH: 72, goalsH: 92, minBox: 92, thanksMin: 92,
  },
} as const;

/**
 * What the page holds, for the heights: the length of every text that can
 * wrap, in characters. sheet-from-report.ts `contentOf` reads it off the
 * page's own words, so the estimate measures what will print.
 */
export interface PageContent {
  narrativeChars: number;
  /** Machine rows ticked (the sheet shows at most MACHINE_ROWS of them). */
  machineRows: number;
  machineNarrativeChars: number;
  /** Each accolade's big line and the line under it. */
  accoladeHero: number[];
  accoladeContext: number[];
  /** Each rated P's note. */
  pNotes: number[];
  /** Each Pulse line, label and sentence together. */
  pulseLines: number[];
  goals: { why: number; last: number; lastNote: number; next: number; checkIn?: number };
  planItems: number[];
  coachChars: number;
  hasFocusLine: boolean;
}

/** The most machine rows a sheet prints, by density: the rest are said in a line ("8 of 14"). */
export const MACHINE_ROWS: Record<Density, number> = { roomy: 6, condensed: 8 };

/** Average character width over the font size: Geist, and Saira Condensed for the big lines. Erring wide. */
const GEIST = 0.49;
const SAIRA = 0.45;
/** Lines a text wraps to in a width. */
const wraps = (chars: number, widthPx: number, fontPx: number, k = GEIST) =>
  chars <= 0 ? 0 : Math.ceil(chars / Math.max(8, Math.floor(widthPx / (fontPx * k))));

/** The height one module takes at a width. Boxes are a 1px edge and their padding round what they hold. */
export function moduleHeight(m: ModuleId, c: PageContent, d: Density, widthPx: number): number {
  const s = SIZES[d];
  const L = (font: number) => font * s.line;
  const titled = (body: number) => s.titleH + s.titleGap + body;
  const box = (inner: number) => inner + 2 * s.cardPad + 2;
  const inside = (w: number) => w - 2 * 14 - 2;
  const label = L(s.small) + 4;
  switch (m) {
    case "thanks": {
      // The session block is 200 wide beside the quote, with a 12px gap.
      const quote = c.narrativeChars > 0 ? box(wraps(c.narrativeChars + 2, widthPx - 212 - 2 * 18 - 2, s.quote) * L(s.quote) + 6 + L(s.small)) : 0;
      return Math.max(s.thanksMin, quote);
    }
    case "stats":
      return s.statsH;
    case "accolades": {
      const k = Math.max(1, c.accoladeHero.length);
      const w = inside((widthPx - 8 * (k - 1)) / k);
      const hero = Math.max(1, ...c.accoladeHero.map((ch) => wraps(ch, w, s.name * 0.95, SAIRA))) * s.name * 0.95;
      const ctx = Math.max(0, ...c.accoladeContext.map((ch) => wraps(ch, w, s.small))) * L(s.small);
      return titled(Math.max(s.accoladeH, box(label + hero + 4 + ctx)));
    }
    case "machines": {
      const rows = Math.min(c.machineRows, MACHINE_ROWS[d]);
      const table = s.headH + rows * (s.rowH + 1) + 6 + L(s.small);
      return titled(table);
    }
    case "fourps": {
      // One card, a row each: the name line, the note under it, a hairline between.
      const notes = c.pNotes.length ? c.pNotes : [0];
      const w = inside(widthPx);
      const rows = notes.map((ch) => 10 + (s.body + 2) * 1.25 + 1 + wraps(ch, w, s.small) * L(s.small) + 1);
      return titled(box(rows.reduce((t, h) => t + h, 0) + 8));
    }
    case "body":
      if (d === "roomy") return titled(s.bodyH);
      // Alone, a line of four; beside another module, a table of four rows.
      return widthPx > 500
        ? Math.max(s.bodyH, box(label + L(s.small) + L(s.body + 1) + L(s.small)))
        : box(label + 4 * s.rowH);
    case "pulse": {
      const k = Math.max(1, c.pulseLines.length);
      if (d === "roomy") {
        const w = inside((widthPx - 8 * (k - 1)) / k);
        return titled(Math.max(...c.pulseLines.map((ch) => box(label + wraps(ch, w, s.body) * L(s.body))), 0));
      }
      const w = inside(widthPx);
      return Math.max(s.bodyH, box(label + c.pulseLines.reduce((t, ch) => t + wraps(ch, w, s.body) * L(s.body) + 4, 0)));
    }
    case "goals": {
      // Why and last time grow 1, the next 90 days 1.35 (report-sheet.css .rs-goal--next).
      const grows = [c.goals.why > 0 ? 1 : 0, c.goals.last > 0 ? 1 : 0, c.goals.next > 0 ? 1.35 : 0];
      const cells = grows.filter((g) => g > 0).length || 1;
      const total = grows.reduce((t, g) => t + g, 0) || 1;
      const at = (g: number) => inside(((widthPx - 8 * (cells - 1)) * g) / total);
      const big = s.name * 0.64;
      const tallest = Math.max(
        c.goals.why ? label + wraps(c.goals.why + 2, at(1), s.body + 0.5) * L(s.body + 0.5) : 0,
        c.goals.last ? label + wraps(c.goals.last, at(1), s.body + 0.5) * L(s.body + 0.5) + 4 + wraps(c.goals.lastNote, at(1), s.small) * L(s.small) : 0,
        c.goals.next ? label + wraps(c.goals.next, at(1.35), big, SAIRA) * big * 1.08 + 4 + L(s.small) + (c.goals.checkIn ? L(s.small) : 0) : 0,
      );
      return Math.max(s.goalsH, box(tallest));
    }
    case "plan": {
      const w = inside(widthPx) - 18;
      return Math.max(s.minBox, box(label + c.planItems.reduce((t, ch) => t + wraps(ch, w, s.body) * L(s.body), 0)));
    }
    case "coach":
      return Math.max(s.minBox, box(label + wraps(c.coachChars, inside(widthPx), s.body) * L(s.body)));
  }
}

/** The least a condensed page shrinks to stay on one sheet (ReportSheet does the same once it is drawn). */
export const MIN_SCALE = 0.88;

export interface Fit {
  /** The density the page prints at, or null when it runs onto a second page. */
  density: Density | null;
  /** 1, or how much smaller a condensed page prints to stay on one sheet (down to MIN_SCALE). */
  scale: number;
  /** Pixels over at condensed and the smallest print, when it runs on (0 when it doesn't). */
  over: number;
  /** Height used at the density it prints at (or condensed when over). */
  used: number;
}

/** Height of the whole sheet's content at a density. */
export function pageHeight(rows: readonly (readonly ModuleId[])[], c: PageContent, d: Density): number {
  const inner = SHEET.width - 2 * SHEET.side;
  // The focus sits under the coach's name, beside the client's: it costs no line of its own.
  const header = SIZES[d].headerH;
  let h = SHEET.band[d] + SHEET.padTop[d] + header + SHEET.footer + SHEET.padBottom[d];
  for (const row of rows) {
    const w = row.length === 2 ? (inner - 16) / 2 : inner;
    h += SHEET.gap[d] + Math.max(...row.map((m) => moduleHeight(m, c, d, w)));
  }
  return h + SHEET.gap[d];
}

export function fitPage(rows: readonly (readonly ModuleId[])[], c: PageContent): Fit {
  const roomy = pageHeight(rows, c, "roomy");
  if (roomy <= SHEET.height) return { density: "roomy", scale: 1, over: 0, used: roomy };
  const condensed = pageHeight(rows, c, "condensed");
  if (condensed <= SHEET.height) return { density: "condensed", scale: 1, over: 0, used: condensed };
  if (condensed * MIN_SCALE <= SHEET.height) return { density: "condensed", scale: SHEET.height / condensed, over: 0, used: condensed };
  return { density: null, scale: 1, over: Math.ceil(condensed * MIN_SCALE - SHEET.height), used: condensed };
}

/** What the page does, in the editor's words: from the drawn sheet when there is one, else the estimate. */
export function fitLine(fit: { density: Density | null; scale: number; over: number }): string {
  if (fit.density === null) {
    const lines = Math.max(1, Math.round(fit.over / 18));
    return `Runs onto a second page, about ${lines} line${lines === 1 ? "" : "s"} too long: untick a module, or tick fewer machines.`;
  }
  if (fit.scale < 0.995) return `Fits on one page, printed a little smaller (${Math.round(fit.scale * 100)}%).`;
  return fit.density === "roomy" ? "Fits on one page, with room to spare." : "Fits on one page.";
}
