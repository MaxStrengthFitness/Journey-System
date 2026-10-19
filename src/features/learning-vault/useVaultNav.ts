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
import { popRoute, pushRoute, replaceRoute, sameRoute } from "./routes";
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

  return useMemo(
    () => ({ route: top, stack, push, replace, back, reset, canBack: stack.length > 1 }),
    [top, stack, push, replace, back, reset],
  );
}
