import { useState } from "react";
import { useToast } from "../../../contexts/ToastContext";
import type { KnownSize, StudioMachineRosterEntry } from "../../../types/machines";
import { modelsOfMovement } from "../../catalog/models";
import { useMachineModels } from "../../catalog/useMachineModels";
import { AdminButton, AdminNotice } from "../../admin/primitives";
import { sizeOfUnit, sizeSourceWords } from "../sizes";
import { setUnitSize } from "../store";
import { sizeLine } from "../units";
import { SizeForm } from "./SizeForm";
import { UnitModelField } from "./UnitModelField";
import "../../admin/admin.css";
import "../studio-map.css";

/** The unit's MSF movement: its lineage, or its definition's, the way StudioMachineEditor derives it. */
export function movementOfEntry(entry: StudioMachineRosterEntry): string | null {
  const e = entry as { basedOn?: unknown; definition?: { basedOn?: unknown } };
  const id = typeof e.basedOn === "string" && e.basedOn ? e.basedOn : typeof e.definition?.basedOn === "string" ? e.definition.basedOn : "";
  return id.trim() || null;
}

/**
 * ITS SIZE — one machine's size on its door (the studio map, Oct 2026).
 *
 * The door's way into the same editor as the floor's Sizes sheet: the same
 * UnitModelField and SizeForm, the same two writes. For one machine and for
 * corrections; setting up a whole floor is the sheet's job. Trainers read
 * it; the studio's leaders change it. A measured size wins over the
 * model's; with neither, it says what can be done, never a guessed size.
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
  const movementId = movementOfEntry(entry);
  const modelId = typeof entry.modelId === "string" && entry.modelId.trim() ? entry.modelId.trim() : null;
  const read = sizeOfUnit({ unitSize: entry.unit?.size ?? null, modelId, movementId }, models);
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
      {read.state === "known" && read.from === "model" && read.note && <AdminNotice tone="info">{read.note}</AdminNotice>}

      {leader && editing === "measure" && (
        <SizeForm idPrefix={`smap-size-${entry.machineId}`} onSave={(size) => saveSize(size, "Size saved.")} onCancel={() => setEditing(null)} />
      )}

      {leader && editing !== "measure" && (
        <>
          {/* Which model: shown at once while the size isn't known, behind Change model once it is. */}
          {read.state === "unknown" && picker}
          {read.state === "known" && read.from === "model" && editing === "model" && picker}
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
                <AdminButton variant="quiet" onClick={() => setEditing("measure")}>
                  Measure it
                </AdminButton>
                {read.state === "known" && read.from === "model" && editing !== "model" && picker && (
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
