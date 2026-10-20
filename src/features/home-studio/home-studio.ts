/**
 * BOOKED HERE, HOME STUDIO ELSEWHERE — who sees it, and what it says.
 *
 * The rules live in functions/src/home-studio-logic.ts (the server decides and
 * re-checks); this file is only the screen's half: who is offered the notice
 * (the same people the server will accept) and the words.
 */
import type { Trainer } from "../../types";
import { isDemoStudioId } from "../demo-mode/is-demo";
import { isEveryStudioRole, leadsStudio } from "../renewals/permissions";

export interface HomeStudioNotice {
  clientId: string;
  name: string;
  /** Live bookings at the asking studio in the last 30 days (and any ahead). */
  here: number;
  /** The latest of them, an ISO instant, or null. */
  lastAt: string | null;
  homeStudioId: string | null;
  homeStudioName: string | null;
}

export interface HomeStudioNoticesResult {
  studioName: string;
  notices: HomeStudioNotice[];
  truncated: boolean;
}

/**
 * Administrators, and a head trainer, studio leader, studio owner or franchise
 * owner of THIS studio, or a trainer given the grant. Mirrors the server's
 * mayMoveClientsTo; Demo Mode is never offered, since a practice studio holds
 * no real client.
 */
export function maySeeHomeStudioNotice(t: Trainer | null | undefined, studioId: string | null | undefined): boolean {
  if (!t || !studioId || isDemoStudioId(studioId)) return false;
  return isEveryStudioRole(t) || leadsStudio(t, studioId);
}

export function bookingsWord(n: number): string {
  return n === 1 ? "1 booking" : `${n} bookings`;
}

/** "Filed at westlake. 4 bookings here lately, the latest Oct 18." */
export function noticeSentence(n: Pick<HomeStudioNotice, "here" | "homeStudioName">, lastLabel: string | null): string {
  const filed = n.homeStudioName ? `Filed at ${n.homeStudioName}.` : "Not filed at any studio yet.";
  return `${filed} ${bookingsWord(n.here)} here lately${lastLabel ? `, the latest ${lastLabel}` : ""}.`;
}

/** The section row's name: "Booked here, filed elsewhere: 2". */
export function noticeHeading(count: number): string {
  return `Booked here, filed at another studio: ${count}`;
}

/** What Move says to a leader once it has happened. */
export function movedSentence(name: string, studioName: string): string {
  return `${name} is now filed at ${studioName}.`;
}

export const NOTICE_WHY =
  "These clients have live bookings at this studio in the last 30 days and none at the studio Journey has them filed at, on the same Mindbody site. Mindbody's Home location is usually why. Moving a client files her at this studio, so your team can open her record; it changes nothing in Mindbody, so ask the front desk to set her Home location there too.";
