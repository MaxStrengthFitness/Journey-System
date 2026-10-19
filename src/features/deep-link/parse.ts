/**
 * JOURNEY LINKS — the three paths a link may point at, read and written in
 * one place (the Teams link round, Oct 19 2026; docs/rounds/2026-10-19-teams-link.md).
 *
 *   /t/{shareId}            a client or a session, through a share document
 *                           (shares/{shareId}). The link never carries the
 *                           client's record id, which is usually a Mindbody
 *                           number: a mis-sent link means nothing in Teams'
 *                           logs or on a lock screen.
 *   /l/{kind}~{id}          a Learning page: a machine's Catalog page or an
 *                           Academy page. A studio's own page adds ?studio=.
 *   /a/{askId}?studio={id}  a Relay ask (studios/{s}/taskRequests/{askId}).
 *
 * An id is letters, digits, "-" and "_" only, at most LINK_ID_MAX long. A
 * dot is refused because the web server answers any path whose last part
 * looks like a file (".xxx") with Not found (server/served-files.ts); a
 * slash would be another path segment. A link this file cannot read is null,
 * never a guess: a link that opens the wrong place is worse than one that
 * says it is wrong.
 *
 * PURE: no React, no Firestore, no window. main.tsx reads the address through
 * ./pending.ts, so nothing here may grow the first screen.
 */
import { LEARNING_REF_KINDS, type LearningRef, type LearningRefKind } from "../learning/ref";

/** The most characters an id in a link may have. */
export const LINK_ID_MAX = 64;

/** Letters, digits, "-" and "_": no dot, no slash, no space, nothing a URL would encode. */
const ID_RE = /^[A-Za-z0-9_-]+$/;

export type LinkTarget =
  | { kind: "share"; shareId: string }
  | { kind: "learning"; ref: LearningRef }
  | { kind: "ask"; askId: string; studioId: string };

/** The query key that names a studio on a link that needs one. */
export const STUDIO_PARAM = "studio";

/** A usable id: within the limit, and nothing but the characters above. */
export function isLinkId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= LINK_ID_MAX && ID_RE.test(value);
}

/** True for any address this feature would read, before it is parsed. */
export function isLinkPath(pathname: string): boolean {
  return /^\/(t|l|a)\/./.test(pathname);
}

/**
 * A Learning page's id in a link: its kind, "~", and the page's own id
 * ("machine~m-leg-press", "academy-topic~hydration"). The two kinds with no
 * id of their own are the kind alone. A studio's page keeps its studio in
 * ?studio=, not here, so every segment has one shape. Null when the ref
 * cannot be carried (an id with a dot, or too long).
 */
export function learningPageId(ref: LearningRef): string | null {
  switch (ref.kind) {
    case "academy-cueing":
      return ref.kind;
    case "academy-glossary":
      if (!ref.id) return ref.kind;
      return isLinkId(ref.id) ? `${ref.kind}~${ref.id}` : null;
    default:
      return isLinkId(ref.id) ? `${ref.kind}~${ref.id}` : null;
  }
}

function learningRefOf(pageId: string, studioId: string | null): LearningRef | null {
  const tilde = pageId.indexOf("~");
  const kind = (tilde < 0 ? pageId : pageId.slice(0, tilde)) as LearningRefKind;
  const id = tilde < 0 ? null : pageId.slice(tilde + 1);
  if (!LEARNING_REF_KINDS.includes(kind)) return null;
  if (id !== null && !isLinkId(id)) return null;
  switch (kind) {
    case "academy-cueing":
      return id === null ? { kind } : null;
    case "academy-glossary":
      return id === null ? { kind } : { kind, id };
    case "studio-page":
      return id !== null && studioId ? { kind, id, studioId } : null;
    default:
      return id !== null ? { kind, id } : null;
  }
}

/**
 * Read a link from its path and query. `pathname` is "/t/abc" and `search`
 * is "?studio=solon" or "", as window.location gives them.
 */
export function parseLink(pathname: string, search: string = ""): LinkTarget | null {
  const m = /^\/(t|l|a)\/([^/?#]+)\/?$/.exec(pathname);
  if (!m) return null;
  const [, door, raw] = m;
  let segment: string;
  try {
    segment = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const studioRaw = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(STUDIO_PARAM);
  const studioId = isLinkId(studioRaw) ? studioRaw : null;
  if (door === "t") return isLinkId(segment) ? { kind: "share", shareId: segment } : null;
  if (door === "a") return isLinkId(segment) && studioId ? { kind: "ask", askId: segment, studioId } : null;
  const ref = learningRefOf(segment, studioId);
  return ref ? { kind: "learning", ref } : null;
}

/** The path and query for a target: what goes after the origin. Null when the target cannot be carried. */
export function linkPathFor(target: LinkTarget): string | null {
  switch (target.kind) {
    case "share":
      return isLinkId(target.shareId) ? `/t/${target.shareId}` : null;
    case "ask":
      return isLinkId(target.askId) && isLinkId(target.studioId)
        ? `/a/${target.askId}?${STUDIO_PARAM}=${target.studioId}`
        : null;
    case "learning": {
      const page = learningPageId(target.ref);
      if (!page) return null;
      if (target.ref.kind === "studio-page") {
        return isLinkId(target.ref.studioId) ? `/l/${page}?${STUDIO_PARAM}=${target.ref.studioId}` : null;
      }
      return `/l/${page}`;
    }
  }
}

/** The whole link, from the app's origin ("https://maxstrength-app-beta.onrender.com"). */
export function linkUrl(origin: string, target: LinkTarget): string | null {
  const path = linkPathFor(target);
  return path ? `${origin.replace(/\/+$/, "")}${path}` : null;
}

/** The studio a link names before anything is read: an ask's, a studio page's; null otherwise. */
export function studioNamedByLink(target: LinkTarget): string | null {
  if (target.kind === "ask") return target.studioId;
  if (target.kind === "learning" && target.ref.kind === "studio-page") return target.ref.studioId;
  return null;
}
