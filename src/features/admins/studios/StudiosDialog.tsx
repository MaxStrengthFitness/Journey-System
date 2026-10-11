/**
 * WHERE A PERSON WORKS — "Also works at" and "Take off this studio's team",
 * from a studio's Team on the Admins dashboard (Oct 1 2026; the round is
 * docs/rounds/2026-10-01-second-studio.md, the rules of it studio-membership.ts).
 *
 * Beside Change role on the person's row, for the same reasons: the Admins
 * dashboard is administrators', the rules let an administrator write any
 * trainer's studio lists (trainerUpdateAllowed: roleIsSuper), and the
 * Activity record — which every change here goes into — takes administrators'
 * entries only. The picker offers every real studio for the same reason.
 *
 * Edits are held until Save, which writes only the lists that changed
 * (arrayUnion / arrayRemove, or the whole list when one list both gains and
 * loses), then one Activity line per studio, after the write has landed. The
 * studio lists are read by the rules from the document on every request, so
 * no claim needs refreshing (syncTrainerClaims mirrors the role only); the
 * person's own iPad picks the change up the next time they sign in or Journey
 * reloads.
 *
 * OWNS (the franchise partition, Oct 2026; ROADMAP Gate B). Below "Also works
 * at", the one control that makes a studio a franchise owner's: "Owns
 * {studio}", held until Save with the rest and written in the same update
 * (`ownedStudioIds`, arrayUnion or arrayRemove). Switching it on for someone
 * who doesn't work there yet puts the studio on "Also works at" too, in that
 * same update, because the cross-train rules count where a person works, not
 * what they own. It is never offered at the person's home studio (they run it
 * already) or for a role that doesn't run studios; studio-membership.ts says
 * why in each case.
 */
import { useEffect, useMemo, useState } from "react";
import { arrayRemove, arrayUnion, doc, updateDoc } from "firebase/firestore";
import { MapPin, Plus, X } from "lucide-react";
import { db } from "../../../firebase";
import type { Studio, Trainer } from "../../../types";
import { useUnsavedChanges } from "../../unsaved-changes";
import { AdminButton, AdminField, AdminNotice, AdminSelect } from "../../admin/primitives";
import { logActivity } from "../activity/log-activity";
import {
  addableStudios,
  homeStudioLine,
  mayOwnStudios,
  membershipConsequences,
  membershipPlan,
  membershipRecords,
  memberships,
  ownershipChange,
  ownershipConsequences,
  ownershipLine,
  ownershipRecord,
  ownsStudio,
  whyNotRemovable,
  type FieldChange,
} from "./studio-membership";

export interface StudiosDialogProps {
  /** Who, or null while the dialog is shut. */
  person: Trainer | null;
  /** The studio page it was opened from: its "Take off this studio's team". */
  studio: Studio;
  studios: readonly Studio[];
  /** The signed-in administrator's name, for the record. */
  byName: string;
  onClose: () => void;
  /** After the save: the dashboard reads the people again. */
  onSaved?: () => void | Promise<void>;
}

/** Shut while there is nobody; opened fresh for each person. */
export function StudiosDialog(props: StudiosDialogProps) {
  if (!props.person) return null;
  return <StudiosDialogOpen key={props.person.id} {...props} person={props.person} />;
}

/** One list's change as the update writes it: only what moves, never the other lists. */
function fieldValue(c: FieldChange): unknown {
  if (c.remove.length === 0) return arrayUnion(...c.add);
  if (c.add.length === 0) return arrayRemove(...c.remove);
  return c.next;
}

