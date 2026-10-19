/**
 * PLAYBOOKS — the small helpers every page is written with, and the one list
 * of files a playbook may draw from.
 *
 * Why a list of files at all: a playbook is Claude's draft from Journey's own
 * notes, and "Corporate owns the method, so corporate reads it before
 * adopting it" (CLAUDE.md). Head office can only read a draft against its
 * sources if every line says where it came from, so every block carries
 * "path:line" (or "path:from-to"), and `playbooks.test.ts` opens each file
 * and proves the line is inside it. A file that is not in SOURCE_TITLES can't
 * be cited: that keeps the drafts on the business notes, the feature READMEs
 * that record AJ's decisions, and the one Academy file the kit page needs,
 * and away from anything the source check calls stale (the consultation
 * script's package lines, the starting weights, Research.txt).
 *
 * PURE MODULE: data and string helpers only. No React, no Firestore, no JSON.
 */

import type { PlaybookBlock } from "../types";

/** Every file a playbook line may cite, with the name a reader sees for it. */
export const SOURCE_TITLES: Readonly<Record<string, string>> = {
  "docs/business/the-floor.md": "The floor",
  "docs/business/packages-and-pricing.md": "Packages and pricing",
  "docs/business/renewals.md": "Renewals and retention",
  "docs/business/migration-and-prior-history.md": "History before Journey",
  "docs/business/roles-and-permissions.md": "Roles and permissions",
  "docs/business/glossary.md": "Journey's glossary",
  "src/features/ford/README.md": "FORD",
  "src/features/ford/types.ts": "FORD's prompts",
  "src/features/progress-report/README.md": "The progress report",
  "src/features/progress-report/steps.ts": "The progress report's step guide",
  "src/features/subjective-report/README.md": "Pulse",
  "src/features/routine-plan/README.md": "Routine plans",
  "src/features/packages/README.md": "The packages screen",
  "src/features/packages/package-copy.ts": "The packages screen's words",
  "src/features/renewals/README.md": "Renewals in Journey",
  "src/features/renewals/conversation.ts": "The renewal conversation",
  "docs/rounds/2026-10-07-first-session-and-routines.md": "The first-session round, Oct 7 2026",
  "docs/rounds/2026-10-08-first-session-screens.md": "The first-session screens, Oct 8 2026",
  "docs/rounds/2026-09-28-codex-source-check.md": "The codex source check, Sep 28 2026",
  "docs/msf-academy/Academy/Academy - Registering Performance - Use of the Clicker.txt":
    "Academy: Use of the Clicker",
};

/** Short names for the paths, so a page reads `at(FLOOR, 52, 53)`. */
export const FLOOR = "docs/business/the-floor.md";
export const PACKAGES = "docs/business/packages-and-pricing.md";
export const RENEWALS = "docs/business/renewals.md";
export const HISTORY = "docs/business/migration-and-prior-history.md";
export const ROLES = "docs/business/roles-and-permissions.md";
export const GLOSSARY = "docs/business/glossary.md";
export const FORD_README = "src/features/ford/README.md";
export const FORD_TYPES = "src/features/ford/types.ts";
export const REPORT_README = "src/features/progress-report/README.md";
export const REPORT_STEPS = "src/features/progress-report/steps.ts";
export const PULSE_README = "src/features/subjective-report/README.md";
export const PLAN_README = "src/features/routine-plan/README.md";
export const PACKAGES_README = "src/features/packages/README.md";
export const PACKAGE_COPY = "src/features/packages/package-copy.ts";
export const RENEWALS_README = "src/features/renewals/README.md";
export const CONVERSATION = "src/features/renewals/conversation.ts";
export const FIRST_SESSION_ROUND = "docs/rounds/2026-10-07-first-session-and-routines.md";
export const FIRST_SESSION_SCREENS = "docs/rounds/2026-10-08-first-session-screens.md";
export const SOURCE_CHECK = "docs/rounds/2026-09-28-codex-source-check.md";
export const CLICKER = "docs/msf-academy/Academy/Academy - Registering Performance - Use of the Clicker.txt";

/**
 * The four P's, in the ONE order Learning names them: the Academy's own
 * ("The 4 P's - Posture, Pace, Path, Purpose", Introduction) and the
 * code's (rating/scales.ts). The Academy topic's title, made from its file
 * name, and the floor notes each say them in another order; a playbook or a
 * track never does (judges' fix, Oct 19 2026).
 */
export const FOUR_PS = ["Posture", "Pace", "Path", "Purpose"] as const;
/** "Posture, Pace, Path, Purpose": a step or link to the Academy's topic on them. */
export const FOUR_PS_TITLE = FOUR_PS.join(", ");

/** "docs/business/the-floor.md:66", or ":52-53" for a sentence over two lines. */
export function at(path: string, from: number, to?: number): string {
  return to !== undefined && to !== from ? `${path}:${from}-${to}` : `${path}:${from}`;
}

export function para(text: string, source: string): PlaybookBlock {
  return { kind: "para", text, source };
}

export function bullet(text: string, source: string): PlaybookBlock {
  return { kind: "bullet", text, source };
}

/** A block's source, read back: the file and the lines. Null when it isn't "path:n" or "path:n-m". */
export function parsePlaybookSource(source: string): { path: string; from: number; to: number } | null {
  const m = /^(.+):(\d+)(?:-(\d+))?$/.exec(source);
  if (!m) return null;
  const from = Number(m[2]);
  const to = m[3] === undefined ? from : Number(m[3]);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) return null;
  return { path: m[1], from, to };
}

/**
 * What a reader sees beside a line: "The floor · line 66", "Pulse · lines
 * 28–44". A path the list doesn't know shows its file name, never the whole
 * path (the test holds that every cited path IS in the list).
 */
export function playbookSourceLabel(source: string): string {
  const parsed = parsePlaybookSource(source);
  if (!parsed) return source;
  const title = SOURCE_TITLES[parsed.path] ?? parsed.path.split("/").pop() ?? parsed.path;
  return parsed.from === parsed.to
    ? `${title} · line ${parsed.from}`
    : `${title} · lines ${parsed.from}–${parsed.to}`;
}
