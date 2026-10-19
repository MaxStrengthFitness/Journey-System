import { useMemo } from "react";
import { MapPin } from "lucide-react";
import type { PresetDial } from "../../machine-codex/format";
import type { VaultSection } from "../types";
import { lineNaming } from "./steps";
import "../../wiki/wiki.css";
import "./dial-tiles.css";

/**
 * THE DIAL TILES — a unit's dials, each its name and this unit's number.
 * Lifted from the Interactive Course's field manual (its blueprint's pins)
 * into the shared parts (the Learning vault redesign, Oct 19 2026: AJ picked
 * the mix, the Codex as the base with the Course's dial tiles at the top of
 * a machine page). Draws with dial-tiles.css (vtk__). The blueprint's
 * grid-paper panel stays the Course's; these are the tiles alone.
 *
 * Each setting field, in the unit's order (machine-codex/format.ts presetOf):
 * the dial's letter where the unit records one (never made up: a dial with
 * no recorded letter has none, and a number here would point at nothing),
 * its name, and this unit's number, or "Not set". Nothing here suggests a
 * weight or a setting (the house's rule for the machine card): the numbers
 * are the unit's own.
 *
 * A tile whose dial a set-up line names (`lines`, the set-up's sections;
 * steps.ts lineNaming: the dial's words, whole and in order, any case) is a
 * raised button with the blueprint's one blue mark, and `onJump` takes the
 * reader to that line; every other tile is a quiet well. Without `onJump`
 * every tile is a well: blue is exactly what can be tapped.
 */

export type DialTile = Pick<PresetDial, "key" | "label" | "letter" | "number">;

export interface DialTilesProps {
  /** The unit's dials (presetOf(def).dials). */
  dials: readonly DialTile[];
  /** The set-up's sections a tile can jump into (the lines that set the dials). */
  lines?: VaultSection[];
  /** A tile whose dial a line names: go to that line (by its place in `lines`). */
  onJump?: (dial: DialTile, line: { section: number; block: number }) => void;
  /** What the list is, for a screen reader. */
  label?: string;
  /** Said in a well when the unit records no dials; null says nothing. */
  emptyText?: string | null;
}

export function DialTiles({
  dials,
  lines,
  onJump,
  label = "The dials on this unit",
  emptyText = "No dials recorded for this unit.",
}: DialTilesProps) {
  const tiles = useMemo(
    () => dials.map((d) => ({ dial: d, line: onJump && lines ? lineNaming(lines, d.label) : null })),
    [dials, lines, onJump],
  );
  if (tiles.length === 0) return emptyText ? <p className="vtk__empty">{emptyText}</p> : null;
  return (
    <ol className="vtk" aria-label={label}>
      {tiles.map(({ dial, line }) => {
        const body = (
          <>
            {dial.letter && <span className="vtk__letter">{dial.letter}</span>}
            <span className="vtk__words">
              <span className="vtk__label">{dial.label}</span>
              <span className="vtk__value" data-unset={dial.number ? undefined : ""}>
                {dial.number ?? "Not set"}
              </span>
            </span>
            {line && <MapPin size={18} aria-hidden className="vtk__go" />}
          </>
        );
        return (
          <li key={dial.key}>
            {line && onJump ? (
              <button
                type="button"
                className="vtk__tile"
                aria-label={`${dial.letter ? `${dial.letter}, ` : ""}${dial.label}: ${dial.number ?? "not set"}. Show how it is set`}
                onClick={() => onJump(dial, line)}
              >
                {body}
              </button>
            ) : (
              <div className="vtk__tile">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
