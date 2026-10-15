import { useMemo, useState } from "react";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { useToast } from "../../../contexts/ToastContext";
import type {
  MachineCatalogEntry,
  MachineDefinition,
  StudioMachineRosterEntry,
} from "../../../types/machines";
import { studioMachineId } from "../../../types/machines";
import type { EditScope } from "../../../lib/machine-template";
import { definitionFieldsOnly, describeFields, scopeOverrides } from "../../../lib/machine-template";
import { pruneOverrides } from "../equipment/clone";
import { MachineEditor } from "./editor/MachineEditor";
import { definitionOf, emptyMachineDefinition, stripUndefined } from "./definition-defaults";
import { useMachineModels } from "../../machine-codex/models-store";
import { useSignedInPerson } from "../../machine-codex/who";
import "../admin.css";

/**
 * EDITING A STUDIO'S OWN MACHINE.
 *
 * Round: Machine authoring, Sep 2026. AJ: "when you're looking at your own
 * floor for your studio, it doesn't seem as if we can edit the machine."
 *
 * He was right, twice over, and neither was a missing button — the doors were
 * never cut:
 *
 *  - A CUSTOM machine, once saved, could not be edited at all. saveCustom()
 *    refused an existing name and nothing anywhere reopened the form on an
 *    existing entry, so the only way to change a studio's own machine was to
 *    delete it and retype sixty fields.
 *  - A CATALOG machine's local copy could override exactly one field, its
 *    name. LocalSetupDialog was the app's only writer of `overrides`, and it
 *    wrote four things. Meanwhile the type allowed any field, the resolver
 *    merged any field, and MachineDefinitionForm had an `inherited` prop
 *    built for precisely this that no caller ever passed.
 *
 * All three cases land here, and the difference between them is only where
 * the write goes.
 */

export interface StudioMachineEditorProps {
  studioId: string;
  studioName?: string;
  /** The roster entry being edited. Absent when adding a new custom machine. */
  entry?: StudioMachineRosterEntry;
  /** The resolved definition for an existing entry. */
  resolved?: MachineDefinition;
  /** The catalog entry an entry is based on, for a catalog-sourced machine. */
  catalogEntry?: MachineCatalogEntry;
  /** Every catalog machine, for the "most like" picker on a new custom one. */
  catalog: MachineCatalogEntry[];
  /** Ids already on this floor, so a new custom name cannot collide. */
  rosteredIds: Set<string>;
  /** "studio" for a studio leader, "admin" for corporate inside a location. */
  scope: EditScope;
  onBack: () => void;
  backLabel: string;
  /** The unit card — serial, manufacturer, notes. */
  unit?: React.ReactNode;
}

