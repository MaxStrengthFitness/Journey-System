/**
 * LINES A READER CAN MARK — the Learning vault's blocks, Oct 19 2026.
 *
 * Every page in the vault (a machine's method lines, an Academy topic, the
 * cueing phrasebook, a playbook) is drawn as sections of blocks, and a block
 * is the unit a studio crosses out, writes a note on, or disputes with head
 * office. So a block needs an identity that survives the corpus being
 * rebuilt.
 *
 * WHY THE KEY IS MADE FROM THE WORDS
 * ----------------------------------
 * The Academy corpus is generated (scripts/build-academy-content.ts) and "a
 * rebuilt corpus can rename" an id (learning/ref.ts); a machine's method
 * lines come from a definition head office edits. A key made from a block's
 * POSITION would move a studio's mark onto a different sentence the first
 * time a line was added above it, silently. A key made from the WORDS keeps
 * the mark on the line it was made on, and a line whose words changed turns
 * into an orphan ("Lines that changed since Solon marked them") that a person
 * can look at, instead of a mark that quietly means something else. That is
 * the same call safetyLineKey makes for a machine's safety lines
 * (lib/resolve-machine.ts), and the same reason the codex's source records
 * are keyed by a line's words (machine-codex/format.ts lineKey).
 *
 * The words are normalised first, so the key does not change when a rebuild
 * only re-cases a line, straightens a quote mark, or drops a full stop.
 *
 * The key is "b-" and eight hex digits (FNV-1a, 32 bits), which also passes
 * the deep-link id check (/^[A-Za-z0-9_-]{1,64}$/), so a Teams link can carry
 * it as `?section=b-1a2b3c4d`.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { VaultBlock, VaultBlockKind, VaultSection } from "./types";

/**
 * Quote marks, brackets, dashes and stops a line can gain or lose at either
 * end without its words changing. Written as escapes: never a raw curly quote
 * or dash in source (KNOWN-TRAPS, invisible and look-alike characters).
 */
const EDGE_MARKS =
  "\\s\"'`*_.,;:!?()\\[\\]{}\\u2018\\u2019\\u201A\\u201B\\u201C\\u201D\\u201E\\u201F\\u00AB\\u00BB\\u2039\\u203A\\u2026\\u2013\\u2014\\u2012\\u2015\\-";
const EDGES = new RegExp(`^[${EDGE_MARKS}]+|[${EDGE_MARKS}]+$`, "g");
const CURLY_SINGLE = /[\u2018\u2019\u201A\u201B\u2032]/g;
const CURLY_DOUBLE = /[\u201C\u201D\u201E\u201F\u2033]/g;

/**
 * The words of a line, as its key sees them: compatibility-normalised,
 * curly quotes straightened, lower-case, every run of whitespace one space,
 * and quote marks and punctuation stripped from both ends.
 * "  \u201CBarely touch, barely start.\u201D " reads "barely touch, barely start".
 */
export function normaliseWords(text: string): string {
  if (typeof text !== "string") return "";
  return text
    .normalize("NFKC")
    .replace(CURLY_SINGLE, "'")
    .replace(CURLY_DOUBLE, '"')
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(EDGES, "")
    .trim();
}

/** FNV-1a, 32 bits, over the UTF-16 code units of `s`, as 8 lower-case hex digits. */
function fnv1a32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** A line's key: "b-" + FNV-1a 32 of its normalised words ("b-1a2b3c4d"). */
export function blockKeyFor(text: string): string {
  return `b-${fnv1a32(normaliseWords(text))}`;
}

/** The kinds a vault block can be. Anything else a source sends is a paragraph. */
const VAULT_KINDS: ReadonlySet<string> = new Set<VaultBlockKind>([
  "heading",
  "subheading",
  "para",
  "bullet",
  "cue",
  "said",
  "do",
  "line",
]);

/** The Academy corpus says "body"; a studio page says "para". Both are a paragraph. */
function kindOf(kind: string): VaultBlockKind {
  if (kind === "body") return "para";
  return VAULT_KINDS.has(kind) ? (kind as VaultBlockKind) : "para";
}

/**
 * Markdown emphasis as plain words (review fix, Oct 19 2026). The machine
 * definitions write cue *"ease out... do not speed up"* and relax the ankles
 * *before* lowering; a few Academy topics write **bold**. A page draws plain
 * words, so a paired asterisk (or pair of them) goes and what it wrapped
 * stays, quotes and all. A lone asterisk, or one with a space just inside it
 * ("5 * 6"), is not emphasis and is left alone.
 */
export function plainEmphasis(text: string): string {
  return text.replace(/\*\*(\S(?:[^*\n]*?\S)?)\*\*/g, "$1").replace(/\*(\S(?:[^*\n]*?\S)?)\*/g, "$1");
}

/**
 * The corpus's blocks (`{ kind, text }`) as vault blocks: heading, subheading
 * and bullet kept, body and para a paragraph, the vault's own kinds kept,
 * anything else a paragraph, Markdown emphasis drawn as plain words. A block
 * with no words is not a line and is left out. `source` says where the words
 * come from, on every block.
 */
export function toVaultBlocks(
  blocks: { kind: string; text: string }[],
  opts?: { source?: string },
): VaultBlock[] {
  const out: VaultBlock[] = [];
  for (const b of blocks ?? []) {
    const text = typeof b?.text === "string" ? plainEmphasis(b.text).trim() : "";
    if (!text) continue;
    const block: VaultBlock = { key: blockKeyFor(text), kind: kindOf(String(b.kind)), text };
    if (opts?.source) block.source = opts.source;
    out.push(block);
  }
  return out;
}

/** A section, with no `note` key at all when there is no note. */
export function vaultSection(id: string, title: string, blocks: VaultBlock[], note?: string): VaultSection {
  const section: VaultSection = { id, title, blocks };
  if (note && note.trim()) section.note = note.trim();
  return section;
}
