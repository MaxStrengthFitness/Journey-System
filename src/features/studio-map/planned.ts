/**
 * MACHINES STILL TO BUY (the studio map, Oct 2026).
 *
 * A remodel plan may hold machines the studio doesn't own yet (AJ, Oct 10
 * 2026: drafts let studios "plan out remodels and adding additional
 * machines in the event of a remodel"; Oct 11, Q2: "AJ agrees"). A planned
 * machine lives on a draft only, drawn at its model's true size, dashed,
 * "To buy", until the real one is on the floor list and swapped in. The
 * layout itself never holds one (layout.ts `planProblems` and `readPlan`).
 *
 * Its size is looked up live, like a unit's: the model it names, when that
 * model is of the same movement and has a size; else the lengths typed on
 * the draft; else not known (a round marker). A model of another movement
 * is never used for its size.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { KnownSize } from "../../types/machines";
import type { ModelsRead } from "../catalog/models";
import { normalDeg, PLAN_LIMITS, type PlannedPlacement, type PlanPoint } from "./layout";
import { listWords } from "./units";

/** A fresh `pm-` id: short, id-shaped, and different on every call. */
export function plannedId(nowMs = Date.now(), rand = Math.random()): string {
  return `pm-${Math.max(0, Math.floor(nowMs)).toString(36)}${Math.floor(rand * 46656)
    .toString(36)
    .padStart(3, "0")}`;
}

const sizeOk = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= PLAN_LIMITS.sizeMin && v <= PLAN_LIMITS.sizeMax;

/**
 * A machine still to buy, at `at` (its centre), turned 0. The typed size is
 * kept only when both lengths are in range and only when no model is named
 * (a model gives its own size, looked up live).
 */
export function newPlanned(i: {
  movementId: string | null;
  modelId: string | null;
  label: string;
  typed: KnownSize | null;
  at: PlanPoint;
  id?: string;
}): PlannedPlacement {
  const label = i.label.replace(/\s+/g, " ").trim().slice(0, PLAN_LIMITS.plannedLabel);
  const typed = !i.modelId && i.typed && sizeOk(i.typed.lengthMm) && sizeOk(i.typed.widthMm) ? i.typed : null;
  return {
    kind: "planned",
    id: i.id ?? plannedId(),
    label: label || "A machine to buy",
    movementId: i.movementId,
    modelId: i.modelId,
    ...(typed ? { lengthMm: Math.round(typed.lengthMm), widthMm: Math.round(typed.widthMm) } : {}),
    x: Math.round(i.at.x),
    y: Math.round(i.at.y),
    rotationDeg: normalDeg(0),
  };
}

export type PlannedSizeRead =
  | { state: "known"; size: KnownSize; from: "model" | "typed" }
  | { state: "unknown" }
  | { state: "loading" };

/**
 * Which size a machine still to buy has: its model's (same movement, with a
 * size), else, while the models are still loading, loading; else the typed
 * lengths; else not known.
 */
export function plannedSizeOf(p: PlannedPlacement, models: ModelsRead): PlannedSizeRead {
  if (p.modelId) {
    if (models.state === "off" || models.state === "loading") return { state: "loading" };
    if (models.state === "ready") {
      const m = models.byId[p.modelId];
      if (m && m.movementId === p.movementId && m.size) {
        const { source: _s, note: _n, ...size } = m.size;
        return { state: "known", size, from: "model" };
      }
    }
  }
  if (sizeOk(p.lengthMm) && sizeOk(p.widthMm)) return { state: "known", size: { lengthMm: p.lengthMm, widthMm: p.widthMm, heightMm: null }, from: "typed" };
  return { state: "unknown" };
}

/** The size to draw, or null for a marker. */
export const plannedKnownSize = (r: PlannedSizeRead): KnownSize | null => (r.state === "known" ? r.size : null);

/** Where a planned machine's size came from, in the editor's panel. */
export function plannedSizeWords(p: PlannedPlacement, r: PlannedSizeRead, models: ModelsRead): string {
  if (r.state === "loading") return "Checking the model's size…";
  if (r.state === "unknown") return "Size not known yet.";
  if (r.from === "typed") return "Size typed on the plan";
  const m = models.state === "ready" && p.modelId ? models.byId[p.modelId] : null;
  return m?.size ? `${m.model} · ${m.size.source}` : "The model's size";
}

const GENDER_WORD = /\b(?:fe)?males?\b/gi;

/**
 * The name a machine still to buy is given: its model's own name (never its
 * brand, so a brand is never said twice), else the movement's, without
 * "female" or "male" (gender is used nowhere in choosing a machine).
 */
export function plannedLabel(movementName: string | null, modelName: string | null): string {
  const pick = (s: string | null) =>
    (s ?? "")
      .replace(GENDER_WORD, " ")
      .replace(/\(\s*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return (pick(modelName) || pick(movementName)).slice(0, PLAN_LIMITS.plannedLabel);
}

export interface SwapCandidate {
  machineId: string;
  name: string;
  movementId: string | null;
}

/**
 * Bought it? The floor's machines not placed yet that could stand where the
 * planned one does: those of the same movement first, then the rest, each
 * in the order given (walking order).
 */
export function swapCandidates(p: PlannedPlacement, unplaced: readonly SwapCandidate[]): { same: SwapCandidate[]; other: SwapCandidate[] } {
  const same: SwapCandidate[] = [];
  const other: SwapCandidate[] = [];
  for (const u of unplaced) {
    if (p.movementId && u.movementId === p.movementId) same.push(u);
    else other.push(u);
  }
  return { same, other };
}

/** "Still to buy: Hip Abductor and Seated Dip." Null with none. */
export function stillToBuyWords(planned: readonly Pick<PlannedPlacement, "label">[]): string | null {
  if (planned.length === 0) return null;
  return `Still to buy: ${listWords(planned.map((p) => p.label))}.`;
}
