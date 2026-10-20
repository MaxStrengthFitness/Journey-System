import { createPortal } from "react-dom";
import { ArrowRight, Check, Delete } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { PAD_DIGITS, type PadKey } from "./now-pad";

/**
 * THE NOW BAR'S NUMBER PAD (the Now Bar pad round, Oct 20 2026; AJ's
 * "Opens on tap").
 *
 * Tapping the weight or the count opens this ONE row of keys over the app's
 * bottom bar, and only over it: the fields carry `inputMode="none"`, so the
 * iPad's own keyboard never rises, never covers half the grid and never
 * shoves the screen up to make room. The Now Bar and the grid stay exactly
 * where they were.
 *
 * Keys use pointerdown + preventDefault so the field keeps its focus (and its
 * ring): the pad types INTO the field in hand (machine-fit's QuickPad does
 * the same). A hardware keyboard keeps working the whole time. Done, a tap
 * anywhere else, or moving to another machine closes it, and closing sends
 * what was typed, as leaving a field always has.
 *
 * Mounted on document.body so `position: fixed` is the screen's, never a
 * transformed ancestor's. The tokens are on :root, so it keeps the bar's
 * colours in both modes.
 */
export interface NowPadProps {
  /** What is being typed, for the screen reader: "Weight", "Reps", "Right side reps". */
  label: string;
  /** The weight takes a point; a count does not. */
  decimal: boolean;
  onKey: (key: PadKey) => void;
  /** The other field's name ("Reps", "Weight"), or absent with one field. */
  switchLabel?: string;
  onSwitch?: () => void;
  onDone: () => void;
}

/** Keep focus where it is: the pad types into the field in hand. */
const hold = (e: ReactPointerEvent) => e.preventDefault();

export function NowPad({ label, decimal, onKey, switchLabel, onSwitch, onDone }: NowPadProps) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="jg-pad" role="group" aria-label={`Number pad: ${label}`} data-testid="now-pad">
      <div className="jg-pad__keys">
        {PAD_DIGITS.map((d) => (
          <button key={d} type="button" className="jg-pad__key" onPointerDown={hold} onClick={() => onKey(d)}>
            {d}
          </button>
        ))}
        {decimal && (
          <button type="button" className="jg-pad__key" onPointerDown={hold} onClick={() => onKey(".")} aria-label="Point">
            .
          </button>
        )}
        <button type="button" className="jg-pad__key" onPointerDown={hold} onClick={() => onKey("back")} aria-label="Backspace">
          <Delete size={20} strokeWidth={2.4} aria-hidden="true" />
        </button>
        {switchLabel && onSwitch && (
          <button
            type="button"
            className="jg-pad__key jg-pad__key--switch"
            onPointerDown={hold}
            onClick={onSwitch}
            aria-label={`Go to ${switchLabel}`}
          >
            {switchLabel}
            <ArrowRight size={16} strokeWidth={2.6} aria-hidden="true" />
          </button>
        )}
        <button type="button" className="jg-pad__key jg-pad__key--done" onPointerDown={hold} onClick={onDone}>
          <Check size={17} strokeWidth={2.8} aria-hidden="true" />
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}
