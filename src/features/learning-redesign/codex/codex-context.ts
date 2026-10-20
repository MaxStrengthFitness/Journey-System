import { createContext, useContext } from "react";
import type { LearningViewId } from "../../learning/LearningView";
import { nodeById } from "../../learning-vault/graph";
import { titleOf } from "../../learning-vault/pages";
import type { PeekStack } from "../../learning-vault/ui/PeekSheet";
import type { VaultRoute } from "../../learning-vault/types";
import type { VaultData } from "../../learning-vault/useVaultData";
import type { VaultNav } from "../../learning-vault/useVaultNav";
import type { WikiCrumb } from "../../wiki";
import type { MapState } from "../../learning-vault/map/map-model";
import type { TodayDoor } from "../today-door";
import { pieceLabel } from "./codex-model";

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
  /** The lens an index was last read through in this visit ("catalog", "academy", "phrasebook"), or null. */
  lensFor: (key: string) => string | null;
  rememberLens: (key: string, lens: string) => void;
  /** The map's state for a lens, so Back finds the map as it was left. */
  mapFor: (key: string) => MapState | null;
  rememberMap: (key: string, state: MapState) => void;
  phone: boolean;
  /** Today's Learning at a door, for the studio's tools (today-door.ts); null draws no doors. */
  openToday: ((door: TodayDoor) => void) | null;
}

export const CodexContext = createContext<CodexValue | null>(null);

export function useCodex(): CodexValue {
  const v = useContext(CodexContext);
  if (!v) throw new Error("useCodex() needs the Codex above it.");
  return v;
}

/**
 * A route's name in a crumb or the peek's head. The vault's own titleOf,
 * except where it has only a kind to offer, or names a page after something
 * else: a map entry (a clinical flag) is named by its node, and a machine's
 * quick card, script or deep dive by the piece first ("Quick card · LEG
 * PRESS"; "Quick card" alone right after its machine in the trail), so the
 * three never read as the machine's own page.
 */
export function crumbLabel(route: VaultRoute, data: VaultData, parent?: VaultRoute | null): string {
  if (route.kind === "map" && route.focus) {
    const node = data.graph ? nodeById(data.graph, route.focus) : null;
    const entity = data.entities?.byId.get(route.focus);
    return node?.label ?? entity?.label ?? "Connections";
  }
  return pieceLabel(route, data.machines, data.names, parent) ?? titleOf(route, data);
}
