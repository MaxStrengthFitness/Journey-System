import { useState } from "react";
import { useToast } from "../../../contexts/ToastContext";
import type { KnownSize, StudioMachineRosterEntry } from "../../../types/machines";
import { modelsOfMovement } from "../../catalog/models";
import { useMachineModels } from "../../catalog/useMachineModels";
import { AdminButton, AdminNotice } from "../../admin/primitives";
import { isAssumed, sizeOfUnit, sizeSourceWords, unitFactsOfEntry } from "../sizes";
import { AnotherMachinesModel, setUnitModel, setUnitSize } from "../store";
import { sizeLine } from "../units";
import { SizeForm } from "./SizeForm";
import { UnitModelField } from "./UnitModelField";
import "../../admin/admin.css";
import "../studio-map.css";

// The unit's MSF movement now lives with the rest of a unit's facts, in the pure sizes.ts.
export { movementOfEntry } from "../sizes";

/**
 * ITS SIZE — one machine's size on its door (the studio map, Oct 2026).
 *
 * The door's way into the same editor as the floor's Sizes sheet: the same
 * UnitModelField and SizeForm, the same two writes. For one machine and for
 * corrections; setting up a whole floor is the sheet's job. Trainers read
 * it; the studio's leaders change it. A measured size wins over the
 * model's; a catalog copy that names no model shows its movement's Imagine
 * Strength size as not confirmed, with Confirm (one tap names that model);
 * with none of these, it says what can be done, never a guessed size.
 */
export function UnitSizeCard({
  studioId,
  entry,
  machineName,
  canEdit,
  authUid,
  nameOf,
}: {
  studioId: string;
  entry: StudioMachineRosterEntry;
  machineName: string;
  canEdit: boolean;
  authUid: string | null;
  nameOf: (uid: string) => string | null;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const models = useMachineModels(true);
  const [editing, setEditing] = useState<null | "measure" | "model">(null);
  const facts = unitFactsOfEntry(entry);
  const { movementId, modelId } = facts;
  const read = sizeOfUnit(facts, models);
  const assumed = isAssumed(read) ? read : null;
  const movementModels = movementId && models.state === "ready" ? modelsOfMovement(models.models, movementId) : [];
  const named = modelId && models.state === "ready" ? models.byId[modelId] : undefined;
  const fieldId = `smap-model-${entry.machineId}`;
  const leader = canEdit && !!authUid;

  const saveSize = (size: KnownSize | null, done: string) => {
    if (!authUid) return;
    setUnitSize(studioId, entry.machineId, size, authUid).catch((e: unknown) => {
      console.error("[studio map] the unit's size wasn't saved", e);
      toastError(`The size of ${machineName} wasn't saved.`);
    });
    setEditing(null);
    toastSuccess(done);
  };

  // Confirm: name the model the size was assumed from. The roster listener shows it; a refusal is a toast.
  const confirm = () => {
    if (!assumed) return;
    setUnitModel(studioId, { machineId: entry.machineId, movementId }, { id: assumed.modelId, movementId: movementId ?? "" }).catch((e: unknown) => {
      console.error("[studio map] the unit's model wasn't confirmed", e);
      toastError(e instanceof AnotherMachinesModel ? "That model is for another machine, so it wasn't named." : `The model of ${machineName} wasn't saved.`);
    });
    toastSuccess(`${machineName} confirmed as the ${assumed.model}.`);
  };

  const picker =
    movementId && movementModels.length > 0 ? (
      <UnitModelField
        studioId={studioId}
        machineId={entry.machineId}
        machineName={machineName}
        movementId={movementId}
        value={modelId}
        models={movementModels}
        id={fieldId}
      />
    ) : null;

  return (
    <div className="smap-size">
      {read.state === "known" && <p className="smap-size__line">{sizeLine(read.size)}</p>}
      <p className="smap-size__src">{sizeSourceWords(read, nameOf, leader)}</p>
      {read.state === "known" && read.from !== "measured" && read.note && <AdminNotice tone="info">{read.note}</AdminNotice>}

      {leader && editing === "measure" && (
        <SizeForm idPrefix={`smap-size-${entry.machineId}`} onSave={(size) => saveSize(size, "Size saved.")} onCancel={() => setEditing(null)} />
      )}

      {leader && editing !== "measure" && (
        <>
          {/* Which model: shown at once while the size isn't known, behind Change model once it is. */}
          {read.state === "unknown" && picker}
          {read.state === "known" && read.from !== "measured" && editing === "model" && picker}
          <div className="smap-size__actions">
            {read.state === "known" && read.from === "measured" ? (
              <>
                <AdminButton variant="quiet" onClick={() => setEditing("measure")}>
                  Measure again
                </AdminButton>
                {named?.size && (
                  <AdminButton variant="quiet" onClick={() => saveSize(null, `${machineName} uses the model's size.`)}>
                    Use the model's size instead
                  </AdminButton>
                )}
              </>
            ) : (
              <>
                {assumed && <AdminButton variant="primary" onClick={confirm}>Confirm</AdminButton>}
                <AdminButton variant="quiet" onClick={() => setEditing("measure")}>
                  Measure it
                </AdminButton>
                {read.state === "known" && editing !== "model" && picker && (
                  <AdminButton variant="quiet" onClick={() => setEditing("model")}>
                    Change model
                  </AdminButton>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
