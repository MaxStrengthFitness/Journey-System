/**
 * ONE BOOKING ON THE HUB GRID (calm Hub round, Sep 28 2026; it replaces
 * components/schedule/ScheduleBlock).
 *
 * Mindbody's layout, calmer (AJ's screenshots, Sep 28: "I don't want it to
 * look like this but the layout is the foundation"):
 *   - the name the client goes by, WHOLE, wrapping onto a second line —
 *     never "Lobelia S…";
 *   - the time, and the service only when it isn't the usual session;
 *   - her number in words ("#264"), only when it may be quoted, or "New to
 *     Journey" when her story began before the studio's cutover;
 *   - the mark inside its left edge says the booking's state (hub-card.css,
 *     since the cards round a 3px band); the glyphs say what is worth
 *     knowing, from the SAME moments as the Opportunities list
 *     (hub-opportunities/moments-today); crimson is the Critical triangle
 *     alone;
 *   - "Now · 4:30" once its time has come and no session has started in
 *     Journey (the cards round, Oct 17 2026: `hubCardIsNow`, which the Next
 *     30 minutes strip asks too), the word whole or not at all.
 *
 * What the card may say about a booking's outcome is lib/hub-card-state over
 * lib/booking-state (done means logged, AJ Sep 24): live and in-session cards
 * keep every mark; a card that is over recedes and drops them, the triangle
 * included (AJ, Sep 28: "once the session is done it should make a lot less
 * noise so trainers can focus on the rest of their day").
 *
 * The clinical-history dot is gone from the card (Hub question 3's default):
 * standing context, on most clients, and still said in the peek and the
 * briefing. The Pulse flag is plum, not rose, so red stays the triangle's.
 *
 * In YOUR column, read in words (`wordy`, the hub cherry round's focus
 * column), every glyph says its sayable word where the card has room, not
 * only the first. The words are still only ones fine to say out loud.
 *
 * THE NARROW CARD'S PARTS (the narrow cards round, Oct 18 2026; AJ: "Keep
 * them side by side, cards say less", and initials for the very long
 * names). When two or three bookings share a slot, a card is a half or a
 * third of its column and says less. Its parts are drawn on every card and
 * hub-card.css shows each where it belongs; on a full card they are hidden
 * or `display: contents`, so a full card reads exactly as it did:
 *   - the card's aria-label is the whole card in words (`spokenCard`,
 *     card-words.ts), on a card with no profile too, so a word a narrow card
 *     doesn't show is still heard;
 *   - data-critical, data-span ("tall" for a span of 45 minutes or more),
 *     and on a client's card data-name-over (name-fit.ts): the narrow lines
 *     her name is too long for, where a narrow card says her initials;
 *   - every time in one .hs-card-clock, a span also without its AM or PM
 *     (.hs-card-clock-short), the time again (.hs-card-alt-time) where "In
 *     session" or "Not synced yet" stands in its place;
 *   - the state word and its dot as one part (.hs-card-state-part), and a
 *     symbol for it (.hs-card-sym: a ring for Not logged, two bars for Left
 *     open, a cross for a late cancel);
 *   - the triangle a second time at the end of the time line
 *     (.hs-tri--short), her initials (.hs-card-initials) on a client's card
 *     only, and each glyph's place in the Key's order (data-rank);
 *   - in the Unassigned column, the staff line as an empty lead and its
 *     words (.hs-card-staff-lead, .hs-card-staff-name), so the grid can drop
 *     the line whole where the name and the time leave it too little room
 *     (phase 2; on the phone's list it stands as it did).
 */
import { memo, type ComponentType } from "react";
import { Activity, AlertTriangle, Award, Cake, Check, Circle, CloudOff, FileSignature, MessageCircle, Pause, RefreshCw, Sparkles, Undo2, X } from "lucide-react";
import type { Client, WorkoutSession } from "../../types";
import { isStaffBlock, type BookingMarks, type LoggedSessions } from "../../lib/booking-state";
import { hubCardIsNow, hubCardRecedes, hubCardState, type HubCardState } from "../../lib/hub-card-state";
import { clientDisplayName, clientInitials } from "../../lib/client-name";
import { safeToDate } from "../../lib/utils";
import { zonedHM } from "../../lib/studio-time";
import type { MomentKind, RunSheetEntry } from "../hub-opportunities/moments-today";
import { cardMarks, cardRestWords, cornerNumber } from "./card-marks";
import { cardSpanKind, cardStateWords, initialsOf, spokenCard, timeAndSuffix } from "./card-words";
import { nameOverAttr } from "./name-fit";
import "./hub-card.css";

