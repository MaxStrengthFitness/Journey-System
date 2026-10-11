/**
 * THE SIZES SHEET'S ROWS (the studio map, Oct 2026) — the pure half.
 *
 * One row per machine on the floor, in walking order: its size or why it
 * has none, the models recorded for its movement (any maker), and whether a
 * tick may name it Imagine Strength. IT NEVER MARKS ANYTHING BY ITSELF: a
 * model is named only by a tick the leader made on a row they can see, or a
 * pick on that row (AJ's floors are mixed; a count-only confirm would draw a
 * Hoist at the Imagine Strength size).
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { MachineModel, ModelsRead } from "../catalog/models";
import { modelsOfMovement } from "../catalog/models";
import { IMAGINE_STRENGTH_BRAND } from "./imagine-strength";
import { sizeOfUnit, type UnitFacts, type UnitSizeRead } from "./sizes";

export { IMAGINE_STRENGTH_BRAND };

/** A machine on the floor, in walking order (`onFloor`'s answer, reduced to what a row needs). */
export interface FloorMachine {
  machineId: string;
  name: string;
}

export interface SizeRow {
  machineId: string;
  name: string;
  /** 1-based, the walking order. */
  order: number;
  /** basedOn, or the definition's basedOn; null for a machine with no MSF movement. */
  movementId: string | null;
  size: UnitSizeRead;
  /** The movement's recorded models, any brand ([] with no movement, or while the models aren't read). */
  models: MachineModel[];
  /** The one Imagine Strength model a tick would name, with the model's OWN movement (for the store's check), or null. */
  isOffer: { modelId: string; model: string; movementId: string } | null;
}

/** One link a tick makes: which model a unit is, with both movements so the store can refuse a mismatch. */
export interface ModelLink {
  machineId: string;
  modelId: string;
  unitMovementId: string | null;
  modelMovementId: string;
}

const NO_FACTS: UnitFacts = { unitSize: null, modelId: null, movementId: null };

/** Every machine on the floor as a row, in walking order. */
export function sizeRows(floor: readonly FloorMachine[], units: Readonly<Record<string, UnitFacts>>, models: ModelsRead): SizeRow[] {
  const all = models.state === "ready" ? models.models : [];
  return floor.map((m, i) => {
    const facts = units[m.machineId] ?? NO_FACTS;
    const movementId = facts.movementId?.trim() || null;
    const size = sizeOfUnit(facts, models);
    const mine = movementId ? modelsOfMovement(all, movementId) : [];
    const imagine = mine.filter((x) => x.brand === IMAGINE_STRENGTH_BRAND);
    const offered =
      movementId !== null && !(facts.modelId?.trim()) && !(size.state === "known" && size.from === "measured") && imagine.length === 1;
    return {
      machineId: m.machineId,
      name: m.name,
      order: i + 1,
      movementId,
      size,
      models: mine,
      isOffer: offered ? { modelId: imagine[0].id, model: imagine[0].model, movementId: imagine[0].movementId } : null,
    };
  });
}

/** The sheet's head: "{n} machines have no size yet", "{k} of {n} have a size" or "Every machine has a size". */
export function sizesHeading(rows: readonly SizeRow[]): string {
  const n = rows.length;
  if (n === 0) return "No machines on the floor yet";
  const k = rows.filter((r) => r.size.state === "known").length;
  if (k === n) return "Every machine has a size";
  if (k === 0) return n === 1 ? "1 machine has no size yet" : `${n} machines have no size yet`;
  return `${k} of ${n} have a size`;
}

/** What Mark {n} as Imagine Strength writes: only the ticked rows that offer it, in walking order. */
export function linksFor(rows: readonly SizeRow[], ticked: ReadonlySet<string>): ModelLink[] {
  return rows
    .filter((r) => r.isOffer && ticked.has(r.machineId))
    .map((r) => ({
      machineId: r.machineId,
      modelId: r.isOffer!.modelId,
      unitMovementId: r.movementId,
      // The model's own movement, never the row's: the store's check compares something real.
      modelMovementId: r.isOffer!.movementId,
    }));
}

/** A link whose model is for another movement than its unit's: the store drops it. */
export function linkMismatched(link: ModelLink): boolean {
  return !link.unitMovementId || link.unitMovementId !== link.modelMovementId;
}
