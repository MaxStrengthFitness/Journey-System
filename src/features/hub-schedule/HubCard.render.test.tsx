// @vitest-environment jsdom
/**
 * THE HUB CARD, MOUNTED (calm Hub round, Sep 28 2026). It carries over every
 * promise the old card's test held (components/schedule, deleted with it):
 *
 *   - it stays live, with every mark, until the booking is done (AJ, Sep 24:
 *     done means logged), and a finished slot nobody logged says so quietly;
 *   - once it is over it recedes and drops its marks, the triangle included
 *     (AJ, Sep 28: "once the session is done it should make a lot less noise");
 *   - a Critical note that matters on the BOOKING's day is the red triangle,
 *     its words whole in the label — and the edge never turns red;
 *
 * and adds the round's own: the marks come from the Hub's one engine (the
 * same moments the Opportunities list reads), the Pulse flag is a plum glyph,
 * "No waiver signed" is a plum glyph, the clinical dot is gone, the name is
 * the floor name whole, the number shows from #1 and only when it may be
 * quoted, and Mindbody's "Unavailable" is time that isn't a session.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HubCard, sameCard, type HubCardProps } from "./HubCard";
import { KeySheet } from "./DayHeader";
import { bookingMarks, loggedSessions, type BookingMarks, type LoggedSessions } from "../../lib/booking-state";
import { momentsToday, type MomentsTodayInput, type RunSheetEntry } from "../hub-opportunities/moments-today";
import type { Client, WorkoutSession } from "../../types";
import type { JournalEntry } from "../../types/journal";
import type { FordEntry } from "../ford/types";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const DAY = "2026-09-24";
const FRIDAY = "2026-09-25";
const at = (hm: string, day = DAY) => new Date(`${day}T${hm}:00-04:00`);
const NOW = at("12:00"); // Thursday, noon Eastern

const PRIORITY = "Left shoulder: no overhead press";
const PULSE = "Sleep & Recovery is Red";

const client = {
  id: "c1",
  firstName: "Maria",
  lastName: "Kowalski",
  priorityNote: PRIORITY,
  clinicalNotes: "Hip replacement, 2024",
  subjectiveSnapshot: { flags: [{ severity: "red", label: PULSE }] },
} as unknown as Client;

const booking = (hm: string, day = DAY, over: Record<string, unknown> = {}) => ({
  id: `b-${day}-${hm}`,
  clientId: "c1",
  clientName: "Maria Kowalski",
  trainerId: "t1",
  trainerName: "Sara Kim",
  studioId: "solon",
  startTime: at(hm, day),
  endTime: new Date(at(hm, day).getTime() + 30 * 60_000),
  status: "Scheduled",
  serviceName: "Training Session",
  ...over,
});

const session = (status: WorkoutSession["status"], hm: string) =>
  ({ id: `s-${hm}`, clientId: "c1", status, hostedAtStudioId: "solon", startTime: at(hm), date: DAY }) as WorkoutSession;

const NOTHING_LOGGED = loggedSessions([]);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount({
  hm,
  day = DAY,
  logged = NOTHING_LOGGED,
  marks = null,
  workoutSession = null,
  quietWord = null,
  withClient = true,
  who = client,
  criticalNotes = null,
  sessionNumber = null,
  newToJourney = false,
  usualService = null,
  bookingOver = {},
  ford,
  onOpen = () => {},
}: {
  hm: string;
  day?: string;
  logged?: LoggedSessions | null;
  marks?: BookingMarks | null;
  workoutSession?: WorkoutSession | null;
  quietWord?: string | null;
  withClient?: boolean;
  who?: Client;
  criticalNotes?: readonly JournalEntry[] | null;
  sessionNumber?: number | null;
  newToJourney?: boolean;
  usualService?: string | null;
  bookingOver?: Record<string, unknown>;
  /** The Hub's one FORD read (wave 2 hub), handed to the engine. */
  ford?: (clientId: string) => readonly FordEntry[] | null;
  onOpen?: (id: string, anchor: HTMLElement) => void;
}) {
  // One card at a time: a second mount in a test replaces the first.
  if (root) {
    act(() => root!.unmount());
    host?.remove();
    root = null;
    host = null;
  }
  const b = booking(hm, day, bookingOver);
  const c = withClient ? who : null;
  // The Hub's one engine, asked about the booking's day: the card reads its moments.
  const input: MomentsTodayInput = {
    day,
    today: DAY,
    now: NOW,
    schedules: [b as never],
    clientsById: new Map(c ? [[c.id as string, c]] : []),
    rowsById: new Map(),
    studios: [],
    logged,
    criticalFor: () => criticalNotes,
    fordFor: ford,
    myIds: [],
  };
  const entry = c ? momentsToday(input).find((e) => e.clientId === c.id) ?? null : null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <StrictMode>
        <HubCard
          booking={b}
          client={c}
          entry={entry}
          sessionNumber={sessionNumber}
          newToJourney={newToJourney}
          usualService={usualService}
          workoutSession={workoutSession}
          quietWord={quietWord}
          logged={logged}
          noShows={marks}
          now={NOW}
          onOpen={onOpen}
        />
      </StrictMode>,
    );
  });
  const card = host.firstElementChild as HTMLElement;
  return {
    card,
    text: card.textContent || "",
    faded: card.dataset.recede === "true",
    flags: {
      priority: !!card.querySelector(`[aria-label="${PRIORITY}"]`),
      pulse: !!card.querySelector(`[aria-label="${PULSE}"]`),
      clinical: !!card.querySelector('[aria-label="Clinical history on file"]'),
    },
    notLogged: (card.textContent || "").includes("Not logged"),
    didntCome: (card.textContent || "").includes("Late cancel"),
    inSession: !!card.querySelector('[aria-label="Session in progress"]'),
    /** The triangle's words, when a Critical note put it there. */
    critical: card.querySelector('.hs-tri[aria-label^="Critical:"]')?.getAttribute("aria-label") ?? null,
  };
}

/** Every mark a live card shows for Maria: the triangle and the plum Pulse glyph. The clinical dot is gone. */
const ALL_FLAGS = { priority: true, pulse: true, clinical: false };
const NO_FLAGS = { priority: false, pulse: false, clinical: false };

