/**
 * A SHARE: the document behind a client or session link (shares/{shareId}).
 *
 * The id is random and made on the iPad (AJ's T2a, Oct 19 2026), so a link
 * carries neither a name nor a record id. Whoever opens it is let in by the
 * rules alone: the share is readable only by someone who may read its
 * client. See ./README.md and docs/ARCHITECTURE.md §3.2.
 */

/** shares/{shareId}. The write side arrives with the shares collection (phase 2). */
export interface ShareRecord {
  kind: "client" | "session";
  /** The client's id for a client share; the session's id for a session share. */
  targetId: string;
  clientId: string;
  /** The client's home studio when the link was copied. */
  studioId: string;
  /** The Firebase Auth uid of whoever copied the link. */
  createdBy: string;
  createdAt: unknown;
}

/** What the share document said when it was read. */
export type ShareRead =
  | { status: "loading" }
  | { status: "ready"; share: ShareRecord }
  /** The Firestore error code, or "missing" for a document that is not there. */
  | { status: "refused"; code: string };

/** A share document read back from Firestore, or null for anything that is not one. */
export function shareRecordOf(raw: unknown): ShareRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (d.kind !== "client" && d.kind !== "session") return null;
  const targetId = typeof d.targetId === "string" ? d.targetId : "";
  const clientId = typeof d.clientId === "string" ? d.clientId : "";
  const studioId = typeof d.studioId === "string" ? d.studioId : "";
  if (!targetId || !clientId || !studioId) return null;
  return {
    kind: d.kind,
    targetId,
    clientId,
    studioId,
    createdBy: typeof d.createdBy === "string" ? d.createdBy : "",
    createdAt: d.createdAt,
  };
}
