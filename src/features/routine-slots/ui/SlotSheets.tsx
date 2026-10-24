/**
 * The stash's sheets (the routine library round, Oct 23 2026;
 * docs/rounds/2026-10-20-routine-library.md §2 and §10.6):
 *
 * - `ChangeSlotSheet`: what goes in a slot. This client's stash (each with
 *   its machine count and "in A" / "in B"), the starting routines and the
 *   templates (the studio's, head office's, and the trainer's own), and a new
 *   routine (a copy of what is in the slot; blank for B). A template is
 *   COPIED into the stash, its name and source kept, and equipped: advice, and
 *   a copy can't be changed under the client by someone else's edit.
 * - `StashSheet`: one stashed routine: put it in A or B, rename, retire, or
 *   bring a retired one back.
 * - `RenameSheet`: a name, checked unique for the client; the typing is
 *   unsaved work until Save or Cancel.
 *
 * Nothing here writes: each choice is handed up and the builder writes it
 * through `../store.ts`, never awaited.
 */
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { Routine, RoutinePreset } from "../../../types";
import { Button } from "@/components/ui/button";
import { GLOBAL_ROUTINE_PRESETS } from "../../../data/routine-presets";
import { drawerTemplates } from "../../../lib/routine-templates";
import { useUnsavedChanges } from "../../unsaved-changes";
import { startFromGroups, startFromLines, type StartFromChoice } from "../../routine-plan/start-from";
import type { FloorMachine } from "../../routine-plan/starting-plan";
import { useStartingRoutines } from "../../routine-plan/useStartingRoutines";
import { PlanSheet } from "../../routine-plan/ui/parts";
import { LETTER_OF, nameProblem, resolvedSlots, stashOf, type SlotKey } from "../slots";

function machinesLine(ids: readonly string[], nameOf: (id: string) => string): string {
  if (ids.length === 0) return "No machines yet";
  const shown = ids.slice(0, 4).map(nameOf).join(", ");
  return ids.length > 4 ? `${shown} and ${ids.length - 4} more` : shown;
}

function countWords(n: number): string {
  return n === 1 ? "1 machine" : `${n} machines`;
}

export interface ChangeSlotSheetProps {
  slot: SlotKey;
  first: string;
  routines: readonly Routine[];
  slots: unknown;
  nameOf: (id: string) => string;
  floor: readonly FloorMachine[];
  studioId: string | null;
  studioName?: string | null;
  todayYmd: string;
  /** The signed-in trainer's own routines, offered first; null while they read or when there are none to read. */
  myRoutines: readonly RoutinePreset[] | null;
  onClose: () => void;
  /** A routine of the client's into the slot (null: slot B left empty). */
  onEquip: (routineId: string | null) => void;
  /** A starting routine or a template, copied into the stash and into the slot. */
  onCopyIn: (choice: StartFromChoice) => void;
  /** A new routine: a copy of what is in the slot, or blank (B only). */
  onNew: (from: "copy" | "blank") => void;
}

