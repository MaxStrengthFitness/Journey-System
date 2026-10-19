import { useState } from "react";
import type { GraphDomain } from "../../learning-vault/types";
import { MapExplorer } from "../../learning-vault/map/MapExplorer";
import { NO_MAP_STATE, type MapState } from "../../learning-vault/map/map-model";
import { useCodex } from "./codex-context";
import "./codex.css";

/**
 * THE MAP AS A LENS (the Mix, Oct 19 2026): the Vault's explorer, the
 * shared part, mounted under an index's lens switch. The Catalog's Map shows
 * the machines and what connects to them; the Academy's, its modules,
 * topics, words and cue moments.
 *
 * Open and Peek go through the Codex's own routes and peek sheet, so a star's
 * page opens as every other link does (the unsaved-changes gate asked
 * first), and a peek keeps the reader's place. The map's own state (what is
 * in the middle, the trail of where the reader has been, the domain chips)
 * is held for the visit by the Codex, so Back from a page finds the map as
 * it was left. Never stored.
 */
export function MapLens({
  lensKey,
  domains,
  marked,
  label,
}: {
  /** Which index's map this is ("catalog", "academy"): its state is held under this key. */
  lensKey: string;
  domains: GraphDomain[];
  /** Node ids drawn solid (the studio's floor); every other machine is hollow. */
  marked?: ReadonlySet<string>;
  label: string;
}) {
  const { data, open, peek, mapFor, rememberMap } = useCodex();
  const [state, setState] = useState<MapState>(() => mapFor(lensKey) ?? NO_MAP_STATE);
  const change = (next: MapState) => {
    setState(next);
    rememberMap(lensKey, next);
  };
  return (
    <div className="cdx__map">
      <MapExplorer
        data={data}
        onOpen={open}
        onPeek={peek}
        size="lens"
        domains={domains}
        chips
        marked={marked}
        state={state}
        onStateChange={change}
        label={label}
      />
    </div>
  );
}
