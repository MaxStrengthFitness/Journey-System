import { useMemo, useState } from "react";
import { Flag, FlagOff, Wrench } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { studioDateKey } from "../../lib/studio-time";
import type { Trainer } from "../../types";
import type { StudioMachineRosterEntry } from "../../types/machines";
import { AdminButton, AdminInput, AdminTextarea } from "../admin/primitives";
import { UpkeepDialog } from "../admin/upkeep/UpkeepDialog";
import { DEFAULT_UPKEEP_POLICY, tallyUpkeep, worstStatus } from "../admin/upkeep/upkeepLog";
import { backInService, setOutOfService } from "../admin/machines/roster-status";
import { OUT_OF_SERVICE_REASON_MAX, outOfServiceLineOf, outOfServiceOfEntry, reasonToStore } from "../catalog/out-of-service";
import { FloorNotes } from "../floor-notes/FloorNotes";
import { leadsStudioPerRules } from "../learning/permissions";
import { flagLine } from "../relay/board/cleaning";
import { FLAG_NOTE_MAX, type MachineCare } from "../relay/board/machine-care";
import { careActor, clearMachineFlag, flagMachine } from "../relay/board/machine-care-store";
import { useUnsavedChanges } from "../unsaved-changes";
import { useCardMaintain, type CardReads } from "./useMachineCardReads";
import "./machine-card.css";

/**
 * MAINTAIN — "something is wrong with it" first, then the floor's notes, Out
 * of service and upkeep (the studio map, phase 4; Oct 11 reviews, A18).
 *
 * WHICH RECORD "REPORT A PROBLEM" WRITES: the machine's flag
 * (`machineCare.flag`, through flagMachine), the one line every floor door
 * already shows until someone clears it (Relay's head line, Open loops,
 * Since you were in, the machine menu's safety strip, the Catalog's
 * Flagged), and it rings the studio leader's bell as the care sheet did
 * since Sep 2026 (design §G question 3, built with its default (a)). This
 * differs from the machine menu, whose note box writes a "The machine
 * itself" floor note (Oct 4 2026): one fault written two ways is AJ's call.
 * A floor note, for something worth a dated history, is under the report.
 *
 * Out of service is a leader's signed decision (roster-status.ts, the
 * roster's one write): a reason of 1 to 140 characters, required by the
 * rules. Its reads (the floor's notes, the earlier notes, upkeep) mount
 * only while this part is open.
 */
