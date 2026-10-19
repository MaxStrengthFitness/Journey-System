/**
 * THE LINK A TAB OPENED WITH, remembered until Journey can act on it.
 *
 * main.tsx calls `captureLinkFromAddress` before React mounts. If the address
 * is a Journey link (./parse.ts) it is kept in module memory, a flag is set
 * in sessionStorage saying this tab opened from a link, and the address bar
 * is replaced with "/" at once. Replaced, not kept: a reload, or a sign-in
 * that comes back by redirect, must not open the link a second time, and the
 * id must not sit in the address bar for the next person on the iPad to read.
 *
 * The memory is forgotten at sign-out (features/sign-out/memory.ts): a link
 * left waiting is the last person's, not the next one's. The tab flag is the
 * tab's own and stays; src/firebase.ts may read it one day to keep a link
 * tab's sign-in and cache with the tab (the plan's Safari landing), which this
 * round does not do.
 *
 * NO FIRESTORE AND NO REACT: this runs before either exists.
 */
import { forgetOnSignOut } from "../sign-out/memory";
import { parseLink, type LinkTarget } from "./parse";

/** sessionStorage: "1" in a tab that opened from a Journey link. */
export const LINK_TAB_KEY = "journey.link-tab";

export interface PendingLink {
  target: LinkTarget;
  /** The address as it was opened, for Copy link on the signed-out landing. */
  href: string;
}

let pending: PendingLink | null = null;

forgetOnSignOut(() => {
  pending = null;
});

/** The part of window this module touches, so it is tested without a browser. */
export interface AddressLike {
  location: { pathname: string; search: string; href: string };
  history: { replaceState: (data: unknown, unused: string, url?: string | null) => void };
  sessionStorage?: { setItem(key: string, value: string): void; getItem(key: string): string | null } | null;
}

/**
 * Read the address once, at boot. Returns what it found, which is also what
 * `peekPendingLink` will say from now on. A plain address leaves everything
 * as it was.
 */
export function captureLinkFromAddress(win: AddressLike): PendingLink | null {
  const target = parseLink(win.location.pathname, win.location.search);
  if (!target) return null;
  pending = { target, href: win.location.href };
  try {
    win.sessionStorage?.setItem(LINK_TAB_KEY, "1");
  } catch {
    /* storage refused (private mode, quota): the flag is a courtesy */
  }
  try {
    win.history.replaceState(null, "", "/");
  } catch {
    /* an address that cannot be replaced is left; the link still opens once */
  }
  return pending;
}

export function peekPendingLink(): PendingLink | null {
  return pending;
}

/** The link has been opened, refused, or let go: nothing waits any more. */
export function clearPendingLink(): void {
  pending = null;
}

/** True in a tab that opened from a Journey link, reload included. */
export function isLinkTab(storage: { getItem(key: string): string | null } | null | undefined): boolean {
  try {
    return storage?.getItem(LINK_TAB_KEY) === "1";
  } catch {
    return false;
  }
}

/** For tests only: what main.tsx would do, on a given address. */
export function __setPendingForTests(link: PendingLink | null): void {
  pending = link;
}
