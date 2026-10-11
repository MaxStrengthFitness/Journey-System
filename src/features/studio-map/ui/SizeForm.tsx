import { useState } from "react";
import type { KnownSize } from "../../../types/machines";
import { AdminButton, AdminInput } from "../../admin/primitives";
import { useUnsavedChanges } from "../../unsaved-changes";
import { parseFtIn } from "../units";
import "../../admin/admin.css";
import "../studio-map.css";

/** A unit's length on a tape: 1 to 20 ft. The rules take 250 to 6,100 mm, a little either side. */
const MIN_MM = 305;
const MAX_MM = 6096;

type Part = "length" | "width" | "height";
type Fields = Record<Part, { ft: string; in: string }>;

const EMPTY: Fields = { length: { ft: "", in: "" }, width: { ft: "", in: "" }, height: { ft: "", in: "" } };
const PART_WORDS: Record<Part, string> = { length: "Length", width: "Width", height: "Height" };

/**
 * MEASURE IT — a unit's size from a tape (the studio map, Oct 2026). The
 * same form on the machine's door and on a row of the Sizes sheet: Length
 * and Width, Height folded, each in feet and inches, the inches taking
 * "83", "83.5" or "83 1/2" and the feet left empty when a tape is read in
 * inches alone. Save hands the size up and closes; the caller issues the
 * write and never waits for it. Typing is unsaved work: the door's X,
 * Escape and another machine all ask first.
 */
export function SizeForm({
  idPrefix,
  onSave,
  onCancel,
}: {
  idPrefix: string;
  onSave: (size: KnownSize) => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [withHeight, setWithHeight] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const dirty = (Object.keys(fields) as Part[]).some((p) => fields[p].ft.trim() !== "" || fields[p].in.trim() !== "");
  const reset = () => {
    setFields(EMPTY);
    setWithHeight(false);
    setProblem(null);
  };
  useUnsavedChanges(dirty, "the machine's size", { onDiscard: reset });

  const set = (part: Part, unit: "ft" | "in", v: string) => {
    setFields((f) => ({ ...f, [part]: { ...f[part], [unit]: v } }));
    setProblem(null);
  };

  // One sentence per part, written here rather than a prefix on parseFtIn's
  // own words, so a width is never called a length.
  const read = (part: Part): { mm: number } | { problem: string } => {
    const { ft, in: inches } = fields[part];
    const word = PART_WORDS[part].toLowerCase();
    if (ft.trim() === "" && inches.trim() === "") {
      return { problem: part === "height" ? "Type the height, or leave both boxes empty." : `Type the ${word}.` };
    }
    const r = parseFtIn(ft, inches);
    if ("problem" in r) return { problem: `${PART_WORDS[part]}: feet are whole numbers; inches can be 83, 83.5 or 83 1/2.` };
    if (r.mm < MIN_MM || r.mm > MAX_MM) return { problem: `The ${word} is between 1 ft and 20 ft.` };
    return r;
  };

  const save = () => {
    const length = read("length");
    const width = read("width");
    const heightTyped = withHeight && (fields.height.ft.trim() !== "" || fields.height.in.trim() !== "");
    const height = heightTyped ? read("height") : null;
    const first = [length, width, height].find((r): r is { problem: string } => !!r && "problem" in r);
    if (first) {
      setProblem(first.problem);
      return;
    }
    onSave({
      lengthMm: (length as { mm: number }).mm,
      widthMm: (width as { mm: number }).mm,
      heightMm: height ? (height as { mm: number }).mm : null,
    });
    reset();
  };

  const row = (part: Part) => {
    const id = `${idPrefix}-${part}`;
    return (
      <div className="smap-form__row" role="group" aria-labelledby={`${id}-label`}>
        <span id={`${id}-label`} className="smap-form__label">
          {PART_WORDS[part]}
        </span>
        <AdminInput
          id={`${id}-ft`}
          className="smap-form__num"
          inputMode="numeric"
          aria-label={`${PART_WORDS[part]}, feet`}
          value={fields[part].ft}
          onChange={(e) => set(part, "ft", e.target.value)}
        />
        <span className="smap-form__unit">ft</span>
        <AdminInput
          id={`${id}-in`}
          className="smap-form__num"
          aria-label={`${PART_WORDS[part]}, inches`}
          value={fields[part].in}
          onChange={(e) => set(part, "in", e.target.value)}
        />
        <span className="smap-form__unit">in</span>
      </div>
    );
  };

  return (
    <div className="smap-form">
      <p className="smap-form__hint">Length runs front to back as you face the seat or pad. Measure the frame at rest.</p>
      {row("length")}
      {row("width")}
      {withHeight ? (
        row("height")
      ) : (
        <div>
          <AdminButton variant="ghost" onClick={() => setWithHeight(true)}>
            Add its height
          </AdminButton>
        </div>
      )}
      {problem && (
        <p className="smap-form__problem" role="alert">
          {problem}
        </p>
      )}
      <div className="smap-form__actions">
        <AdminButton variant="primary" onClick={save}>
          Save
        </AdminButton>
        <AdminButton
          variant="quiet"
          onClick={() => {
            reset();
            onCancel();
          }}
        >
          Cancel
        </AdminButton>
      </div>
    </div>
  );
}
