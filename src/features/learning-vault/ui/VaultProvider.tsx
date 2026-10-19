/**
 * THE VAULT'S CONTEXT — the store, the studio, who is reading, and which
 * version they are reading. Round: the Learning vault redesign, Oct 19 2026.
 *
 * All three designs (the Tactical Codex, the Living Vault, the Interactive
 * Course) mount inside one VaultProvider, so a line crossed out in one is
 * crossed out in the others, and the reader's choice of "Solon's version" or
 * "MSF original" is one choice, not one per screen.
 *
 * - The LENS starts on the studio's version when a studio is open (the
 *   round's brief: the studio's version, with the MSF original one tap
 *   away), on the MSF original when none is (an administrator outside a
 *   studio has no studio version to read). With no studio, the lens is the
 *   original whatever was set: there is nothing else to show.
 * - Crossed-out lines SHOW by default (decision 2 of the round: "the
 *   baseline is always still there"); hiding them is the reader's opt-in.
 * - The hooks read the store through useSyncExternalStore, so a component
 *   re-renders when its page's markup changes and not otherwise (the store
 *   hands back the same object until it changes; markup-store.ts).
 *
 * The lens and the hide choice are React state, never module memory and
 * never browser storage: a shared iPad's next reader starts where the round
 * says (sign-out forgets nothing because nothing outlives the provider).
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { MarkupStore } from "../markup-store";
import type { LearningSubmission, MarkupLens, StudioMarkup, VaultViewer } from "../types";

export interface VaultContextValue {
  store: MarkupStore;
  studio: { id: string | null; name: string };
  viewer: VaultViewer;
  lens: MarkupLens;
  setLens: (l: MarkupLens) => void;
  showCrossed: boolean;
  setShowCrossed: (v: boolean) => void;
  now: () => Date;
  newId: (prefix: string) => string;
}

const VaultContext = createContext<VaultContextValue | null>(null);

const realNow = (): Date => new Date();

/**
 * "Solon's version"; a name that ends in s takes the apostrophe alone
 * ("James' version"); no name at all is "This studio's version".
 */
export function versionLabel(studioName: string): string {
  const name = (studioName ?? "").trim();
  if (!name) return "This studio's version";
  return /s$/i.test(name) ? `${name}' version` : `${name}'s version`;
}

export function VaultProvider(props: {
  store: MarkupStore;
  studio: { id: string | null; name: string };
  viewer: VaultViewer;
  now?: () => Date;
  newId?: (prefix: string) => string;
  initialLens?: MarkupLens;
  children: ReactNode;
}) {
  const { store, studio, viewer, now, newId, initialLens, children } = props;
  const studioId = studio.id || null;
  const studioName = (studio.name ?? "").trim() || "This studio";

  const [chosenLens, setChosenLens] = useState<MarkupLens>(initialLens ?? (studioId ? "studio" : "original"));
  const [showCrossed, setShowCrossed] = useState(true);
  const lens: MarkupLens = studioId ? chosenLens : "original";

  // Ids for marks made in this provider's life: a prefix, the moment, a count.
  // Only [A-Za-z0-9_-], so one can travel in a link if it ever needs to.
  const counter = useRef(0);
  const makeId = useCallback((prefix: string) => {
    counter.current += 1;
    const clean = (prefix || "id").replace(/[^A-Za-z0-9_-]/g, "") || "id";
    return `${clean}-${Date.now().toString(36)}-${counter.current.toString(36)}`;
  }, []);

  const setLens = useCallback((l: MarkupLens) => setChosenLens(l), []);
  const setShown = useCallback((v: boolean) => setShowCrossed(v), []);

  const { uid, name: viewerName, canStrike, canNote, isHeadOffice } = viewer;
  const value = useMemo<VaultContextValue>(
    () => ({
      store,
      studio: { id: studioId, name: studioName },
      viewer: { uid, name: viewerName, canStrike, canNote, isHeadOffice },
      lens,
      setLens,
      showCrossed,
      setShowCrossed: setShown,
      now: now ?? realNow,
      newId: newId ?? makeId,
    }),
    [store, studioId, studioName, uid, viewerName, canStrike, canNote, isHeadOffice, lens, setLens, showCrossed, setShown, now, newId, makeId],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

/** The vault. Throws outside a VaultProvider: a page drawn without one would lose every mark. */
export function useVault(): VaultContextValue {
  const v = useContext(VaultContext);
  if (!v) throw new Error("useVault() needs a <VaultProvider> above it.");
  return v;
}

/** The vault, or null outside a provider (a piece that can draw without markup). */
export function useOptionalVault(): VaultContextValue | null {
  return useContext(VaultContext);
}

const NOTHING: never[] = [];
const subscribeToNothing = () => () => {};

/**
 * The store's subscribe, bound and stable for as long as the store is the
 * same (a store written as a class keeps its `this`).
 */
function useSubscribe(store: MarkupStore | null): (listener: () => void) => () => void {
  return useCallback((listener: () => void) => (store ? store.subscribe(listener) : subscribeToNothing()), [store]);
}

/**
 * This studio's markup on one page, or null (no studio open, nothing marked,
 * or no provider). Re-renders when that markup changes.
 */
export function useStudioMarkup(targetKey: string): StudioMarkup | null {
  const v = useOptionalVault();
  const store = v?.store ?? null;
  const studioId = v?.studio.id ?? null;
  const subscribe = useSubscribe(store);
  const read = useCallback(
    () => (store && studioId && targetKey ? store.markupFor(studioId, targetKey) : null),
    [store, studioId, targetKey],
  );
  return useSyncExternalStore(subscribe, read, read);
}

/** Every submission to head office (the prototype's queue). Re-renders on change. */
export function useSubmissions(): LearningSubmission[] {
  const store = useOptionalVault()?.store ?? null;
  const subscribe = useSubscribe(store);
  const read = useCallback((): LearningSubmission[] => (store ? store.submissions() : NOTHING), [store]);
  return useSyncExternalStore(subscribe, read, read);
}

/** Every studio's markup (head office's count of crossed-out lines). Re-renders on change. */
export function useAllMarkup(): StudioMarkup[] {
  const store = useOptionalVault()?.store ?? null;
  const subscribe = useSubscribe(store);
  const read = useCallback((): StudioMarkup[] => (store ? store.allMarkup() : NOTHING), [store]);
  return useSyncExternalStore(subscribe, read, read);
}
