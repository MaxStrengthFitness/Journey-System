import { createContext, useContext, type ReactNode } from "react";
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
  return <CareCtx.Provider value={{ studioId, read: read ?? own }}>{children}</CareCtx.Provider>;
}

/** The studio's care read: the provider's when one is mounted for this studio, else this component's own. */
export function useCareRead(studioId: string | null): MachineCareState {
  const ctx = useContext(CareCtx);
  const shared = Boolean(ctx && studioId && ctx.studioId === studioId);
  const own = useMachineCare(shared ? null : studioId);
  return shared && ctx ? ctx.read : own;
}

/** The read's state in the checklist's words: an error is "failed", an unanswered read "loading". */
export function careReadState(read: MachineCareState): "ready" | "loading" | "failed" {
  if (read.error) return "failed";
  if (read.loading) return "loading";
  return "ready";
}
