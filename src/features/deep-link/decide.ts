/**
 * WHAT TO DO WITH A LINK, once someone is signed in and standing in a studio.
 *
 * One pure answer for every link (the Teams link round, Oct 19 2026):
 *
 *   wait     the share document is still being read;
 *   hold     a session screen is up: the link waits for Finish, said as one
 *            quiet line and never as a dialog over the floor;
 *   open     here, now, through the bell's own navigation;
 *   switch   the link is at another studio this person works at: "Switch to
 *            Solon" is OFFERED, and nothing switches by itself (a switch lets
 *            go of the client, features/studio-switch);
 *   refuse   with the rules' words: "not at a studio you work at, or the
 *            link is wrong" for a refused or missing document (never "not
 *            found": the two are told apart by nothing a stranger should
 *            learn), "You're offline" when the read could not reach the
 *            server (the link is kept for when it can);
 *   demo     Demo Mode's own sentence.
 *
 * The session link's four cases (`sessionCase`) are read off the session
 * document: a finished session opens the Activity Archive's pop-up; another
 * trainer's running session opens the watching view; your own open session
 * is still open where you started it; a session with no client yet says so.
 */
import { isDemoStudioId } from "../demo-mode/is-demo";
import { isAnotherTrainersSession, isOpenSession } from "../../lib/live-session";
import type { LearningRef } from "../learning/ref";
import type { LinkTarget } from "./parse";
import type { ShareRead } from "./share";

export const HOLD_LINE = "Opens when you finish this session";
export const REFUSED_LINE = "This link isn't at a studio you work at, or the link is wrong.";
export const OFFLINE_LINE = "You're offline. The link opens when you're back.";
export const DIDNT_OPEN_LINE = "That link didn't open. Try it again.";
export const IN_DEMO_LINE = "You're in Demo Mode. Leave it to open this link.";
export const DEMO_NAME = "Demo Mode";
export const SESSION_STILL_OPEN_LINE = "That session is still open where you started it.";
export const SESSION_UNASSIGNED_LINE = "That session hasn't been given a client yet.";

export type OpenTarget =
  | { kind: "client"; clientId: string; studioId: string }
  | { kind: "session"; sessionId: string; clientId: string; studioId: string }
  | { kind: "ask"; askId: string; studioId: string }
  | { kind: "learning"; ref: LearningRef };

export type Decision =
  | { kind: "wait" }
  | { kind: "hold"; line: string }
  | { kind: "open"; target: OpenTarget }
  | { kind: "switch"; studioId: string; studioName: string; sentence: string; action: string }
  | { kind: "refuse"; sentence: string; keep: boolean }
  | { kind: "demo"; sentence: string };

export interface DecideFacts {
  link: LinkTarget;
  /** The studio the iPad is in. */
  activeStudioId: string | null;
  /** The studios this person works at or runs (lib/tenancy readableStudioIds, plus the grant). */
  myStudioIds: readonly string[];
  studioNameOf: (studioId: string) => string | null;
  /** A session screen is up: the Active Session, the briefing, the Wrap-up, the watch. */
  sessionRunning: boolean;
  /** What the share document said; needed for a share link only. */
  share: ShareRead | null;
}

/** The sentence for a refused read, by Firestore's error code. */
export function refusalFor(code: string): { sentence: string; keep: boolean } {
  if (code === "unavailable") return { sentence: OFFLINE_LINE, keep: true };
  if (code === "permission-denied" || code === "missing") return { sentence: REFUSED_LINE, keep: false };
  return { sentence: DIDNT_OPEN_LINE, keep: false };
}

function openTargetOf(f: DecideFacts): OpenTarget | null {
  const { link } = f;
  if (link.kind === "learning") return { kind: "learning", ref: link.ref };
  if (link.kind === "ask") return { kind: "ask", askId: link.askId, studioId: link.studioId };
  if (f.share?.status !== "ready") return null;
  const s = f.share.share;
  return s.kind === "client"
    ? { kind: "client", clientId: s.clientId, studioId: s.studioId }
    : { kind: "session", sessionId: s.targetId, clientId: s.clientId, studioId: s.studioId };
}

function studioOf(target: OpenTarget): string | null {
  if (target.kind === "learning") return target.ref.kind === "studio-page" ? target.ref.studioId : null;
  return target.studioId;
}

export function decide(f: DecideFacts): Decision {
  if (f.sessionRunning) return { kind: "hold", line: HOLD_LINE };

  if (f.link.kind === "share") {
    if (!f.share || f.share.status === "loading") return { kind: "wait" };
    if (f.share.status === "refused") return { kind: "refuse", ...refusalFor(f.share.code) };
  }
  const target = openTargetOf(f);
  if (!target) return { kind: "wait" };

  const at = studioOf(target);
  if (!at || at === f.activeStudioId) return { kind: "open", target };

  if (isDemoStudioId(f.activeStudioId) && !isDemoStudioId(at)) return { kind: "demo", sentence: IN_DEMO_LINE };

  if (f.myStudioIds.includes(at) || isDemoStudioId(at)) {
    const studioName = isDemoStudioId(at) ? DEMO_NAME : (f.studioNameOf(at) ?? "another studio");
    return {
      kind: "switch",
      studioId: at,
      studioName,
      sentence: `That link is at ${studioName}.`,
      action: `Switch to ${studioName}`,
    };
  }

  // A share the rules let this person read, at a studio they do not work
  // at (a client approved to cross-train here): it opens where they stand.
  if (target.kind === "client" || target.kind === "session") return { kind: "open", target };

  return { kind: "refuse", sentence: REFUSED_LINE, keep: false };
}

/* ------------------------------------------------------------------ *
 * A session link's four cases
 * ------------------------------------------------------------------ */

export interface SessionDocLike {
  status?: string;
  trainerId?: string | null;
  clientId?: string | null;
  isUnassigned?: boolean;
}

export type SessionCase =
  /** Finished: the Activity Archive's pop-up, from the document. */
  | { kind: "finished" }
  /** Another trainer is running it: the watching view. */
  | { kind: "watch" }
  /** This person's own running session: said, never followed into. */
  | { kind: "say"; sentence: string };

export function sessionCase(session: SessionDocLike | null, myTrainerIds: readonly string[]): SessionCase {
  if (!session) return { kind: "say", sentence: REFUSED_LINE };
  if (session.status !== "In-Progress") return { kind: "finished" };
  if (isOpenSession(session)) return { kind: "say", sentence: SESSION_UNASSIGNED_LINE };
  if (isAnotherTrainersSession(session, myTrainerIds)) return { kind: "watch" };
  return { kind: "say", sentence: SESSION_STILL_OPEN_LINE };
}
