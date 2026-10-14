import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { StudioMachineSetting } from "../types";

/**
 * Live per-studio machine setting overrides (settingOptions,
 * standardSettings, display order, possession) — round: Multi-Tenant
 * Machine Settings, Aug 2026. Keyed by machineId for easy lookup at each
 * call site: `settingsByMachineId[machine.id]`.
 *
 * Used by: the Catalog's StudioSetupCard (which both reads and writes these -
 * it replaced the Hub's Machine Settings editor in Sep 2026, see that file for
 * why the editor moved into the Catalog), and any read-only consumer that
 * needs a studio's custom order/possession — currently the Client Profile
 * Journey grid and the Active Session table's unfocused view.
 */
export function useStudioMachineSettings(studioId: string | null) {
  const [settingsByMachineId, setSettingsByMachineId] = useState<
    Record<string, StudioMachineSetting>
  >({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Another studio's cards never stand in for this one's: the map is
    // emptied when the studio changes and when a read fails (the studio
    // machines round's review, Oct 13 2026: the session and the profile read
    // these too, and the catalog's machines share ids across studios).
    const clear = () => setSettingsByMachineId((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    clear();
    if (!studioId) return;
    setLoading(true);
    const q = query(
      collection(db, "studioMachineSettings"),
      where("studioId", "==", studioId),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const map: Record<string, StudioMachineSetting> = {};
        snap.docs.forEach((d) => {
          const data = { id: d.id, ...d.data() } as StudioMachineSetting;
          if (data.machineId) map[data.machineId] = data;
        });
        setSettingsByMachineId(map);
        setLoading(false);
      },
      (err) => {
        console.error("Error loading studio machine settings:", err);
        clear();
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [studioId]);

  return { settingsByMachineId, loading };
}
