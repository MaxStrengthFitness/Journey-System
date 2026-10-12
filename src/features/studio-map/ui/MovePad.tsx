import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw, RotateCw } from "lucide-react";
import { AdminButton } from "../../admin/primitives";
import type { NudgeDir } from "../placement";
import "../../admin/admin.css";
import "../studio-map.css";

/**
 * THE MACHINE'S MOVES (the studio map, Oct 2026): Turn left, Turn right,
 * Back to the wall (not for a machine with no size, a round marker) and
 * Take it off the map; folded under Fine moves, the four 6 in arrows and a
 * 15° turn. No distance to the wall is shown: the editor is rough on
 * purpose (AJ, Oct 11 2026: "I don't want it to be like a very picky
 * builder").
 */
export function MovePad({
  marker,
  onTurn,
  onToWall,
  onTakeOff,
  onNudge,
}: {
  marker: boolean;
  onTurn: (by: 90 | -90 | 15 | -15) => void;
  onToWall: () => void;
  /** Absent for a machine still to buy, whose panel has its own Remove. */
  onTakeOff?: () => void;
  onNudge: (dir: NudgeDir) => void;
}) {
  const [fine, setFine] = useState(false);
  return (
    <div className="smap-pad" role="group" aria-label="Move it">
      <AdminButton onClick={() => onTurn(-90)}>
        <RotateCcw className="w-4 h-4" aria-hidden="true" />
        Turn left
      </AdminButton>
      <AdminButton onClick={() => onTurn(90)}>
        <RotateCw className="w-4 h-4" aria-hidden="true" />
        Turn right
      </AdminButton>
      {!marker && <AdminButton onClick={onToWall}>Back to the wall</AdminButton>}
      {onTakeOff && (
        <AdminButton variant="ghost" onClick={onTakeOff}>
          Take it off the map
        </AdminButton>
      )}
      <AdminButton variant="ghost" aria-expanded={fine} onClick={() => setFine((f) => !f)}>
        Fine moves
      </AdminButton>
      {fine && (
        <div className="smap-pad" role="group" aria-label="Fine moves">
          <AdminButton iconOnly aria-label="Move up 6 in" onClick={() => onNudge("up")}>
            <ArrowUp className="w-4 h-4" aria-hidden="true" />
          </AdminButton>
          <AdminButton iconOnly aria-label="Move down 6 in" onClick={() => onNudge("down")}>
            <ArrowDown className="w-4 h-4" aria-hidden="true" />
          </AdminButton>
          <AdminButton iconOnly aria-label="Move left 6 in" onClick={() => onNudge("left")}>
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          </AdminButton>
          <AdminButton iconOnly aria-label="Move right 6 in" onClick={() => onNudge("right")}>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </AdminButton>
          <AdminButton onClick={() => onTurn(15)}>Turn 15°</AdminButton>
        </div>
      )}
    </div>
  );
}
