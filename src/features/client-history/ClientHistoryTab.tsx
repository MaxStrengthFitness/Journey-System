import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import type { Client, ExerciseLog, Machine, Routine, Trainer } from "../../types";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { clearSessionHandoff, peekSessionHandoff } from "./open-session-handoff";
import { CopyShareLinkButton } from "../deep-link/CopyShareLinkButton";
import { useBookingMarks } from "../admin/attention/booking-marks";
import { HistoryView, type HistoryViewMode } from "./HistoryView";
import { LogPastSessionDialog } from "./LogPastSessionDialog";
import { SessionDetailDialog } from "./SessionDetailDialog";
import { trainerLookup } from "./trainers";
import { routineNamer, toVisitDays, todayKey } from "./model";
import { useSessionHistory, useSessionLogs } from "./useSessionHistory";
import type { HistorySession } from "./model";
import { bookingsReadFrom } from "./bookings";
import { useClientBookings } from "./useClientBookings";
import { useClientCoverage } from "../../hooks/useClientCoverage";
import { canQuoteSessionNumber } from "../../lib/client-coverage";
import { ownedWindow } from "../../lib/history-claims";
import { priorHistoryOf } from "../../lib/prior-history";
import { HISTORY_SIGNATURE_SPAN, historySignature } from "../client-profile/history-freshness";

/**
 * The client profile's History tab: every read and write lives here, every
 * pixel lives in HistoryView.
 *
 * Replaces components/ClientHistoryCalendar.tsx (1,775 lines — one month at a
 * time, a hard 30-session limit, and a "Load More Sessions" button beneath it
 * in ClientProfileView that set a state variable nothing ever read).
 */
export interface ClientHistoryTabProps {
  clientId: string;
  client?: Client | null;
  machines: Machine[];
  trainers: Trainer[];
  /** The client's routines: sessions store a routineId, and this names it. */
  routines?: Routine[];
  /** Sets the profile already loaded for the Journey grid — reused, not re-read. */
  seedLogs?: ExerciseLog[];
  /** The client's home studio timezone, when it has one. */
  timeZone?: string;
  /** True while the profile is backing off after a quota error. */
  disabled?: boolean;
  /** Controlled Calendar/List, when the parent owns the sub-toggle. */
  view?: HistoryViewMode;
  onViewChange?: (view: HistoryViewMode) => void;
  /** Suppress the tab's own header — the parent already names the screen. */
  hideHeader?: boolean;
  /**
   * Her newest sessions as the live list holds them, as one signature, each
   * time the server has answered (speed round, Oct 5 2026). The profile reads
   * its own page of her history again only when this changes: an edit, a
   * past session logged, one removed, here or on another iPad.
   */
  onHistoryChanged?: (signature: string) => void;
}

