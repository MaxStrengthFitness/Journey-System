/**
 * COPY LINK for the places that need no share document: an ask on the
 * Board and a Learning page. The link is built from the ids it already has
 * (./parse.ts), the words go to the clipboard in the tap, and a toast says
 * so. The words say the kind of thing, never its title: "An ask · Open in
 * Journey <url>", "A Learning page · Open in Journey <url>".
 */
import { linkUrl, type LinkTarget } from "./parse";
import { COPIED_LINE, COPY_FAILED_LINE } from "./share";

export const LINK_WORD = {
  ask: "An ask",
  learning: "A Learning page",
} as const;

export function linkWords(kind: keyof typeof LINK_WORD, url: string): string {
  return `${LINK_WORD[kind]} · Open in Journey ${url}`;
}

export interface CopyLinkIo {
  copy: (words: string) => Promise<void>;
  origin: string;
  say: { success: (line: string) => void; error: (line: string) => void };
}

/**
 * The tap. Returns the link, or null when the target cannot be carried (an
 * id with a dot, a page too long), in which case nothing is copied and
 * nothing is said: the button should not have been offered.
 */
export function copyPlainLink(target: Exclude<LinkTarget, { kind: "share" }>, io: CopyLinkIo): string | null {
  const url = linkUrl(io.origin, target);
  if (!url) return null;
  io.copy(linkWords(target.kind, url)).then(
    () => io.say.success(COPIED_LINE),
    () => io.say.error(COPY_FAILED_LINE),
  );
  return url;
}

/** The app's own io: the clipboard and this origin. */
export function appCopyLinkIo(say: CopyLinkIo["say"]): CopyLinkIo {
  return {
    copy: (words) => {
      const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
      return clip?.writeText ? clip.writeText(words) : Promise.reject(new Error("no clipboard"));
    },
    origin: typeof window !== "undefined" ? window.location.origin : "",
    say,
  };
}
