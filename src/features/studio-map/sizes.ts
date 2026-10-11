/**
 * WHICH SIZE A UNIT HAS (the studio map, Oct 2026).
 *
 * A machine's size belongs to its UNIT, never to a brochure: the
 * tape-measured size on the studio's roster entry (`unit.size`) if there is
 * one; otherwise the size on the model the unit names
 * (`machineModels/{id}.size`); otherwise "Size not known", which the layout
 * draws as a round marker every check leaves out. AJ's floors are mixed
 * ("Four studios own four different leg presses", Sep 21 2026), so nothing
 * here guesses a model from a movement.
 *
 * The models come from the Catalog's read (catalog/useMachineModels: off ·
 * loading · unreadable · ready), and `off` reads as loading, never as
 * unknown: a door that turns the read on is still loading until its first
 * answer.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { KnownSize } from "../../types/machines";
import type { ModelsRead } from "../catalog/models";
import { MODEL_LIMITS } from "../machine-codex/models";
import { formatStudioDate } from "../../lib/studio-time";

export type UnitSizeRead =
  | { state: "known"; size: KnownSize; from: "measured"; by: string; at: Date | null }
  | { state: "known"; size: KnownSize; from: "model"; modelId: string; model: string; source: string; note: string | null }
  | {
      state: "unknown";
      why: "no-model" | "model-has-no-size" | "model-not-recorded" | "model-for-another-machine" | "no-model-for-movement";
      /** The unit has no MSF movement at all, so no model can be picked for it: only measuring helps. */
      noMovement?: true;
    }
  | { state: "loading" }
  | { state: "unreadable" };

/** What sizes.ts needs of a unit: never a whole roster entry, so the Catalog's machine can supply it too. */
export interface UnitFacts {
  unitSize: unknown;
  modelId: string | null;
  movementId: string | null;
}

/** The Catalog's own read, whose model now carries `size`. */
export type ModelLookup = ModelsRead;

/** A unit with no size is a round marker 2 ft across, never a guessed rectangle. */
export const MARKER_MM = 610;

const sizeMmOk = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= MODEL_LIMITS.sizeMinMm && v <= MODEL_LIMITS.sizeMaxMm;

function dateOf(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (v && typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function") {
    try {
      const d = (v as { toDate: () => Date }).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The unit's tape-measured size, or null when there isn't one a screen can
 * stand behind. Tolerant: junk (a length as a string, a negative) is
 * ignored, and the unit falls back to its model.
 */
export function measuredSizeOf(unitSize: unknown): { size: KnownSize; by: string; at: Date | null } | null {
  if (!unitSize || typeof unitSize !== "object") return null;
  const s = unitSize as { lengthMm?: unknown; widthMm?: unknown; heightMm?: unknown; by?: unknown; at?: unknown };
  if (!sizeMmOk(s.lengthMm) || !sizeMmOk(s.widthMm)) return null;
  return {
    size: {
      lengthMm: Math.round(s.lengthMm),
      widthMm: Math.round(s.widthMm),
      heightMm: sizeMmOk(s.heightMm) ? Math.round(s.heightMm) : null,
    },
    by: typeof s.by === "string" ? s.by : "",
    at: dateOf(s.at),
  };
}

/** Which size a unit has, and why it has none. */
export function sizeOfUnit(unit: UnitFacts, models: ModelLookup): UnitSizeRead {
  const measured = measuredSizeOf(unit.unitSize);
  // 1. A measured size wins, and needs no models: known while they load.
  if (measured) return { state: "known", size: measured.size, from: "measured", by: measured.by, at: measured.at };
  const movementId = unit.movementId?.trim() || null;
  const modelId = unit.modelId?.trim() || null;
  // 2. The model the unit names.
  if (modelId) {
    if (models.state === "off" || models.state === "loading") return { state: "loading" };
    if (models.state === "unreadable") return { state: "unreadable" };
    const m = models.byId[modelId];
    if (!m) return { state: "unknown", why: "model-not-recorded" };
    if (m.movementId !== movementId) return { state: "unknown", why: "model-for-another-machine" };
    if (!m.size) return { state: "unknown", why: "model-has-no-size" };
    const { source, note, ...size } = m.size;
    return { state: "known", size, from: "model", modelId, model: m.model, source, note };
  }
  // A machine with no MSF movement: no model can be named for it.
  if (!movementId) return { state: "unknown", why: "no-model-for-movement", noMovement: true };
  // 3. Nothing recorded for its movement.
  if (models.state === "ready" && !models.models.some((m) => m.movementId === movementId)) {
    return { state: "unknown", why: "no-model-for-movement" };
  }
  // 4. It names none.
  return { state: "unknown", why: "no-model" };
}

/** The size to draw, or null for a marker (unknown, loading or unreadable). */
export function knownSizeOf(r: UnitSizeRead): KnownSize | null {
  return r.state === "known" ? r.size : null;
}

const SHORT_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

/**
 * Where a unit's size came from, or why it has none, in one sentence.
 *
 * `canAct` is whether the reader may measure the unit or name its model (the
 * studio's leaders). A reader who can't is never told to do either: an
 * unknown size is simply "Size not known yet." for them.
 */
export function sizeSourceWords(r: UnitSizeRead, nameOf: (uid: string) => string | null, canAct = true): string {
  switch (r.state) {
    case "known": {
      if (r.from === "measured") {
        const name = r.by ? nameOf(r.by) : null;
        const when = r.at ? ` on ${formatStudioDate(r.at, SHORT_DATE)}` : "";
        return name ? `Measured by ${name}${when}` : `Measured${when}`;
      }
      return `${r.model} · ${r.source} · frame at rest`;
    }
    case "unknown":
      if (!canAct) return "Size not known yet.";
      switch (r.why) {
        case "no-model":
          return "Size not known. Pick its model or measure it.";
        case "model-has-no-size":
          return "Size not known: head office hasn't recorded this model's size. Measure it, or pick another model.";
        case "no-model-for-movement":
          return r.noMovement
            ? "Size not known. Measure it."
            : "Size not known. Measure it, or ask head office to record its model.";
        case "model-not-recorded":
          return "Size not known: head office hasn't recorded its model. Measure it, or pick another.";
        case "model-for-another-machine":
          return "Size not known: the model named is for another machine. Pick its model or measure it.";
      }
      return "Size not known.";
    case "loading":
      return "Checking the model's size…";
    case "unreadable":
      return "The model's size couldn't be read.";
  }
}