export function ClientHistoryTab({
  clientId,
  client,
  machines,
  trainers,
  routines,
  seedLogs,
  timeZone,
  disabled = false,
  view,
  onViewChange,
  hideHeader = false,
  onHistoryChanged,
}: ClientHistoryTabProps) {
  const { activeStudioId } = useActiveStudio();
  const history = useSessionHistory(clientId, !disabled);
  // The newest page's worth only: Load full history widening the window is not a change.
  const signature = useMemo(() => {
    if (history.status !== "ready") return null;
    const own = history.sessions.filter((s) => s.clientId === clientId).slice(0, HISTORY_SIGNATURE_SPAN);
    // For the one render after a switch the list still holds the last client's.
    if (own.length === 0 && history.sessions.length > 0) return null;
    return historySignature(own);
  }, [history.status, history.sessions, clientId]);
  useEffect(() => {
    if (signature !== null) onHistoryChanged?.(signature);
  }, [signature, onHistoryChanged]);
  const { logsBySession, request, replace } = useSessionLogs(seedLogs);
  const [opened, setOpened] = useState<{ key: number; sessions: HistorySession[] } | null>(null);
  const [logPastOpen, setLogPastOpen] = useState(false);
  const trainerFor = useMemo(() => trainerLookup(trainers), [trainers]);
  const routineNameFor = useMemo(() => routineNamer(routines), [routines]);

  /*
   * What this tab may say about her past (Sep 24 2026). A gap is a break
   * only where Journey sees every session - from her HOME studio's cutover,
   * or after her prior record runs through - and a row is numbered only once
   * her total is known. lib/history-claims.ts.
   */
  const { coverage, cutover } = useClientCoverage(client);
  const prior = useMemo(() => priorHistoryOf(client), [client]);
  const breakWindow = useMemo(
    () => ownedWindow({ coverage, prior, cutover }),
    [coverage, prior, cutover],
  );
  const quoteSessionNumbers = canQuoteSessionNumber(client, coverage);

  /*
   * Her bookings, laid over the calendar (Sep 26 2026, bookings.ts): one read
   * from the first day the calendar draws, once her sessions have settled so
   * that day is known. Only sessions that are HERS count — for the one render
   * after a switch, the listener still holds the last client's.
   */
  const today = todayKey(new Date(), timeZone);
  const readFrom = useMemo(() => {
    if (history.status === "loading") return null;
    const own = history.sessions.filter((s) => s.clientId === clientId);
    return bookingsReadFrom(toVisitDays(own, timeZone, today).days);
  }, [history.status, history.sessions, clientId, timeZone, today]);
  const bookings = useClientBookings(clientId, readFrom, !disabled, timeZone);
  /*
   * The studio's "didn't come" marks over the same days (Operations room,
   * wave 3, Sep 29 2026): ONE listener on studios/{s}/bookingMarks from the
   * first day drawn to today, for the studio the iPad is in — never a read
   * per booking. Unread or refused: null, and nothing is taken as marked.
   */
  const noShows = useBookingMarks(disabled ? null : activeStudioId, readFrom ?? "", today);
  // Nothing asked yet because her sessions are still arriving: still loading.
  const bookingsStatus =
    bookings.status === "idle" && history.status === "loading" && !disabled ? "loading" : bookings.status;

  const openSessions = useCallback((sessions: HistorySession[]) => {
    if (sessions.length > 0) setOpened({ key: Date.now(), sessions });
  }, []);

  /* A session a Journey link asked for (./open-session-handoff.ts): opened
     from the list once it has answered, else from its own document, one
     read. A session the rules refuse, or that is gone, opens nothing: the
     link's refusal was already said where the link was read. */
  const [wantedSessionId] = useState(() => peekSessionHandoff(clientId));
  useEffect(() => {
    if (!wantedSessionId || history.status === "loading") return;
    const held = history.sessions.find((s) => s.id === wantedSessionId);
    if (held) {
      clearSessionHandoff(wantedSessionId);
      openSessions([held]);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "sessions", wantedSessionId))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        openSessions([{ id: snap.id, ...snap.data() } as HistorySession]);
      })
      .catch(() => {
        /* said where the link was read */
      })
      .finally(() => clearSessionHandoff(wantedSessionId));
    return () => {
      cancelled = true;
    };
    // Once the list has answered; the list changing later must not reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedSessionId, history.status === "loading"]);

  return (
    <>
      <HistoryView
        sessions={history.sessions}
        status={history.status}
        hasMore={history.hasMore}
        isFull={history.isFull}
        onLoadAll={history.loadAll}
        clientSessionCount={client?.sessionCount ?? client?.completedSessions}
        events={client?.events}
        trainers={trainers}
        routines={routines}
        logsBySession={logsBySession}
        onNeedLogs={request}
        onOpenSessions={openSessions}
        onLogPast={() => setLogPastOpen(true)}
        timeZone={timeZone}
        bookings={bookings.rows}
        bookingsStatus={bookingsStatus}
        marks={noShows.marks}
        marksStudioId={activeStudioId}
        view={view}
        onViewChange={onViewChange}
        hideHeader={hideHeader}
        breakWindow={breakWindow}
        prior={prior}
        quoteSessionNumbers={quoteSessionNumbers}
      />

      {opened && (
        <SessionDetailDialog
          key={opened.key}
          initialSessions={opened.sessions}
          onClose={() => setOpened(null)}
          clientId={clientId}
          machines={machines}
          trainerFor={trainerFor}
          routineNameFor={routineNameFor}
          timeZone={timeZone}
          onLogsChanged={replace}
          trainers={trainers}
          activeStudioId={activeStudioId}
          clientHomeStudioId={client?.homeStudioId}
          // Copy link, at the client's studio only (the Teams link round).
          tools={
            activeStudioId && client?.homeStudioId === activeStudioId
              ? (s) =>
                  s.id ? (
                    <CopyShareLinkButton
                      className="hsd-icon-btn"
                      facts={{ kind: "session", targetId: s.id, clientId, studioId: activeStudioId }}
                    />
                  ) : null
              : undefined
          }
        />
      )}

      <LogPastSessionDialog
        open={logPastOpen}
        onOpenChange={setLogPastOpen}
        clientId={clientId}
        client={client}
        clientHomeStudioId={client?.homeStudioId}
        machines={machines}
        trainers={trainers}
        routines={routines}
        timeZone={timeZone}
      />
    </>
  );
}
