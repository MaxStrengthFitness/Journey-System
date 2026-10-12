import { useToast } from "../../../contexts/ToastContext";
import type { MachineModel } from "../../catalog/models";
import { AdminField } from "../../admin/primitives";
import { ModelPicker } from "../../admin/machines/models/ModelPicker";
import { AnotherMachinesModel, setUnitModel } from "../store";
import "../../admin/admin.css";
import "../studio-map.css";

/**
 * WHICH MODEL A UNIT IS — the one control that sets a unit's model (the
 * studio map, Oct 2026). Mounted on the machine's door (Its size) and on
 * the floor's Sizes sheet: one editor, two ways in. The studio machine
 * editor shows the model read only and never writes it.
 *
 * The existing ModelPicker over the models recorded for the unit's movement,
 * writing `setUnitModel` alone, never awaited: the roster listener shows the
 * pick at once, and a refusal comes back as a toast. A model of another
 * movement is refused before anything is written.
 */
export function UnitModelField({
  studioId,
  machineId,
  machineName,
  movementId,
  value,
  models,
  id,
  label = "Which model",
}: {
  studioId: string;
  machineId: string;
  /** The studio's name for the unit, for the sentence when a pick isn't saved. */
  machineName: string;
  /** The unit's MSF movement. Without one, no model can be named, and the caller shows Measure alone. */
  movementId: string;
  value: string | null;
  /** The movement's recorded models, any brand. */
  models: readonly MachineModel[];
  id: string;
  label?: string;
}) {
  const { error: toastError } = useToast();
  const options = models.map((m) => ({ id: m.id, brand: m.brand, model: m.model, movementId: m.movementId }));

  const pick = (next: string | undefined) => {
    const model = next ? options.find((m) => m.id === next) : null;
    if (next && !model) return;
    setUnitModel(studioId, { machineId, movementId }, model ? { id: model.id, movementId: model.movementId } : null).catch((e: unknown) => {
      console.error("[studio map] the unit's model wasn't saved", e);
      toastError(
        e instanceof AnotherMachinesModel
          ? "That model is for another machine, so it wasn't named."
          : `The model of ${machineName} wasn't saved.`,
      );
    });
  };

  return (
    <div className="smap-model">
      <AdminField label={label} htmlFor={id}>
        <ModelPicker id={id} models={options} movementId={movementId} value={value ?? undefined} onChange={pick} />
      </AdminField>
    </div>
  );
}
