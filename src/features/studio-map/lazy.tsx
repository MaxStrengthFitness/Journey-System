import { lazy, Suspense } from "react";
import { LoadBoundary } from "../new-version/LoadBoundary";
import type { LayoutViewProps } from "./ui/types";
import "./studio-map.css";

/**
 * THE STUDIO MAP'S SCREENS, FETCHED ON FIRST USE (the studio map, Oct 2026).
 *
 * Arrange the floor (the leaders' editor) and its drawing are a chunk of
 * their own, so nothing on the first screen pays for them. A deploy that
 * removed the chunk an open app hasn't fetched is caught by the boundary
 * around it (new-version/LoadBoundary), never by the whole-app error screen.
 * It is a screen, not a session's panel: its words say so, and its Done
 * goes back where the leader came from.
 */
const LayoutView = lazy(() => import("./ui/LayoutView"));

export function LazyLayoutView(props: LayoutViewProps) {
  return (
    <LoadBoundary kind="panel" where="screen" panel="Arrange the floor" onDone={props.onDone}>
      <Suspense fallback={<p className="smap-quiet">Loading the layout…</p>}>
        <LayoutView {...props} />
      </Suspense>
    </LoadBoundary>
  );
}

export type { LayoutViewProps };
