/**
 * LEARNING LINKS — a Learning page, or one line on it, as a Journey link a
 * person pastes into Teams (the Learning vault redesign, Oct 19 2026).
 *
 * WHY THIS COPIES THE TEAMS-LINK BRANCH'S GRAMMAR
 * The way INTO Journey is being built on its own branch
 * (claude/oct19-teams-link-795436, src/features/deep-link/parse.ts): a link
 * is `/l/{kind}~{id}`, a studio's own page adds `?studio=`, and an id is
 * letters, digits, "-" and "_" only, at most 64 long. This file writes the
 * same links, character for character, so a link copied from a prototype
 * today opens the right page the day that branch lands. learning-link.test.ts
 * pins the branch's own examples (a machine, a quick card, a topic, the
 * phrasebook with no id, the glossary with and without a term, a studio page
 * with ?studio=) so the two cannot drift apart unnoticed.
 *
 * ONE THING IS NEW: `?section={blockKey}`, so a link can point at one LINE
 * ("Ask in Teams" under a line). The block key is made from the line's words
 * (blocks.ts blockKeyFor: "b-" and eight hex digits), so it always passes the
 * id rule. TODO when both branches land: the deep-link parser must learn to
 * read `section`. Today parse.ts reads only `studio` and pending.ts replaces
 * the address with "/" at boot, so the section is dropped and the link opens
 * the page, not the line. The fix is a few lines in parse.ts: read
 * SECTION_PARAM beside STUDIO_PARAM (isLinkId, else ignore it) and carry it
 * on the learning LinkTarget; parseLearningLink below is the reading to copy.
 *
 * What a link never carries: a title, a client, a name. "In-app only, for
 * now" and "Nothing pings anyone" (CLAUDE.md): the app never posts to Teams;
 * a person copies these words or hands them to the iPad's share sheet. A
 * page title is the Academy's or a machine's name, never client data, so the
 * words say it (the Teams-link branch's own copy says only the kind of page;
 * these words name it so the person reading Teams knows what they are
 * opening). "Keep client names out of Teams." is the one line ShareForm
 * says under the box where a person types.
 *
 * A link this file cannot build is null, never a guess: a playbook (a draft
 * from docs/business, which has no LearningRef kind, so the parser could not
 * read it back), an id with a dot or a space (31 of the 52 glossary terms
 * today, "Bone Density (Remodeling)"), anything over 64 characters.
 *
 * PURE: no React, no Firestore, no window.
 */
import {
  LEARNING_REF_KINDS,
  learningRefKey,
  type LearningRef,
  type LearningRefKind,
} from "../learning/ref";
import type { VaultTarget, VaultTargetRef } from "./types";

/** The most characters an id in a link may have (parse.ts LINK_ID_MAX). */
export const LINK_ID_MAX = 64;

/** Letters, digits, "-" and "_": no dot, no slash, no space, nothing a URL would encode. */
const ID_RE = /^[A-Za-z0-9_-]+$/;

/** The query key that names a studio on a studio's own page (parse.ts STUDIO_PARAM). */
export const STUDIO_PARAM = "studio";

/** The query key that names one line on the page. New in this round; parse.ts must learn it. */
export const SECTION_PARAM = "section";

/** The key prefix a playbook's markup and submissions are filed under. */
const PLAYBOOK_PREFIX = "playbook:";

/** A usable id: within the limit, and nothing but the characters above. */
export function isLinkId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= LINK_ID_MAX && ID_RE.test(v);
}

/* ------------------------------------------------------------------ *
 * A page's identity
 * ------------------------------------------------------------------ */

/**
 * The key a page's markup and submissions are filed under: learningRefKey
 * for every Learning page ("machine:m-leg-press", "academy-glossary"), and
 * "playbook:<id>" for a playbook, which has no LearningRef kind.
 */
export function targetKeyOf(ref: VaultTargetRef): string {
  if (ref.kind === "playbook") return `${PLAYBOOK_PREFIX}${ref.id}`;
  return learningRefKey(ref);
}

/**
 * The page a key names, read back: the inverse of targetKeyOf. A strike
 * signal carries only its page's key, and head office's queue needs the page
 * to open it. An academy-topic comes back without its module (the key never
 * had it); routeForRef finds the module in the Academy index. Null for a
 * key this file did not write.
 */
export function refFromTargetKey(key: string): VaultTargetRef | null {
  if (typeof key !== "string" || key.length === 0) return null;
  const colon = key.indexOf(":");
  const kind = colon < 0 ? key : key.slice(0, colon);
  const rest = colon < 0 ? null : key.slice(colon + 1);
  if (kind === "playbook") return rest ? { kind: "playbook", id: rest } : null;
  if (!LEARNING_REF_KINDS.includes(kind as LearningRefKind)) return null;
  switch (kind as LearningRefKind) {
    case "academy-cueing":
      return rest === null ? { kind: "academy-cueing" } : null;
    case "academy-glossary":
      if (rest === null) return { kind: "academy-glossary" };
      return rest ? { kind: "academy-glossary", id: rest } : null;
    case "studio-page": {
      if (!rest) return null;
      const slash = rest.indexOf("/");
      if (slash <= 0 || slash === rest.length - 1) return null;
      return { kind: "studio-page", studioId: rest.slice(0, slash), id: rest.slice(slash + 1) };
    }
    default:
      return rest ? ({ kind, id: rest } as LearningRef) : null;
  }
}

/** A page's identity for markup, links and submissions. */
export function vaultTarget(ref: VaultTargetRef, title: string): VaultTarget {
  return { ref, key: targetKeyOf(ref), title };
}