export function MaintainPart({
  studioId,
  studioName,
  machineId,
  name,
  entry,
  shareKey,
  care,
  have,
  authTrainer,
  uid,
  canWrite,
  canLead,
  onClose,
}: {
  studioId: string;
  studioName: string;
  machineId: string;
  name: string;
  entry: StudioMachineRosterEntry;
  shareKey: string;
  /** This machine's live care record (undefined while unknown or none). */
  care: MachineCare | undefined;
  have: Partial<Pick<CardReads, "floorNotes" | "oldNotes" | "overlayFor" | "upkeep">>;
  authTrainer: Trainer | null;
  uid: string | null;
  canWrite: boolean;
  canLead: boolean;
  onClose: () => void;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const { activeStudio, studios } = useActiveStudio();
  const reads = useCardMaintain(studioId, have);
  const [note, setNote] = useState("");
  const [upkeep, setUpkeep] = useState(false);
  const [askingOut, setAskingOut] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonProblem, setReasonProblem] = useState<string | null>(null);
  useUnsavedChanges(note.trim().length > 0, `the problem report on ${name}`, { onDiscard: () => setNote("") });
  const reasonUnsaved = useUnsavedChanges(askingOut && reason.trim().length > 0, `the out of service reason for ${name}`, { onDiscard: () => setReason("") });

  const flag = flagLine(care);
  const out = entry.status === "maintenance";
  const outLine = out ? outOfServiceOfEntry(entry) : null;
  const upkeepStatus = useMemo(
    () => worstStatus(tallyUpkeep(reads.upkeep.events, machineId, studioDateKey(new Date()) ?? ""), DEFAULT_UPKEEP_POLICY),
    [reads.upkeep.events, machineId],
  );
  const leaderId = (activeStudio?.id === studioId ? activeStudio : (studios ?? []).find((s) => s.id === studioId))?.headTrainerId ?? null;

  const report = () => {
    const text = note.trim().slice(0, FLAG_NOTE_MAX);
    if (!text || !uid) return;
    flagMachine({ studioId, machineId, machineName: name, note: text, author: careActor(uid, authTrainer?.fullName), leaderId }).catch((err: unknown) => {
      console.warn("[machine card] report failed:", err);
      toastError(`Couldn't report the problem with ${name}. Check your connection.`);
    });
    setNote("");
    toastSuccess("Reported. Leaders see it under Open loops.");
  };

  const clear = () => {
    clearMachineFlag({ studioId, machineId }).catch((err: unknown) => {
      console.warn("[machine card] clear failed:", err);
      toastError("Couldn't clear that.");
    });
    toastSuccess("Flag cleared.");
  };

  const saveOut = () => {
    const r = reasonToStore(reason);
    if (r.ok === false) {
      setReasonProblem(r.why);
      return;
    }
    if (!uid) {
      toastError("Sign in again before taking a machine out of service.");
      return;
    }
    setOutOfService(studioId, machineId, r.reason, { uid, name: authTrainer?.fullName ?? "A leader" }).catch((err: unknown) => {
      console.error(err);
      toastError("Could not take it out of service. Studio leads and admins only.");
    });
    setReason("");
    setAskingOut(false);
    toastSuccess(`${name} is out of service. Trainers see why.`);
    // Saved and leaving in one tap: clean now, or the host's guard asks about the reason it just saved.
    reasonUnsaved.release();
    onClose();
  };

  const putBack = () => {
    backInService(studioId, machineId, uid).catch((err: unknown) => {
      console.error(err);
      toastError("Could not put it back in service. Studio leads and admins only.");
    });
    toastSuccess(`${name} is back in service.`);
  };

  return (
    <>
      <section className="mdc-report" aria-label="Report a problem">
        <h3 className="mdc-h">Report a problem</h3>
        {flag ? (
          <>
            <p className="mdc-line">{flag}</p>
            {canWrite && (
              <div className="mdc-actions">
                <AdminButton onClick={clear}>
                  <FlagOff className="w-3.5 h-3.5" aria-hidden />
                  Clear the flag
                </AdminButton>
              </div>
            )}
          </>
        ) : canWrite ? (
          <>
            <AdminTextarea
              aria-label={`What's wrong with ${name}`}
              className="min-h-20"
              maxLength={FLAG_NOTE_MAX}
              value={note}
              placeholder="What's wrong? A torn pad, a squeak, a loose cable…"
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mdc-actions">
              <AdminButton variant="primary" disabled={!note.trim()} onClick={report}>
                <Flag className="w-3.5 h-3.5" aria-hidden />
                Report it
              </AdminButton>
            </div>
          </>
        ) : (
          <p className="mdc-line mdc-line--quiet">Nothing reported.</p>
        )}
      </section>

      <section aria-label="The floor's notes">
        <h3 className="mdc-h">The floor's notes</h3>
        <FloorNotes
          studioId={studioId}
          studioName={studioName}
          machineId={machineId}
          machineName={name}
          read={reads.floorNotes}
          earlier={{
            studioNotes: reads.oldNotes[machineId]?.notes
              ? {
                  text: reads.oldNotes[machineId].notes,
                  by: reads.oldNotes[machineId].updatedBy?.name ?? null,
                  at: reads.oldNotes[machineId].updatedAt,
                }
              : null,
            catalogNote: (() => {
              const o = reads.overlayFor("machine", machineId);
              return o
                ? {
                    id: o.id,
                    blocks: o.blocks,
                    by: o.updatedByName ?? o.authorName ?? null,
                    at: o.updatedAt ?? o.createdAt,
                    shared: o.shared,
                    shareStatus: o.shareStatus,
                    shareReviewNote: o.shareReviewNote,
                  }
                : null;
            })(),
            unitNote: entry.studioNotes ?? null,
          }}
          uid={uid}
          writerName={canWrite ? (authTrainer?.fullName ?? "A trainer") : null}
          // The rules' own answer for whose words a leader may change (isStudioOwnerOrHeadTrainer).
          canLead={leadsStudioPerRules(authTrainer ?? null, studioId)}
          shareKeys={[shareKey]}
        />
      </section>

      <section aria-label="Out of service">
        <h3 className="mdc-h">Out of service</h3>
        {out ? (
          <p className="mdc-line">
            {outLine ? (() => {
              const l = outOfServiceLineOf(outLine);
              return `${l.reason} · ${l.who}`;
            })() : "Out of service."}
          </p>
        ) : (
          !askingOut && <p className="mdc-line mdc-line--quiet">In service.</p>
        )}
        {canLead && out && (
          <div className="mdc-actions">
            <AdminButton onClick={putBack}>Back in service</AdminButton>
          </div>
        )}
        {canLead && !out && !askingOut && (
          <div className="mdc-actions">
            <AdminButton onClick={() => setAskingOut(true)}>Take it out of service</AdminButton>
          </div>
        )}
        {canLead && !out && askingOut && (
          <div className="mdc-report">
            <label className="mdc-report__label" htmlFor={`mdc-out-${machineId}`}>
              Why? Trainers read it on the floor and in the Catalog.
            </label>
            <AdminInput
              id={`mdc-out-${machineId}`}
              maxLength={OUT_OF_SERVICE_REASON_MAX}
              value={reason}
              invalid={Boolean(reasonProblem)}
              placeholder="A new cable is on order"
              onChange={(e) => {
                setReason(e.target.value);
                setReasonProblem(null);
              }}
            />
            {reasonProblem && <p className="mdc-line">{reasonProblem}</p>}
            <div className="mdc-actions">
              <AdminButton variant="primary" onClick={saveOut}>
                Save
              </AdminButton>
              <AdminButton
                variant="ghost"
                onClick={() => {
                  setAskingOut(false);
                  setReason("");
                  setReasonProblem(null);
                }}
              >
                Cancel
              </AdminButton>
            </div>
          </div>
        )}
      </section>

      <section aria-label="Upkeep">
        <h3 className="mdc-h">Upkeep</h3>
        {reads.upkeep.state === "failed" ? (
          <p className="mdc-line mdc-line--quiet">Can't read the upkeep record right now.</p>
        ) : reads.upkeep.state === "loading" ? (
          <p className="mdc-line mdc-line--quiet">Reading the upkeep record…</p>
        ) : (
          canWrite && (
            <div className="mdc-actions">
              <AdminButton onClick={() => setUpkeep(true)}>
                <Wrench className="w-3.5 h-3.5" aria-hidden />
                Upkeep{upkeepStatus === "overdue" ? " · overdue" : upkeepStatus === "due" ? " · due" : ""}
              </AdminButton>
            </div>
          )
        )}
      </section>

      {upkeep && (
        <UpkeepDialog studioId={studioId} machineId={machineId} machineName={name} events={reads.upkeep.events} authTrainer={authTrainer} onClose={() => setUpkeep(false)} />
      )}
    </>
  );
}

