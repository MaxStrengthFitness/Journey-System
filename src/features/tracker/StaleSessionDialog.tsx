/**
 * THE QUESTION BEFORE A STALE SESSION IS CARRIED ON WITH (Sep 24 2026).
 *
 * The Active Session used to adopt ANY In-Progress session for the client,
 * so Start the next morning quietly reopened yesterday's abandoned session
 * and that day's sets went into it, under yesterday's date. A session the
 * heartbeat rule calls abandoned (lib/live-session.ts, `splitInProgress`)
 * is now never carried on with unless the trainer says so, and this is
 * where they say so.
 *
 * An OPEN session (no client yet, `clientFirstName` null; the whole-branch
 * review, Oct 9 2026) is asked about the same way: left an hour with nothing
 * typed, it could not be reached from anywhere. Resume carries on with it,
 * Who's this? still there. Finish it as it was is never offered for one:
 * there is nobody to count it for until Who's this? is answered.
 *
 * ANYONE AT THE STUDIO (the sessions round, Oct 12 2026; AJ: "Anyone can
 * clear a session"). A session left open is now reached from doors that
 * aren't its trainer's (Operations → Today, Hours, the Directory, the
 * profile), so the question is asked of whoever opened it:
 *   - never "your" to someone else: "{Starter}'s open session was never
 *     finished";
 *   - one line (when it started, by whom, how much was logged), and each
 *     answer with its own short meaning beneath it;
 *   - Discard it, at the bottom left and never first, asks a second time,
 *     and for someone else's session it first reads the session from the
 *     server (`checkDiscard`, features/session-record/discard.ts): active
 *     since, finished, gone or unknown holds the final Discard back;
 *   - closing it, any way at all, is Start a new session for the trainer's
 *     own session (what they pressed Start for), and Not now for anyone
 *     else's: nothing starts, nothing is touched, and they go back to the
 *     door they came from;
 *   - a session at another studio is described ("Left open at Solon."),
 *     never cleared from here.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  sessionDayWords,
  staleSessionStartedLine,
  type StaleSessionFacts,
} from "../../lib/live-session";
import { stillLeftOpenWords, type StillLeftOpen } from "../session-record/discard";

export function StaleSessionDialog({
  open,
  clientFirstName,
  session,
  begunMachines,
  todayKey,
  takesOver = false,
  starterName = null,
  mine = true,
  onResume,
  onStartNew,
  onFinishAsItWas,
  finishAsItWasReady = true,
  onDiscard,
  checkDiscard,
  onNotNow,
  lastActive = null,
  leftOpenAt = null,
}: {
  open: boolean;
  /** The client's name; null for an open session, which has no client yet. */
  clientFirstName: string | null;
  session: StaleSessionFacts;
  /** Machines with anything logged in it. Null says nothing: "none" and
   *  "not loaded yet" look the same, so none is never claimed. */
  begunMachines: number | null;
  todayKey: string;
  /**
   * Another trainer started it: resuming makes it this trainer's to finish,
   * as a take-over does (session record, Sep 26 2026), and the question says so.
   */
  takesOver?: boolean;
  /** The trainer on the session, as a person says it: first name, else initials. */
  starterName?: string | null;
  /** The trainer's own session (default). Not theirs: never "your", and closing is Not now. */
  mine?: boolean;
  onResume: () => void;
  onStartNew: () => void;
  /**
   * The third answer (the Atlas answers, Oct 2 2026): finish the old session
   * under its own day, as it stands, so its real sets count, then carry on
   * to today's. Absent: no such answer. Never for an open session.
   */
  onFinishAsItWas?: () => void;
  /**
   * Whether the client's machine totals have answered (the iPad round,
   * features/machine-totals). Finishing an old session compares each
   * machine's day with what is on file, so until they have, the answer
   * waits (a moment): never "nothing on file" off a read still on its way.
   */
  finishAsItWasReady?: boolean;
  /** Discard it, after the second tap. Absent: not offered. */
  onDiscard?: () => void;
  /**
   * The check before the final Discard, run when its question opens (never
   * after the final tap). Absent: nothing to check (the trainer's own).
   */
  checkDiscard?: () => Promise<StillLeftOpen>;
  /** Close without starting anything (someone else's session). */
  onNotNow?: () => void;
  /** "2:14 PM" when its last sign of life is today; null otherwise. */
  lastActive?: string | null;
  /** The studio it runs at, when that isn't this iPad's: it is described, not offered. */
  leftOpenAt?: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [check, setCheck] = useState<StillLeftOpen | "checking" | null>(null);
  const asked = useRef(0);
  useEffect(() => {
    if (!open) {
      setConfirming(false);
      setCheck(null);
    }
  }, [open]);

  const isOpenSession = clientFirstName === null;
  const who = (starterName || "").trim();
  const day = sessionDayWords(session, todayKey);
  const dayPhrase = day === "today" ? "today's date" : day === "yesterday" ? "yesterday's date" : day ?? "the day it was started";
  const started = staleSessionStartedLine(session, todayKey).replace(/\.$/, "");
  const logged = begunMachines ? `${begunMachines} ${begunMachines === 1 ? "machine" : "machines"} logged` : "";
  const line = [leftOpenAt ? `Left open at ${leftOpenAt}` : "", started, logged].filter(Boolean).join(" · ");

  const title = clientFirstName
    ? `${clientFirstName} has an unfinished session`
    : mine
      ? "Your open session was never finished"
      : who
        ? `${who}'s open session was never finished`
        : "An open session was never finished";

  const close = mine ? onStartNew : (onNotNow ?? onStartNew);
  const canFinish = !!onFinishAsItWas && !isOpenSession && !leftOpenAt;
  const canDiscard = !!onDiscard && !leftOpenAt;

  const askDiscard = () => {
    setConfirming(true);
    if (!checkDiscard) {
      setCheck("ok");
      return;
    }
    const n = ++asked.current;
    setCheck("checking");
    checkDiscard().then(
      (answer) => n === asked.current && setCheck(answer),
      () => n === asked.current && setCheck("unknown"),
    );
  };

  const resumeMeaning = mine
    ? `Carry on where you left off.${isOpenSession ? " Who's this? is still there." : ""}`
    : `Carry on in it. It becomes yours to finish.${isOpenSession ? " Who's this? is still there." : ""}`;

  const held = check && check !== "ok" && check !== "checking" ? stillLeftOpenWords(check, who) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) return;
        // In the second question, any close is Keep it.
        if (confirming) {
          setConfirming(false);
          setCheck(null);
          return;
        }
        close();
      }}
    >
      <DialogContent className="sm:max-w-120 rounded-[32px] p-0 overflow-hidden border-none">
        {confirming ? (
          <>
            <div className="bg-card p-8 text-foreground space-y-3">
              <DialogTitle className="break-words">{mine || !who ? "Discard this session?" : `Discard ${who}'s session?`}</DialogTitle>
              <DialogDescription className="text-foreground font-medium text-base leading-relaxed break-words">
                Every set in it is deleted. This can't be undone.
              </DialogDescription>
              {!mine && lastActive && (
                <p className="text-foreground text-sm leading-relaxed break-words" data-testid="stale-last-on-it">
                  {who
                    ? `${who} was last on it at ${lastActive}. If ${who} might still be with the client, check with ${who} first.`
                    : `It was last used at ${lastActive}. If someone might still be with the client, check with them first.`}
                </p>
              )}
              {held && (
                <p role="status" className="text-foreground text-sm font-semibold leading-relaxed break-words" data-testid="stale-discard-held">
                  {held}
                </p>
              )}
            </div>
            <div className="p-6 grid grid-cols-2 gap-3 bg-card border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="outline"
                className="min-h-12 h-auto whitespace-normal rounded-2xl"
                onClick={() => {
                  setConfirming(false);
                  setCheck(null);
                }}
              >
                Keep it
              </Button>
              <Button
                variant="outline"
                className="min-h-12 h-auto whitespace-normal rounded-2xl text-destructive"
                disabled={check !== "ok"}
                aria-busy={check === "checking" || undefined}
                onClick={() => {
                  if (check !== "ok") return;
                  setConfirming(false);
                  onDiscard?.();
                }}
              >
                {check === "checking" ? "Checking…" : "Discard"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="bg-card p-8 text-foreground space-y-3">
              <DialogTitle className="break-words">{title}</DialogTitle>
              <DialogDescription className="text-foreground font-medium text-base leading-relaxed break-words">
                {line ? `${line}.` : "It was never finished."}
              </DialogDescription>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-4 bg-card border-t border-slate-100 dark:border-slate-800">
              {/* Two rows: Resume and Finish it as it was; then Discard at the
                  bottom left (never first) and the way out at the right. */}
              {!leftOpenAt && (
                <Answer meaning={resumeMeaning}>
                  <Button variant="outline" className="min-h-14 h-auto w-full whitespace-normal rounded-2xl" onClick={onResume}>
                    Resume it
                  </Button>
                </Answer>
              )}
              {!leftOpenAt &&
                (canFinish ? (
                  <Answer meaning={`Saved under ${dayPhrase} as ${who ? `${who}'s` : "its trainer's"} session, with what was logged.`}>
                    <Button
                      variant="outline"
                      className="min-h-14 h-auto w-full whitespace-normal rounded-2xl"
                      onClick={onFinishAsItWas}
                      disabled={!finishAsItWasReady}
                      aria-busy={!finishAsItWasReady || undefined}
                    >
                      {finishAsItWasReady ? "Finish it as it was" : "Reading the machines…"}
                    </Button>
                  </Answer>
                ) : (
                  <Spacer />
                ))}
              {!leftOpenAt &&
                (canDiscard ? (
                  <Answer meaning="Deletes it and every set in it.">
                    <Button
                      variant="outline"
                      className="min-h-14 h-auto w-full whitespace-normal rounded-2xl text-destructive"
                      onClick={askDiscard}
                    >
                      Discard it
                    </Button>
                  </Answer>
                ) : (
                  <Spacer />
                ))}
              {mine ? (
                <Answer meaning={isOpenSession ? "This one stays as it is." : "This one stays as it is, on the profile."}>
                  <Button
                    className="min-h-14 h-auto w-full whitespace-normal rounded-2xl bg-cta text-cta-foreground hover:bg-cta shadow-(--go-lift)"
                    onClick={onStartNew}
                  >
                    Start a new session
                  </Button>
                </Answer>
              ) : (
                <Answer meaning="Nothing changes. Back to where you were.">
                  <Button variant="outline" className="min-h-14 h-auto w-full whitespace-normal rounded-2xl" onClick={onNotNow ?? onStartNew}>
                    Not now
                  </Button>
                </Answer>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** An empty cell, so Discard keeps the bottom left on a wide screen. */
function Spacer() {
  return <span className="hidden sm:block" aria-hidden="true" />;
}

/** One answer, with what it does beneath it (12px, wraps, never clipped). */
function Answer({ meaning, children }: { meaning: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {children}
      <p className="text-[12px] leading-snug text-muted-foreground break-words">{meaning}</p>
    </div>
  );
}
