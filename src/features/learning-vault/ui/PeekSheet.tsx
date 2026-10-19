/**
 * THE PEEK SHEET — read the page a link points at without leaving this one.
 *
 * Round: the Learning vault redesign, Oct 19 2026. The Living Vault's "bottom
 * peek sheet in portrait, a dock at >= 1024px"; any design may use it.
 *
 * WHY A SHEET, AND WHY NOT A DIALOG
 * ---------------------------------
 * A trainer reading Leg Press taps "Peek" on Gradual Load Up: they want the
 * definition beside the machine, not instead of it. So the peek keeps the
 * page live underneath, like Relay's Context Panel (relay/board/ContextPanel)
 * and the Catalog map's card (machine-card/CardFrame): a plain element, never
 * a Base UI dialog, so nothing sets pointer-events on <body> and nothing can
 * freeze the iPad when it unmounts (lib/scroll-lock.ts records that bug).
 *
 *   Under 1024px  a bottom sheet INSIDE the app's <main> (absolute, left,
 *                 right and bottom 0), so it sits on the bottom bar's top
 *                 edge and never covers it, and pays no safe-area inset (the
 *                 bar pays it; features/home-screen counts every payer).
 *                 Two detents: 55% and tall (90%, as Relay's). A phone opens
 *                 tall: 55% of a phone is a strip. The tall detent stops
 *                 under Learning's masthead, which it measures, rather than
 *                 sliding beneath it (the masthead is z 11, the sheet z 8).
 *   From 1024px   a dock: a column beside the page (PeekFrame lays the two
 *                 out), sticky in the page's one scroller, as tall as the
 *                 scroller allows; its own body scrolls.
 *
 * Its body is the one second scroller Learning allows (the contract's
 * exception): a long topic in a peek scrolls inside the peek.
 *
 * THE STACK
 * ---------
 * A link inside a peek pushes another page onto the same sheet; the trail of
 * crumbs (each 40px+) goes back to any of them, Back goes back one, Close
 * empties it, "Open full page" hands the page to the design's own navigation.
 * Every one of those moves asks about typing inside the peek first (a note
 * being written under a line, in place, inside the peek): the peek is its own
 * leave scope (usePeekStack's `scope`; pass it to PeekSheet), so it asks only
 * about what the peek would lose, and changes the stack only inside the answer.
 * Escape closes it, unless the leave question is the thing on screen (that
 * question owns Escape) or something above already used the key (a concept
 * card closing itself calls preventDefault).
 *
 * FOCUS
 * -----
 * Opening moves focus to the peek's title (tabIndex -1), and every new page
 * in it does the same; closing gives focus back to whatever had it before
 * (the Hub peek's rule, hub-schedule/Peek.tsx).
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { usePhone } from "../../phone/device";
import { UnsavedChangesScope, useLeaveScope, type LeaveScope } from "../../unsaved-changes";
import type { VaultRoute } from "../types";
import "../../wiki/wiki.css";
import "./peek.css";

/* ------------------------------------------------------------------ *
 * The stack
 * ------------------------------------------------------------------ */

/** How deep a peek goes before the oldest page drops off the trail. */
export const PEEK_DEPTH = 8;