/** One shape per kind of mark (the Key's). The Next 30 minutes strip draws with the same. */
export const GLYPH: Record<MomentKind, ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>> = {
  critical: AlertTriangle,
  waiver: FileSignature,
  pulse: Activity,
  consult: Sparkles,
  "early-session": Sparkles,
  "first-with-trainer": Sparkles,
  back: Undo2,
  milestone: Award,
  birthday: Cake,
  renew: RefreshCw,
  // Get to know (wave 2 hub): the ✎ alone, its label "Something to ask about".
  "ask-about": MessageCircle,
};

/**
 * Is the card's time a span ("10:00 – 10:45 AM") rather than one clock
 * ("9:30")? Only a booking that isn't the usual half hour (a new client
 * consult), or any booking with an end when `span` is asked for.
 */
export function cardTimeIsSpan(start: Date | null, end: Date | null, { span = false }: { span?: boolean } = {}): boolean {
  if (!start || !end) return false;
  return span || Math.round((end.getTime() - start.getTime()) / 60_000) !== 30;
}

/**
 * "9:30", or "10:00 – 10:45 AM" when the booking isn't the usual half hour
 * (a new client consult), in STUDIO time. `span` always gives both ends.
 */
export function cardTime(start: Date | null, end: Date | null, { span = false }: { span?: boolean } = {}): string {
  const clock = (d: Date | null, suffix: boolean) => {
    const hm = d ? zonedHM(d) : null;
    if (!hm) return "";
    const h12 = hm.hour % 12 === 0 ? 12 : hm.hour % 12;
    const mm = String(hm.minute).padStart(2, "0");
    return suffix ? `${h12}:${mm} ${hm.hour >= 12 ? "PM" : "AM"}` : `${h12}:${mm}`;
  };
  if (!start) return "";
  if (!cardTimeIsSpan(start, end, { span })) return clock(start, false);
  return `${clock(start, false)} – ${clock(end, true)}`;
}

/**
 * Every time a card shows, in ONE part (the narrow cards round). On a full
 * card it is `display: contents` (hub-card.css), so the time is the same
 * text beside its dot and its word as it always was. A span's time stays ONE
 * text node, AM or PM included: split in two, the browser lays it 1/64px
 * wider (each piece is rounded on its own), and a full card would not be
 * drawn exactly as before. So a span also carries itself without its AM or
 * PM ("10:00 – 10:45") in an empty .hs-card-clock-short, which a narrow card
 * shows in the clock's place (`content: attr(data-time)`) and leaves the AM
 * or PM to the peek; hidden on a full card and from a screen reader, whose
 * label says the whole time.
 */
function clockOf(time: string) {
  const [main, suffix] = timeAndSuffix(time);
  return (
    <>
      <span className="hs-card-clock">{time}</span>
      {suffix && <span className="hs-card-clock-short" data-time={main} aria-hidden />}
    </>
  );
}

/** What happened, beside the time: the dot and the word as one part, so a consult can give it a line of its own. */
function statePart(word: string, title?: string, dense = false) {
  return (
    <span className="hs-card-state-part">
      {dense ? null : (
        <span className="hs-card-sep" aria-hidden>
          {" · "}
        </span>
      )}
      <strong className="hs-card-state" title={title}>
        {word}
      </strong>
    </span>
  );
}

