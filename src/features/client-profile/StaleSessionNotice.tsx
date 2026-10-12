/**
 * AN UNFINISHED SESSION, SAID OUT LOUD (Sep 24 2026; the sessions round,
 * Oct 12 2026).
 *
 * The header offers Start when nothing is running, and it still does: a
 * session the heartbeat rule calls abandoned (lib/live-session.ts) never
 * withholds Start. But it used to be invisible here, so Discard — which
 * lives in the "In progress" menu, shown only for a LIVE session — could
 * not reach it, and nothing else ever would. This line says it is there.
 *
 * Since Oct 12 2026 (AJ: "Anyone can clear a session") it has two doors,
 * for anyone who works at the studio it was left at:
 *
 *   - Resume or finish: the Active Session, which asks Resume it, Finish it
 *     as it was, Discard it, or Start a new session — one place for that
 *     question, not two;
 *   - Discard it: the profile's own question, which checks the server first
 *     when it isn't this trainer's session.
 *
 * A session left at another studio is described, never cleared from here:
 * "Left open at Solon".
 */
import { Clock, Play, Trash2 } from "lucide-react";
import { staleSessionStartedLine, type StaleSessionFacts } from "../../lib/live-session";

export function StaleSessionNotice({
  session,
  todayKey,
  onResume,
  onDiscard,
  elsewhereStudioName,
}: {
  session: StaleSessionFacts;
  todayKey: string;
  /** Resume or finish: the Active Session asks there. */
  onResume: () => void;
  onDiscard: () => void;
  /**
   * The studio's name when the session was left at another studio than this
   * iPad's: said, with no buttons ("never another studio's").
   */
  elsewhereStudioName?: string | null;
}) {
  const started = staleSessionStartedLine(session, todayKey);
  const elsewhere = elsewhereStudioName !== undefined && elsewhereStudioName !== null;
  const where = elsewhere ? `Left open at ${elsewhereStudioName || "another studio"}` : null;
  const line = [where, started].filter(Boolean).join(" · ");
  return (
    <div
      role="status"
      className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-2"
    >
      <Clock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <p className="min-w-0 flex-1 basis-64 text-sm leading-snug text-foreground">
        <span className="font-bold">Unfinished session</span>
        {line ? ` · ${line}` : "."}
      </p>
      {!elsewhere && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onResume}
            className="shrink-0 inline-flex items-center gap-2 min-h-10 px-4 py-2 rounded-xl bg-(--raised) border border-input shadow-(--raised-lift) active:translate-y-px active:shadow-(--press) text-foreground text-[14px] font-bold text-left"
          >
            <Play className="w-4 h-4" aria-hidden />
            Resume or finish
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="shrink-0 inline-flex items-center gap-2 min-h-10 px-4 py-2 rounded-xl bg-(--raised) border border-input shadow-(--raised-lift) active:translate-y-px active:shadow-(--press) text-red-700 dark:text-red-400 text-[14px] font-bold text-left hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" aria-hidden />
            Discard it
          </button>
        </div>
      )}
    </div>
  );
}
