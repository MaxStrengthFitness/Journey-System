/**
 * A SHARE: the document behind a client or session link (shares/{shareId}).
 *
 * The id is random and made on the iPad (AJ's T2a, Oct 19 2026), so a link
 * carries neither a name nor a record id. Whoever opens it is let in by the
 * rules alone: the share is readable only by someone who may read its
 * client. See ./README.md and docs/ARCHITECTURE.md §3.2.
 *
 * COPY LINK NEVER WAITS ON THE NETWORK. The id and the link are made at the
 * tap, the words go to the clipboard in the same tap (Safari allows a
 * clipboard write only inside one), and the document is written without
 * waiting; a refused write comes back as a toast saying the copied link
 * won't open. The words never carry the client's name: "A client · Open in
 * Journey <url>".
 */
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import type { JourneyShare } from "../../types";
import { linkUrl } from "./parse";

export type ShareRecord = JourneyShare;

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

/* ------------------------------------------------------------------ *
 * The id
 * ------------------------------------------------------------------ */

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A new share id: a UUID without its dashes (32 hex characters), or, where
 * the iPad has no randomUUID, 20 base-62 characters from getRandomValues.
 * Letters and digits only, 20 to 32 long: what the rules accept, and
 * nothing a URL would encode or the server would read as a file.
 */
export function newShareId(cryptoLike: Pick<Crypto, "getRandomValues"> & { randomUUID?: () => string } = crypto): string {
  if (typeof cryptoLike.randomUUID === "function") return cryptoLike.randomUUID().replace(/-/g, "");
  const bytes = cryptoLike.getRandomValues(new Uint8Array(20));
  let out = "";
  for (const b of bytes) out += BASE62[b % BASE62.length];
  return out;
}

/* ------------------------------------------------------------------ *
 * The words
 * ------------------------------------------------------------------ */

export const SHARE_WORD: Record<JourneyShare["kind"], string> = {
  client: "A client",
  session: "A session",
};

/** "A client · Open in Journey https://…/t/abc": the kind and the link, never a name. */
export function shareWords(kind: JourneyShare["kind"], url: string): string {
  return `${SHARE_WORD[kind]} · Open in Journey ${url}`;
}

/** The toast when the document's write was refused: the copied link will not open. */
export const SHARE_REFUSED_LINE = "That link won't open. Check your connection and copy it again.";
export const COPIED_LINE = "Link copied. Paste it into Teams.";
export const COPY_FAILED_LINE = "Couldn't copy the link.";

/* ------------------------------------------------------------------ *
 * Copy link
 * ------------------------------------------------------------------ */

export interface CopyShareFacts {
  kind: JourneyShare["kind"];
  /** The session's id for a session share; left out for a client's. */
  targetId?: string;
  clientId: string;
  /** The client's home studio. */
  studioId: string;
}

export interface CopyShareIo {
  /** Writes the words during the tap. */
  copy: (words: string) => Promise<void>;
  /** The share document's write, sent and not waited for. */
  write: (shareId: string, share: Omit<JourneyShare, "createdAt">) => Promise<void>;
  origin: string;
  uid: string | null;
  say: { success: (line: string) => void; error: (line: string) => void };
  makeId?: () => string;
}

/**
 * The tap: make the id and the link, copy the words, send the write. Nothing
 * here waits on the network; the clipboard's answer and the write's refusal
 * each come back as a toast. Returns the link, or null when nothing could
 * be made (not signed in, an id the link cannot carry).
 */
export function copyShareLink(facts: CopyShareFacts, io: CopyShareIo): string | null {
  if (!io.uid) return null;
  const shareId = (io.makeId ?? newShareId)();
  const url = linkUrl(io.origin, { kind: "share", shareId });
  if (!url) return null;
  const words = shareWords(facts.kind, url);
  io.copy(words).then(
    () => io.say.success(COPIED_LINE),
    () => io.say.error(COPY_FAILED_LINE),
  );
  io.write(shareId, {
    kind: facts.kind,
    targetId: facts.kind === "client" ? facts.clientId : (facts.targetId ?? ""),
    clientId: facts.clientId,
    studioId: facts.studioId,
    createdBy: io.uid,
  }).catch(() => io.say.error(SHARE_REFUSED_LINE));
  return url;
}

/** The app's own io: the clipboard, Firestore, this origin, the signed-in uid. */
export function appShareIo(say: CopyShareIo["say"]): CopyShareIo {
  return {
    copy: (words) => {
      const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
      return clip?.writeText ? clip.writeText(words) : Promise.reject(new Error("no clipboard"));
    },
    write: (shareId, share) => setDoc(doc(db, "shares", shareId), { ...share, createdAt: serverTimestamp() }),
    origin: typeof window !== "undefined" ? window.location.origin : "",
    uid: auth.currentUser?.uid ?? null,
    say,
  };
}
