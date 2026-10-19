/**
 * SHARE AND COPY — how a Learning link leaves the iPad (the Learning vault
 * redesign, Oct 19 2026).
 *
 * Two ways out, both a person's own tap, neither one the app talking to
 * Teams ("In-app only, for now"; "Nothing pings anyone"):
 *
 *   Share…     the iPad's share sheet (navigator.share), where Teams is one
 *              of the apps offered. iPad Safari and the Home Screen app have
 *              it; desktop Chrome may not.
 *   Copy link  the clipboard, always offered, so the words can be pasted
 *              into Teams by hand wherever Share… is missing.
 *
 * BOTH CALLS START INSIDE THE TAP. Safari allows a clipboard write and the
 * share sheet only while it is still handling the tap, so copyShare and
 * nativeShare call into the io before their first await, and the caller
 * calls them straight from onClick, never after waiting on something else.
 *
 * WHY A SECOND WAY TO COPY. The clipboard API (navigator.clipboard) exists
 * only on a secure page. AJ walks a PC build on the iPad at the PC's Wi-Fi
 * address over plain http (memory: iPad testing against the PC), where it is
 * missing, so copyWithSelection falls back to the old select-and-copy, the
 * way clipboard.js does it, which iPad Safari still honours inside a tap.
 *
 * The io is injectable so the tests need no browser: browserShareIo() is the
 * real one, a test passes its own.
 */

export interface ShareIo {
  /** Writes the words to the clipboard. Missing when nothing can copy here. */
  copy?: (text: string) => Promise<void>;
  /** Opens the share sheet. Missing where the browser has none. */
  share?: (data: { title: string; text: string; url?: string }) => Promise<void>;
  /** The app's own origin, for the link ("https://maxstrength-app-beta.onrender.com"). */
  origin: string;
}

/**
 * Copy by selecting the words in a field nobody sees and asking the browser
 * to copy the selection. True when the browser says it copied. Never throws:
 * a page without a document, or a browser that refuses, answers false.
 */
export function copyWithSelection(text: string, doc: Document | null | undefined): boolean {
  if (!doc || !doc.body || typeof doc.execCommand !== "function") return false;
  const before = doc.activeElement as HTMLElement | null;
  const field = doc.createElement("textarea");
  field.value = text;
  // 16px, or iPad Safari zooms the page to the field it focuses. Off-screen
  // and transparent; read-only so no keyboard rises.
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.left = "-9999px";
  field.style.opacity = "0";
  field.style.fontSize = "16px";
  field.setAttribute("readonly", "");
  field.setAttribute("aria-hidden", "true");
  let copied = false;
  try {
    doc.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, text.length);
    copied = doc.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    field.remove();
    try {
      before?.focus?.({ preventScroll: true });
    } catch {
      /* the element went away; focus stays where the browser put it */
    }
  }
  return copied;
}

/** The real io: the clipboard (or the old way), the share sheet when there is one, this origin. */
export function browserShareIo(): ShareIo {
  const win = typeof window !== "undefined" ? window : undefined;
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const doc = typeof document !== "undefined" ? document : undefined;
  const clipboard = nav?.clipboard;
  const secure = win ? win.isSecureContext !== false : false;

  const copy = (text: string): Promise<void> => {
    if (secure && clipboard && typeof clipboard.writeText === "function") {
      return clipboard.writeText(text).catch((err: unknown) => {
        if (copyWithSelection(text, doc)) return;
        throw err;
      });
    }
    return copyWithSelection(text, doc) ? Promise.resolve() : Promise.reject(new Error("Copy isn't available here."));
  };

  const canShare = !!nav && typeof nav.share === "function";
  const share = canShare
    ? (data: { title: string; text: string; url?: string }) => nav!.share(data)
    : undefined;

  return {
    copy,
    share,
    origin: win?.location?.origin ?? "",
  };
}

/**
 * Copy the words. Starts the write before its first await (inside the tap).
 * "failed" when there is nothing to copy with or the browser refused.
 */
export async function copyShare(text: string, io: ShareIo): Promise<"copied" | "failed"> {
  if (!io.copy) return "failed";
  try {
    await io.copy(text);
    return "copied";
  } catch {
    return "failed";
  }
}

/** A person closing the share sheet without picking an app: not a failure. */
function isCancel(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { name?: unknown }).name === "AbortError";
}

/**
 * Open the share sheet. Starts it before its first await (inside the tap).
 * "cancelled" when the person closed it, "unavailable" when there is none
 * here, "failed" for anything else (the browser refused it).
 */
export async function nativeShare(
  data: { title: string; text: string; url?: string },
  io: ShareIo,
): Promise<"shared" | "cancelled" | "unavailable" | "failed"> {
  if (!io.share) return "unavailable";
  try {
    await io.share(data);
    return "shared";
  } catch (err) {
    return isCancel(err) ? "cancelled" : "failed";
  }
}
