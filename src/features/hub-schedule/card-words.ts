/**
 * THE CARD IN WORDS (the narrow cards round, Oct 18 2026). Pure:
 * card-words.test.ts.
 *
 * When two or three bookings start together they share their slot, and a
 * card a half or a third of its column says less (AJ, Oct 18 2026: "Keep
 * them side by side, cards say less"): what happened as a small symbol, one
 * mark, the time alone, no number. Nothing it gives up is gone. A tap opens
 * the peek, which says it all, and the card's spoken name says it to a
 * screen reader at every width: `spokenCard` is HubCard's aria-label, so a
 * word the card no longer shows is still the card's.
 *
 * The parts here are the card's own words, in the order the full card shows
 * them, and only words that are fine to say with the client at the iPad:
 * the glyphs' labels are the ones the peek and the "+N" already use, so a
 * client's home life (Get to know) is "Something to ask about" here too.
 */
import type { HubCardState } from "../../lib/hub-card-state";

/** What a card is, as HubCard's data-kind says it (a staff block has its own label). */
export type CardKind = "client" | "pending" | "unknown" | "unlinked";

/**
 * What is happening, in the card's own words: the word beside the time on a
 * full card, or what its mark and fill say ("Now", "In session", "Done").
 * Nothing for a booking still to come, and nothing for one that is over with
 * nothing to claim (a failed read, as the card says nothing).
 */
export function cardStateWords({
  kind,
  state,
  now,
  quietWord = null,
}: {
  kind: CardKind;
  state: HubCardState;
  /** Its time has come and no session has started (`hubCardIsNow`). */
  now: boolean;
  /** Why a session left open went quiet: "Paused", "At End Session"; else "Left open". */
  quietWord?: string | null;
}): string[] {
  if (kind === "pending") return ["Loading this client"];
  if (kind === "unknown") return ["Couldn't check this client's profile"];
  if (kind === "unlinked") return ["Not synced yet"];
  switch (state) {
    case "live":
      return now ? ["Now"] : [];
    case "in-session":
      return ["In session"];
    case "done":
      return ["Done"];
    case "not-logged":
      return ["Not logged"];
    case "didnt-come":
      return ["Late cancel"];
    case "left-open":
      return [quietWord || "Left open"];
    default:
      return [];
  }
}

export interface SpokenCardParts {
  /** The name she goes by, or Mindbody's name on a card with no profile. */
  name: string;
  /** "#264", or null where her number may not be quoted (`cornerNumber`). */
  numberText: string | null;
  /** `cardStateWords`. */
  stateWords: ReadonlyArray<string>;
  /** "9:30", or "10:00 – 10:45 AM" (`cardTime`), AM or PM included. */
  time: string;
  /** Read first: the Critical note's words, whole (`cardMarks().critical`). */
  critical: string | null;
  /** The glyphs the card shows: each one's label and its place in the Key's order. */
  glyphs: ReadonlyArray<{ label: string; rank: number }>;
  /** How many more the "+N" stands for, and what they are. */
  more: number;
  moreLabel: string | null;
  /** The words after the time ("New to Journey", a service: `cardRestWords`). */
  rest: ReadonlyArray<string>;
  /** In the Unassigned column, the staff name Mindbody gave. */
  staffName?: string | null;
}

/**
 * The card's spoken name: "Maria Kowalski, session 264, Not logged, 10:00,
 * Read first: …, Sleep & Recovery is Red, 1 more: Renewal talk, New to
 * Journey". The name, her number, what is happening, the time, Read first,
 * each glyph's label in the Key's order, the "+N", the words after the time,
 * and in the Unassigned column who Mindbody booked it with.
 */
export function spokenCard(p: SpokenCardParts): string {
  const parts: Array<string | null | undefined> = [
    p.name,
    p.numberText ? `session ${p.numberText.replace(/^#/, "")}` : null,
    ...p.stateWords,
    p.time,
    p.critical ? `Read first: ${p.critical}` : null,
    ...[...p.glyphs].sort((a, b) => a.rank - b.rank).map((g) => g.label),
    p.more > 0 ? (p.moreLabel ? `${p.more} more: ${p.moreLabel}` : `${p.more} more`) : null,
    ...p.rest,
    p.staffName ? `Booked with ${p.staffName}` : null,
  ];
  return parts
    .map((s) => (s ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * A span's time and its AM or PM apart ("10:00 – 10:45 AM" is
 * ["10:00 – 10:45", " AM"]), so a narrow card can leave the AM or PM to the
 * peek. One clock ("9:30") has none.
 */
export function timeAndSuffix(time: string): [string, string] {
  const m = / ([AP]M)$/.exec(time);
  return m ? [time.slice(0, m.index), ` ${m[1]}`] : [time, ""];
}

/** A span this long has the height for a line of its own under its time (a 45-minute card is 97px). */
export const TALL_SPAN_MINUTES = 45;

/**
 * HubCard's data-span: "tall" for a span of 45 minutes or more (a new client
 * consult), "short" for one under, nothing for the usual half hour's one
 * clock.
 */
export function cardSpanKind(start: Date | null, end: Date | null, isSpan: boolean): "tall" | "short" | undefined {
  if (!isSpan || !start || !end) return undefined;
  return Math.round((end.getTime() - start.getTime()) / 60_000) >= TALL_SPAN_MINUTES ? "tall" : "short";
}

/**
 * Her initials from a name ("Ann Lee" is "AL", "Cher" is "C"): the first
 * letter of the first word and of the last. For a client whose record holds
 * no name of its own (`clientInitials` gives nothing), from the name the
 * card shows, Mindbody's.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = [...words[0]][0] ?? "";
  const last = words.length > 1 ? [...words[words.length - 1]][0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}