describe("the Hub card on the floor", () => {
  it("is live, with every mark, in its slot before the session has started — the trainer is a few minutes late", () => {
    const c = mount({ hm: "11:45" });
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
    expect(c.notLogged).toBe(false);
  });

  it("is live, with every mark, before its start", () => {
    const c = mount({ hm: "15:00" });
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
  });

  it("is in session while a Journey session is open, and keeps its marks", () => {
    const c = mount({ hm: "11:45", workoutSession: session("In-Progress", "11:46") });
    expect(c.inSession).toBe(true);
    expect(c.text).toContain("In session");
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
  });

  it("stays in session past the slot while the session is still open", () => {
    const c = mount({ hm: "10:00", workoutSession: session("In-Progress", "10:01") });
    expect(c.inSession).toBe(true);
    expect(c.faded).toBe(false);
  });

  it("recedes and drops its marks once a session was completed for the client today", () => {
    const logged = loggedSessions([session("Completed", "10:05")]);
    const c = mount({ hm: "10:00", logged });
    expect(c.faded).toBe(true);
    expect(c.flags).toEqual(NO_FLAGS);
    expect(c.notLogged).toBe(false);
    expect(c.card.querySelector('[aria-label="Done"]')).toBeTruthy();
  });

  it("recedes as soon as End Session is pressed, even inside the slot", () => {
    const logged = loggedSessions([session("Completed", "11:55")]);
    const c = mount({ hm: "11:45", logged, workoutSession: session("Completed", "11:55") });
    expect(c.faded).toBe(true);
    expect(c.notLogged).toBe(false);
  });

  it("recedes with a quiet 'Not logged' when the slot is over and nothing was logged", () => {
    const c = mount({ hm: "10:00" });
    expect(c.faded).toBe(true);
    expect(c.flags).toEqual(NO_FLAGS);
    expect(c.notLogged).toBe(true);
  });

  it("reads a leader's 'didn't come' mark as a quiet 'Didn't come', never 'Not logged' (Operations wave 3)", () => {
    const marks = bookingMarks([{ id: "b-marked", noShow: true }]);
    const c = mount({ hm: "10:00", marks, bookingOver: { id: "b-marked" } });
    expect(c.faded).toBe(true);
    expect(c.flags).toEqual(NO_FLAGS);
    expect(c.didntCome).toBe(true);
    expect(c.notLogged).toBe(false);
    const other = mount({ hm: "10:00", marks, bookingOver: { id: "b-other" } });
    expect(other.notLogged).toBe(true);
    expect(other.didntCome).toBe(false);
  });

  it("says nothing when the sessions could not be read: receded, never 'Not logged'", () => {
    const c = mount({ hm: "10:00", logged: null });
    expect(c.faded).toBe(true);
    expect(c.notLogged).toBe(false);
  });

  it("keeps a slot in progress live while the sessions are still loading", () => {
    const c = mount({ hm: "11:45", logged: null });
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
  });

  it("booked twice: the later card keeps its marks until it starts, though the morning session was logged", () => {
    const logged = loggedSessions([session("Completed", "09:05")]);
    const c = mount({ hm: "15:00", logged });
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
  });

  it("a card with no profile never says 'Not logged': the cloud mark already says why, and it opens nothing", () => {
    const onOpen = vi.fn();
    const c = mount({ hm: "10:00", withClient: false, onOpen });
    expect(c.notLogged).toBe(false);
    expect(c.card.querySelector('[aria-label="Not synced to a Max Strength profile yet"]')).toBeTruthy();
    expect(c.text).toContain("Not synced yet");
    expect(c.card.getAttribute("role")).toBeNull();
    act(() => c.card.click());
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("a 'Not logged' card still opens: its client is where the session can be logged", () => {
    const onOpen = vi.fn();
    const c = mount({ hm: "10:00", onOpen });
    act(() => c.card.click());
    expect(onOpen).toHaveBeenCalledWith("c1", c.card);
  });
});

describe("the card's words and marks come from the Hub's one engine", () => {
  it("the Pulse flag is a plum glyph with its words, and the clinical dot has left the card", () => {
    const c = mount({ hm: "15:00" });
    expect(c.card.querySelector(`.hs-g[aria-label="${PULSE}"]`)?.getAttribute("data-family")).toBe("watch");
    expect(c.flags.clinical).toBe(false);
  });

  it("'No waiver signed' is a plum glyph, only for a definite 'not signed'", () => {
    const unsigned = { id: "c1", firstName: "Estella", lastName: "Bolger", isLiabilityReleased: false } as unknown as Client;
    const c = mount({ hm: "15:00", who: unsigned });
    expect(c.card.querySelector('.hs-g[aria-label="No waiver signed"]')?.getAttribute("data-family")).toBe("watch");
    const unknown = { id: "c1", firstName: "Estella", lastName: "Bolger" } as unknown as Client;
    expect(mount({ hm: "15:00", who: unknown }).card.querySelector('[aria-label="No waiver signed"]')).toBeNull();
  });

  it("names the client by her floor name, whole", () => {
    const judy = { id: "c1", firstName: "Judith", nickname: "Judy", lastName: "Sackville-Baggins" } as unknown as Client;
    expect(mount({ hm: "15:00", who: judy }).card.querySelector(".hs-card-name")?.textContent).toBe("Judy Sackville-Baggins");
  });

  it("shows her number from #1, a new client's too, and only when it may be quoted (AJ, Oct 20 2026)", () => {
    expect(mount({ hm: "15:00", sessionNumber: 264 }).text).toContain("#264");
    expect(mount({ hm: "15:00", sessionNumber: 2 }).text).toContain("#2");
    expect(mount({ hm: "15:00", sessionNumber: null }).text).not.toContain("#");
  });

  it("says 'New to Journey' in the number's place when her story began before the cutover", () => {
    expect(mount({ hm: "15:00", newToJourney: true }).text).toContain("New to Journey");
  });

  it("names its service only when it isn't the day's usual one", () => {
    const usual = "1:1 Strength Training";
    expect(mount({ hm: "15:00", usualService: usual, bookingOver: { serviceName: usual } }).text).not.toContain(usual);
    expect(mount({ hm: "15:00", usualService: usual, bookingOver: { serviceName: "InBody Scan" } }).text).toContain("InBody Scan");
  });

  it("gives a booking that isn't the usual half hour its span (a 45-minute consult)", () => {
    const c = mount({ hm: "15:00", bookingOver: { endTime: at("15:45"), serviceName: "New Client Consultation" } });
    expect(c.text).toContain("3:00 – 3:45 PM");
    expect(c.card.querySelector('.hs-g[aria-label="Consultation"]')).toBeTruthy();
  });

  it("Get to know is the ✎ alone: 'Something to ask about', and the detail's words nowhere on the card (wave 2 hub)", () => {
    const words = "Her grandson Hamson moves into Bag End on Saturday";
    const moving = { id: "f1", clientId: "c1", studioId: "solon", pillar: "family", body: words, subject: "the move", eventDate: at("00:00", "2026-09-26"), recurrence: "none", occurredAt: at("10:00", "2026-09-01"), isArchived: false } as unknown as FordEntry;
    const plainClient = { id: "c1", firstName: "Bell", lastName: "Gamgee" } as unknown as Client;
    const c = mount({ hm: "15:00", who: plainClient, ford: () => [moving] });
    const glyph = c.card.querySelector('.hs-g[data-family="get-to-know"]');
    expect(glyph?.getAttribute("aria-label")).toBe("Something to ask about");
    expect(glyph?.querySelector(".hs-g-word")).toBeNull();
    expect(c.card.outerHTML).not.toContain("Bag End");
    expect(c.card.outerHTML).not.toContain("the move");
    // A finished card goes quiet: the ✎ leaves with every other mark.
    const done = session("Completed", "11:02");
    const quiet = mount({ hm: "11:00", who: plainClient, ford: () => [moving], logged: loggedSessions([done]), workoutSession: done });
    expect(quiet.card.querySelector('.hs-g[data-family="get-to-know"]')).toBeNull();
  });

  it("draws Mindbody's 'Unavailable' as time that isn't a session: never a button, never counted as her", () => {
    const onOpen = vi.fn();
    const c = mount({ hm: "12:00", withClient: false, bookingOver: { clientId: "", clientName: "Unavailable", endTime: at("12:30") }, onOpen });
    expect(c.card.dataset.kind).toBe("staff");
    expect(c.text).toContain("Unavailable");
    expect(c.text).toContain("12:00 – 12:30 PM");
    expect(c.card.getAttribute("role")).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Your own column, in words (hub cherry round, Sep 28 2026): a card in the
 * focus column may say every mark's word, "first with you" among them; and
 * on every card the time and her number are never the part that is cut.
 * ------------------------------------------------------------------ */

describe("your own column, in words", () => {
  const entryWith = (moments: RunSheetEntry["moments"]) =>
    ({ key: "b1", clientId: "c1", moments, sessionNumber: 5, criticalUnknown: false, clinicalOnFile: false }) as unknown as RunSheetEntry;
  const firstWithYou = { family: "welcome", kind: "first-with-trainer", chip: "First with Sara", sentence: "First session with Sara." } as const;
  const milestone = { family: "celebrate", kind: "milestone", chip: "100th", sentence: "100th session." } as const;

  function card(wordy: boolean, moments: RunSheetEntry["moments"] = [firstWithYou, milestone]) {
    if (root) {
      act(() => root!.unmount());
      host?.remove();
    }
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <HubCard booking={booking("15:00")} client={client} entry={entryWith([...moments])} sessionNumber={264} wordy={wordy} logged={NOTHING_LOGGED} now={NOW} onOpen={() => {}} />,
      );
    });
    return host.firstElementChild as HTMLElement;
  }

  it("marks a card in your column for its words, and says 'first with you' there", () => {
    const mine = card(true);
    expect(mine.dataset.words).toBe("all");
    expect([...mine.querySelectorAll(".hs-g-word")].map((w) => w.textContent)).toEqual(["first with you", "100th"]);
    const theirs = card(false);
    expect(theirs.dataset.words).toBeUndefined();
    expect([...theirs.querySelectorAll(".hs-g-word")].map((w) => w.textContent)).toEqual(["100th"]);
  });

  it("puts her number in the top-right corner, beside the name, and off the time's line (AJ, Oct 1 2026)", () => {
    const c = card(false, []);
    expect(c.querySelector(".hs-card-when")?.textContent).toBe("3:00");
    const num = c.querySelector<HTMLElement>(".hs-card-top .hs-card-num");
    expect(num?.textContent).toBe("#264");
    expect(num?.getAttribute("aria-label")).toBe("Session 264");
    // In the same row as the name, after it; the triangle keeps its own slot outside that row.
    expect(num?.parentElement?.className).toBe("hs-card-head");
    expect(num?.nextElementSibling?.className).toBe("hs-card-name");
    const late = mount({ hm: "10:00", sessionNumber: 264 });
    expect(late.card.querySelector(".hs-card-num")?.textContent).toBe("#264");
    expect(late.card.querySelector(".hs-card-when")?.textContent).not.toContain("#");
  });

  it("never cuts its second line: the state word sits with the time, and the rest shows whole or not at all (hub fixes, Oct 1 2026)", () => {
    const late = mount({ hm: "10:00", sessionNumber: 264 });
    // "Not logged" is in the part that never shrinks, beside the time.
    expect(late.card.querySelector(".hs-card-when")?.textContent).toBe("10:00 · Not logged");
    expect(late.card.querySelector(".hs-card-when .hs-card-state")?.textContent).toBe("Not logged");
    expect(late.card.querySelector(".hs-card-rest")).toBeNull();
    // "New to Journey" is a whole part, never a cut string.
    const fresh = mount({ hm: "15:00", newToJourney: true });
    expect([...fresh.card.querySelectorAll(".hs-card-rest .hs-card-part")].map((p) => p.textContent)).toEqual([" · New to Journey"]);
    // The stylesheet never ellipsises the line: a part that doesn't fit drops whole.
    const css = readFileSync(resolve(__dirname, "hub-card.css"), "utf8");
    const rest = css.match(/\.hs-card-rest\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rest).not.toMatch(/text-overflow/);
    expect(rest).toMatch(/flex-wrap:\s*wrap/);
    expect(css.match(/\.hs-card-part\s*\{([^}]*)\}/)?.[1] ?? "").toMatch(/flex:\s*none/);
    expect(css).not.toMatch(/text-overflow:\s*ellipsis/);
  });

  it("says 'Left open' on a session gone quiet for an hour, never 'In session' all day (hub fixes, Oct 1 2026)", () => {
    const left = { ...session("In-Progress", "09:02"), lastHeartbeatAt: at("09:40") } as WorkoutSession;
    const c = mount({ hm: "09:00", workoutSession: left });
    expect(c.card.dataset.state).toBe("left-open");
    expect(c.faded).toBe(true);
    expect(c.card.querySelector(".hs-card-when .hs-card-state")?.textContent).toBe("Left open");
    expect(c.text).not.toContain("In session");
    // Why it went quiet, when the Hub knows (the sessions round, Oct 12 2026).
    const paused = mount({ hm: "09:00", workoutSession: left, quietWord: "Paused" });
    expect(paused.card.querySelector(".hs-card-when .hs-card-state")?.textContent).toBe("Paused");
    // Still beating: in session, past its slot too.
    const running = { ...session("In-Progress", "11:02"), lastHeartbeatAt: at("11:55") } as WorkoutSession;
    const r = mount({ hm: "11:00", workoutSession: running });
    expect(r.card.dataset.state).toBe("in-session");
    expect(r.text).toContain("In session");
  });

  it("shows no number, and no placeholder, where it may not be quoted", () => {
    expect(mount({ hm: "15:00", sessionNumber: null }).card.querySelector(".hs-card-num")).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * A Critical note written in Journey marks the card (question 12 of the
 * Sep 20 audit, AJ Sep 24 2026): the red triangle only, for every trainer,
 * from one read of the day's notes — and only a note that matters on the
 * booking's day.
 * ------------------------------------------------------------------ */

/** A client with nothing on the record: whatever lights, a note lit it. */
const plain = { id: "c1", firstName: "Maria", lastName: "Kowalski" } as Client;

const SHOULDER = "Left shoulder: no overhead pressing until the MRI";
let seq = 0;
const critical = (over: Partial<JournalEntry> = {}) =>
  ({
    id: `note-${++seq}`,
    clientId: "c1",
    studioId: "solon",
    kind: "injury",
    body: SHOULDER,
    importance: "critical",
    threadId: null,
    occurredAt: at("09:00", "2026-09-10"),
    effectiveFrom: null,
    effectiveUntil: null,
    repeat: null,
    resolvedAt: null,
    isArchived: false,
    ...over,
  }) as JournalEntry;

describe("the Hub card and a Critical note", () => {
  it("shows the red triangle for a Critical note that matters today, with its words whole", () => {
    const c = mount({ hm: "15:00", who: plain, criticalNotes: [critical()] });
    expect(c.critical).toBe(`Critical: ${SHOULDER}`);
    expect(c.card.getAttribute("title")).toBe(`Critical: ${SHOULDER}`);
  });

  it("the triangle is the one red mark — a legacy priority note included — and spends no glyph", () => {
    const legacy = mount({ hm: "15:00", who: { ...plain, priorityNote: "Pacemaker" } as Client });
    expect(legacy.card.querySelectorAll(".hs-tri:not(.hs-tri--short)")).toHaveLength(1);
    // The narrow card's copy at the end of its time line (the narrow cards
    // round): hidden on a full card and from a screen reader, so one
    // triangle is in sight at any width.
    const short = legacy.card.querySelectorAll(".hs-tri--short");
    expect(short).toHaveLength(1);
    expect(short[0].getAttribute("aria-hidden")).toBe("true");
    expect(legacy.card.querySelectorAll(".hs-g")).toHaveLength(0);
  });

  it("stays dark for a closed thread", () => {
    expect(mount({ hm: "15:00", who: plain, criticalNotes: [critical({ resolvedAt: at("08:00") })] }).critical).toBeNull();
  });

  it("stays dark for an archived thread", () => {
    expect(mount({ hm: "15:00", who: plain, criticalNotes: [critical({ isArchived: true })] }).critical).toBeNull();
  });

  it("stays dark once the note's window has run out", () => {
    const ended = critical({ effectiveUntil: at("23:59", "2026-09-23") });
    expect(mount({ hm: "15:00", who: plain, criticalNotes: [ended] }).critical).toBeNull();
  });

  it("a window that opens tomorrow leaves today's card alone and marks tomorrow's", () => {
    const fromFriday = critical({ occurredAt: at("08:00"), effectiveFrom: at("12:00", FRIDAY) });
    expect(mount({ hm: "15:00", who: plain, criticalNotes: [fromFriday] }).critical).toBeNull();
    expect(mount({ hm: "09:00", day: FRIDAY, who: plain, criticalNotes: [fromFriday] }).critical).toBe(`Critical: ${SHOULDER}`);
  });

  it("a Heads up does not mark the Hub card", () => {
    expect(mount({ hm: "15:00", who: plain, criticalNotes: [critical({ importance: "elevated" })] }).critical).toBeNull();
  });

  it("claims nothing while the notes are unknown", () => {
    const c = mount({ hm: "15:00", who: plain, criticalNotes: null });
    expect(c.critical).toBeNull();
    expect(c.flags.priority).toBe(false);
  });

  it("keeps the triangle while the trainer is late, and drops it once the session is logged", () => {
    expect(mount({ hm: "11:45", who: plain, criticalNotes: [critical()] }).critical).not.toBeNull();
    const done = session("Completed", "11:02");
    const c = mount({ hm: "11:00", who: plain, criticalNotes: [critical()], logged: loggedSessions([done]), workoutSession: done });
    expect(c.faded).toBe(true);
    expect(c.critical).toBeNull();
  });

  it("says every live Critical note, newest first", () => {
    const older = critical({ body: "Pacemaker: no chest-compression machines", occurredAt: at("09:00", "2026-08-01") });
    const c = mount({ hm: "15:00", who: plain, criticalNotes: [older, critical()] });
    expect(c.critical).toBe(`Critical: ${SHOULDER} · Critical: Pacemaker: no chest-compression machines`);
  });
});

/* ------------------------------------------------------------------ *
 * NOW (the cards round, Oct 17 2026; AJ's "Now, Next, Done", 1A 2A 3A):
 * a card whose time has come and whose session has not started says
 * "Now" before its time, as a word, from its start until it would turn
 * Not logged (lib/hub-card-state, hubCardIsNow). The minute clock moves it
 * while its state stays "live", so the memo must redraw it.
 * ------------------------------------------------------------------ */

describe("Now: a card whose time has come and no session has started", () => {
  const TODAY = "2026-10-17";
  const half = booking("16:30", TODAY); // 4:30-5:00 PM
  const nowAt = (hm: string, sec = 0) => new Date(at(hm, TODAY).getTime() + sec * 1000);
  const onOpen = () => {};

  function draw(props: Partial<Parameters<typeof HubCard>[0]> & { now: Date }) {
    const el = (
      <HubCard booking={half} client={plain} entry={null} sessionNumber={null} logged={NOTHING_LOGGED} onOpen={onOpen} {...props} />
    );
    if (!root) {
      host = document.createElement("div");
      document.body.appendChild(host);
      root = createRoot(host);
    }
    act(() => root!.render(el));
    const card = host!.firstElementChild as HTMLElement;
    return {
      card,
      now: card.dataset.now === "true",
      word: card.querySelector(".hs-card-when .hs-card-now")?.textContent ?? null,
      when: card.querySelector(".hs-card-when")?.textContent ?? "",
    };
  }

  it("is not Now before its start: the time alone", () => {
    const c = draw({ now: nowAt("16:20") });
    expect(c.card.dataset.state).toBe("live");
    expect(c.now).toBe(false);
    expect(c.word).toBeNull();
    expect(c.when).toBe("4:30");
  });

  it("says 'Now · 4:30' at 4:40, the word as text before the time", () => {
    const c = draw({ now: nowAt("16:40") });
    expect(c.card.dataset.state).toBe("live");
    expect(c.now).toBe(true);
    expect(c.word).toBe("Now");
    expect(c.when).toBe("Now · 4:30");
    // The word and its dot are one part, and the time is never inside it: short of room, the part drops whole.
    const when = c.card.querySelector<HTMLElement>(".hs-card-when")!;
    expect(when.dataset.now).toBe("true");
    const part = when.querySelector(".hs-card-now-part");
    expect(part?.textContent).toBe("Now · ");
    expect(part?.querySelector("strong.hs-card-now")).toBeTruthy();
    // The time is its own part, last and outside the word's (the narrow
    // cards round's .hs-card-clock, display: contents on a full card).
    const clock = when.lastElementChild;
    expect(when.lastChild).toBe(clock);
    expect(clock?.className).toBe("hs-card-clock");
    expect(clock?.textContent).toBe("4:30");
    expect(part?.contains(clock!)).toBe(false);
    // The marks stay: a card that is Now is a card still to come.
    expect(c.card.dataset.recede).toBe("false");
  });

  it("is still Now at 5:03, in the five minutes before Not logged", () => {
    const c = draw({ now: nowAt("17:03") });
    expect(c.card.dataset.state).toBe("live");
    expect(c.now).toBe(true);
    expect(c.when).toBe("Now · 4:30");
  });

  it("is gone at 5:06: the card says Not logged instead", () => {
    const c = draw({ now: nowAt("17:06") });
    expect(c.card.dataset.state).toBe("not-logged");
    expect(c.now).toBe(false);
    expect(c.word).toBeNull();
    expect(c.when).toBe("4:30 · Not logged");
  });

  it("redraws the memoised card when a minute tick crosses 4:30, and only then", () => {
    // The Hub's clock ticks once a minute from whenever it mounted: 4:29:40, then 4:30:40.
    const before = draw({ now: nowAt("16:29", 40) });
    expect(before.now).toBe(false);
    expect(before.when).toBe("4:30");
    const after = draw({ now: nowAt("16:30", 40) });
    expect(after.card.dataset.state).toBe("live");
    expect(after.now).toBe(true);
    expect(after.when).toBe("Now · 4:30");
    // A tick that changes nothing the card shows is still skipped.
    const base = { booking: half, client: plain, entry: null, sessionNumber: null, logged: NOTHING_LOGGED, onOpen };
    expect(sameCard({ ...base, now: nowAt("16:29", 40) }, { ...base, now: nowAt("16:30", 40) })).toBe(false);
    expect(sameCard({ ...base, now: nowAt("16:31", 40) }, { ...base, now: nowAt("16:32", 40) })).toBe(true);
    expect(sameCard({ ...base, now: nowAt("16:20") }, { ...base, now: nowAt("16:21") })).toBe(true);
    // Leaving Now is a change of state too (Not logged), and redraws.
    expect(sameCard({ ...base, now: nowAt("17:04", 30) }, { ...base, now: nowAt("17:05", 30) })).toBe(false);
  });

  it("is never Now in session, once done, or on a card with no profile", () => {
    const running = { ...session("In-Progress", "16:31"), startTime: at("16:31", TODAY), date: TODAY, lastHeartbeatAt: at("16:39", TODAY) } as WorkoutSession;
    const inSession = draw({ now: nowAt("16:40"), workoutSession: running });
    expect(inSession.card.dataset.state).toBe("in-session");
    expect(inSession.now).toBe(false);
    expect(inSession.word).toBeNull();
    const finished = { ...session("Completed", "16:32"), startTime: at("16:32", TODAY), date: TODAY } as WorkoutSession;
    const done = draw({ now: nowAt("16:50"), logged: loggedSessions([finished]), workoutSession: finished });
    expect(done.card.dataset.state).toBe("done");
    expect(done.now).toBe(false);
    const unlinked = draw({ now: nowAt("16:40"), client: null });
    expect(unlinked.card.dataset.kind).toBe("unlinked");
    expect(unlinked.now).toBe(false);
    expect(unlinked.word).toBeNull();
  });

  it("a consult's span is Now without the word: no room beside its marks, so the card's mark says it", () => {
    const consult = { ...half, startTime: at("10:00", TODAY), endTime: at("10:45", TODAY), serviceName: "New Client Consultation" };
    const c = draw({ booking: consult, now: nowAt("10:20") });
    expect(c.now).toBe(true);
    expect(c.word).toBeNull();
    expect(c.when).toBe("10:00 – 10:45 AM");
    expect(c.card.querySelector<HTMLElement>(".hs-card-when")?.dataset.now).toBeUndefined();
  });

  it("the stylesheet drops the word whole and never shrinks the time below itself", () => {
    const css = readFileSync(resolve(__dirname, "hub-card.css"), "utf8");
    const line = css.match(/\.hs-card-when\[data-now="true"\]\s*\{([^}]*)\}/)?.[1] ?? "";
    // One line high, wrapping, clipped: a part that doesn't fit goes to the hidden second line whole.
    expect(line).toMatch(/flex-wrap:\s*wrap/);
    expect(line).toMatch(/height:\s*16px/);
    expect(line).toMatch(/overflow:\s*hidden/);
    // Right to left with the time first in flex order, so the word is the part that wraps.
    expect(line).toMatch(/flex-direction:\s*row-reverse/);
    // It may shrink, never below the time (overflow: hidden alone would let it reach 0 and cut the time).
    expect(line).toMatch(/min-width:\s*min-content/);
    const part = css.match(/\.hs-card-now-part\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(part).toMatch(/order:\s*1\b/);
    expect(part).not.toMatch(/display:\s*none|text-overflow/);
  });
});

/* ------------------------------------------------------------------ *
 * THE NARROW CARD'S PARTS (the narrow cards round, Oct 18 2026; AJ: "Keep
 * them side by side, cards say less", and initials for the very long
 * names). Every card is drawn with the parts a card sharing its slot needs;
 * hub-card.css shows them only there, so a full card is unchanged. The
 * card's label says the whole card in words at every width, so a word a
 * narrow card doesn't show is never lost.
 * ------------------------------------------------------------------ */

describe("the narrow card's parts, drawn on every card", () => {
  const TODAY = "2026-10-17";
  const half = booking("16:30", TODAY); // 4:30-5:00 PM
  const tAt = (hm: string) => at(hm, TODAY);
  const mo = (family: string, kind: string, chip: string, words?: string) => ({ family, kind, chip, sentence: chip, ...(words ? { words } : {}) });
  const READ_FIRST = mo("read-first", "critical", "Read first", "Critical: no overhead press");
  const PULSE_M = mo("watch", "pulse", "Pulse flag", "Sleep & Recovery is Red");
  const BACK = mo("welcome", "back", "Back after 5 wk");
  const RENEW = mo("renew", "renew", "Renewal talk");
  const entryOf = (...moments: ReturnType<typeof mo>[]) => ({ key: "b", clientId: "c1", moments, sessionNumber: null }) as unknown as RunSheetEntry;
  const MARKED = entryOf(READ_FIRST, PULSE_M, BACK, RENEW);
  const live = (hm: string) => ({ ...session("In-Progress", hm), startTime: tAt(hm), date: TODAY }) as WorkoutSession;
  const finished = { ...session("Completed", "16:32"), startTime: tAt("16:32"), date: TODAY } as WorkoutSession;
  const quiet = () => ({ ...live("16:31"), lastHeartbeatAt: tAt("16:35") }) as WorkoutSession;
  const running = () => ({ ...live("16:31"), lastHeartbeatAt: tAt("16:39") }) as WorkoutSession;

  function draw(props: Partial<HubCardProps> & { now: Date }) {
    if (root) {
      act(() => root!.unmount());
      host?.remove();
    }
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<HubCard booking={half} client={plain} entry={null} sessionNumber={null} logged={NOTHING_LOGGED} onOpen={() => {}} {...props} />));
    return host.firstElementChild as HTMLElement;
  }

  /** Every word the card shows, in the card's own words: what its label must hold. */
  function shownWords(card: HTMLElement): string[] {
    const texts = (sel: string) => [...card.querySelectorAll(sel)].map((e) => (e.textContent ?? "").replace(/^\s*·\s*/, "").trim()).filter(Boolean);
    const words = [...texts(".hs-card-name"), ...texts(".hs-card-state"), ...texts(".hs-card-part"), ...texts(".hs-card-staff")];
    const num = card.querySelector(".hs-card-num")?.textContent;
    if (num) words.push(`session ${num.slice(1)}`);
    if (card.querySelector(".hs-live-dot")) words.push("In session");
    if (card.querySelector(".hs-card-now")) words.push("Now");
    if (card.querySelector('[aria-label="Done"]')) words.push("Done");
    if (card.querySelector(".hs-card-unsynced")) words.push("Not synced yet");
    const clock = card.querySelector(".hs-card-when .hs-card-clock")?.textContent;
    if (clock) words.push(clock);
    for (const s of card.querySelectorAll(".hs-card-when > span[aria-label]:not(.hs-live-dot)")) words.push(s.getAttribute("aria-label")!);
    for (const t of card.querySelectorAll(".hs-tri:not(.hs-tri--short)")) words.push(t.getAttribute("aria-label")!);
    for (const g of card.querySelectorAll(".hs-g")) words.push(g.getAttribute("aria-label")!);
    return words;
  }

  const CASES: [string, Partial<HubCardProps> & { now: Date }, string[]][] = [
    [
      "coming up, with her number, Read first, two glyphs and +1",
      { now: tAt("16:00"), entry: MARKED, sessionNumber: 264 },
      ["session 264", "4:30", "Read first: Critical: no overhead press", "Sleep & Recovery is Red", "Back after 5 wk", "1 more: Renewal talk"],
    ],
    ["Now", { now: tAt("16:40"), entry: MARKED }, ["Now", "4:30"]],
    ["in session", { now: tAt("16:40"), entry: MARKED, workoutSession: running() }, ["In session", "4:30"]],
    ["done", { now: tAt("16:50"), logged: loggedSessions([finished]), workoutSession: finished }, ["Done", "4:30"]],
    ["Not logged", { now: tAt("17:10"), sessionNumber: 264 }, ["session 264", "Not logged", "4:30"]],
    ["a late cancel", { now: tAt("17:10"), noShows: bookingMarks([{ id: half.id, noShow: true }]) }, ["Late cancel", "4:30"]],
    ["left open", { now: tAt("18:00"), workoutSession: quiet() }, ["Left open", "4:30"]],
    ["paused", { now: tAt("18:00"), workoutSession: quiet(), quietWord: "Paused" }, ["Paused", "4:30"]],
    ["past, a failed read", { now: tAt("17:10"), logged: null }, ["4:30"]],
    [
      "New to Journey and a service",
      { now: tAt("16:00"), newToJourney: true, usualService: "1:1 Strength Training", booking: { ...half, serviceName: "InBody Scan" } },
      ["4:30", "New to Journey", "InBody Scan"],
    ],
    ["in the Unassigned column", { now: tAt("16:00"), staffName: "Westlake Rotation" }, ["4:30", "Booked with Westlake Rotation"]],
    [
      "a consult, Now",
      { now: tAt("15:10"), booking: { ...half, startTime: tAt("15:00"), endTime: tAt("15:45"), serviceName: "New Client Consultation" } },
      ["Now", "3:00 – 3:45 PM"],
    ],
    ["no profile yet", { now: tAt("16:00"), client: null }, ["Not synced yet", "4:30"]],
    ["its profile still loading", { now: tAt("16:00"), client: null, rosterLoading: true }, ["Loading this client", "4:30"]],
    ["the roster unread", { now: tAt("16:00"), client: null, rosterFailed: true }, ["Couldn't check this client's profile", "4:30"]],
  ];

  it.each(CASES)("says the whole card in its label: %s", (_, props, expected) => {
    const card = draw(props);
    const label = card.getAttribute("aria-label") ?? "";
    // Her name first: the one thing a narrow card may show as initials.
    expect(label.startsWith("Maria Kowalski, ")).toBe(true);
    for (const w of expected) expect(label, w).toContain(w);
    // And everything the card shows is in it, whatever a narrow card hides.
    for (const w of shownWords(card)) expect(label, w).toContain(w);
  });

  it("says the glyphs in the Key's order, though the worded one is drawn first", () => {
    const waiver = mo("watch", "waiver", "No waiver signed", "No waiver signed");
    const early = mo("welcome", "early-session", "First session");
    const card = draw({ now: tAt("16:00"), entry: entryOf(waiver, early) });
    expect([...card.querySelectorAll(".hs-g")].map((g) => [g.getAttribute("aria-label"), g.getAttribute("data-rank")])).toEqual([
      ["First session", "1"],
      ["No waiver signed", "0"],
    ]);
    expect(card.getAttribute("aria-label")).toBe("Maria Kowalski, 4:30, No waiver signed, First session");
  });

  it("gives a card with no profile a label from Mindbody's name, and still no role, no peek and no initials", () => {
    const onOpen = vi.fn();
    const card = draw({ now: tAt("16:00"), client: null, booking: { ...half, clientName: "Bartholomew Hollingsworth" }, onOpen });
    expect(card.getAttribute("aria-label")).toBe("Bartholomew Hollingsworth, Not synced yet, 4:30");
    expect(card.getAttribute("role")).toBeNull();
    expect(card.querySelector(".hs-card-initials")).toBeNull();
    expect(card.dataset.nameOver).toBeUndefined();
    act(() => card.click());
    expect(onOpen).not.toHaveBeenCalled();
    for (const props of [{ rosterLoading: true }, { rosterFailed: true }]) {
      const c = draw({ now: tAt("16:00"), client: null, booking: { ...half, clientName: "Bartholomew Hollingsworth" }, ...props });
      expect(c.querySelector(".hs-card-initials")).toBeNull();
      expect(c.dataset.nameOver).toBeUndefined();
    }
  });

  it("on the Calendar's Day a tap still opens the client, the label the same", () => {
    const onOpen = vi.fn();
    const card = draw({ now: tAt("16:00"), opensPeek: false, onOpen });
    expect(card.getAttribute("aria-haspopup")).toBeNull();
    expect(card.getAttribute("role")).toBe("button");
    expect(card.getAttribute("aria-label")).toBe("Maria Kowalski, 4:30");
    act(() => card.click());
    expect(onOpen).toHaveBeenCalledWith("c1", card);
  });

  it("marks a card with Read first, and a span by its length: tall from 45 minutes", () => {
    expect(draw({ now: tAt("16:00"), entry: MARKED }).dataset.critical).toBe("true");
    expect(draw({ now: tAt("16:00") }).dataset.critical).toBeUndefined();
    // A card that is over has dropped its marks, the triangle included.
    expect(draw({ now: tAt("17:10"), entry: MARKED }).dataset.critical).toBeUndefined();
    const span = (from: string, to: string, over: Record<string, unknown> = {}) =>
      draw({ now: tAt("09:00"), client: over.clientName ? null : plain, booking: { ...half, startTime: tAt(from), endTime: tAt(to), ...over } }).dataset.span;
    expect(span("16:30", "17:00")).toBeUndefined();
    expect(span("15:00", "15:45")).toBe("tall");
    expect(span("15:00", "16:00")).toBe("tall");
    expect(span("15:00", "15:15")).toBe("short");
    // Mindbody's Unavailable is always a span.
    expect(span("12:00", "12:30", { clientId: "", clientName: "Unavailable" })).toBe("short");
    expect(span("12:00", "13:00", { clientId: "", clientName: "Unavailable" })).toBe("tall");
  });

  it("draws a symbol for each state word, hidden from a screen reader: a ring, two bars, a cross", () => {
    const sym = (props: Partial<HubCardProps> & { now: Date }) => {
      const s = [...draw(props).querySelectorAll(".hs-card-sym")];
      expect(s.every((e) => e.getAttribute("aria-hidden") === "true")).toBe(true);
      return s.map((e) => [e.getAttribute("data-sym"), e.querySelector("svg")?.getAttribute("class")]);
    };
    expect(sym({ now: tAt("17:10") })).toEqual([["not-logged", "lucide lucide-circle"]]);
    expect(sym({ now: tAt("17:10"), noShows: bookingMarks([{ id: half.id, noShow: true }]) })).toEqual([["late-cancel", "lucide lucide-x"]]);
    for (const quietWord of [null, "Paused", "At End Session"]) {
      expect(sym({ now: tAt("18:00"), workoutSession: quiet(), quietWord })).toEqual([["left-open", "lucide lucide-pause"]]);
    }
    // Two solid bars, no ring: told apart from the ring at arm's length, and not a media button.
    expect(draw({ now: tAt("18:00"), workoutSession: quiet() }).querySelector(".hs-card-sym svg")?.getAttribute("fill")).toBe("currentColor");
    // Done keeps the check it has; nothing else draws a symbol.
    expect(sym({ now: tAt("16:50"), logged: loggedSessions([finished]), workoutSession: finished })).toEqual([]);
    expect(sym({ now: tAt("16:00") })).toEqual([]);
    expect(sym({ now: tAt("16:40") })).toEqual([]);
    expect(sym({ now: tAt("16:40"), workoutSession: running() })).toEqual([]);
    expect(sym({ now: tAt("17:10"), logged: null })).toEqual([]);
    expect(sym({ now: tAt("17:10"), client: null })).toEqual([]);
  });

  it("holds every time in one part, a span also without its AM or PM, and the time again where a word stands in its place", () => {
    const consult = draw({ now: tAt("09:00"), booking: { ...half, startTime: tAt("15:00"), endTime: tAt("15:45") } });
    const clock = consult.querySelector(".hs-card-when .hs-card-clock")!;
    // The span's text is one node, AM or PM included: two would be laid 1/64px wider.
    expect(clock.childNodes).toHaveLength(1);
    expect(clock.textContent).toBe("3:00 – 3:45 PM");
    // A narrow card says it without the PM, from an empty part no screen reader hears (its label has the whole time).
    const short = clock.nextElementSibling as HTMLElement;
    expect(short.className).toBe("hs-card-clock-short");
    expect(short.dataset.time).toBe("3:00 – 3:45");
    expect(short.textContent).toBe("");
    expect(short.getAttribute("aria-hidden")).toBe("true");
    expect(draw({ now: tAt("09:00") }).querySelector(".hs-card-clock-short")).toBeNull();
    const staff = draw({ now: tAt("09:00"), client: null, booking: { ...half, clientId: "", clientName: "Unavailable", startTime: tAt("12:00"), endTime: tAt("12:30") } });
    expect(staff.querySelector(".hs-card-when .hs-card-clock")?.textContent).toBe("12:00 – 12:30 PM");
    expect(staff.querySelector<HTMLElement>(".hs-card-when .hs-card-clock-short")?.dataset.time).toBe("12:00 – 12:30");
    // In session and Not synced yet stand where the time is: a narrow card shows the time instead.
    const inSession = draw({ now: tAt("16:40"), workoutSession: running() });
    expect(inSession.querySelector(".hs-card-when .hs-card-alt-time .hs-card-clock")?.textContent).toBe("4:30");
    const unsynced = draw({ now: tAt("16:00"), client: null });
    expect(unsynced.querySelector(".hs-card-when .hs-card-unsynced")?.textContent).toBe("Not synced yet");
    expect(unsynced.querySelector(".hs-card-when .hs-card-alt-time .hs-card-clock")?.textContent).toBe("4:30");
    expect(draw({ now: tAt("16:00") }).querySelector(".hs-card-alt-time")).toBeNull();
  });

  it("puts the state word and its dot in one part, the dot hidden from a screen reader", () => {
    const part = draw({ now: tAt("17:10") }).querySelector(".hs-card-when .hs-card-state-part")!;
    expect(part.textContent).toBe(" · Not logged");
    expect(part.querySelector(".hs-card-sep")?.getAttribute("aria-hidden")).toBe("true");
    expect(part.querySelector("strong.hs-card-state")?.textContent).toBe("Not logged");
  });

  it("draws her initials on a client's card, from the name she goes by, or Mindbody's when the record has none", () => {
    const initials = (who: Client | null, over: Record<string, unknown> = {}) => {
      const card = draw({ now: tAt("16:00"), client: who, booking: { ...half, ...over } });
      const el = card.querySelector(".hs-card-head .hs-card-initials");
      if (el) expect(el.getAttribute("aria-hidden")).toBe("true");
      return el?.textContent ?? null;
    };
    expect(initials(plain)).toBe("MK");
    expect(initials({ id: "c1", firstName: "Judith", nickname: "Judy", lastName: "Sackville-Baggins" } as unknown as Client)).toBe("JS");
    expect(initials({ id: "c1" } as Client, { clientName: "ann lee" })).toBe("AL");
    expect(initials(null)).toBeNull();
  });

  it("says which narrow lines her name is too long for, only for a very long name", () => {
    expect(draw({ now: tAt("16:00") }).dataset.nameOver).toBeUndefined();
    const long = { id: "c1", firstName: "Bartholomew", lastName: "Hollingsworth" } as unknown as Client;
    expect(draw({ now: tAt("16:00"), client: long }).dataset.nameOver).toBe("60 62 64 66 68 70 72");
  });

  /* Phase 3 (hub-card.css): the short form and the shortest read data-name-over and the initials; a card
     with no profile, still loading or unread has neither, so its name stays whole, however long. */
  it("never gives a card with no profile, still loading or unread a way to initials, however long Mindbody's name", () => {
    const longName = { ...half, clientName: "Mary Ellen Szymanski-Abernathy" };
    for (const props of [{ client: null }, { client: null, rosterLoading: true }, { client: null, rosterFailed: true }] as Partial<HubCardProps>[]) {
      const card = draw({ now: tAt("16:00"), booking: longName, ...props });
      expect(card.dataset.kind).not.toBe("client");
      expect(card.dataset.nameOver).toBeUndefined();
      expect(card.querySelector(".hs-card-initials")).toBeNull();
      expect(card.querySelector(".hs-card-name")?.textContent).toBe("Mary Ellen Szymanski-Abernathy");
      expect(card.getAttribute("aria-label")).toMatch(/^Mary Ellen Szymanski-Abernathy, /);
    }
    // The same name on a client's card: the narrow lines it is too long for, and her initials.
    const client = draw({ now: tAt("16:00"), booking: longName, client: { id: "c1", firstName: "Mary Ellen", lastName: "Szymanski-Abernathy" } as unknown as Client });
    expect(client.dataset.nameOver?.split(" ")).toContain("112");
    expect(client.querySelector(".hs-card-initials")?.textContent).toBe("MS");
  });

  it("the Key draws each narrow card's symbol exactly as the card does: the icon, its size, stroke and fill", () => {
    const drawn = (svg: Element | null | undefined) => (svg ? ["class", "width", "height", "stroke-width", "fill"].map((a) => svg.getAttribute(a)) : null);
    const onCard = {
      done: drawn(draw({ now: tAt("16:50"), logged: loggedSessions([finished]), workoutSession: finished }).querySelector('.hs-card-when > svg[aria-label="Done"]')),
      "not-logged": drawn(draw({ now: tAt("17:10") }).querySelector('.hs-card-sym[data-sym="not-logged"] svg')),
      "left-open": drawn(draw({ now: tAt("18:00"), workoutSession: quiet() }).querySelector('.hs-card-sym[data-sym="left-open"] svg')),
      "late-cancel": drawn(draw({ now: tAt("17:10"), noShows: bookingMarks([{ id: half.id, noShow: true }]) }).querySelector('.hs-card-sym[data-sym="late-cancel"] svg')),
    };
    act(() => root!.render(<KeySheet open onClose={() => {}} />));
    for (const [sym, svg] of Object.entries(onCard)) {
      expect(svg, sym).not.toBeNull();
      expect(drawn(document.querySelector(`.hd-key-sym[data-sym="${sym}"] svg`)), sym).toEqual(svg);
    }
    // Two solid bars for Left open, the plainer pause (phase 1's CirclePause read like a button).
    expect(onCard["left-open"]).toEqual(["lucide lucide-pause", "13", "13", "2", "currentColor"]);
  });

  it("hides every new part on a full card: the wrappers are display: contents, the extras take no box", () => {
    const css = readFileSync(resolve(__dirname, "hub-card.css"), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");
    const top = (selectors: string) => {
      const at = css.indexOf(`${selectors} {`);
      expect(at, selectors).toBeGreaterThan(-1);
      // At the top level, never inside a container query.
      const before = css.slice(0, at);
      expect((before.match(/\{/g) ?? []).length, selectors).toBe((before.match(/\}/g) ?? []).length);
      return css.slice(at, css.indexOf("}", at));
    };
    expect(top(".hs-card-clock,\n.hs-card-state-part,\n.hs-card-sep,\n.hs-card-unsynced")).toMatch(/display:\s*contents;/);
    expect(top(".hs-card-initials,\n.hs-card-sym,\n.hs-card-alt-time,\n.hs-card-clock-short,\n.hs-tri.hs-tri--short")).toMatch(/display:\s*none;/);
  });

  /* Phase 2 (hub-card.css): a lane of about 155 to 175px hides her number
     beside the triangle and "+N" beside In session; the Unassigned column's
     staff line drops whole where the name and the time leave it too little
     room. What a card hides there, its label says. */
  it("says what a 155 to 175px lane hides: her number beside the triangle, and +N beside In session", () => {
    const card = draw({ now: tAt("16:40"), entry: MARKED, sessionNumber: 264, workoutSession: running() });
    expect(card.dataset.critical).toBe("true");
    expect(card.dataset.state).toBe("in-session");
    expect(card.querySelector(".hs-card-num")?.textContent).toBe("#264");
    expect(card.querySelector('.hs-g[data-family="more"]')?.textContent).toBe("+1");
    const label = card.getAttribute("aria-label") ?? "";
    expect(label).toContain("session 264");
    expect(label).toContain("1 more: Renewal talk");
  });

  it("draws the Unassigned column's staff line as a lead it can drop behind, then the words, which its label says", () => {
    const card = draw({ now: tAt("16:00"), staffName: "Westlake Rotation" });
    const staff = card.querySelector(".hs-card-staff")!;
    expect([...staff.children].map((c) => c.className)).toEqual(["hs-card-staff-lead", "hs-card-staff-name"]);
    // The lead is empty and unheard; the words are the line's whole text, as before.
    expect(staff.firstElementChild!.getAttribute("aria-hidden")).toBe("true");
    expect(staff.firstElementChild!.textContent).toBe("");
    expect(staff.textContent).toBe("Booked with Westlake Rotation");
    expect(card.getAttribute("aria-label")).toContain("Booked with Westlake Rotation");
    // Outside the Unassigned column there is no staff line at all.
    expect(draw({ now: tAt("16:00") }).querySelector(".hs-card-staff")).toBeNull();
  });
});