export function StudioMachineEditor({
  studioId,
  studioName,
  entry,
  resolved,
  catalogEntry,
  catalog,
  rosteredIds,
  scope,
  onBack,
  backLabel,
  unit,
}: StudioMachineEditorProps) {
  const { success: toastSuccess } = useToast();
  const isNew = !entry;
  const isCustom = !entry || entry.source === "custom";

  const value = useMemo(
    () => resolved ?? (entry ? definitionOf(entry) : emptyMachineDefinition()),
    [resolved, entry],
  );

  // Lineage for a brand-new custom machine (`basedOn`, read as `basedOn ??
  // machineId`). Nothing is copied through it; it is read: the catalog
  // machine's clinical watch-outs, its movement and family in the Catalog
  // (and its words where the unit's page is blank), and the key shared tips
  // are filed under. Machine trends and machine fit group by machineId alone,
  // so it compares nothing across studios (Oct 15 2026 code check).
  const [basedOn, setBasedOn] = useState<string>(
    entry && "basedOn" in entry ? (entry.basedOn ?? "") : "",
  );

  // Minted once, from the name it was created with, and never again. machineId
  // is a foreign key in exerciseLogs, clientMachineSettings and routines, all
  // queried ACROSS studios — re-minting it on a rename would orphan every set
  // ever logged on the machine and split its history in two.
  const [existingId] = useState(() => entry?.machineId ?? null);

  // The model records, for "Which model this unit is" (Codex R2).
  const { models } = useMachineModels();
  const movementId = catalogEntry?.id ?? (basedOn || undefined);
  // Who is editing, for a removed safety line's record (the Sep 21 rule).
  const actor = useSignedInPerson();

  const save = async (
    patch: Partial<MachineDefinition>,
    draftIn: MachineDefinition,
  ) => {
    const name = (draftIn.name ?? "").trim();
    if (!name) throw new Error("Give the machine a name first.");

    // THE UNIT'S MODEL lives on the roster entry itself (`modelId`), never in
    // the definition or its overrides: the definition's own `modelId` is the
    // catalog's reference unit. Since the studio map (Oct 2026) it is set in
    // ONE place, the floor's Sizes and the machine's Its size
    // (studio-map/ui/UnitModelField), and this save never writes it: a whole
    // draft saved here would undo a model set there.
    const { modelId: _unitModel, ...draft } = draftIn;

    if (isCustom) {
      const machineId = existingId ?? studioMachineId(studioId, name);
      if (!existingId && rosteredIds.has(machineId)) {
        throw new Error(`${studioName ?? "This studio"} already has a machine with that name.`);
      }
      const ref = doc(db, "studios", studioId, "roster", machineId);
      const body = {
        machineId,
        studioId,
        source: "custom" as const,
        ...(basedOn ? { basedOn } : {}),
        status: entry?.status ?? ("active" as const),
        // A custom machine inherits nothing, so its definition is stored
        // whole rather than as a diff — its own fields only (the draft is a
        // resolved machine and carries the floor's bookkeeping too), and
        // with nothing `undefined` in it, which Firestore refuses.
        definition: stripUndefined(definitionFieldsOnly(draft)),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid ?? null,
      };
      if (existingId) await updateDoc(ref, body);
      else await setDoc(ref, body);

      toastSuccess(
        existingId
          ? `${name} saved for ${studioName ?? "this studio"}.`
          : `${name} added to ${studioName ?? "this studio"}.`,
      );
      if (!existingId) onBack();
      return;
    }

    // A catalog machine's local copy. The stored value is the DIFFERENCE from
    // the standard, computed from the whole draft rather than from this
    // sitting's patch, so overrides made earlier survive. Given the standard,
    // the gate refuses one of its safety lines gone without a reason (the
    // Sep 21 rule) and keeps each safety list as the studio's additions.
    if (!catalogEntry) throw new Error("This machine's catalog entry is missing.");
    const standard = definitionOf(catalogEntry);
    const scoped = scopeOverrides(scope, draft as Partial<MachineDefinition>, standard);
    const overrides = stripUndefined(pruneOverrides(catalogEntry, scoped));

    const ref = doc(db, "studios", studioId, "roster", catalogEntry.id);
    const body = {
      machineId: catalogEntry.id,
      studioId,
      source: "catalog" as const,
      basedOn: catalogEntry.id,
      status: entry?.status ?? ("active" as const),
      // REPLACED, never merged. Firestore's merge is deep for maps, so a
      // setDoc({overrides}, {merge:true}) would keep a key the studio has
      // just reverted — "use the standard" would appear to work and then not.
      overrides,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid ?? null,
    };
    if (entry) await updateDoc(ref, body);
    else await setDoc(ref, body);

    const changedFields = (Object.keys(overrides) as (keyof MachineDefinition)[]).filter(
      (f) => f !== "removedSafety",
    );
    const removed = overrides.removedSafety?.length ?? 0;
    const parts: string[] = [];
    if (changedFields.length) parts.push(`differs from the standard on ${describeFields(changedFields)}`);
    if (removed) {
      parts.push(`does without ${removed} of its safety ${removed === 1 ? "line" : "lines"}, each with its reason`);
    }
    toastSuccess(
      parts.length === 0
        ? `${name} now follows the Max Strength standard exactly.`
        : `${name} saved. ${studioName ?? "This studio"} ${parts.join(", and ")}; everything else still follows it.`,
    );
  };

  return (
    <MachineEditor
      value={value}
      standard={catalogEntry ? definitionOf(catalogEntry) : undefined}
      scope={scope}
      whose={
        isCustom
          ? `${studioName ?? "This studio"}'s own machine`
          : `${studioName ?? "This studio"}'s copy of the Max Strength standard`
      }
      backLabel={backLabel}
      onBack={onBack}
      onSave={save}
      isNew={isNew}
      movementId={movementId}
      models={models}
      actor={actor}
      unit={
        <>
          {isNew && (
            <div className="adm-field adm-field--wide">
              <label className="adm-label" htmlFor="based-on">
                Which Max Strength machine is this most like?
              </label>
              <select
                id="based-on"
                className="adm-select"
                value={basedOn}
                onChange={(e) => setBasedOn(e.target.value)}
              >
                <option value="">None — genuinely novel equipment</option>
                {catalog
                  .filter((c) => c.status === "active")
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <p className="adm-hint">
                Yours keeps its own name and settings. Choosing one here gives
                it Max Strength&rsquo;s safety watch-outs for that machine when
                a client has a health flag, lists it under that movement and
                family in the Catalog (any part of its page left blank shows
                that machine&rsquo;s), and files tips shared about it with that
                machine&rsquo;s, so both show them. Choose None for equipment
                unlike any Max Strength machine.
              </p>
            </div>
          )}
          {unit}
        </>
      }
    />
  );
}
