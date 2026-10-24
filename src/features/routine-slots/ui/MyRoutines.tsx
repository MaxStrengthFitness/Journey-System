/**
 * MY PROFILE → MY ROUTINES (the routine library round, Oct 23 2026; §10.3).
 *
 * AJ: "just allow trainers to make their own routines and save them on their
 * profile so they can load it into a client if they need". The trainer's own
 * starting points, theirs alone: made here (a name and machines from the
 * studio's floor), from a client's routine (Save as my routine, on a stashed
 * routine), or from the Edit routine drawer; loaded into a client from a
 * slot's Change ("My routines") or the session's Start from a routine….
 *
 * One read of the trainer's own (`useMyRoutines`); the floor is read only
 * while the editor is open. A read that failed says so, never "none". What is
 * typed and not saved is unsaved work.
 */
import { useMemo, useState } from "react";
import { Check, ChevronRight, Plus } from "lucide-react";
import type { RoutinePreset } from "../../../types";
import { Button } from "@/components/ui/button";
import { useStudioMachines } from "../../../hooks/useStudioMachines";
import { useUnsavedChanges } from "../../unsaved-changes";
import { PlanSheet } from "../../routine-plan/ui/parts";
import { myRoutineNameProblem } from "../my-routines";
import { removeMyRoutine, saveMyRoutine, updateMyRoutine, useMyRoutines } from "../useMyRoutines";
import "../../routine-plan/ui/routine-plan.css";

export interface MyRoutinesProps {
  uid: string | null;
  trainerName?: string | null;
  /** The studio the iPad is at: where a new one is made, and whose floor its machines come from. */
  studioId: string | null;
  studioName: string;
}