export function ChangeSlotSheet({
  slot,
  first,
  routines,
  slots,
  nameOf,
  floor,
  studioId,
  studioName = null,
  todayYmd,
  myRoutines,
  onClose,
  onEquip,
  onCopyIn,
  onNew,
}: ChangeSlotSheetProps) {
  const letter = LETTER_OF[slot];
  const now = resolvedSlots(routines, slots);
  const here = now[slot] ? routines.find((r) => r.id === now[slot]) ?? null : null;
  const other: SlotKey = slot === "a" ? "b" : "a";
  const stash = stashOf(routines, slots);
  const inOther = now[other] ? routines.find((r) => r.id === now[other]) ?? null : null;
  const starting = useStartingRoutines(studioId, { trainerTemplates: true });
  const groups = useMemo(() => {
    const mine = myRoutines ?? [];
    const templates =
      starting.templates === null
        ? starting.status === "loading"
          ? null
          : ("failed" as const)
        : drawerTemplates(starting.templates, studioId, GLOBAL_ROUTINE_PRESETS);
    const shared = startFromGroups({
      floor,
      todayYmd,
      clientRoutines: null,
      starting:
        starting.status === "loading"
          ? null
          : { routines: starting.routines, choice: starting.choice, failed: starting.status === "failed", fromCode: starting.fromCode },
      templates,
      nameOf,
      firstName: first,
      studioName,
    });
    const own = startFromGroups({
      floor,
      todayYmd,
      clientRoutines: null,
      starting: { routines: [], choice: null },
      templates: { company: [], studio: mine },
      nameOf,
    }).filter((g) => g.key === "studio" && g.choices.length > 0);
    return [...own.map((g) => ({ ...g, label: "My routines" })), ...shared];
  }, [starting.status, starting.routines, starting.choice, starting.fromCode, starting.templates, studioId, floor, todayYmd, nameOf, first, studioName, myRoutines]);

  return (
    <PlanSheet
      open
      title={`What goes in slot ${letter}`}
      meta={here ? `Now: ${here.name}. It goes to ${first}'s stash, kept as it is.` : `Slot ${letter} is empty.`}
      onClose={onClose}
    >
      <section className="rpl-sheet__section" aria-label={`${first}'s stash`}>
        <p className="rpl-sheet__label">{first}'s routines</p>
        {stash.length === 0 && !inOther ? (
          <p className="rpl-meta">Nothing else in {first}'s stash yet.</p>
        ) : (
          <div className="rpl-starts">
            {[...(inOther ? [inOther] : []), ...stash].map((r) => (
              <button key={r.id} type="button" className="rpl-start" onClick={() => onEquip(r.id!)}>
                <span className="rpl-start__name">
                  {r.name}
                  {r === inOther ? ` · in ${LETTER_OF[other]}, swaps places` : ""}
                </span>
                <span className="rpl-start__meta">
                  {countWords(r.machineIds.length)} · {machinesLine(r.machineIds, nameOf)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {groups.map((g) => (
        <section key={`${g.key}-${g.label}`} className="rpl-sheet__section" aria-label={g.label}>
          <p className="rpl-sheet__label">{g.label}</p>
          {g.notes?.map((line) => (
            <p key={line} className="rpl-meta">
              {line}
            </p>
          ))}
          {g.status ? (
            <p className="rpl-meta">{g.status}</p>
          ) : (
            <div className="rpl-starts">
              {g.choices.map((c) => {
                const lines = startFromLines(c, nameOf, { firstName: first, studioName });
                return (
                  <button key={c.key} type="button" className="rpl-start" disabled={c.machineIds.length === 0} onClick={() => onCopyIn(c)}>
                    <span className="rpl-start__name">
                      {c.label}
                      {c.notes.length > 0 ? ` · ${c.notes.join(" · ")}` : ""}
                    </span>
                    <span className="rpl-start__meta">{lines.machines}</span>
                    {lines.leftOut.map((line) => (
                      <span key={line} className="rpl-start__meta">
                        {line}
                      </span>
                    ))}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ))}

      <section className="rpl-sheet__section" aria-label="A new routine">
        <p className="rpl-sheet__label">A new routine</p>
        <div className="rpl-actions">
          {here && (
            <Button variant="outline" onClick={() => onNew("copy")}>
              Copy of {here.name}
            </Button>
          )}
          {slot === "b" && (
            <Button variant="outline" onClick={() => onNew("blank")}>
              Blank
            </Button>
          )}
          {slot === "b" && here && (
            <Button variant="outline" onClick={() => onEquip(null)}>
              Leave slot B empty
            </Button>
          )}
        </div>
        {slot === "b" && here && <p className="rpl-meta">With slot B empty, every session runs A.</p>}
      </section>
    </PlanSheet>
  );
}

export interface StashSheetProps {
  routine: Routine;
  first: string;
  nameOf: (id: string) => string;
  onClose: () => void;
  onEquip: (slot: SlotKey) => void;
  onRename: () => void;
  onRetire: (archived: boolean) => void;
  /** Saves it to the trainer's own routines (My Profile → My routines); absent with nobody signed in. */
  onSaveAsMine?: () => void;
}

export function StashSheet({ routine, first, nameOf, onClose, onEquip, onRename, onRetire, onSaveAsMine }: StashSheetProps) {
  const retired = !!routine.archived;
  return (
    <PlanSheet
      open
      title={routine.name}
      meta={retired ? `Retired. Kept in ${first}'s record; bring it back to use it again.` : `In ${first}'s stash.`}
      onClose={onClose}
    >
      <ol className="rpl-list rpl-list--flush" aria-label={`${routine.name}'s machines`}>
        {routine.machineIds.length === 0 ? (
          <li className="rpl-meta">No machines yet.</li>
        ) : (
          routine.machineIds.map((id, i) => (
            <li key={id} className="abb-stash__row">
              {i + 1}. {nameOf(id)}
            </li>
          ))
        )}
      </ol>
      {routine.plan?.purpose ? <p className="rpl-meta">What it's for: {routine.plan.purpose}</p> : null}
      <div className="rpl-actions">
        {retired ? (
          <Button variant="outline" onClick={() => onRetire(false)}>
            Bring it back
          </Button>
        ) : (
          <>
            <Button onClick={() => onEquip("a")}>Put in slot A</Button>
            <Button variant="outline" onClick={() => onEquip("b")}>
              Put in slot B
            </Button>
            <Button variant="outline" onClick={onRename}>
              Rename
            </Button>
            {onSaveAsMine && routine.machineIds.length > 0 && (
              <Button variant="outline" onClick={onSaveAsMine}>
                Save as my routine
              </Button>
            )}
            <Button variant="ghost" onClick={() => onRetire(true)}>
              Retire
            </Button>
          </>
        )}
      </div>
    </PlanSheet>
  );
}

export interface RenameSheetProps {
  routine: Pick<Routine, "id" | "name">;
  routines: readonly Pick<Routine, "id" | "name">[];
  onClose: () => void;
  onSave: (name: string) => void;
}

export function RenameSheet({ routine, routines, onClose, onSave }: RenameSheetProps) {
  const [name, setName] = useState(routine.name);
  const dirty = name.trim() !== routine.name.trim();
  const unsaved = useUnsavedChanges(dirty, `${routine.name}'s name`, { onDiscard: () => setName(routine.name) });
  const problem = dirty ? nameProblem(name, routines, routine.id) : null;
  const close = () => {
    unsaved.release();
    onClose();
  };
  return (
    <PlanSheet
      open
      title="Rename"
      onClose={close}
      footer={
        <div className="rpl-actions">
          <Button
            className="hover:bg-primary"
            disabled={!dirty || !!problem}
            onClick={() => {
              unsaved.release();
              onSave(name.trim());
            }}
          >
            <Check aria-hidden="true" />
            Save name
          </Button>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
        </div>
      }
    >
      <label className="rpl-sheet__section">
        <span className="rpl-sheet__label">Name</span>
        <input className="rpl-field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Routine name" />
      </label>
      {problem && <p className="rpl-meta">{problem}</p>}
    </PlanSheet>
  );
}
