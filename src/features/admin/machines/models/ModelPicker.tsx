import { AdminSelect } from "../../primitives";
import { dialSummary, modelLabel, modelsFor, type ModelWithId } from "../../../machine-codex/models";

/** What the picker needs of a model: the codex record, or the Catalog's read of it (the studio map). */
export type PickerModel = Pick<ModelWithId, "id" | "brand" | "model" | "movementId" | "dials">;

/**
 * WHICH MODEL — a select of the models recorded for one MSF movement
 * (Codex R2, Sep 28 2026). On a catalog machine it names the reference unit
 * the standard was written on; on a studio's machine, which model the unit
 * in their room is. A model id the list does not hold (another movement's,
 * or one no longer recorded) is shown as it is rather than silently cleared.
 */
export function ModelPicker({
  models,
  movementId,
  value,
  onChange,
  readOnly,
  id = "machine-model",
  label,
}: {
  models: readonly PickerModel[];
  movementId: string | undefined;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  readOnly?: boolean;
  id?: string;
  /** An accessible name, where no visible label names the select. */
  label?: string;
}) {
  const options = modelsFor(models, movementId);
  const current = value ? models.find((m) => m.id === value) : undefined;

  if (readOnly) {
    return current ? (
      <p className="adm-me__prose">
        {modelLabel(current)} · {dialSummary(current)}
      </p>
    ) : value ? (
      <p className="adm-me__prose">A model no longer recorded ({value})</p>
    ) : (
      <p className="adm-me__empty">Not recorded</p>
    );
  }

  return (
    <AdminSelect id={id} aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">Not recorded</option>
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {modelLabel(m)}
        </option>
      ))}
      {value && !options.some((m) => m.id === value) && (
        <option value={value}>{current ? modelLabel(current) : `A model no longer recorded (${value})`}</option>
      )}
    </AdminSelect>
  );
}
