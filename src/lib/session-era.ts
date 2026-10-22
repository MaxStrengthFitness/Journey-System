/**
 * THE SESSION'S ERA: the one place it is read (Oct 22 2026, Stage 3 of the
 * Strongsville import; docs/business/session-eras.md).
 *
 * AJ's decision (a), Oct 21 2026: a session brought in from FileMaker counts
 * everywhere for now, with a visible "from FileMaker" tag. In a few months
 * (b): trend and average measures move to the Journey era only, and the
 * counts (the total, the numbering, the machine totals, the trainer rollups)
 * stay whole. So:
 *
 *   - `eraOf(session)` says which era a session (or a set, by its session id)
 *     belongs to, derived at read time from the marks the import writes:
 *     `legacy_filemaker_id` on the session, the `fm_` session id, and the
 *     older chart imports' marks. Nothing is stored for it.
 *   - `eraTag(session)` is the tag every list of a client's sessions shows.
 *   - `TREND_ERA` is the switch: "all" today, "journey" when (b) comes. Each
 *     trend or average measure makes ONE call to `inTrendEra`, so (b) is this
 *     one constant and nothing else; the page above names every measure.
 */

export type SessionEra = "filemaker" | "journey";

/** What the import writes, and what a reader may hand in: a session, or a set with its session id. */
export interface EraLike {
  id?: string | null;
  sessionId?: string | null;
  legacy_filemaker_id?: unknown;
  trainerId?: unknown;
  trainerInitials?: unknown;
  /** A reader that already worked the era out (the Journey grid's sessions) hands it back. */
  era?: SessionEra | null;
}

/** The ids the FileMaker importer derives (plan.ts sessionIdFor). */
const FM_ID = /^fm_/;

/** Which era a session is from, derived from the import's marks; never stored. */
export function eraOf(s: EraLike | null | undefined): SessionEra {
  if (!s) return "journey";
  if (s.era === "filemaker" || s.era === "journey") return s.era;
  if (s.legacy_filemaker_id) return "filemaker";
  if (typeof s.id === "string" && FM_ID.test(s.id)) return "filemaker";
  if (typeof s.sessionId === "string" && FM_ID.test(s.sessionId)) return "filemaker";
  // The chart imports before the FileMaker tool (client-history/model.ts isLegacySession).
  if (s.trainerId === "legacy-trainer" || s.trainerInitials === "Legacy" || s.trainerInitials === "Chart") return "filemaker";
  return "journey";
}

export function isFileMakerSession(s: EraLike | null | undefined): boolean {
  return eraOf(s) === "filemaker";
}

/** The words every list shows beside a FileMaker session (AJ: "a visible 'from FileMaker' tag"). */
export const ERA_TAG_WORDS = "from FileMaker";

/** The tag for a session in a list, or null for Journey's own. */
export function eraTag(s: EraLike | null | undefined): string | null {
  return isFileMakerSession(s) ? ERA_TAG_WORDS : null;
}

/**
 * Which eras the trend and average measures read. "all" is decision (a);
 * "journey" is (b). Changing this one word is the whole of (b): every measure
 * in docs/business/session-eras.md asks `inTrendEra` once.
 */
export const TREND_ERA: "all" | "journey" = "all";

/** Whether a session (or a set, by its session id) is in the era the trend and average measures read. */
export function inTrendEra(s: EraLike | null | undefined, era: "all" | "journey" = TREND_ERA): boolean {
  return era === "all" || eraOf(s) === "journey";
}
