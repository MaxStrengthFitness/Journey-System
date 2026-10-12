/**
 * WHERE A LEADER WAS IN OPERATIONS — module memory, forgotten at sign-out.
 *
 * The redesign's Operations room (Sep 28 2026). The pin on today's screen:
 * "It forgets where you were. Every visit starts again on Overview. Tapping a
 * client leaves Operations, so the tab, the list and your scroll are lost."
 *
 * So the shell remembers, for the rest of the session and for this person:
 *
 *   place     the destination and the page inside it
 *   subs      the page each destination was last on (Clients remembers
 *             Renewals while you look at Team)
 *   client    the client opened inside Operations, so coming back from her
 *             full profile lands on her again, and the studio the app was
 *             on when she was opened: at another studio she is let go
 *             (Oct 12 2026, AJ: "switching studios should clear whoever
 *             youre holding"), however the switch was made
 *   scroll    how far down each page was
 *   setupOpen whether the sidebar's Setup group was open
 *
 * In module scope, like My Studio's section (section-memory.ts): it outlives
 * the Operations screen (which unmounts when the app shows a profile) and a
 * restart forgets it. A sign-out forgets it too — the next person on a shared
 * iPad starts on Today, never on the leader-before's client.
 */
import { forgetOnSignOut } from "../../sign-out/memory";
import { HOME_PLACE, resolvePlace, type OpsPage, type OpsPlace } from "./places";

interface Memory {
  place: OpsPlace;
  subs: Partial<Record<OpsPage, string | null>>;
  clientId: string | null;
  /** The studio the app was on when that client was opened. */
  clientStudioId: string | null;
  scroll: Record<string, number>;
  setupOpen: boolean;
}

const blank = (): Memory => ({ place: HOME_PLACE, subs: {}, clientId: null, clientStudioId: null, scroll: {}, setupOpen: false });

let memory: Memory = blank();

forgetOnSignOut(() => {
  memory = blank();
});

/** Where Operations opens: the last place, made safe to open. */
export function rememberedPlace(): OpsPlace {
  return resolvePlace(memory.place);
}

export function rememberPlace(place: OpsPlace): void {
  memory.place = resolvePlace(place);
  if (place.page !== "today") memory.subs[place.page] = memory.place.sub;
}

/** The page a destination was last on, or null for none remembered. */
export function rememberedSub(page: OpsPage): string | null | undefined {
  return memory.subs[page];
}

/** The client open inside Operations, only while the app is on the studio she was opened at. */
export function rememberedClient(studioId: string | null): string | null {
  return memory.clientId && memory.clientStudioId === studioId ? memory.clientId : null;
}

export function rememberClient(clientId: string | null, studioId: string | null = null): void {
  memory.clientId = clientId;
  memory.clientStudioId = clientId ? studioId : null;
}

export function rememberedScroll(key: string): number {
  return memory.scroll[key] ?? 0;
}

export function rememberScroll(key: string, top: number): void {
  if (Number.isFinite(top) && top >= 0) memory.scroll[key] = top;
}

export function rememberedSetupOpen(): boolean {
  return memory.setupOpen;
}

export function rememberSetupOpen(open: boolean): void {
  memory.setupOpen = open;
}

/** For tests: back to a fresh session. */
export function resetOperationsMemory(): void {
  memory = blank();
}
