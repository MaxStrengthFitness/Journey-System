import { lazy, Suspense } from "react";
import { LoadBoundary } from "../new-version/LoadBoundary";
import type { LayoutViewProps } from "./ui/types";
import type { StudioRoomProps } from "./ui/StudioRoom";
import type { FloorMapViewProps } from "./ui/FloorMapView";
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

const StudioRoom = lazy(() => import("./ui/StudioRoom"));

/**
 * The bare drawing, for a door that draws the map without the editor (the
 * Catalog's floor lens). The chunk is fetched the first time a map is shown;
 * a deploy that removed it says so in the panel, never over the page.
 */
export function LazyStudioRoom({ onDone, ...props }: StudioRoomProps & { /** The way back to the list, should the drawing's file be gone. */ onDone: () => void }) {
  return (
    <LoadBoundary kind="panel" where="screen" panel="The map" onDone={onDone}>
      <Suspense fallback={<p className="smap-quiet">Loading the map…</p>}>
        <StudioRoom {...props} />
      </Suspense>
    </LoadBoundary>
  );
}

const FloorMapView = lazy(() => import("./ui/FloorMapView"));

/**
 * The map every door but the Catalog reads (the studio map, phase 4): My
 * Studio → Machines, Relay's floor, Admins' floor, with the cleaning
 * checklist. Its chunk is the drawing's; a deploy that removed it says so
 * in the panel, and Done goes back to the host's list.
 */
export function LazyFloorMapView({ onDone, ...props }: FloorMapViewProps & { /** The way back to the list or the tiles, should the map's file be gone. */ onDone: () => void }) {
  return (
    <LoadBoundary kind="panel" where="screen" panel="The map" onDone={onDone}>
      <Suspense fallback={<p className="smap-quiet">Loading the map…</p>}>
        <FloorMapView {...props} />
      </Suspense>
    </LoadBoundary>
  );
}

export type { FloorMapViewProps, LayoutViewProps, StudioRoomProps };