export function MyRoutines({ uid, trainerName, studioId, studioName }: MyRoutinesProps) {
  const read = useMyRoutines(uid);
  const [editing, setEditing] = useState<RoutinePreset | "new" | null>(null);
  /** A refused save, said on the card (My Profile has no toast of its own). */
  const [refused, setRefused] = useState<string | null>(null);
  const onError = (message: string) => setRefused(message);
  if (!uid) return null;
  const list = read.routines ?? [];
  return (
    <section className="tp-card" aria-labelledby="my-routines-title" data-testid="my-routines">
      <div className="tp-card__head">
        <h2 className="tp-card__title" id="my-routines-title">
          My routines
        </h2>
        {studioId && (
          <Button variant="outline" onClick={() => setEditing("new")}>
            <Plus aria-hidden="true" />
            New routine
          </Button>
        )}
      </div>
      <div className="tp-card__body">
        {refused && (
          <p className="tp-mc__state" role="alert">
            {refused}
          </p>
        )}
        {read.status === "loading" && list.length === 0 ? (
          <p className="tp-mc__state" role="status">
            Reading your routines…
          </p>
        ) : read.status === "failed" ? (
          <p className="tp-mc__state" role="status">
            Couldn't read your routines just now. Try again in a moment.
          </p>
        ) : list.length === 0 ? (
          <p className="tp-mc__state">
            Your own starting points, to load into a client from a slot's Change. Make one here, or save one of a client's routines as yours.
          </p>
        ) : (
          list.map((p) => (
            <button key={p.id} type="button" className="tp-row" onClick={() => setEditing(p)} data-testid="my-routine-row">
              <span className="tp-row__main">
                <span className="tp-row__name">{p.name}</span>
                <span className="tp-row__sub">{p.machineIds.length === 1 ? "1 machine" : `${p.machineIds.length} machines`}</span>
              </span>
              <ChevronRight size={16} aria-hidden style={{ opacity: 0.5, flex: "0 0 auto" }} />
            </button>
          ))
        )}
      </div>
      {editing && (
        <MyRoutineSheet
          routine={editing === "new" ? null : editing}
          mine={list}
          studioId={studioId}
          studioName={studioName}
          onClose={() => setEditing(null)}
          onSave={(name, machineIds) => {
            setRefused(null);
            if (editing === "new") {
              if (!studioId) return;
              saveMyRoutine({ name, machineIds }, { uid, name: trainerName }, studioId)
                .commit.then(read.reload)
                .catch(() => onError("Couldn't save your routine. Try again."));
            } else if (editing.id) {
              const fields: Partial<Pick<RoutinePreset, "name" | "machineIds">> = {};
              if (name !== editing.name) fields.name = name;
              if (machineIds.join("|") !== editing.machineIds.join("|")) fields.machineIds = machineIds;
              if (Object.keys(fields).length > 0)
                updateMyRoutine(editing.id, fields, uid).then(read.reload).catch(() => onError("Couldn't save your routine. Try again."));
            }
            setEditing(null);
          }}
          onRemove={
            editing !== "new" && editing.id
              ? () => {
                  removeMyRoutine(editing.id!).then(read.reload).catch(() => onError("Couldn't remove your routine. Try again."));
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </section>
  );
}

function MyRoutineSheet({
  routine,
  mine,
  studioId,
  studioName,
  onClose,
  onSave,
  onRemove,
}: {
  routine: RoutinePreset | null;
  mine: readonly RoutinePreset[];
  studioId: string | null;
  studioName: string;
  onClose: () => void;
  onSave: (name: string, machineIds: string[]) => void;
  onRemove?: () => void;
}) {
  const [name, setName] = useState(routine?.name ?? "");
  const [ids, setIds] = useState<string[]>(routine ? [...routine.machineIds] : []);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { machines } = useStudioMachines(studioId, { bridgeWhenRosterEmpty: true });
  const nameOf = useMemo(() => {
    const names = new Map(machines.map((m) => [m.machineId, m.name]));
    return (id: string) => names.get(id) || id;
  }, [machines]);
  const dirty = name.trim() !== (routine?.name ?? "").trim() || ids.join("|") !== (routine?.machineIds ?? []).join("|");
  const unsaved = useUnsavedChanges(dirty, routine ? `${routine.name}` : "your new routine", { onDiscard: onClose });
  const problem = name.trim() || routine ? myRoutineNameProblem(name, mine, routine?.id) : null;
  const close = () => {
    unsaved.release();
    onClose();
  };
  const toggle = (id: string) => setIds((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));
  return (
    <PlanSheet
      open
      title={routine ? routine.name : "New routine"}
      meta={`Machines from ${studioName}'s floor, in the order you tap them.`}
      onClose={close}
      footer={
        <div className="rpl-actions">
          <Button
            className="hover:bg-primary"
            disabled={!dirty || !!problem || ids.length === 0}
            onClick={() => {
              unsaved.release();
              onSave(name.trim(), ids);
            }}
          >
            <Check aria-hidden="true" />
            Save routine
          </Button>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          {onRemove &&
            (confirmRemove ? (
              <Button variant="destructive" onClick={onRemove}>
                Remove from My routines
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmRemove(true)}>
                Remove…
              </Button>
            ))}
        </div>
      }
    >
      <label className="rpl-sheet__section">
        <span className="rpl-sheet__label">Name</span>
        <input className="rpl-field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Routine name" />
      </label>
      {problem && <p className="rpl-meta">{problem}</p>}
      {ids.length > 0 && (
        <ol className="rpl-list rpl-list--flush" aria-label="Its machines">
          {ids.map((id, i) => (
            <li key={id} className="abb-stash__row">
              {i + 1}. {nameOf(id)}
            </li>
          ))}
        </ol>
      )}
      <div className="rpl-tiles" aria-label={`${studioName}'s floor`}>
        {machines.map((m) => (
          <button key={m.machineId} type="button" className="rpl-tile" aria-pressed={ids.includes(m.machineId)} onClick={() => toggle(m.machineId)}>
            <span className="rpl-tile__name">{m.name}</span>
          </button>
        ))}
      </div>
    </PlanSheet>
  );
}
