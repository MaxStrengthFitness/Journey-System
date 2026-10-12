import { useState } from "react";
import type { View } from "../../types";
import { afterStudioMove, type LetGo } from "./let-go";

/**
 * Lets go of the held client when the active studio moves (Oct 12 2026; see
 * ./let-go.ts for the rule and AJ's words).
 *
 * The adjustment happens DURING RENDER (React's "storing information from
 * previous renders"), not in an effect: React drops the render that saw the
 * new studio with the old client and renders again before anything is drawn,
 * so the new studio never shows the last one's client, not even for a frame,
 * and none of her screen's effects run against the new studio. `letGo` must
 * therefore only set state of the component calling this hook (AppContent's
 * own setters, the raw ones: a switch someone chose already asked the
 * unsaved-changes question), or forget a module memory, which is the same
 * write however often React renders.
 */
export function useLetGoOnStudioSwitch(
  studioId: string | null,
  view: View,
  letGo: (step: LetGo) => void,
): void {
  const [held, setHeld] = useState(studioId);
  if (held !== studioId) {
    setHeld(studioId);
    const step = afterStudioMove(held, studioId, view);
    if (step) letGo(step);
  }
}
