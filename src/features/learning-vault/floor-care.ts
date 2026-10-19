/**
 * THE FLOOR'S STATUS — Out of service and Flagged, the two things the
 * Catalog says about a unit from the floor, for the three prototypes.
 *
 * Round: the Learning vault redesign, Oct 19 2026 (the judges' last fixes).
 * All three judges found the prototypes silent about a machine that is out
 * of service or flagged, which today's Catalog says on its rows and at the
 * top of the machine page ("Flagged by Jess · Left pad sticks at the
 * bottom"). CLAUDE.md, "The Catalog is the floor first": it "shows only Out
 * of service and Flagged, read from Relay".
 *
 * THE SAME TWO READS THE CATALOG MAKES, NO NEW ONE
 * ------------------------------------------------
 *   Out of service  the studio's roster (studios/{s}/roster), the entry's
 *                   `status: "maintenance"` and, where a leader gave one,
 *                   its `outOfService` reason (catalog/out-of-service.ts).
 *                   useVaultData already holds this read (useCatalogMachines).
 *   Flagged         Relay's care record (studios/{s}/machineCare, read only),
 *                   through Relay's own useMachineCare, the one listener the
 *                   Catalog and the Overview open. useVaultData opens it
 *                   once per Learning screen.
 *
 * UNKNOWN IS NOT "ALL FINE"
 * -------------------------
 * The answer is null while either read is loading, when either failed, and
 * with no studio open: a screen then says nothing about the floor, as the
 * Catalog does, and never "in service" or "not flagged". Once both are
 * known the answer is a record holding ONLY the machines with something to
 * say; a machine missing from a known record is in service and unflagged.
 *
 * A floor read as empty (the roster holds nothing; the list the Catalog
 * shows is then the MSF standard standing in) has no unit out of service,
 * but Relay's flags still count: a flag is on a machine id, whatever list
 * it is drawn in.
 *
 * Dates are ISO strings (the house rule for what is held); FloorStatus
 * turns them back into the Catalog's own words (flagLineOf,
 * outOfServiceLineOf), in the studio's zone.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { FloorState } from "../catalog/floor-index";
import type { OutOfService } from "../catalog/out-of-service";

/** One note about a unit: the words, who said them (their whole name), and when (ISO). */
export interface FloorCareNote {
  /** The words; "" for a flag raised without any. */
  text: string;
  by?: string;
  at?: string;
}

/** What the floor says about one machine. */
export interface MachineFloorCare {
  /** The roster has it out of service (status "maintenance"). */
  outOfService: boolean;
  /** Why, who and when, where a leader said (an older entry has none). Only on a unit that IS out of service. */
  outOfServiceWhy?: FloorCareNote;
  /** Relay's flag on it: the note, who flagged it and when. */
  flag?: FloorCareNote;
}

/** By machine id, only the machines with something to say. Null: unknown. */
export type VaultCare = Record<string, MachineFloorCare>;

/** The parts of a CatalogMachine this reads. */
export interface FloorUnit {
  id: string;
  rosterStatus?: string;
  outOfService?: OutOfService | null;
}

/** The parts of Relay's care read (useMachineCare's state) this reads. */
export interface CareRead {
  byMachineId: Record<string, { flag: { note: string; by: { name: string }; at: number } | null } | undefined>;
  loading: boolean;
  error: string | null;
}

function isoOf(ms: number): string | undefined {
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** A note with no empty field: Firestore-clean, and nothing for a screen to guess at. */
function note(text: string | null | undefined, by: string | null | undefined, atMs: number): FloorCareNote {
  const out: FloorCareNote = { text: (text ?? "").trim() };
  const who = (by ?? "").trim();
  if (who) out.by = who;
  const at = isoOf(atMs);
  if (at) out.at = at;
  return out;
}

/**
 * The floor's status, by machine, from the two reads; null while either is
 * unknown (see the header).
 */
export function floorCareOf(input: {
  studioId: string | null;
  floorState: FloorState;
  units: readonly FloorUnit[];
  care: CareRead;
}): VaultCare | null {
  const { studioId, floorState, units, care } = input;
  if (!studioId) return null;
  if (floorState === "loading" || floorState === "unreadable") return null;
  if (care.loading || care.error) return null;

  const out: VaultCare = {};
  if (floorState === "ready") {
    for (const u of units) {
      if (!u.id || u.rosterStatus !== "maintenance") continue;
      const entry: MachineFloorCare = { outOfService: true };
      const why = u.outOfService;
      if (why && why.reason.trim()) entry.outOfServiceWhy = note(why.reason, why.by?.name, why.at);
      out[u.id] = entry;
    }
  }
  for (const [id, record] of Object.entries(care.byMachineId)) {
    const flag = record?.flag;
    // A flag with no words is still a flag (the Catalog says "Flagged" alone).
    if (!id || !flag) continue;
    const entry = out[id] ?? { outOfService: false };
    entry.flag = note(flag.note, flag.by?.name, flag.at);
    out[id] = entry;
  }
  return out;
}

/** True when a machine has something to say: out of service, or flagged. */
export function hasFloorStatus(status: MachineFloorCare | null | undefined): status is MachineFloorCare {
  return Boolean(status && (status.outOfService || status.flag));
}
