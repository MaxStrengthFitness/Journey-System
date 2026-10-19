import { createContext, useContext } from "react";
import type { LearningViewId } from "../../learning/LearningView";
import { nodeById } from "../../learning-vault/graph";
import { titleOf } from "../../learning-vault/pages";
import type { PeekStack } from "../../learning-vault/ui/PeekSheet";
import type { VaultRoute } from "../../learning-vault/types";
import type { VaultData } from "../../learning-vault/useVaultData";
import type { VaultNav } from "../../learning-vault/useVaultNav";
import type { WikiCrumb } from "../../wiki";

/**
 * What every Codex screen reads: the vault's data, the trail, the two ways
 * to follow a link (open it, or peek it under your thumb), and the tier
 * memory of this visit. One context, so a screen deep in the page does not
 * take eleven props. Nothing in it outlives the visit.
 */
export interface CodexValue {
  data: VaultData;
  nav: VaultNav;
  /** Open a page on top of the trail (asks first; a page already in the trail is gone back to). */
  open: (route: VaultRoute) => void;
  /** Read a page in the peek sheet, keeping this one. */
  peek: (route: VaultRoute) => void;
  peekStack: PeekStack;
  crumbs: WikiCrumb[];
  studioName: string;
  onSection: (id: LearningViewId) => void;
  /** The tier a page was last read at in this visit. */
  tierFor: (pageKey: string) => string | null;
  rememberTier: (pageKey: string, tier: string) => void;
  phone: boolean;
}

export const CodexContext = createContext<CodexValue | null>(null);

export function useCodex(): CodexValue {
  const v = useContext(CodexContext);
  if (!v) throw new Error("useCodex() needs the Codex above it.");
  return v;
}

/**
 * A route's name in a crumb or the peek's head. The vault's own titleOf,
 * except where it has only a kind to offer: a map entry (a clinical flag)
 * is named by its node.
 */
export function crumbLabel(route: VaultRoute, data: VaultData): string {
  if (route.kind === "map" && route.focus) {
    const node = data.graph ? nodeById(data.graph, route.focus) : null;
    const entity = data.entities?.byId.get(route.focus);
    return node?.label ?? entity?.label ?? "Connections";
  }
  return titleOf(route, data);
}
