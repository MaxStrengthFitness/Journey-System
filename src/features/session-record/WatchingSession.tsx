/**
 * The Active Session on an iPad that is watching, not recording (session
 * record, Sep 26 2026).
 *
 * Another trainer is running this client's session. The screen is the one
 * they see, drawn read-only: the session bar without Notes, Pulse, Discard or
 * Finish, the grid with today's column filling in as each set is saved, and no
 * Now bar. One sentence says who is running it and that nothing here changes
 * it. "Take over" is the only way to record from here, and it asks first; the
 * safe answer, "Keep watching", is the default.
 *
 * It holds no write of its own. The tracker draws it in place of its own
 * screen, so none of the recording screen's effects, sheets or buttons are
 * mounted while watching.
 *
 * The trainer's OWN session recorded on another device (the sessions round,
 * Oct 12 2026) has "Continue on this iPad" in Take over's place, in the blue
 * of a Save, never orange. Saved a moment ago, the screen watches and asks
 * from the button; quieter than that, it asks at once (`continueHere.askNow`).
 * Either way the safe answer, watching, is the default.
 */
import { useState, type ReactNode } from "react";
import { Eye } from "lucide-react";
import { ActiveSessionTimer } from "../../components/ActiveSessionTimer";
import { LeaveConfirmDialog } from "../unsaved-changes";
import type { ContinueHereWords, TakeOverWords, WatchWords } from "./watch";
import "../journey-grid/journey-grid.css";
import "./session-record.css";

export function WatchingSession({
  clientName,
  sessionTag,
  runnerInitials,
  startedLabel,
  timer,
  done,
  total,
  words,
  takeOver,
  onTakeOver,
  continueHere = null,
  onContinueHere,
  children,
}: {
  clientName: string;
  /** "#12", or null when the number cannot be quoted (lib/client-coverage.ts). */
  sessionTag: string | null;
  runnerInitials: string;
  startedLabel: string | null;
  timer: { startTime: unknown; fallbackStartTime?: unknown; pausedAt?: unknown; totalPausedMs?: number };
  done: number;
  total: number;
  words: WatchWords;
  /** The question before a take-over; null when this person cannot take it over. */
  takeOver: TakeOverWords | null;
  onTakeOver: () => void;
  /**
   * The trainer's own session on another device: the question, and whether
   * to ask it at once (the other device has gone quiet). Null otherwise.
   */
  continueHere?: { words: ContinueHereWords; askNow: boolean } | null;
  onContinueHere?: () => void;
  /** The grid, drawn by the tracker with a read-only live column. */
  children: ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  const [askingContinue, setAskingContinue] = useState(() => !!continueHere?.askNow);

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden relative" data-testid="watching-session">
      <div className="jg-sbar">
        <div className="jg-sbar__client">
          <h3 className="jg-sbar__name">{clientName}</h3>
          <div className="jg-sbar__meta">
            {sessionTag && (
              <>
                <span>
                  <b>{sessionTag}</b>
                </span>
                <span aria-hidden>·</span>
              </>
            )}
            <span>{runnerInitials}</span>
            {startedLabel && (
              <>
                <span aria-hidden>·</span>
                <span>Started {startedLabel}</span>
              </>
            )}
          </div>
        </div>
        {/* The session's own clock, paused when the trainer paused it; no
            pause button, because pausing is the trainer's. */}
        <ActiveSessionTimer
          variant="bar"
          startTime={timer.startTime}
          fallbackStartTime={timer.fallbackStartTime}
          pausedAt={timer.pausedAt}
          totalPausedMs={timer.totalPausedMs}
        />
        {total > 0 && (
          <div className="jg-sbar__progress" aria-label={`${done} of ${total} machines logged`}>
            <span className="jg-sbar__progress-text">
              {done} <small>of {total}</small>
            </span>
            <span className="jg-sbar__meter" aria-hidden>
              <i style={{ width: `${Math.round((100 * done) / total)}%` }} />
            </span>
          </div>
        )}
        <span className="jg-sbar__sp" />
      </div>

      <div className="sr-watch" role="status" aria-live="polite">
        <Eye className="sr-watch__icon" size={16} strokeWidth={2.4} aria-hidden="true" />
        <p className="sr-watch__text">
          {words.line}
          {words.offline && <span className="sr-watch__offline"> {words.offline}</span>}
        </p>
        {continueHere ? (
          <button type="button" className="sr-watch__continue" onClick={() => setAskingContinue(true)}>
            Continue on this iPad
          </button>
        ) : (
          takeOver && (
            <button type="button" className="sr-watch__take" onClick={() => setAsking(true)}>
              Take over
            </button>
          )
        )}
      </div>

      <div className="jg-stage">
        <div className="jg-stage__main">{children}</div>
      </div>

      {askingContinue && continueHere && (
        <LeaveConfirmDialog
          title={continueHere.words.title}
          question={continueHere.words.question}
          leaveLabel={continueHere.words.continueLabel}
          stayLabel={continueHere.words.watchLabel}
          onStay={() => setAskingContinue(false)}
          onLeave={() => {
            setAskingContinue(false);
            onContinueHere?.();
          }}
        />
      )}

      {asking && takeOver && !continueHere && (
        <LeaveConfirmDialog
          title={takeOver.title}
          question={takeOver.question}
          leaveLabel={takeOver.leaveLabel}
          stayLabel={takeOver.stayLabel}
          onStay={() => setAsking(false)}
          onLeave={() => {
            setAsking(false);
            onTakeOver();
          }}
        />
      )}
    </div>
  );
}
