import type { ReactNode } from "react";
import { ContextPanel } from "../relay/board/ContextPanel";
import type { PanelContent } from "../relay/board/RelayContext";
import "./machine-card.css";

/**
 * A MAP BESIDE ITS CARD, for a host with no Relay shell (the studio map,
 * phase 4): the Catalog's map and Admins' floor. The same Context Panel My
 * Studio and Relay open (a column in landscape, a sheet in portrait), in a
 * frame that rides the page's own scroller.
 */
export function CardFrame({ panel, onClose, children }: { panel: PanelContent | null; onClose: () => void; children: ReactNode }) {
  return (
    <div className="mdc-frame">
      <div className="mdc-frame__main">{children}</div>
      <ContextPanel content={panel} onClose={onClose} />
    </div>
  );
}
