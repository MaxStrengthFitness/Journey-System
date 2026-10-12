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
import { imagineStrengthModelOf, isAssumed, isCatalogCopy, sizeOfUnit, type UnitFacts, type UnitSizeRead } from "./sizes";

export { IMAGINE_STRENGTH_BRAND };

/**
 * A machine on the floor, in walking order (`onFloor`'s answer, reduced to
 * what a row needs). `source` is the roster entry's own field, so a catalog
 * copy can be told from a studio's own machine that happens to name a
 * movement.
 */
export interface FloorMachine {
  machineId: string;
  name: string;
  source?: "catalog" | "custom" | string | null;
}

export interface SizeRow {
  machineId: string;
  name: string;
  /** 1-based, the walking order. */
  order: number;
  source: FloorMachine["source"];
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
    // The same one model an assumed size is drawn at (sizes.ts), so Mark confirms what the map shows.
    const imagine = movementId ? imagineStrengthModelOf(all, movementId) : null;
    const offered =
      movementId !== null && !(facts.modelId?.trim()) && !(size.state === "known" && size.from === "measured") && imagine !== null;
    return {
      machineId: m.machineId,
      name: m.name,
      order: i + 1,
      source: m.source ?? null,
      movementId,
      size,
      models: mine,
      isOffer: offered && imagine ? { modelId: imagine.id, model: imagine.model, movementId: imagine.movementId } : null,
    };
  });
}

/**
 * The sheet's head: "{n} machines have no size yet", "{k} of {n} have a
 * size", "{a} sizes not confirmed yet" or "Every machine has a size". A
 * size that is only its movement's Imagine Strength size (not confirmed)
 * is a size, never "no size", but the sheet doesn't call the floor done.
 */
export function sizesHeading(rows: readonly SizeRow[]): string {
  const n = rows.length;
  if (n === 0) return "No machines on the floor yet";
  // A read that failed or hasn't answered is unknown, never "no size".
  if (rows.some((r) => r.size.state === "unreadable")) return "The sizes couldn't be read";
  if (rows.some((r) => r.size.state === "loading")) return "Checking the sizes…";
  const k = rows.filter((r) => r.size.state === "known").length;
  const a = rows.filter((r) => isAssumed(r.size)).length;
  if (k === n && a === 0) return "Every machine has a size";
  if (k === n) return a === 1 ? "1 size not confirmed yet" : `${a} sizes not confirmed yet`;
  if (a > 0) return `${n - k} with no size · ${a} not confirmed`;
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

/**
 * The ticks the Sizes sheet opens with (AJ, Oct 11 2026, asked whether
 * Solon's and Strongsville's machines are Imagine Strength: "Yes, nearly
 * all"): every row that offers Imagine Strength AND is a catalog copy
 * (the same rule that draws a copy at that size, not confirmed, sizes.ts).
 * A studio's own machine starts unticked even when it names a movement. A
 * pre-tick writes nothing: only Mark {n} does, with every ticked row on
 * screen.
 */
export function initialTicks(rows: readonly SizeRow[]): Set<string> {
  return new Set(rows.filter((r) => r.isOffer && isCatalogCopy(r.source)).map((r) => r.machineId));
}