function StudiosDialogOpen({ person, studio, studios, byName, onClose, onSaved }: StudiosDialogProps & { person: Trainer }) {
  const start = useMemo(() => memberships(person), [person]);
  const [list, setList] = useState<string[]>(() => start.map((m) => m.studioId));
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = person.fullName || "This person";
  const studioId = studio.id ?? "";
  const home = person.primaryHomeStudioId ?? "";
  // Owns this studio (the franchise partition, Oct 2026), held until Save.
  const ownsBefore = ownsStudio(person, studioId);
  const [ownsNext, setOwnsNext] = useState(ownsBefore);
  const ownChange = useMemo(() => ownershipChange(person, studioId, ownsNext), [person, studioId, ownsNext]);
  // Owning a studio they don't work at yet puts it on "Also works at" too,
  // in the same save; the list above shows it.
  const effectiveList = useMemo(
    () => (ownChange?.alsoWorksAt && !list.includes(studioId) ? [...list, studioId] : list),
    [ownChange, list, studioId],
  );
  const plan = useMemo(() => membershipPlan(person, effectiveList), [person, effectiveList]);
  const dirty = plan.changes.length > 0 || ownChange !== null;
  useUnsavedChanges(dirty, `${name}'s studios`, {
    onDiscard: () => {
      setList(start.map((m) => m.studioId));
      setOwnsNext(ownsBefore);
    },
  });
  const ownsOffered = (mayOwnStudios(person.role) && studioId !== "" && studioId !== home) || ownsBefore;
  const otherOwned = (person.ownedStudioIds ?? []).filter((id) => id && id !== studioId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const nameOf = (id: string) => studios.find((s) => s.id === id)?.name || id;
  const kindOf = (id: string) => start.find((m) => m.studioId === id)?.kind ?? "also";
  const choices = addableStudios(person, studios, list);
  const isHomeHere = whyNotRemovable(person, studioId) === "home";
  const onThisTeam = effectiveList.includes(studioId);
  const wasOnThisTeam = start.some((m) => m.studioId === studioId);

  const remove = (id: string) => {
    setList((l) => l.filter((x) => x !== id));
    // Taking off the studio that Owns just added takes the Owns back too:
    // otherwise the row would come straight back.
    if (id === studioId && ownsNext && !ownsBefore) setOwnsNext(false);
  };
  const add = () => {
    if (!adding) return;
    setList((l) => (l.includes(adding) ? l : [...l, adding]));
    setAdding("");
  };

  const save = async () => {
    if (!dirty || !person.id) return;
    setBusy(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {};
      for (const c of plan.changes) patch[c.field] = fieldValue(c);
      if (ownChange) patch.ownedStudioIds = fieldValue(ownChange.owned);
      // Owning brings them onto "Also works at" (a guest there becomes one
      // who also works there): folded into the one accessibleStudioIds
      // change, so the update still writes each list once.
      const also = ownChange?.alsoWorksAt ?? null;
      const planned = plan.changes.find((c) => c.field === "accessibleStudioIds");
      if (also && !planned?.add.includes(studioId)) {
        patch.accessibleStudioIds = planned
          ? fieldValue({ ...planned, add: [...planned.add, studioId], next: [...planned.next, studioId] })
          : fieldValue(also);
      }
      await updateDoc(doc(db, "trainers", person.id), patch);
      // Awaited (it never throws) so a record read straight after shows the lines.
      for (const record of membershipRecords({ person, plan, studios, byName })) await logActivity(record);
      if (ownChange) await logActivity(ownershipRecord({ person, studioId, owns: ownsNext, studios, byName }));
      await onSaved?.();
      onClose();
    } catch (err) {
      setError(`Couldn't save ${name}'s studios: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  };

  return (
    <div
      className="adm-scrim adm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="adm-dialog" role="alertdialog" aria-modal="true" aria-label={`Where ${name} works and what they own`}>
        <div className="adm-dialog__body">
          <h3 className="adm-dialog__title">Where {name} works and what they own</h3>
          <p className="adm-dialog__text">
            <MapPin className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" />
            Home studio: {person.primaryHomeStudioId ? nameOf(person.primaryHomeStudioId) : "not set"}.
          </p>

          <div className="hq-studios" role="list" aria-label="Also works at">
            <p className="hq-studios__label">Also works at</p>
            {effectiveList.length === 0 ? <p className="adm-dialog__text">Home studio only.</p> : null}
            {effectiveList.map((id) => (
              <div key={id} className="hq-studios__row" role="listitem">
                <span className="hq-studios__name">
                  {nameOf(id)}
                  <span className="hq-row__ctx">{start.some((m) => m.studioId === id) ? (kindOf(id) === "guest" ? "a guest" : "also works there") : "to add"}</span>
                </span>
                <AdminButton size="sm" variant="ghost" onClick={() => remove(id)} disabled={busy} aria-label={`Take ${name} off ${nameOf(id)}'s team`}>
                  Remove
                </AdminButton>
              </div>
            ))}
          </div>

          {choices.length > 0 ? (
            <div className="hq-studios__add">
              <AdminField label="Add a studio" htmlFor="hq-studio-add">
                <AdminSelect id="hq-studio-add" value={adding} onChange={(e) => setAdding(e.target.value)} disabled={busy}>
                  <option value="">Choose a studio</option>
                  {choices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name || s.id}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminButton size="sm" onClick={add} disabled={!adding || busy}>
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Add
              </AdminButton>
            </div>
          ) : null}

          <div className="hq-studios" role="group" aria-label="Owns">
            <p className="hq-studios__label">Owns</p>
            {otherOwned.length > 0 ? (
              <p className="adm-dialog__text">Also owns {otherOwned.map((id) => nameOf(id)).join(", ")}.</p>
            ) : null}
            {ownsOffered ? (
              <label className="hq-sheet__check">
                <input
                  type="checkbox"
                  checked={ownsNext}
                  disabled={busy}
                  onChange={(e) => setOwnsNext(e.target.checked)}
                />
                <span>Owns {studio.name}</span>
              </label>
            ) : (
              <p className="adm-dialog__text">{ownershipLine(person, studio)}</p>
            )}
          </div>

          {isHomeHere ? (
            <AdminNotice tone="info">{homeStudioLine(person, studios)}</AdminNotice>
          ) : wasOnThisTeam && onThisTeam ? (
            <AdminButton variant="quiet" onClick={() => remove(studioId)} disabled={busy}>
              Take off {studio.name}&apos;s team
            </AdminButton>
          ) : null}

          {dirty ? (
            <ul className="adm-dialog__text hq-consequences">
              {[
                ...membershipConsequences({ person, plan, studios }),
                ...(ownChange
                  ? ownershipConsequences({ person, studioId, change: ownChange, studios, alsoWorksAtAfter: effectiveList })
                  : []),
              ].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {error ? <AdminNotice tone="alert">{error}</AdminNotice> : null}
        </div>
        <div className="adm-dialog__foot">
          <AdminButton variant="ghost" onClick={onClose} disabled={busy}>
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            Cancel
          </AdminButton>
          <AdminButton variant="primary" onClick={() => void save()} disabled={!dirty} busy={busy}>
            Save studios
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
