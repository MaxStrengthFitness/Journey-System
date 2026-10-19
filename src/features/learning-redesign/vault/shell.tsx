import { createContext, useContext, useMemo, type ReactNode } from "react";
import { WikiShell, type WikiCrumb } from "../../wiki";
import { titleOf } from "../../learning-vault/pages";
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
              peek.close();
              nav.push(r);
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
