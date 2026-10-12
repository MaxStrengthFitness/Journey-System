/**
 * HOW MY STUDIO → MACHINES OPENS NEXT (the studio map, Oct 2026) — module
 * memory, like section-memory.ts, so a door elsewhere can send a leader
 * straight into Arrange the floor without importing the section.
 *
 * The Catalog's Draw the floor (a leader whose studio has no map yet) asks
 * for it: AppContent remembers My Studio's Machines section, then this, then
 * opens My Studio; the section takes it once, as it mounts, and opens the
 * editor in place of the floor list if the person leads the studio and isn't
 * on a phone. A sign-out forgets it, so the next person never lands in a
 * leader's editor.
 *
 * Phase 4 adds the map or the list (`rememberMachinesView`) beside it: the
 * one a person picked on this iPad, until sign-out, which wins over map
 * first whenever it can be honoured.
 */

import { forgetOnSignOut } from "../sign-out/memory";

let arrange = false;
let view: MachinesView | null = null;

export type MachinesView = "map" | "list";

forgetOnSignOut(() => {
  arrange = false;
  view = null;
});

/** The person's pick on Machines (the switch, or a door that names one). */
export function rememberMachinesView(next: MachinesView): void {
  view = next;
}

/** The pick on this iPad, or null: then Machines opens on the map once the studio has one. */
export function rememberedMachinesView(): MachinesView | null {
  return view;
}

/** The next open of Machines goes straight into Arrange the floor. */
export function rememberArrange(): void {
  arrange = true;
}

/** Whether a door asked for Arrange the floor; asking once forgets it. */
export function takeArrange(): boolean {
  const asked = arrange;
  arrange = false;
  return asked;
}
