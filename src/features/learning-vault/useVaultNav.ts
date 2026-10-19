/**
 * NAVIGATION INSIDE A DESIGN — a stack of routes, every move asked first.
 *
 * Round: the Learning vault redesign, Oct 19 2026 (overnight prototypes).
 *
 * Learning has no router and no address (AppContent switches on a view id;
 * each section keeps its own page in state). Each prototype design is the
 * same: it holds a stack of VaultRoutes, and the top one is the page drawn.
 *
 * THE RULE THIS HOOK EXISTS TO KEEP
 * ---------------------------------
 * Any in-page door that replaces a page asks the unsaved-changes gate first
 * and changes state ONLY inside the answer (docs/KNOWN-TRAPS.md, the Learning
 * door rule; LearningView's `through`). A trainer halfway through "Why does
 * Solon cross this out?" who taps a linked term must be asked before the form
 * vanishes, and "Keep editing" must leave everything exactly where it was —
 * no half-made move, no route set before the question and undone after.
 *
 * So push, replace, back and reset each ask useLeaveGuard, and set the stack
 * only in the proceed callback. A move that would change nothing (pushing the
 * page already on top, Back on the root) asks nothing.
 *
 * THE ONE MOVE THAT DOES NOT ASK
 * ------------------------------
 * `set(stack)` replaces the whole trail at once, WITHOUT asking: for a move
 * the app has already asked about before it reached the design (a page
 * opened from outside, through AppContent's guarded screen or LearningView's
 * doors; a masthead section change; the Learning title tapped on the
 * section's front page). Asking there again would put the same question
 * twice. It is never for a door inside the design: those use the four above.
 *
 * The stack's own rules (a trail cut back when a page in it is re-opened, a
 * cap on its depth, a root that never leaves) are pure and live in routes.ts.
 * `root` is where the stack starts; a design that changes section calls
 * reset(newRoot) rather than handing a new root, so a re-render never throws
 * away a reader's trail.
 *
 * Nothing here is remembered past the screen: the stack is component state,
 * gone when the design unmounts (no module memory, so nothing to forget at
 * sign-out).
 */

import { useCallback, useMemo, useState } from "react";
import { useLeaveGuard } from "../unsaved-changes";
import { STACK_MAX, popRoute, pushRoute, replaceRoute, sameRoute } from "./routes";
import type { VaultRoute } from "./types";

export interface VaultNav {
  /** The page on top: the one drawn. */
  route: VaultRoute;
  /** Root first, the page on top last. */
  stack: VaultRoute[];
  push: (r: VaultRoute) => void;
  replace: (r: VaultRoute) => void;
  back: () => void;
  reset: (root: VaultRoute) => void;
  /**
   * The whole trail, root first, at once and WITHOUT asking: only for a move
   * the app already asked about (a jump from outside, a masthead section
   * change, the title). An empty trail is ignored, the same trail changes
   * nothing, and a trail past STACK_MAX keeps its root and its newest pages.
   */
  set: (stack: VaultRoute[]) => void;
  canBack: boolean;
}

export function useVaultNav(root: VaultRoute): VaultNav {
  const [stack, setStack] = useState<VaultRoute[]>(() => [root]);
  const leave = useLeaveGuard();
  const top = stack[stack.length - 1];

  const push = useCallback(
    (r: VaultRoute) => {
      if (pushRoute(stack, r) === stack) return;
      leave(() => setStack((s) => pushRoute(s, r)));
    },
    [stack, leave],
  );

  const replace = useCallback(
    (r: VaultRoute) => {
      if (replaceRoute(stack, r) === stack) return;
      leave(() => setStack((s) => replaceRoute(s, r)));
    },
    [stack, leave],
  );

  const back = useCallback(() => {
    if (stack.length <= 1) return;
    leave(() => setStack((s) => popRoute(s)));
  }, [stack, leave]);

  const reset = useCallback(
    (next: VaultRoute) => {
      if (stack.length === 1 && sameRoute(stack[0], next)) return;
      leave(() => setStack([next]));
    },
    [stack, leave],
  );

  const set = useCallback((next: VaultRoute[]) => {
    if (next.length === 0) return;
    setStack((s) => (sameTrail(s, next) ? s : capTrail(next)));
  }, []);

  return useMemo(
    () => ({ route: top, stack, push, replace, back, reset, set, canBack: stack.length > 1 }),
    [top, stack, push, replace, back, reset, set],
  );
}

function sameTrail(a: VaultRoute[], b: VaultRoute[]): boolean {
  return a.length === b.length && a.every((r, i) => sameRoute(r, b[i]));
}

/** A copy, its root and newest pages kept past STACK_MAX (as pushRoute keeps them). */
function capTrail(next: VaultRoute[]): VaultRoute[] {
  if (next.length <= STACK_MAX) return [...next];
  return [next[0], ...next.slice(next.length - (STACK_MAX - 1))];
}