/** A route as a stable string: the same page is the same key, whatever order its fields were written in. */
export function peekKey(route: VaultRoute): string {
  const entries = Object.entries(route as unknown as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(entries);
}

/**
 * Pure: the stack after peeking `route`. The page already on top: nothing
 * changes. A page already further down: the trail goes back to it (no page
 * twice in one trail). Otherwise it goes on top, the oldest dropping off past
 * PEEK_DEPTH.
 */
export function pushPeek(stack: VaultRoute[], route: VaultRoute): VaultRoute[] {
  const key = peekKey(route);
  const at = stack.findIndex((r) => peekKey(r) === key);
  if (at === stack.length - 1 && at >= 0) return stack;
  if (at >= 0) return stack.slice(0, at + 1);
  const next = [...stack, route];
  return next.length > PEEK_DEPTH ? next.slice(next.length - PEEK_DEPTH) : next;
}

export interface PeekStack {
  stack: VaultRoute[];
  push: (r: VaultRoute) => void;
  back: () => void;
  crumb: (i: number) => void;
  close: () => void;
  /** The peek's own leave scope. Pass it to PeekSheet so typing inside the peek is asked about. */
  scope: LeaveScope;
}

/** The stack a design keeps for its peek. Every move asks the peek's leave scope first. */
export function usePeekStack(): PeekStack {
  const scope = useLeaveScope();
  const [stack, setStack] = useState<VaultRoute[]>([]);
  const { guard } = scope;
  const push = useCallback(
    (r: VaultRoute) => guard(() => setStack((s) => pushPeek(s, r))),
    [guard],
  );
  const back = useCallback(() => guard(() => setStack((s) => s.slice(0, -1))), [guard]);
  const crumb = useCallback(
    (i: number) => guard(() => setStack((s) => (i >= 0 && i < s.length ? s.slice(0, i + 1) : s))),
    [guard],
  );
  const close = useCallback(() => guard(() => setStack([])), [guard]);
  return useMemo(() => ({ stack, push, back, crumb, close, scope }), [stack, push, back, crumb, close, scope]);
}

/* ------------------------------------------------------------------ *
 * The tall detent's clearance
 * ------------------------------------------------------------------ */

/**
 * How far down the sheet's container its top bars reach: the tallest bottom
 * edge of the bars, measured from the container's top, ignoring bars that are
 * hidden (no height) or sit above it. Pure, so a test can hold it.
 */
export function clearanceFrom(containerTop: number, bars: { top: number; bottom: number }[]): number {
  let clear = 0;
  for (const b of bars) {
    if (b.bottom - b.top <= 0 || b.bottom <= containerTop) continue;
    clear = Math.max(clear, b.bottom - containerTop);
  }
  return Math.round(clear);
}

/** Learning's own bars: the masthead and the sub-bar under it (features/wiki). */
const BARS = ".wk__mast, .wk__bar";

/* ------------------------------------------------------------------ *
 * The sheet
 * ------------------------------------------------------------------ */

export interface PeekSheetProps {
  stack: VaultRoute[];
  titleOf: (r: VaultRoute) => string;
  render: (r: VaultRoute) => ReactNode;
  onBack: () => void;
  onCrumb: (i: number) => void;
  onClose: () => void;
  onOpenFull: (r: VaultRoute) => void;
  /** usePeekStack's scope; without one the sheet makes its own (typing pushed from outside then goes unasked). */
  scope?: LeaveScope;
}

export function PeekSheet({ stack, titleOf, render, onBack, onCrumb, onClose, onOpenFull, scope: given }: PeekSheetProps) {
  const own = useLeaveScope();
  const scope = given ?? own;
  const { guard } = scope;
  const phone = usePhone();
  const [tall, setTall] = useState<boolean | null>(null);
  const titleId = useId();
  const sheetRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const open = stack.length > 0;
  const top = open ? stack[stack.length - 1] : null;
  const topKey = top ? peekKey(top) : "";
  const isTall = tall ?? phone;

  // A fresh peek starts at the device's own detent.
  useEffect(() => {
    if (!open) setTall(null);
  }, [open]);

  // Focus in on open, back out on close.
  useEffect(() => {
    if (!open) return;
    const active = typeof document !== "undefined" ? document.activeElement : null;
    openerRef.current = active instanceof HTMLElement && !sheetRef.current?.contains(active) ? active : null;
    return () => {
      const opener = openerRef.current;
      openerRef.current = null;
      try {
        if (opener?.isConnected) opener.focus({ preventScroll: true });
      } catch {
        // A detached or unfocusable opener: nowhere to go back to.
      }
    };
  }, [open]);

  // Each page in the peek: its title takes focus, so a reader hears where they are.
  useEffect(() => {
    if (!topKey) return;
    try {
      titleRef.current?.focus({ preventScroll: true });
    } catch {
      // Focus is a courtesy here; never a reason to fail.
    }
  }, [topKey]);

  // Escape closes, asking first (see the header for when it does not).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="alertdialog"]')) return;
      guard(() => onCloseRef.current());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, guard]);

  // The tall detent stops under the masthead; the dock is as tall as the
  // scroller it rides. Measured where it cannot throw (KNOWN-TRAPS), with
  // ResizeObserver only where it exists; the CSS has a fallback for each.
  useLayoutEffect(() => {
    if (!open) return;
    const el = sheetRef.current;
    if (!el) return;
    const measure = () => {
      try {
        const parent = el.offsetParent instanceof HTMLElement ? el.offsetParent : null;
        if (parent) {
          const box = parent.getBoundingClientRect();
          const bars = Array.from(parent.querySelectorAll<HTMLElement>(BARS)).map((b) => {
            const r = b.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom };
          });
          el.style.setProperty("--vtp-clear", `${clearanceFrom(box.top, bars)}px`);
        }
        const scroller = el.closest(".wk__scroll");
        if (scroller instanceof HTMLElement && scroller.clientHeight > 0) {
          el.style.setProperty("--vtp-room", `${Math.max(240, scroller.clientHeight - 24)}px`);
        }
      } catch {
        // Keep the CSS fallbacks.
      }
    };
    measure();
    window.addEventListener("resize", measure);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function") {
      try {
        ro = new ResizeObserver(measure);
        if (el.offsetParent instanceof HTMLElement) ro.observe(el.offsetParent);
      } catch {
        ro = null;
      }
    }
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [open]);

  if (!open || !top) return null;
  const title = titleOf(top);
  const earlier = stack.slice(0, -1);
  const previous = earlier.length > 0 ? earlier[earlier.length - 1] : null;

  return (
    <aside ref={sheetRef} className={`vtp${isTall ? " vtp--tall" : ""}`} aria-labelledby={titleId}>
      <button
        type="button"
        className="vtp__grip"
        aria-label={isTall ? "Make the peek shorter" : "Make the peek taller"}
        aria-expanded={isTall}
        onClick={() => setTall(!isTall)}
      >
        <span className="vtp__grip-bar" aria-hidden="true" />
      </button>
      <header className="vtp__head">
        {earlier.length > 0 && (
          <nav className="vtp__trail" aria-label="Pages in this peek">
            <ol className="vtp__crumbs">
              {earlier.map((r, i) => (
                <li key={`${i}:${peekKey(r)}`} className="vtp__crumb-item">
                  <button type="button" className="vtp__crumb" onClick={() => guard(() => onCrumb(i))}>
                    {titleOf(r)}
                  </button>
                  <ChevronRight className="vtp__crumb-sep" size={14} aria-hidden="true" />
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="vtp__bar">
          {previous && (
            <button
              type="button"
              className="vtp__icon-btn"
              aria-label={`Back to ${titleOf(previous)}`}
              onClick={() => guard(() => onBack())}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
          )}
          <h2 id={titleId} ref={titleRef} className="vtp__title" tabIndex={-1}>
            {title}
          </h2>
          <button type="button" className="vtp__icon-btn" aria-label="Close the peek" onClick={() => guard(() => onClose())}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="vtp__actions">
          <button type="button" className="vtp__open" onClick={() => guard(() => onOpenFull(top))}>
            Open full page
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        </div>
      </header>
      <UnsavedChangesScope scope={scope}>
        <div key={topKey} className="vtp__body">
          {render(top)}
        </div>
      </UnsavedChangesScope>
    </aside>
  );
}

/* ------------------------------------------------------------------ *
 * The frame: the page and its peek, side by side from 1024px
 * ------------------------------------------------------------------ */

/**
 * Lays a page and its peek out together. Put it INSIDE the page's WikiShell
 * (as its children), so Learning's masthead stays whole across the top:
 *
 *   <WikiShell crumbs=…>
 *     <PeekFrame open={peek.stack.length > 0} peek={<PeekSheet … />}>
 *       {the page}
 *     </PeekFrame>
 *   </WikiShell>
 *
 * Under 1024px the frame is not positioned, so the sheet finds the app's
 * <main> and sits on the bottom bar; while it is open the page gets room at
 * its foot to scroll its last lines up above the sheet. From 1024px the frame
 * is a row: the page, then the dock.
 */
export function PeekFrame({ open, peek, children }: { open: boolean; peek: ReactNode; children: ReactNode }) {
  return (
    <div className={`vtp__frame${open ? " vtp__frame--open" : ""}`}>
      <div className="vtp__page">{children}</div>
      {peek}
    </div>
  );
}
