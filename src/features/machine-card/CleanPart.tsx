import { Check, Sparkles } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import type { Trainer } from "../../types";
import { AdminButton } from "../admin/primitives";
import { useStudioTasks } from "../studio-tasks/useStudioTasks";
import type { TaskRow } from "../studio-tasks/types";
import { careLines, wipeRowsOf } from "../relay/board/cleaning";
import { careReadState } from "../relay/board/machine-care-context";
import { wearOf, weeklyMaintenanceLine } from "../relay/board/machine-care";
import type { WorkoutSession } from "../../types";
import { careActor, markWiped, recordCare, type MachineCareState } from "../relay/board/machine-care-store";
import { useRelayMaybe } from "../relay/board/RelayContext";
import { useCardCleaning, type CardCleaning } from "./useMachineCardReads";
import "./machine-card.css";

/**
 * CLEAN — only the cleaning (the studio map, phase 4; Oct 11 reviews, A18):
 * the machine's wipe and deep clean in days, never who or what minute (AJ:
 * "it doesn't need to be that military"); Wiped (blue) and Deep cleaned;
 * the weekly maintenance line on its day. A due deep clean is said here and
 * never on the daily checklist. Reporting a problem is Maintain's.
 *
 * Wiped is the checklist's one rule (`markWiped`): it marks the machine and
 * completes today's wipe-chore row for it whenever the row is known (from
 * the host, from the Relay shell's live rows, or from this part's own read
 * while it is open on a door that passed none), then closes the card
 * ("Save closes"), with Undo on the toast. Nothing waits on the network.
 */
export function CleanPart({
  studioId,
  machineId,
  name,
  care,
  sessions,
  todayKey,
  have,
  rows,
  floorIds,
  authTrainer,
  uid,
  canWrite,
  onWiped,
}: {
  studioId: string;
  machineId: string;
  name: string;
  /** The screen's one live care read (never a value captured when the card opened). */
  care: MachineCareState;
  /** Today's sessions at the studio (Relay's shell has them); null where there are none to count. */
  sessions: readonly Pick<WorkoutSession, "sessionMachineIds" | "startTime" | "createdAt" | "status">[] | null;
  todayKey: string;
  have?: CardCleaning;
  rows?: readonly TaskRow[];
  floorIds: ReadonlySet<string>;
  authTrainer: Trainer | null;
  uid: string | null;
  canWrite: boolean;
  onWiped: () => void;
}) {
  const relay = useRelayMaybe();
  const { toast, error: toastError, success: toastSuccess } = useToast();
  const cleaning = useCardCleaning(studioId, have);
  // Today's rows: the host's, else the shell's live ones, else this part's own read while it is open.
  const shellRows = relay?.studioId === studioId ? relay.dayRows : null;
  const own = useStudioTasks(rows || shellRows ? null : studioId);
  // Only the wipe chore's rows: a wipe never completes another machine chore.
  const dayRows = wipeRowsOf(rows ?? shellRows ?? own.rows);
  const known = careReadState(care) === "ready";
  const record = known ? care.byMachineId[machineId] : undefined;
  const weekly = weeklyMaintenanceLine(cleaning.weeklyDay, todayKey);
  const wear = sessions
    ? wearOf(machineId, { sessions: [...sessions], care: record, now: Date.now(), deepCleanDays: cleaning.deepDays, wipeAfterSessions: cleaning.wipeAfter })
    : null;

  const wiped = () => {
    if (!uid) {
      toastError("Sign in again before marking a machine wiped.");
      return;
    }
    const res = markWiped({
      studioId,
      machineIds: [machineId],
      floorIds,
      author: careActor(uid, authTrainer?.fullName),
      taskAuthor: authTrainer?.id ? { id: authTrainer.id, name: authTrainer.fullName ?? "A trainer" } : null,
      before: known ? care.byMachineId : null,
      rows: dayRows,
    });
    res.done.catch((err: unknown) => {
      console.warn("[machine card] wipe failed:", err);
      toastError(`Couldn't mark ${name} wiped. Check your connection.`);
    });
    const undo = res.undo;
    toast(`${name} wiped today.`, "success", 8000, undo ? { label: "Undo", run: () => void undo().catch(() => toastError("Couldn't undo that.")) } : undefined);
    onWiped();
  };

  const deepCleaned = () => {
    if (!uid) {
      toastError("Sign in again before recording a deep clean.");
      return;
    }
    recordCare({ studioId, machineId, kind: "deep-clean", author: careActor(uid, authTrainer?.fullName) }).catch((err: unknown) => {
      console.warn("[machine card] deep clean failed:", err);
      toastError(`Couldn't record the deep clean of ${name}. Check your connection.`);
    });
    toastSuccess(`${name} deep cleaned.`);
  };

  return (
    <>
      {known ? (
        careLines(record, wear, todayKey, cleaning.deepDays).map((l) => (
          <p key={l} className="mdc-line">
            {l}
          </p>
        ))
      ) : (
        <p className="mdc-line mdc-line--quiet">{care.error ? "Can't read the cleaning marks right now." : "Reading the cleaning marks…"}</p>
      )}
      {weekly && <p className="mdc-line mdc-line--quiet">{weekly}</p>}
      {canWrite && (
        <div className="mdc-actions">
          <AdminButton variant="primary" onClick={wiped}>
            <Check className="w-3.5 h-3.5" aria-hidden />
            Wiped
          </AdminButton>
          <AdminButton onClick={deepCleaned}>
            <Sparkles className="w-3.5 h-3.5" aria-hidden />
            Deep cleaned
          </AdminButton>
        </div>
      )}
    </>
  );
}
