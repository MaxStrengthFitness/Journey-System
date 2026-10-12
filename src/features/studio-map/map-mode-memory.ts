/**
 * WHICH MODE RELAY'S MAP OPENS IN (the studio map, phase 4, Oct 2026) —
 * module memory, like my-studio/section-memory.ts.
 *
 * In Cleaning one tap marks a machine wiped for the whole team, so a shared
 * iPad left in Cleaning would turn tomorrow's look-up tap into a wrong mark
 * (Oct 11 reviews, A19). So My Studio, Operations and Admins always open in
 * Look up and never remember Cleaning; only Relay's floor, where the team
 * cleans between clients, remembers its mode on this iPad until sign-out.
 * The first time it opens in Cleaning (design §G question 1, built with its
 * default). A sign-out forgets it.
 */
import { forgetOnSignOut } from "../sign-out/memory";
import type { MapMode } from "../machine-card/parts";

/** Design §G question 1's built default: Relay's floor opens in Cleaning. */
export const RELAY_FIRST_MODE: MapMode = "cleaning";

let relayMode: MapMode | null = null;

forgetOnSignOut(() => {
  relayMode = null;
});

export function relayMapMode(): MapMode {
  return relayMode ?? RELAY_FIRST_MODE;
}

export function rememberRelayMapMode(mode: MapMode): void {
  relayMode = mode;
}
