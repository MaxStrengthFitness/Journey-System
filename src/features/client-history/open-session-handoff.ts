/**
 * A SESSION TO OPEN ON ARRIVAL at the Activity Archive (the Teams link round,
 * Oct 19 2026). A link to a finished session lands on the client's profile,
 * Activity Archive → Sessions, and the tab opens that session's pop-up from
 * its document. The request waits here because the tab is not mounted when
 * the link is read; the tab peeks it when it mounts and clears it once acted
 * on (peek, then clear: StrictMode runs state initialisers twice).
 *
 * Module memory about what a person was doing, so it is forgotten at
 * sign-out (features/sign-out/memory.ts). Imports nothing else.
 */
import { forgetOnSignOut } from "../sign-out/memory";

let handoff: { clientId: string; sessionId: string } | null = null;

forgetOnSignOut(() => {
  handoff = null;
});

export function handOffSession(clientId: string, sessionId: string): void {
  handoff = { clientId, sessionId };
}

/** The session waiting for this client's Activity Archive, or null. */
export function peekSessionHandoff(clientId: string): string | null {
  return handoff && handoff.clientId === clientId ? handoff.sessionId : null;
}

/** Acted on: clear it, unless a newer one has replaced it. */
export function clearSessionHandoff(sessionId: string): void {
  if (handoff?.sessionId === sessionId) handoff = null;
}
