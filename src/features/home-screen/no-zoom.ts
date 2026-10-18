/**
 * NO ZOOM (AJ, Oct 18 2026: "I always want those icons to be at the bottom.
 * I don't want to be able to zoom that in and out").
 *
 * A pinch on the iPad zoomed the whole app, and the zoomed page left the
 * bottom bar floating over a blank band at the foot of the screen. Three
 * layers turn it off, because Safari honours each in different places:
 *
 *   1. index.html's viewport tag: maximum-scale=1, user-scalable=no. The
 *      Home Screen app honours it; a Safari tab ignores user-scalable=no but
 *      still stops zooming into a small text box when it is tapped.
 *   2. index.css: `touch-action: pan-x pan-y` on <html>, so a finger may pan
 *      and never zoom, in a tab too.
 *   3. Here: Safari's own pinch events (`gesturestart`, `gesturechange`),
 *      cancelled, for any Safari that still lets one through.
 *
 * Nothing in Journey pinches on purpose: the studio map's zoom is its own
 * control, not the browser's.
 */

const GESTURES = ["gesturestart", "gesturechange", "gestureend"] as const;

let installed = false;

/** Cancel Safari's pinch gestures, once. A no-op outside a browser. */
export function blockPinchZoom(doc: Document | undefined = typeof document === "undefined" ? undefined : document): void {
  if (installed || !doc) return;
  installed = true;
  const cancel = (e: Event) => e.preventDefault();
  for (const type of GESTURES) doc.addEventListener(type, cancel, { passive: false });
}
