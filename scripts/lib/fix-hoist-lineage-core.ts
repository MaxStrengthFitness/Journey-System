/**
 * The decision of scripts/fix-hoist-lineage.ts, apart from the connection so
 * a test can drive it (src/lib/hoist-lineage-fix.test.ts). Read the script's
 * header first.
 *
 * Pure: given the Hoist's roster document as it is now, say which fields the
 * fix (or its revert) changes, or why it refuses. A field already at the
 * value it would get is left alone; a field at any value other than the one
 * read on Oct 15 2026 is a person's newer edit, and the run refuses rather
 * than write over it.
 */
import { CLINICAL_FLAGS_MATRIX } from "../../src/data/clinical-matrix.ts";
import { machineWatchOuts } from "../../src/lib/clinical-watchouts.ts";
import { resolveMachine } from "../../src/lib/resolve-machine.ts";
import type { StudioMachineRosterEntry } from "../../src/types/machines.ts";

export const HOIST_STUDIO_ID = "BVDDRe5AqQZFihRLW0vK";
export const HOIST_MACHINE_ID = "sm-BVDDRe5AqQZFihRLW0vK-hoist-leg-press";
export const HOIST_PATH = `studios/${HOIST_STUDIO_ID}/roster/${HOIST_MACHINE_ID}`;
/** `updatedBy` on the fix's write, the way the floors script signs its own. */
export const FIX_SIGNATURE = "fix-hoist-lineage";

/** The catalog Leg Press: the Hoist's lineage once fixed. */
export const LEG_PRESS_ID = "m-leg-press";

/**
 * The two fields the fix changes, as read from production on Oct 15 2026 and
 * as the fix leaves them. The region ("Hamstring / Glute") is a person's
 * choice and stays (AJ, Oct 15 2026: "keep the region Hamstring / Glute").
 */
export const FIELDS = [
  { field: "basedOn", before: null, after: LEG_PRESS_ID },
  {
    field: "definition.movementPattern",
    // The blank form's default on Sep 9 2026, when the Hoist was made: nobody chose it.
    before: "Upper Body: Horizontal Push",
    // The catalog Leg Press's (src/data/machine-definitions.ts).
    after: "Lower Body: Quad Dominant",
  },
] as const;

export type FieldName = (typeof FIELDS)[number]["field"];
export type Direction = "fix" | "revert";

/** One field's change. `to: null` deletes the field. */
export interface Change {
  field: FieldName;
  from: string | null;
  to: string | null;
}

/** `reason` says why the run refuses (and `changes` is then empty); null when it may go ahead. */
export interface Plan {
  ok: boolean;
  changes: Change[];
  reason: string | null;
}

const refuse = (reason: string): Plan => ({ ok: false, changes: [], reason });

/** A value as the plan compares it: a non-empty string, else null. */
function textOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function valueOf(doc: Record<string, unknown>, field: FieldName): string | null {
  if (field === "basedOn") return textOrNull(doc.basedOn);
  const def = doc.definition as Record<string, unknown> | undefined;
  return textOrNull(def?.movementPattern);
}

/** Which fields to change, or why not. `doc` is the roster document's data, or null when missing. */
export function planHoistLineage(doc: Record<string, unknown> | null | undefined, direction: Direction): Plan {
  if (!doc) return refuse(`${HOIST_PATH} does not exist.`);
  if (doc.source !== "custom") {
    return refuse(`It is not a studio-built machine (source is ${JSON.stringify(doc.source ?? null)}).`);
  }
  const def = doc.definition as Record<string, unknown> | undefined;
  const name = textOrNull(def?.name) ?? "";
  if (!/leg\s*press/i.test(name)) {
    return refuse(`Its name is ${JSON.stringify(name)}, not a leg press: is this the right machine?`);
  }
  const defLineage = textOrNull(def?.basedOn);
  if (defLineage) {
    return refuse(`Its definition already names a lineage (${defLineage}); a person should look before anything is written.`);
  }

  const changes: Change[] = [];
  for (const f of FIELDS) {
    const now = valueOf(doc, f.field);
    const from = direction === "fix" ? f.before : f.after;
    const to = direction === "fix" ? f.after : f.before;
    if (now === to) continue;
    if (now !== from) {
      return refuse(
        `${f.field} is ${JSON.stringify(now)}, expected ${JSON.stringify(from)}` +
          (direction === "fix" ? " (as read on Oct 15 2026)" : " (as the fix left it)") +
          ". Someone changed it since; nothing was written.",
      );
    }
    changes.push({ field: f.field, from, to });
  }
  return { ok: true, changes, reason: null };
}

/**
 * The update for Firestore, dotted paths so nothing else in `definition`
 * moves. `remove` is the delete sentinel (FieldValue.delete() in the script),
 * `now` the server's time.
 */
export function updateOf(changes: readonly Change[], sentinels: { now: unknown; remove: unknown }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of changes) out[c.field] = c.to === null ? sentinels.remove : c.to;
  out.updatedAt = sentinels.now;
  out.updatedBy = FIX_SIGNATURE;
  return out;
}

/** The document as it would read after the changes, for the watch-out count. */
export function applyChanges(doc: Record<string, unknown>, changes: readonly Change[]): Record<string, unknown> {
  const next: Record<string, unknown> = { ...doc, definition: { ...((doc.definition as Record<string, unknown>) ?? {}) } };
  for (const c of changes) {
    if (c.field === "basedOn") {
      if (c.to === null) delete next.basedOn;
      else next.basedOn = c.to;
    } else {
      (next.definition as Record<string, unknown>).movementPattern = c.to;
    }
  }
  return next;
}

/**
 * How many machine-specific watch-outs the floor shows on this machine with
 * every clinical flag on: the app's own resolver and matcher, so the number
 * is the one the session grid, the machine card and Programming's rows show.
 */
export function watchOutCount(doc: Record<string, unknown>): number {
  const resolved = resolveMachine({ machineId: HOIST_MACHINE_ID, studioId: HOIST_STUDIO_ID, ...doc } as StudioMachineRosterEntry);
  if (!resolved) return 0;
  const flags = CLINICAL_FLAGS_MATRIX.map((f) => f.id);
  return machineWatchOuts(flags, { id: resolved.machineId, name: resolved.name, comparisonKey: resolved.comparisonKey }).length;
}
