/**
 * MAP OR TILES ON RELAY'S FLOOR (the studio map, phase 4, Oct 2026) —
 * module memory, like my-studio/section-memory.ts: what this iPad picked,
 * until sign-out. Map by default once the studio has a map; the tiles stay
 * for a studio with no map, a phone, or a room too small to tap.
 */
import { forgetOnSignOut } from "../../sign-out/memory";

export type RelayFloorView = "map" | "tiles";

let view: RelayFloorView = "map";

forgetOnSignOut(() => {
  view = "map";
});

export function relayFloorView(): RelayFloorView {
  return view;
}

export function rememberRelayFloorView(next: RelayFloorView): void {
  view = next;
}