export interface HubCardProps {
  /** Declared explicitly: this repo has no @types/react, so JSX does not
   *  supply `key` through IntrinsicAttributes (house convention). */
  key?: string | number;
  /** The raw schedule doc (Mindbody-sourced). */
  booking: any;
  /** Her Max Strength record, or null when the Mindbody link is missing. */
  client: Client | null;
  /** Her moments on this booking's day, from the Hub's one engine; null when there is no record. */
  entry: RunSheetEntry | null;
  /** The number THIS booking will be (`bookingSessionNumber`), or null when it may not be quoted. */
  sessionNumber: number | null;
  /** "New to Journey" in the corner's place (`isNewToJourney`). */
  newToJourney?: boolean;
  /** The day's usual service (`usualServiceOf`): a card names its own only when it differs. */
  usualService?: string | null;
  /** Her newest workout session on the booking's studio day, if one exists. */
  workoutSession?: WorkoutSession | null;
  /**
   * Why a session left open went quiet, in a word (the sessions round, Oct
   * 12 2026; lib/session-quiet.ts): "Paused", "At End Session" or "Left
   * open". Absent: "Left open".
   */
  quietWord?: string | null;
  /** `loggedSessions` over the Hub's session stream; null while unknown. */
  logged?: LoggedSessions | null;
  /** The day's late-cancel marks (`useBookingMarks().marks`); null when not read. A marked booking reads "Late cancel", never "Not logged". */
  noShows?: BookingMarks | null;
  /**
   * The Hub's minute clock. It matters to the card through its state and
   * whether it is Now (`sameCard`).
   */
  now?: Date;
  /** The roster is still loading: a booking naming a client we don't hold YET is pending, not "Not synced". */
  rosterLoading?: boolean;
  /**
   * The roster's read failed (hub fixes, Oct 1 2026): a booking naming a
   * client we don't hold is unknown, so the card says nothing about sync —
   * "Not synced yet" would be a claim about a list Journey never read.
   */
  rosterFailed?: boolean;
  /**
   * In the Unassigned column (hub fixes, Oct 1 2026): the staff name Mindbody
   * gave, which Journey couldn't match to a trainer ("Westlake Rotation",
   * "Samuel Lee"). Said whole, on its own line. Absent elsewhere.
   */
  staffName?: string | null;
  /** The day summary's spotlight is on and this card doesn't match it. */
  dimmed?: boolean;
  /**
   * In YOUR column, read in words (the focus column, hub cherry round): every
   * glyph says its word where the card has room, not only the first, and the
   * few words that are fine in your own column ("first with you") join them.
   */
  wordy?: boolean;
  /** Its peek is open. */
  open?: boolean;
  /**
   * A tap opens a peek (the Hub), so the card says it opens a dialog. False
   * where a tap goes straight to the profile instead (the Calendar's Day,
   * the rooms round, Oct 10 2026). The card looks the same either way.
   */
  opensPeek?: boolean;
  /**
   * False on a day the sessions Journey holds don't cover (`cardDayReadable`,
   * lib/hub-card-state): the card is "unread", neither fading nor saying a
   * word, so it never reads as done. The Hub draws only its own window and
   * leaves it true.
   */
  readable?: boolean;
  /**
   * The grid block it is drawn in, handed back to `onOpen`, so the grid can
   * pass every card ONE handler and a card with nothing new skips drawing
   * (speed round, Oct 5 2026, R7).
   */
  blockKey?: string;
  /**
   * A phone's list row (the phone minimalist round, Oct 19 2026): the name,
   * the Critical triangle, the state word and the glyphs, and nothing the
   * row already says or the peek says better — no time (the row's own
   * column says it), no number, no "New to Journey" or service.
   */
  dense?: boolean;
  onOpen: (clientId: string, anchor: HTMLElement, blockKey?: string) => void;
}

