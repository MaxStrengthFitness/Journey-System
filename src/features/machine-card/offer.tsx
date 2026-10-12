import { useEffect, useState } from "react";
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { Upload } from "lucide-react";
import { auth, db } from "../../firebase";
import { useToast } from "../../contexts/ToastContext";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import type { Trainer } from "../../types";
import type { StudioMachineRosterEntry } from "../../types/machines";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdminButton, AdminNotice, AdminTextarea } from "../admin/primitives";
import {
  buildSubmission,
  decisionSentence,
  SUBMISSION_NOTE_MAX,
  type CatalogSubmissionDoc,
  type RosterSubmissionMarker,
} from "../my-studio/floor";
import "../admin/admin.css";
import "./machine-card.css";

/*
 * A STUDIO'S OWN MACHINE, OFFERED TO THE MSF CATALOG — the three pieces of
 * the card's Set up part that send, take back and hear about an offer. They
 * moved here from My Studio → Machines' door when the door became the one
 * card (the studio map, phase 4, Oct 2026), unchanged.
 */

/* ------------------------------------------------------------------ *
 * Taking an offer back, and hearing what corporate said
 * ------------------------------------------------------------------ */

/**
 * WITHDRAW — a leader takes back an offer corporate has not decided on yet.
 *
 * The status and the rule for it already existed (`withdrawn`;
 * firestore.rules allows a studio's leader exactly the pending → withdrawn
 * transition, and only the `status` and `updatedAt` keys with it). Nothing
 * in the app ever wrote it, so an offer made by mistake sat in corporate's
 * queue until someone there passed on it.
 *
 * The write is deliberately those two keys and nothing else: adding a third
 * would be refused by the rule, silently, from the studio's side.
 */
export function WithdrawOffer({
  submissionId,
  studioId,
  machineId,
  machineName,
}: {
  submissionId: string;
  studioId: string;
  machineId: string;
  machineName: string;
}) {
  const { success: toastSuccess } = useToast();
  const [busy, setBusy] = useState(false);

  const withdraw = async () => {
    setBusy(true);
    try {
      await updateDoc(doc(db, "catalogSubmissions", submissionId), {
        status: "withdrawn",
        updatedAt: serverTimestamp(),
      });
      // The marker is a convenience copy, as it is when the offer is made:
      // its failure leaves the withdrawal standing rather than undoing it.
      try {
        await setDoc(
          doc(db, "studios", studioId, "roster", machineId),
          { submission: { id: submissionId, status: "withdrawn" } satisfies RosterSubmissionMarker },
          { merge: true },
        );
      } catch (err) {
        console.warn("[my-studio] withdrawal marker failed:", err);
      }
      toastSuccess(`${machineName} is no longer offered. You can fix it and offer it again.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "catalogSubmissions");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminButton variant="quiet" busy={busy} disabled={busy} onClick={() => void withdraw()}>
      Take the offer back
    </AdminButton>
  );
}

/**
 * WHAT CORPORATE SAID — the decision note, on the studio's own floor.
 *
 * It was always written and a studio's leaders could always read it; it was
 * simply never shown. So a studio learned that corporate passed and never
 * learned why, which is the one thing that would let them fix the machine
 * and offer it again.
 *
 * One `getDoc` when the machine's door opens, not a listener: a decision is
 * made once and the door is already open on a tap.
 */
export function DecisionNote({ submissionId, status }: { submissionId: string; status: RosterSubmissionMarker["status"] }) {
  const [sentence, setSentence] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "declined" && status !== "published") return;
    let alive = true;
    void (async () => {
      try {
        const snap = await getDoc(doc(db, "catalogSubmissions", submissionId));
        if (!alive || !snap.exists()) return;
        const data = snap.data() as CatalogSubmissionDoc;
        setSentence(decisionSentence(status, data.decisionNote));
      } catch {
        // A refused read means "unknown", never "there was no note" — so the
        // panel says nothing rather than implying corporate stayed silent.
      }
    })();
    return () => {
      alive = false;
    };
  }, [submissionId, status]);

  if (!sentence) return null;
  return <AdminNotice tone={status === "declined" ? "warn" : "ok"}>{sentence}</AdminNotice>;
}

/* ------------------------------------------------------------------ *
 * Offering a machine to the MSF catalog
 * ------------------------------------------------------------------ */

export function OfferDialog({
  studioId,
  studioName,
  entry,
  machineName,
  authTrainer,
  onClose,
}: {
  studioId: string;
  studioName: string;
  entry: StudioMachineRosterEntry;
  machineName: string;
  authTrainer: Trainer | null;
  onClose: () => void;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toastError("Sign in again before offering a machine.");
      return;
    }
    const built = buildSubmission({
      studioId,
      studioName,
      entry,
      author: { uid, name: authTrainer?.fullName ?? "A leader" },
      note,
    });
    if (built.ok === false) {
      toastError(built.reason);
      return;
    }
    setBusy(true);
    try {
      const ref = await addDoc(collection(db, "catalogSubmissions"), {
        ...built.doc,
        submittedAt: serverTimestamp(),
      });
      // The marker on the roster entry is what the floor shows; it is a
      // convenience copy, so a failure here leaves the submission standing.
      try {
        await setDoc(
          doc(db, "studios", studioId, "roster", entry.machineId),
          {
            submission: { id: ref.id, status: "pending" } satisfies RosterSubmissionMarker,
            updatedAt: serverTimestamp(),
            updatedBy: uid,
          },
          { merge: true },
        );
      } catch (err) {
        console.warn("[my-studio] submission marker failed:", err);
      }
      toastSuccess(`${machineName} offered to the MSF catalog. Corporate decides; nothing changes on your floor until it does.`);
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "catalogSubmissions");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Offer {machineName} to the MSF catalog</DialogTitle>
        </DialogHeader>
        <div className="adm flex flex-col gap-3">
          <p className="mdc-line mdc-line--quiet">
            Corporate reviews it. If it is published, {studioName} is moved onto the catalog version so every studio starts from the same machine, and your history comes with it.
          </p>
          <label className="flex flex-col gap-1">
            <span className="adm-label">
              A note for corporate (optional)
            </span>
            <AdminTextarea
              className="min-h-24"
              maxLength={SUBMISSION_NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why it earns a place in the catalog, and what it is most like."
            />
          </label>
          <div className="flex justify-end gap-2">
            <AdminButton variant="quiet" onClick={onClose}>
              Cancel
            </AdminButton>
            <AdminButton variant="primary" busy={busy} onClick={() => void send()}>
              <Upload className="w-3.5 h-3.5" />
              Offer it
            </AdminButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
