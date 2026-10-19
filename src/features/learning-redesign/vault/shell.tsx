import { createContext, useContext, useMemo, type ReactNode } from "react";
import { WikiShell, type WikiCrumb } from "../../wiki";
import { floorUnreadableFor, titleOf } from "../../learning-vault/pages";
import type { VaultNav } from "../../learning-vault/useVaultNav";
import type { VaultData } from "../../learning-vault/useVaultData";
import type { GraphDomain, VaultRoute } from "../../learning-vault/types";
import { PeekFrame, PeekSheet, type PeekStack } from "../../learning-vault/ui/PeekSheet";
import { PeekPage } from "./PeekPage";
import "./vault-map.css";

/**
 * THE VAULT'S FRAME — what every screen of Design 2 shares (the Learning
 * vault redesign, Oct 19 2026).
 *
 * One context carries the data, the trail of pages (useVaultNav), the peek
 * (usePeekStack) and the map's remembered state, so a screen asks for what it
 * needs instead of having it threaded through. `Frame` is the one way a
 * screen draws: Learning's own WikiShell (the masthead stays whole), the
 * trail as crumbs, the page and its peek side by side (PeekFrame: a bottom
 * sheet in portrait, a dock from 1024px).
 */

/** What the map remembers while Learning is open: its focus, its trail, which domains, map or list. */
export interface ExploreState {
  focus: string | null;
  /** The nodes focused before this one, oldest first (the way back across the map). */
  trail: string[];
  /** Domains switched on by the chips; empty means all of them. */
  domains: GraphDomain[];
  mode: "map" | "list";
}

export const NO_EXPLORE: ExploreState = { focus: null, trail: [], domains: [], mode: "map" };

export interface VaultScreen {
  data: VaultData;
  nav: VaultNav;
  peek: PeekStack;
  /** The root's crumb word ("Overview", "Catalog", "Academy"). */
  rootLabel: string;
  /** Opens a page: on top of the trail. */
  open: (route: VaultRoute) => void;
  /** Peeks a page: on the sheet, keeping this one. */
  peekAt: (route: VaultRoute) => void;
  explore: (key: string) => ExploreState;
  setExplore: (key: string, next: ExploreState) => void;
  /** The Catalog's and the Academy's lens ("floor" | "map", "modules" | "map"). */
  lens: (key: string) => string;
  setLens: (key: string, value: string) => void;
}

const ScreenContext = createContext<VaultScreen | null>(null);

export function VaultScreenProvider({ value, children }: { value: VaultScreen; children: ReactNode }) {
  return <ScreenContext.Provider value={value}>{children}</ScreenContext.Provider>;
}

export function useVaultScreen(): VaultScreen {
  const v = useContext(ScreenContext);
  if (!v) throw new Error("useVaultScreen() needs the Vault's screen provider above it.");
  return v;
}

/** The trail as crumbs: the root by its section's word, every page by its title. */
export function useCrumbs(): WikiCrumb[] {
  const { nav, data, rootLabel } = useVaultScreen();
  return useMemo(
    () =>
      nav.stack.map((route, i) => {
        const last = i === nav.stack.length - 1;
        const label = i === 0 ? rootLabel : titleOf(route, data);
        return last ? { label } : { label, onClick: () => nav.push(route) };
      }),
    [nav, data, rootLabel],
  );
}

/**
 * A part of the Academy that could not arrive (a reference chunk, a module):
 * said plainly, with the reader's own Try again, never a spinner that never
 * ends. `onPanel` when it sits on a panel (the map's card, the peek), where a
 * well is a shade, not a dip.
 */
export function DidNotLoad({ retry, onPanel = false }: { retry?: () => void; onPanel?: boolean }) {
  return (
    <div className={onPanel ? "vm__gone vm__gone--panel" : "vm__gone"} role="status">
      <p className="vm__gone-title">This part of the Academy didn't load.</p>
      <p className="vm__gone-body">The connection may have dropped. Nothing you marked is lost.</p>
      {retry && (
        <button type="button" className="vm__btn vm__btn--go" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * Why a page is not drawn yet, when it never will be by waiting: its module
 * or a reference chunk failed (the reader's Try again), or it is one of the
 * studio's own machines and the studio's floor could not be read (review
 * fix, Oct 19 2026: each spun forever). Null while waiting is still the
 * honest answer.
 */
export function stuckReason(route: VaultRoute, data: VaultData): "module" | "reference" | "floor" | null {
  if (route.kind === "topic" && route.moduleId !== "" && data.moduleFailed(route.moduleId)) return "module";
  if (floorUnreadableFor(route, data)) return "floor";
  // A studio's own machine waits on the floor, never on the Academy.
  const ownMachine = route.kind === "machine" && !data.defs[route.id];
  if (data.referenceFailed && needsReference(route) && !ownMachine) return "reference";
  return null;
}

/** The routes whose page waits on the Academy's reference chunks (glossary, cues, cards, scripts, deep dives). */
export function needsReference(route: VaultRoute): boolean {
  switch (route.kind) {
    case "machine":
    case "card":
    case "script":
    case "overview":
    case "glossary":
    case "cueing":
    case "map":
    case "quiz":
      return true;
    default:
      return false;
  }
}

export function Frame({ actions, children, scrollKey }: { actions?: ReactNode; children: ReactNode; scrollKey?: string }) {
  const { data, nav, peek } = useVaultScreen();
  const crumbs = useCrumbs();
  const open = peek.stack.length > 0;
  return (
    <WikiShell crumbs={crumbs} actions={actions} scrollKey={scrollKey}>
      <PeekFrame
        open={open}
        peek={
          <PeekSheet
            stack={peek.stack}
            scope={peek.scope}
            titleOf={(r) => titleOf(r, data)}
            render={(r) => <PeekPage route={r} />}
            onBack={peek.back}
            onCrumb={peek.crumb}
            onClose={peek.close}
            onOpenFull={(r) => {
              // The page first, then the peek: should the page ask about
              // typing, the close joins that same question, and "Keep
              // editing" leaves the peek as it was (PeekSheet also runs this
              // inside one answer for the whole gate).
              nav.push(r);
              peek.close();
            }}
          />
        }
      >
        <div className="vm__page" data-docked={open ? "" : undefined}>
          {children}
        </div>
      </PeekFrame>
    </WikiShell>
  );
}