function HubCardView({
  booking,
  client,
  entry,
  sessionNumber,
  newToJourney = false,
  usualService = null,
  workoutSession = null,
  quietWord = null,
  logged = null,
  noShows = null,
  now = new Date(),
  rosterLoading = false,
  rosterFailed = false,
  staffName = null,
  dimmed = false,
  wordy = false,
  open = false,
  opensPeek = true,
  readable = true,
  blockKey,
  dense = false,
  onOpen,
}: HubCardProps) {
  const openPeek = (clientId: string, anchor: HTMLElement) => (blockKey === undefined ? onOpen(clientId, anchor) : onOpen(clientId, anchor, blockKey));
  const start = safeToDate(booking?.startTime || booking?.StartDateTime || booking?.date);
  const end = safeToDate(booking?.endTime || booking?.EndDateTime);
  const time = cardTime(start, end);

  if (isStaffBlock(booking)) {
    // Mindbody's "Unavailable": time that isn't a session. Never a booking (isStaffBlock), never tapped.
    const span = cardTime(start, end, { span: true });
    const spanKind = cardSpanKind(start, end, cardTimeIsSpan(start, end, { span: true }));
    return (
      <div className="hs-card" data-kind="staff" data-span={spanKind} data-dim={dimmed ? "true" : undefined} aria-label={`Unavailable, ${span}: not a session`}>
        <div className="hs-card-top">
          <span className="hs-card-name">Unavailable</span>
        </div>
        <div className="hs-card-meta">
          <span className="hs-card-when">{clockOf(span)}</span>
        </div>
      </div>
    );
  }

  const cardState = stateOfCard({ booking, client, logged, now, workoutSession, noShows, readable });
  /* NOW (the cards round, Oct 17 2026): its time has come and no session has
     started in Journey, from its start until it would turn Not logged
     (lib/hub-card-state, hubCardIsNow; the strip asks the same). */
  const isNow = hubCardIsNow({ state: cardState, start, end, now });
  const recedes = hubCardRecedes(cardState);
  const isUnlinked = !client;
  const isPending = isUnlinked && rosterLoading && Boolean(booking?.clientId);
  /* The roster failed: whether she has a profile is unknown, so nothing is said about it. */
  const isUnknown = isUnlinked && !isPending && rosterFailed && Boolean(booking?.clientId);
  /* A finished slot nobody logged. Only on a linked card: one with no
     profile already says why nothing could be logged. */
  const isNotLogged = cardState === "not-logged" && !isUnlinked;
  /* Someone at the studio marked a late cancel (Operations wave 3; anyone since Oct 2 2026): a fact, said as quietly as "Not logged". */
  const isDidntCome = cardState === "didnt-come" && !isUnlinked;
  /* A session started and gone quiet for an hour (the staleness rule). */
  const isLeftOpen = cardState === "left-open" && !isUnlinked;
  const isDone = cardState === "done";
  const isSpan = cardTimeIsSpan(start, end);

  const name = client ? clientDisplayName(client, booking?.clientName || "Client") : (booking?.clientName || "Reservation").trim();
  const marks = recedes || isUnlinked ? cardMarks(null) : cardMarks(entry?.moments, undefined, { yours: wordy });
  const kind = isPending ? "pending" : isUnknown ? "unknown" : isUnlinked ? "unlinked" : "client";
  const interactive = kind === "client";
  /* Only a client's card is Now. The word goes before the time, but not
     before a span (a consult's "10:00 – 10:45 AM"), which leaves it no room
     beside the marks: there the card's mark says it alone (cards round, C3).
     Anywhere else short of room, the word drops whole (hub-card.css). */
  const clientNow = kind === "client" && isNow;
  const nowWord = clientNow && !isSpan;

  /* Her number, in the card's top-right corner, quietly (AJ, Oct 1 2026: "i
     do wish the top right of the card said what session number they were
     on in a very subtle manner"): only where it may be quoted, never on a
     card with no profile, never a placeholder (card-marks, cornerNumber).
     It is never cut: a clipped "#212" reads as "#2", a confident wrong
     number (hub cherry round). */
  const numberText = isUnlinked || dense ? null : cornerNumber(sessionNumber, marks);
  const restParts = dense ? [] : cardRestWords({ booking, moments: entry?.moments, numberShown: !!numberText, newToJourney, recedes, usualService });

  /* The whole card in words, at every width (the narrow cards round): a
     narrow card shows less, and its label still says it all. A card with
     no profile gets one too, from Mindbody's name. */
  const spoken = spokenCard({
    name,
    numberText,
    stateWords: cardStateWords({ kind, state: cardState, now: clientNow, quietWord }),
    time,
    critical: marks.critical,
    glyphs: marks.glyphs,
    more: marks.more,
    moreLabel: marks.moreLabel,
    rest: isUnlinked ? [] : restParts,
    staffName,
  });
  /* Her initials, for the narrowest card and for a name too long for a
     narrow one (hub-card.css). Only on a client's card: one with no profile,
     or still loading, opens no peek, so its name stays whole. */
  const initials = interactive ? clientInitials(client) || initialsOf(name) : "";

  return (
    <div
      className="hs-card"
      data-kind={kind}
      data-state={cardState}
      data-recede={recedes ? "true" : "false"}
      data-dim={dimmed ? "true" : undefined}
      data-words={wordy ? "all" : undefined}
      data-open={open ? "true" : undefined}
      data-dense={dense ? "true" : undefined}
      data-now={clientNow ? "true" : undefined}
      data-critical={marks.critical ? "true" : undefined}
      data-span={cardSpanKind(start, end, isSpan)}
      data-name-over={interactive ? nameOverAttr(name) : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : -1}
      aria-haspopup={interactive && opensPeek ? "dialog" : undefined}
      aria-label={spoken}
      title={
        isUnknown
          ? `${booking?.clientName || "Reservation"} — couldn't check this client's profile just now.`
          : isUnlinked
          ? `${booking?.clientName || "Reservation"} — no Max Strength profile yet. It will link itself once the next Mindbody sync creates one.`
          : marks.critical || undefined
      }
      onClick={(e) => {
        if (interactive && client?.id) openPeek(client.id, e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (!interactive || !client?.id) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPeek(client.id, e.currentTarget);
        }
      }}
    >
      <div className="hs-card-top">
        {/* Her number floats at the right of the name's first line (first in
            the source, so it takes that line); the name flows beside it,
            whole, and is never cut (hub-card.css). */}
        <span className="hs-card-head">
          {numberText && (
            <span className="hs-card-num" aria-label={`Session ${numberText.slice(1)}`}>
              {numberText}
            </span>
          )}
          <span className="hs-card-name">{name}</span>
          {/* Her initials ("MK"), shown in her name's place only where a
              narrow card can't hold it (hub-card.css); her name is the first
              thing her label says and the peek's first line. */}
          {initials && (
            <span className="hs-card-initials" aria-hidden>
              {initials}
            </span>
          )}
        </span>
        {/* LOUD, and the only red on the grid: read this before the session.
            The words are in the label, whole; the note itself is first on the
            client's briefing and in the peek. */}
        {marks.critical && (
          <span className="hs-tri" aria-label={marks.critical}>
            <AlertTriangle size={14} strokeWidth={2.5} aria-hidden />
          </span>
        )}
      </div>
      {/* In the grid the line drops whole when the name and the time leave
          it too little room, so the time stays (hub-card.css): the lead
          goes first, as the words after the time do on their side. */}
      {staffName && (
        <span className="hs-card-staff" title="Mindbody's staff name; no Journey trainer matches it">
          <span className="hs-card-staff-lead" aria-hidden />
          <span className="hs-card-staff-name">{`Booked with ${staffName}`}</span>
        </span>
      )}

      <div className="hs-card-meta">
        <span className="hs-card-when" data-now={nowWord ? "true" : undefined}>
          {isPending ? (
            <span aria-label="Loading this client">{clockOf(time)}</span>
          ) : isUnknown ? (
            <span aria-label="Couldn't check this client's profile">{clockOf(time)}</span>
          ) : isUnlinked ? (
            <>
              <CloudOff size={13} aria-label="Not synced to a Max Strength profile yet" />
              <span className="hs-card-unsynced">Not synced yet</span>
              {/* Where "Not synced yet" doesn't fit, the time takes its place. */}
              <span className="hs-card-alt-time">{clockOf(time)}</span>
            </>
          ) : cardState === "in-session" ? (
            <>
              <span className="hs-live-dot" aria-label="Session in progress" />
              <strong>In session</strong>
              {/* Where the blue fill says "In session" alone, the time is shown. */}
              <span className="hs-card-alt-time">{clockOf(time)}</span>
            </>
          ) : (
            <>
              {isDone && <Check size={13} aria-label="Done" />}
              {/* What happened, as a shape, where its word doesn't fit: the
                  word is in the label, the peek and the Key. */}
              {isNotLogged && (
                <span className="hs-card-sym" data-sym="not-logged" aria-hidden>
                  <Circle size={12} strokeWidth={2.6} aria-hidden />
                </span>
              )}
              {isLeftOpen && (
                <span className="hs-card-sym" data-sym="left-open" aria-hidden>
                  <Pause size={13} strokeWidth={2} fill="currentColor" aria-hidden />
                </span>
              )}
              {isDidntCome && (
                <span className="hs-card-sym" data-sym="late-cancel" aria-hidden>
                  <X size={13} strokeWidth={2.6} aria-hidden />
                </span>
              )}
              {/* "Now · 4:30": a word, read out and seen without telling
                  colours apart. The word and its dot are one part, so short
                  of room they drop together and the time stays. */}
              {nowWord && (
                <span className="hs-card-now-part">
                  <strong className="hs-card-now">Now</strong>
                  {dense ? null : " · "}
                </span>
              )}
              {dense ? null : clockOf(time)}
            </>
          )}
          {/* What happened, beside the time and never cut (hub fixes, Oct 1
              2026: it was cut to "Didn…"). It never competes with the marks:
              a card that is over has dropped them. */}
          {isNotLogged && statePart("Not logged", "No Journey session was completed for this client today", dense)}
          {isDidntCome && statePart("Late cancel", undefined, dense)}
          {/* A session open but gone quiet for an hour (the staleness rule;
              hub fixes, Oct 1 2026): never "In session" all day. Quiet ink,
              never the red kaizen mark; the peek offers to resume or close it. */}
          {isLeftOpen && statePart(quietWord || "Left open", "A session was started and not finished, and nothing has been saved for over an hour", dense)}
        </span>
        {/* The rest ("New to Journey", a service) says less when space is
            short: each part shows WHOLE or not at all, never "New to Jo…"
            (hub fixes, Oct 1 2026). The peek says them in full. */}
        {!isUnlinked && restParts.length > 0 && (
          <span className="hs-card-rest">
            <span className="hs-card-rest-lead" aria-hidden />
            {restParts.map((part) => (
              <span key={part} className="hs-card-part">{` · ${part}`}</span>
            ))}
          </span>
        )}

        {/* The triangle again, at the end of the time line, where a narrow
            card's name needs its whole first line (hub-card.css). Its words
            are the first triangle's and the label's. */}
        {marks.critical && (
          <span className="hs-tri hs-tri--short" aria-hidden>
            <AlertTriangle size={13} strokeWidth={2.5} aria-hidden />
          </span>
        )}
        {(marks.glyphs.length > 0 || marks.more > 0) && (
          <span className="hs-glyphs">
            {marks.glyphs.map((g) => {
              const Icon = GLYPH[g.kind];
              return (
                <span key={g.kind} className="hs-g" data-family={g.family} data-rank={g.rank} aria-label={g.label}>
                  <Icon size={13} strokeWidth={2.4} aria-hidden />
                  {g.word && <span className="hs-g-word">{g.word}</span>}
                </span>
              );
            })}
            {marks.more > 0 && (
              <span className="hs-g" data-family="more" aria-label={`${marks.more} more: ${marks.moreLabel}`}>
                {`+${marks.more}`}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/** What happened to the booking, by the card's own rule (lib/hub-card-state). */
function stateOfCard(p: Pick<HubCardProps, "booking" | "client" | "logged" | "now" | "workoutSession" | "noShows" | "readable">): HubCardState {
  const booking = p.booking;
  return hubCardState(
    {
      id: booking?.id ?? null,
      clientId: p.client?.id ?? booking?.clientId ?? null,
      startTime: booking?.startTime || booking?.StartDateTime || booking?.date,
      endTime: booking?.endTime || booking?.EndDateTime,
      status: booking?.status,
    },
    p.logged ?? null,
    p.now ?? new Date(),
    { session: p.workoutSession ?? null, marks: p.noShows ?? null, readable: p.readable ?? true },
  );
}

/** Is the card Now, by the one rule the strip also asks (lib/hub-card-state)? */
function nowOfCard(p: Pick<HubCardProps, "booking" | "now">, state: HubCardState): boolean {
  const booking = p.booking;
  return hubCardIsNow({
    state,
    start: safeToDate(booking?.startTime || booking?.StartDateTime || booking?.date),
    end: safeToDate(booking?.endTime || booking?.EndDateTime),
    now: p.now ?? new Date(),
  });
}

const momentsKey = (entry: RunSheetEntry | null | undefined) => (entry ? JSON.stringify(entry.moments) : "");

/**
 * Does the card draw the same? (speed round, Oct 5 2026, R7.) Every prop the
 * same, except two the Hub hands over new far more often than the card
 * changes: the minute clock, which matters only through the booking's state
 * (in session, done, not logged) and whether it is Now, and the day's entry,
 * of which the card reads only the moments. A minute tick, or a session's
 * heartbeat elsewhere on the floor, then redraws only the cards whose state,
 * Now or marks moved. Now is compared on its own (the cards round, Oct 17
 * 2026): a card turns Now at its start while its state stays "live".
 */
export function sameCard(a: HubCardProps, b: HubCardProps): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === "now" || k === "entry") continue;
    if ((a as unknown as Record<string, unknown>)[k] !== (b as unknown as Record<string, unknown>)[k]) return false;
  }
  if (a.entry !== b.entry && momentsKey(a.entry) !== momentsKey(b.entry)) return false;
  if (a.now !== b.now && !isStaffBlock(a.booking)) {
    const state = stateOfCard(a);
    if (state !== stateOfCard(b)) return false;
    // Only a live card can be Now, and the two states are the same here.
    if (state === "live" && nowOfCard(a, state) !== nowOfCard(b, state)) return false;
  }
  return true;
}

/** One booking on the grid, drawn again only when what it shows changes (`sameCard`). */
export const HubCard = memo(HubCardView, sameCard);

export default HubCard;