/* ------------------------------------------------------------------ *
 * Writing a link
 * ------------------------------------------------------------------ */

/**
 * The page's segment: its kind, "~", and the page's own id. The phrasebook
 * is its kind alone; the glossary is its kind alone or with a term. Null
 * when the id cannot be carried. Mirrors parse.ts learningPageId exactly.
 */
function learningPageId(ref: LearningRef): string | null {
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

/**
 * The path and query for a page, and for one line on it when `section` (the
 * line's block key) is given: "/l/academy-topic~mastery-pace?section=b-1a2b3c4d".
 * A studio's own page puts its studio first: "?studio=solon&section=…".
 *
 * Null when the page cannot be carried (a playbook; an id the rule refuses;
 * a studio page whose studio id fails it). A section the rule refuses is
 * left off and the link opens the page: a block key always passes, so that
 * only happens to a caller's mistake, and the page is still the right page.
 */
export function learningLinkPath(ref: VaultTargetRef, section?: string): string | null {
  if (ref.kind === "playbook") return null;
  const page = learningPageId(ref);
  if (!page) return null;
  const query: string[] = [];
  if (ref.kind === "studio-page") {
    if (!isLinkId(ref.studioId)) return null;
    query.push(`${STUDIO_PARAM}=${ref.studioId}`);
  }
  if (section !== undefined && isLinkId(section)) query.push(`${SECTION_PARAM}=${section}`);
  return query.length > 0 ? `/l/${page}?${query.join("&")}` : `/l/${page}`;
}

/** The whole link, from the app's origin ("https://maxstrength-app-beta.onrender.com"). */
export function learningLinkUrl(origin: string, ref: VaultTargetRef, section?: string): string | null {
  const path = learningLinkPath(ref, section);
  return path ? `${origin.replace(/\/+$/, "")}${path}` : null;
}

/* ------------------------------------------------------------------ *
 * Reading one back (what parse.ts must learn)
 * ------------------------------------------------------------------ */

export interface LearningLinkRead {
  ref: LearningRef;
  /** The line's block key, or null when the link points at the whole page. */
  section: string | null;
}

/**
 * Read a Learning link from its path and query, as window.location gives
 * them ("/l/machine~m-leg-press", "?section=b-1a2b3c4d"). The same reading as
 * parse.ts's `/l/` door, plus `section`. An unreadable section is ignored,
 * as parse.ts ignores any key it does not know: the page still opens. Null
 * for anything that is not a readable Learning link, never a guess.
 */
export function parseLearningLink(pathname: string, search: string = ""): LearningLinkRead | null {
  const m = /^\/l\/([^/?#]+)\/?$/.exec(pathname);
  if (!m) return null;
  let segment: string;
  try {
    segment = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const studioRaw = params.get(STUDIO_PARAM);
  const sectionRaw = params.get(SECTION_PARAM);
  const studioId = isLinkId(studioRaw) ? studioRaw : null;
  const ref = learningRefOf(segment, studioId);
  if (!ref) return null;
  return { ref, section: isLinkId(sectionRaw) ? sectionRaw : null };
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
      return id !== null ? ({ kind, id } as LearningRef) : null;
  }
}

/* ------------------------------------------------------------------ *
 * The words
 * ------------------------------------------------------------------ */

/** How long a quoted line may run in a Teams message before it is shortened. */
export const SHARE_QUOTE_MAX = 160;

/** The most a person may type as a question under the words. */
export const QUESTION_MAX = 500;

/** Where to look when a page has no link yet (a playbook draft, an uncarryable term). */
export const NO_LINK_WORDS = "in Journey's Learning";

/** What the words call a page that came without a title. */
export const UNTITLED_WORDS = "A Learning page";

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * A line, as it goes into a message: on one line, and shortened at a word
 * with "…" when it runs past SHARE_QUOTE_MAX. The link opens the whole line;
 * the quote only says which one it is.
 */
export function shareQuote(text: string, max: number = SHARE_QUOTE_MAX): string {
  const flat = oneLine(text);
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  const head = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${head.replace(/[\s,;:.—-]+$/, "")}…`;
}

/**
 * The words a person copies or shares:
 *
 *   Leg Press · Script & cues — Open in Journey https://…/l/machine~m-leg-press?section=b-1a2b3c4d
 *   "Keep the load moving."            (the line, when it is about one)
 *   Does anyone cue this differently?  (their question, when they typed one)
 *
 * The section is left out when it repeats the title. With no link, the first
 * line ends "in Journey's Learning" so the reader still knows where to look.
 * A page title is not client data; the question is the person's own words,
 * and ShareForm asks them to keep client names out of it.
 */
export function shareWords(input: {
  title: string;
  sectionTitle?: string;
  question?: string;
  url: string | null;
  /** The line itself, when the words are about one line (ShareForm passes the block's text). */
  quote?: string;
}): string {
  const title = oneLine(input.title) || UNTITLED_WORDS;
  const section = input.sectionTitle ? oneLine(input.sectionTitle) : "";
  const name = section && section.toLowerCase() !== title.toLowerCase() ? `${title} · ${section}` : title;
  const where = input.url ? `Open in Journey ${input.url}` : NO_LINK_WORDS;
  const lines = [`${name} — ${where}`];
  const quote = input.quote ? shareQuote(input.quote) : "";
  if (quote) lines.push(`“${quote}”`);
  const question = (input.question ?? "").trim().replace(/\n{3,}/g, "\n\n");
  if (question) lines.push(question);
  return lines.join("\n");
}
