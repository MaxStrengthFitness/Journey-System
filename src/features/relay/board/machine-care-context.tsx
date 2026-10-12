import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import type { MachineCare } from "./machine-care";
import { useMachineCare, type MachineCareState } from "./machine-care-store";

/**
 * THE FLOOR'S ONE LIVE CARE READ (the studio map, phase 4, Oct 2026).
 *
 * `studios/{s}/machineCare` is read once per screen, here, and every reader
 * on that screen takes it through `useCareRead`: the Board (the wipe chore's
 * count), Relay's floor, Since you were in, the map, and the machine's card.
 * Before, the Board's subtree alone opened it three times.
 *
 * WHY A CONTEXT AND NOT A PROP. A card opened through `relay.openPanel` is a
 * React element held in state, so a prop given to it is frozen at the moment
 * it opened: Deep cleaned while the card was open would never show "Deep
 * cleaned today". The rule for anything opened through openPanel is ids and
 * callbacks only, never data; what it shows comes from a context or its own
 * hooks. MyStudioView mounts this provider around its sections AND its
 * Context Panel, so a card in the panel reads the same live value; each
 * other host (Operations' Floor, Admins' Floor, the Catalog's map) mounts one
 * around its map and its card.
 *
 * `useCareRead(studioId)` answers from the provider when one is mounted for
 * THAT studio, and otherwise subscribes itself, so a component works in any
 * host. A host that already holds the read (the Catalog reads it for its
 * flags) hands it in as `read` and nothing subscribes twice.
 */

interface CareValue {
  studioId: string | null;
  read: MachineCareState;
  /** The read as it is now, for a callback that runs after its component has gone (a toast's Undo). */
  latest: () => MachineCareState;
}

const CareCtx = createContext<CareValue | null>(null);

export function MachineCareProvider({
  studioId,
  read,
  children,
}: {
  studioId: string | null;
  /** The read the host already holds; absent, the provider makes the one read itself. */
  read?: MachineCareState;
  children: ReactNode;
}) {
  const own = useMachineCare(read ? null : studioId);
  const value = read ?? own;
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  const latest = useCallback(() => ref.current, []);
  const ctx = useMemo(() => ({ studioId, read: value, latest }), [studioId, value, latest]);
  return <CareCtx.Provider value={ctx}>{children}</CareCtx.Provider>;
}

/** The studio's care read: the provider's when one is mounted for this studio, else this component's own. */
export function useCareRead(studioId: string | null): MachineCareState {
  const ctx = useContext(CareCtx);
  const shared = Boolean(ctx && studioId && ctx.studioId === studioId);
  const own = useMachineCare(shared ? null : studioId);
  return shared && ctx ? ctx.read : own;
}

/**
 * The care read as it is WHEN CALLED, for an Undo tapped seconds later
 * (phase 4 review fixes, Oct 12 2026): `markWiped`'s undo puts back only the
 * machines whose wipe is still its own, so it must see a later wipe from
 * another iPad. From the provider when one is mounted for this studio (it
 * outlives a card that closed on Wiped), else from the caller's own `read`.
 * Null while the read is loading or failed: unknown.
 */
export function useLiveCare(studioId: string | null, read: MachineCareState): () => Record<string, MachineCare> | null {
  const ctx = useContext(CareCtx);
  const shared = ctx && studioId && ctx.studioId === studioId ? ctx.latest : null;
  const ref = useRef(read);
  useLayoutEffect(() => {
    ref.current = read;
  });
  return useCallback(() => {
    const r = shared ? shared() : ref.current;
    return careReadState(r) === "ready" ? r.byMachineId : null;
  }, [shared]);
}

/** The read's state in the checklist's words: an error is "failed", an unanswered read "loading". */
export function careReadState(read: MachineCareState): "ready" | "loading" | "failed" {
  if (read.error) return "failed";
  if (read.loading) return "loading";
  return "ready";
}
