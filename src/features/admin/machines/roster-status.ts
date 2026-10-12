import { deleteField, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../../firebase";

/**
 * OUT OF SERVICE, ONE WRITER (the studio map, phase 4, Oct 2026).
 *
 * The floor list (StudioInventoryManager) and the machine's card both take
 * a machine out of service and put it back, and both write it here, one
 * way: the status and the signed reason together, as paths with updateDoc
 * on the entry that is already there (what the machine IS is never written
 * from here; docs/KNOWN-TRAPS.md, the Local set-up trap). Never combined
 * with `unit.size`, `modelId` or `order`, so the roster's budget case B1
 * measures exactly this write. Signed with the Auth uid, which the rules
 * pin (`rosterOutOfServiceOk`), at the server's time. The caller issues it
 * and moves on; a refusal comes back through the promise to its toast.
 */
export function setOutOfService(
  studioId: string,
  machineId: string,
  reason: string,
  who: { uid: string; name: string },
): Promise<void> {
  return updateDoc(doc(db, "studios", studioId, "roster", machineId), {
    status: "maintenance",
    outOfService: {
      reason,
      by: { uid: who.uid, name: who.name.trim().slice(0, 80) || "A leader" },
      at: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
    updatedBy: who.uid,
  });
}

/** Back in service: the status, and the reason off with it. */
export function backInService(studioId: string, machineId: string, uid: string | null): Promise<void> {
  return updateDoc(doc(db, "studios", studioId, "roster", machineId), {
    status: "active",
    outOfService: deleteField(),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}
