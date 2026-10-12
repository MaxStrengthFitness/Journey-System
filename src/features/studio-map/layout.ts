/**
 * THE LAYOUT (the studio map, Oct 2026): what is stored, how it is read
 * back, and the writes that change it.
 *
 * Each studio has ONE layout, at the fixed path studios/{s}/floorPlans/
 * current: the room and where each roster machine stands. The room is
 * BOXES (AJ, Oct 11 2026: "you just need to put how many square feet it
 * is. And then from there, you should just have like a modular box tool"):
 * the square footage the leader typed, one to twelve axis-aligned boxes
 * whose union is the floor, and the places in it (a door on a wall, a
 * pillar, a desk, the bathroom, a changing room, lockers, an office, the
 * fire extinguisher and the AED). Drafts live in five fixed slots, d-1 to
 * d-5, so a studio holds at most six layout documents by construction
 * (the rules' id pattern). Nothing is ever deleted: a draft given back is a
 * retired slot, and every write raises `rev` by exactly one, which the
 * rules require, so a save made from an old copy is refused.
 *
 * A draft may hold machines the studio doesn't own yet (`kind: "planned"`,
 * "Still to buy"); the layout itself never does. A rule can't look inside a
 * list, so that, and every box, place and placement, is checked here:
 * `planProblems` before a write, `readPlan` after a read (tolerant: junk is
 * dropped and counted, never drawn, and a planned machine read from
 * `current` is dropped).
 *
 * The roster is the one answer to which machines a studio has and in what
 * walking order; the layout only says where they stand. `reconcile` puts
 * the two together and never changes the order.
 *
 * PURE MODULE — no React, no Firestore. The server's time is handed in.
 */

import { formatStudioDate, formatStudioTime } from "../../lib/studio-time";
import { withoutUndefined } from "../studio-tasks/task-wizard";

export interface PlanPoint {
  x: number;
  y: number;
}

/** One box of the room. Axis-aligned; x, y is its TOP-LEFT corner. The floor is the union of the boxes. */
export interface RoomBox {
  /** "bx-<n>", up to 40 characters. */
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PlaceKind = "door" | "pillar" | "desk" | "bathroom" | "changing" | "lockers" | "extinguisher" | "aed" | "office";

/** A place in the room. Axis-aligned, x, y its top-left corner. A door straddles its wall. */
export interface RoomPlace {
  /** "pc-<base36>", up to 40 characters. */
  id: string;
  kind: PlaceKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 1-40 characters; absent = the kind's own word. */
  label?: string;
}

export interface PlanRoom {
  /** What the leader typed: whole sq ft, 200-20,000. Absent when never typed; never null. */
  areaSqFt?: number;
  boxes: RoomBox[];
  places: RoomPlace[];
}

/** A floor machine on the layout. x, y is its CENTRE. It carries no `kind` key. */
export interface UnitPlacement {
  /** The roster document id. */
  machineId: string;
  x: number;
  y: number;
  /** 0-359; 0 = length down the screen, its back at the top; clockwise. */
  rotationDeg: number;
}

/** A machine the studio doesn't own yet. DRAFTS ONLY. */
export interface PlannedPlacement {
  kind: "planned";
  /** "pm-<base36>", up to 40 characters. */
  id: string;
  /** 1-60: "Hip Abductor", "IS2027W Hip Abductor", or the leader's own words. */
  label: string;
  movementId: string | null;
  modelId: string | null;
  /** Typed, only when no model gives a size: both or neither. */
  lengthMm?: number;
  widthMm?: number;
  x: number;
  y: number;
  rotationDeg: number;
}

export type Placement = UnitPlacement | PlannedPlacement;

export const isPlanned = (p: Placement): p is PlannedPlacement => (p as { kind?: unknown }).kind === "planned";

/** The id a placement goes by on screen: the roster id, or the planned machine's own `pm-` id. */
export const placementId = (p: Placement): string => (isPlanned(p) ? p.id : p.machineId);

export interface FloorPlanDoc {
  v: 1;
  /** "The layout" for current; a draft's name. */
  name: string;
  room: PlanRoom;
  placements: Placement[];
  /** A draft slot given back; never on current. */
  retired?: true;
  rev: number;
  updatedAt: unknown;
  updatedBy: string;
}

/** A layout document as a screen holds it: read, with its id and its time. */
export interface LoadedPlan {
  id: string;
  name: string;
  rev: number;
  retired: boolean;
  room: PlanRoom;
  placements: Placement[];
  /** The server's time, or its estimate for a write still pending (so it sorts as newest); 0 unknown. */
  updatedAtMs: number;
  updatedBy: string;
}

/** The caps and ranges. The rules' numbers agree with these (a lint test reads both): change them together. */
export const PLAN_LIMITS = {
  boxes: 12,
  boxesMin: 1,
  places: 40,
  placements: 120,
  planned: 30,
  doors: 8,
  name: 60,
  label: 40,
  plannedLabel: 60,
  machineId: 200,
  id: 40,
  coordMax: 60960,
  boxMin: 610,
  areaMin: 305,
  areaMax: 18288,
  pillarMin: 152,
  pillarMax: 1829,
  markerMm: 305,
  doorMin: 610,
  doorMax: 4877,
  doorDepth: 152,
  sizeMin: 250,
  sizeMax: 6100,
  sqFtMin: 200,
  sqFtMax: 20000,
  bytes: 65536,
} as const;

export const CURRENT_ID = "current";
export const DRAFT_SLOTS = ["d-1", "d-2", "d-3", "d-4", "d-5"] as const;
export type DraftSlot = (typeof DRAFT_SLOTS)[number];
export const LAYOUT_NAME = "The layout";

/* ------------------------------------------------------------------ *
 * The places' kinds
 * ------------------------------------------------------------------ */

/**
 * AJ's order ("a pillar here. Or a door here, or a desk here. Or a bathroom
 * here. Changing room. Lockers."), with Office before the two safety
 * markers so they stay together.
 */
export const PLACE_KINDS: readonly PlaceKind[] = ["pillar", "door", "desk", "bathroom", "changing", "lockers", "office", "extinguisher", "aed"];

export const PLACE_WORDS: Record<PlaceKind, string> = {
  door: "Door",
  pillar: "Pillar",
  desk: "Desk",
  bathroom: "Bathroom",
  changing: "Changing room",
  lockers: "Lockers",
  office: "Office",
  extinguisher: "Fire extinguisher",
  aed: "AED",
};

export type PlaceForm = "door" | "area" | "marker";

const KIND_SET = new Set<string>(PLACE_KINDS);
export const isPlaceKind = (v: unknown): v is PlaceKind => typeof v === "string" && KIND_SET.has(v);

/** door; area: desk, bathroom, changing room, lockers, office; marker: pillar, extinguisher, AED. */
export function formOf(kind: PlaceKind): PlaceForm {
  if (kind === "door") return "door";
  if (kind === "pillar" || kind === "extinguisher" || kind === "aed") return "marker";
  return "area";
}

/** The AED and the fire extinguisher: drawn on every door's drawing, above the machines, their words always shown. */
export const isSafety = (kind: PlaceKind): boolean => kind === "extinguisher" || kind === "aed";

/** Every kind but the two safety markers (fixed at 1 ft). */
export const resizable = (kind: PlaceKind): boolean => !isSafety(kind);

/** A place's sides, by kind: [min, max] for each side (a door: along its wall; its depth is fixed). */
export function placeRange(kind: PlaceKind): { min: number; max: number } {
  switch (formOf(kind)) {
    case "door":
      return { min: PLAN_LIMITS.doorMin, max: PLAN_LIMITS.doorMax };
    case "area":
      return { min: PLAN_LIMITS.areaMin, max: PLAN_LIMITS.areaMax };
    case "marker":
      return isSafety(kind)
        ? { min: PLAN_LIMITS.markerMm, max: PLAN_LIMITS.markerMm }
        : { min: PLAN_LIMITS.pillarMin, max: PLAN_LIMITS.pillarMax };
  }
}

/** A place's name: its label, else its kind's word. */
export function placeName(p: Pick<RoomPlace, "kind" | "label">): string {
  const label = p.label?.trim();
  return label ? label : PLACE_WORDS[p.kind];
}

/** The first slot that is free: absent, or retired. Null when all five hold a live draft. */
export function freeSlot(slots: readonly Pick<LoadedPlan, "id" | "retired">[]): DraftSlot | null {
  for (const id of DRAFT_SLOTS) {
    const s = slots.find((d) => d.id === id);
    if (!s || s.retired) return id;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

const ID_SHAPED = /^[A-Za-z0-9_-]+$/;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const inRange = (v: unknown, lo: number, hi: number): v is number => finite(v) && v >= lo && v <= hi;
const coord = (v: unknown): v is number => inRange(v, 0, PLAN_LIMITS.coordMax);
/**
 * A place's corner may sit half a door's depth outside the 0 line: a door
 * straddles its wall, so a door on a wall at 0 starts at -76 mm.
 */
const placeCoord = (v: unknown): v is number => inRange(v, -PLAN_LIMITS.doorDepth, PLAN_LIMITS.coordMax);
const idShaped = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max && ID_SHAPED.test(v);
/** One millimetre either side: a stored side that rounding moved by a hair still reads. */
const side = (v: unknown, lo: number, hi: number): v is number => inRange(v, lo - 1, hi + 1);

/** An angle as a whole number 0-359. */
export function normalDeg(deg: number): number {
  const d = Math.round(deg) % 360;
  return d < 0 ? d + 360 : d;
}

function boxOf(raw: unknown): RoomBox | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (!idShaped(b.id, PLAN_LIMITS.id)) return null;
  if (!coord(b.x) || !coord(b.y)) return null;
  if (!side(b.w, PLAN_LIMITS.boxMin, PLAN_LIMITS.coordMax) || !side(b.h, PLAN_LIMITS.boxMin, PLAN_LIMITS.coordMax)) return null;
  return { id: b.id, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) };
}

function labelOf(v: unknown, kind: PlaceKind): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t || t.length > PLAN_LIMITS.label || t === PLACE_WORDS[kind]) return undefined;
  return t;
}

function placeOf(raw: unknown): RoomPlace | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (!idShaped(p.id, PLAN_LIMITS.id) || !isPlaceKind(p.kind)) return null;
  if (!placeCoord(p.x) || !placeCoord(p.y)) return null;
  const kind = p.kind;
  const label = labelOf(p.label, kind);
  const base = { id: p.id, kind, x: Math.round(p.x), y: Math.round(p.y), ...(label ? { label } : {}) };
  if (isSafety(kind)) return { ...base, w: PLAN_LIMITS.markerMm, h: PLAN_LIMITS.markerMm };
  const r = placeRange(kind);
  if (kind === "door") {
    // Its long side along the wall, 152 mm across it, either way round.
    const depth = (v: unknown) => side(v, PLAN_LIMITS.doorDepth, PLAN_LIMITS.doorDepth);
    const along = (v: unknown) => side(v, r.min, r.max);
    if (!((depth(p.w) && along(p.h)) || (along(p.w) && depth(p.h)))) return null;
  } else if (!side(p.w, r.min, r.max) || !side(p.h, r.min, r.max)) {
    return null;
  }
  return { ...base, w: Math.round(p.w as number), h: Math.round(p.h as number) };
}

function unitOf(p: Record<string, unknown>): UnitPlacement | null {
  if (!idShaped(p.machineId, PLAN_LIMITS.machineId)) return null;
  if (!coord(p.x) || !coord(p.y) || !finite(p.rotationDeg)) return null;
  return { machineId: p.machineId, x: Math.round(p.x), y: Math.round(p.y), rotationDeg: normalDeg(p.rotationDeg) };
}

function plannedOf(p: Record<string, unknown>): PlannedPlacement | null {
  if (!idShaped(p.id, PLAN_LIMITS.id) || !p.id.startsWith("pm-")) return null;
  if (typeof p.label !== "string" || !p.label.trim() || p.label.length > PLAN_LIMITS.plannedLabel) return null;
  // Each id must be null or id-shaped BEFORE any lookup uses it.
  const optionalId = (v: unknown) => v === null || v === undefined || idShaped(v, 100);
  if (!optionalId(p.movementId) || !optionalId(p.modelId)) return null;
  if (!coord(p.x) || !coord(p.y) || !finite(p.rotationDeg)) return null;
  const hasL = p.lengthMm !== undefined;
  const hasW = p.widthMm !== undefined;
  if (hasL !== hasW) return null;
  if (hasL && (!inRange(p.lengthMm, PLAN_LIMITS.sizeMin, PLAN_LIMITS.sizeMax) || !inRange(p.widthMm, PLAN_LIMITS.sizeMin, PLAN_LIMITS.sizeMax))) {
    return null;
  }
  return {
    kind: "planned",
    id: p.id,
    label: p.label.trim(),
    movementId: (p.movementId as string | null | undefined) ?? null,
    modelId: (p.modelId as string | null | undefined) ?? null,
    ...(hasL ? { lengthMm: Math.round(p.lengthMm as number), widthMm: Math.round(p.widthMm as number) } : {}),
    x: Math.round(p.x),
    y: Math.round(p.y),
    rotationDeg: normalDeg(p.rotationDeg),
  };
}

/**
 * A stored layout, read without trusting it: null when its version, room,
 * boxes (no usable box) or rev is unusable; otherwise each box, place or
 * placement that isn't finite, is out of range or malformed is dropped and
 * counted in `dropped`. A machine placed twice keeps its first placement. A
 * placement whose id isn't roster-shaped (a path, 7,000 characters) is
 * dropped, so it never rides along on every save. Read from `current`,
 * every planned machine is dropped and counted: the layout never holds a
 * machine still to buy, even after a bad write. A square footage out of
 * range is read as absent (the leader's number; the line just doesn't
 * compare). The AED's and the extinguisher's size is always 1 ft.
 */
export function readPlan(raw: unknown, opts: { planId: string }): { plan: FloorPlanDoc; dropped: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (d.v !== 1) return null;
  if (!finite(d.rev) || !Number.isInteger(d.rev) || d.rev < 1) return null;
  const room = d.room as Record<string, unknown> | undefined;
  if (!room || typeof room !== "object" || !Array.isArray(room.boxes)) return null;
  let dropped = 0;

  const boxes: RoomBox[] = [];
  for (const r of room.boxes) {
    const b = boxOf(r);
    if (!b || boxes.length >= PLAN_LIMITS.boxes || boxes.some((x) => x.id === b.id)) dropped++;
    else boxes.push(b);
  }
  if (boxes.length < PLAN_LIMITS.boxesMin) return null;

  const places: RoomPlace[] = [];
  let doors = 0;
  for (const r of Array.isArray(room.places) ? room.places : []) {
    const p = placeOf(r);
    const tooMany = places.length >= PLAN_LIMITS.places || (p?.kind === "door" && doors >= PLAN_LIMITS.doors);
    if (!p || tooMany || places.some((x) => x.id === p.id)) {
      dropped++;
      continue;
    }
    if (p.kind === "door") doors++;
    places.push(p);
  }

  const placements: Placement[] = [];
  const seen = new Set<string>();
  let planned = 0;
  for (const r of Array.isArray(d.placements) ? d.placements : []) {
    const raw = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const isPlan = raw.kind === "planned";
    const p = isPlan ? plannedOf(raw) : raw.kind === undefined ? unitOf(raw) : null;
    if (!p || placements.length >= PLAN_LIMITS.placements) {
      dropped++;
      continue;
    }
    if (isPlanned(p) && (opts.planId === CURRENT_ID || planned >= PLAN_LIMITS.planned)) {
      dropped++;
      continue;
    }
    const id = placementId(p);
    if (seen.has(id)) {
      dropped++;
      continue;
    }
    seen.add(id);
    if (isPlanned(p)) planned++;
    placements.push(p);
  }

  const areaSqFt =
    Number.isInteger(room.areaSqFt) && inRange(room.areaSqFt, PLAN_LIMITS.sqFtMin, PLAN_LIMITS.sqFtMax) ? (room.areaSqFt as number) : undefined;
  const name = typeof d.name === "string" && d.name.trim() ? d.name.slice(0, PLAN_LIMITS.name) : LAYOUT_NAME;
  return {
    plan: {
      v: 1,
      name,
      room: { ...(areaSqFt !== undefined ? { areaSqFt } : {}), boxes, places },
      placements,
      ...(d.retired === true && opts.planId !== CURRENT_ID ? { retired: true as const } : {}),
      rev: d.rev,
      updatedAt: d.updatedAt ?? null,
      updatedBy: typeof d.updatedBy === "string" ? d.updatedBy : "",
    },
    dropped,
  };
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/** What a write carries besides its stamp: the working copy's room and placements, its name, its rev. */
export interface PlanBody {
  name: string;
  room: PlanRoom;
  placements: Placement[];
  rev: number;
  retired?: true;
}

function bytesOf(value: unknown): number {
  const json = JSON.stringify(value) ?? "";
  return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(json).length : json.length;
}

/**
 * Every cap and range in plain words, plus the byte budget. Empty when the
 * plan may be sent. The editor can't produce a problem, so this catches a
 * bug, never a person; it is also what keeps a machine still to buy off the
 * layout itself, which no rule can see.
 */
export function planProblems(plan: { name: string; room: PlanRoom; placements: readonly Placement[] }, opts: { planId: string }): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };
  const { boxes, places, areaSqFt } = plan.room;
  if (!Array.isArray(boxes) || boxes.length < PLAN_LIMITS.boxesMin || boxes.length > PLAN_LIMITS.boxes) add("A room has 1 to 12 boxes.");
  for (const b of boxes ?? []) {
    if (!finite(b.w) || !finite(b.h) || b.w < PLAN_LIMITS.boxMin || b.h < PLAN_LIMITS.boxMin) add("A box is 2 ft or more on each side.");
    if (!idShaped(b.id, PLAN_LIMITS.id)) add("A box has no usable id.");
  }
  if (places.length > PLAN_LIMITS.places) add("A room has up to 40 places.");
  const doors = places.filter((p) => p.kind === "door");
  if (doors.length > PLAN_LIMITS.doors) add("A room has up to 8 doors.");
  for (const p of places) {
    if (!isPlaceKind(p.kind) || !idShaped(p.id, PLAN_LIMITS.id)) {
      add("A place in the room isn't one Journey knows.");
      continue;
    }
    if (p.label !== undefined && (!p.label.trim() || p.label.length > PLAN_LIMITS.label)) add("A place's name is 1 to 40 characters.");
    const r = placeRange(p.kind);
    if (p.kind === "door") {
      const along = Math.max(p.w, p.h);
      if (along < r.min - 1 || along > r.max + 1) add("A door is 2 to 16 ft wide.");
    } else if (p.w < r.min - 1 || p.w > r.max + 1 || p.h < r.min - 1 || p.h > r.max + 1) {
      add("A place in the room is too small or too big.");
    }
  }
  if (plan.placements.length > PLAN_LIMITS.placements) add("The layout can hold up to 120 machines.");
  const planned = plan.placements.filter(isPlanned);
  if (planned.length > 0 && opts.planId === CURRENT_ID) add("A machine still to buy goes on a draft, not the layout.");
  if (planned.length > PLAN_LIMITS.planned) add("A draft holds up to 30 machines still to buy.");
  for (const p of planned) {
    if (!p.label.trim() || p.label.length > PLAN_LIMITS.plannedLabel) add("A machine still to buy is named in 1 to 60 characters.");
    if (!idShaped(p.id, PLAN_LIMITS.id)) add("A machine still to buy has no usable id.");
    const hasL = p.lengthMm !== undefined;
    if (hasL !== (p.widthMm !== undefined)) add("A machine still to buy has both lengths or neither.");
  }
  if (!plan.name.trim() || plan.name.length > PLAN_LIMITS.name) add(`A layout's name is 1 to ${PLAN_LIMITS.name} characters.`);
  const points = [...(boxes ?? []), ...plan.placements];
  if (points.some((p) => !coord(p.x) || !coord(p.y)) || places.some((p) => !placeCoord(p.x) || !placeCoord(p.y))) {
    add("Everything on the layout is within 200 ft of the corner.");
  }
  for (const b of boxes ?? []) if (b.x + b.w > PLAN_LIMITS.coordMax || b.y + b.h > PLAN_LIMITS.coordMax) add("Everything on the layout is within 200 ft of the corner.");
  if (plan.placements.some((p) => !Number.isInteger(p.rotationDeg) || p.rotationDeg < 0 || p.rotationDeg > 359)) {
    add("A turn is a whole number of degrees, 0 to 359.");
  }
  const units = plan.placements.filter((p): p is UnitPlacement => !isPlanned(p));
  if (units.some((p) => !idShaped(p.machineId, PLAN_LIMITS.machineId))) add("A machine on the layout isn't one of the floor's.");
  const ids = plan.placements.map(placementId);
  if (new Set(ids).size !== ids.length) add("A machine is placed twice.");
  if (areaSqFt !== undefined && !(Number.isInteger(areaSqFt) && areaSqFt >= PLAN_LIMITS.sqFtMin && areaSqFt <= PLAN_LIMITS.sqFtMax)) {
    add("The studio's size is 200 to 20,000 sq ft.");
  }
  if (bytesOf({ v: 1, ...plan, rev: 1, updatedBy: "x".repeat(40) }) > PLAN_LIMITS.bytes) add("This layout is too large to save.");
  return out;
}

const r = Math.round;

function placementDoc(p: Placement): Record<string, unknown> {
  if (!isPlanned(p)) return { machineId: p.machineId, x: r(p.x), y: r(p.y), rotationDeg: normalDeg(p.rotationDeg) };
  return {
    kind: "planned",
    id: p.id,
    label: p.label.trim(),
    movementId: p.movementId ?? null,
    modelId: p.modelId ?? null,
    ...(p.lengthMm !== undefined && p.widthMm !== undefined ? { lengthMm: r(p.lengthMm), widthMm: r(p.widthMm) } : {}),
    x: r(p.x),
    y: r(p.y),
    rotationDeg: normalDeg(p.rotationDeg),
  };
}

/**
 * The document to write: integers rounded, the version, the writer and the
 * server's time (`stamp`, serverTimestamp() from the store), and nothing
 * undefined anywhere. The square footage is left out when it was never
 * typed; a place's label is left out when empty or the kind's own word. A
 * unit placement carries no `kind`. A machine that left the floor keeps its
 * spot (`gone`) after the ones on it, so bringing it back restores where it
 * stood.
 */
export function planDocument(
  working: { room: PlanRoom; placements: readonly Placement[]; gone?: readonly Placement[] },
  name: string,
  rev: number,
  uid: string,
  stamp: unknown,
  opts: { retired?: boolean } = {},
): Record<string, unknown> {
  const on = new Set(working.placements.map(placementId));
  const all = [...working.placements, ...(working.gone ?? []).filter((g) => !isPlanned(g) && !on.has(placementId(g)))];
  const { areaSqFt } = working.room;
  return withoutUndefined({
    v: 1,
    name,
    room: {
      ...(typeof areaSqFt === "number" ? { areaSqFt: r(areaSqFt) } : {}),
      boxes: working.room.boxes.map((b) => ({ id: b.id, x: r(b.x), y: r(b.y), w: r(b.w), h: r(b.h) })),
      places: working.room.places.map((p) => {
        const label = labelOf(p.label, p.kind);
        return { id: p.id, kind: p.kind, x: r(p.x), y: r(p.y), w: r(p.w), h: r(p.h), ...(label ? { label } : {}) };
      }),
    },
    placements: all.map(placementDoc),
    ...(opts.retired ? { retired: true } : {}),
    rev,
    updatedAt: stamp,
    updatedBy: uid,
  });
}

/* ------------------------------------------------------------------ *
 * The layout against the roster
 * ------------------------------------------------------------------ */

export interface FloorUnit {
  machineId: string;
  name: string;
  code: string;
  status: string;
}

/**
 * The layout against the floor, keyed by roster id, in the roster's walking
 * order: the machines placed, the ones not placed yet, the placements whose
 * machine is no longer on the floor (`gone`: kept in every write, never
 * drawn, named once in the editor), and the machines still to buy, apart
 * (never matched to a roster id, never "gone").
 */
export function reconcile<M extends FloorUnit>(
  plan: Pick<FloorPlanDoc, "placements"> | null,
  floor: readonly M[],
): { placed: { machine: M; placement: UnitPlacement }[]; unplaced: M[]; gone: UnitPlacement[]; planned: PlannedPlacement[] } {
  const byId = new Map<string, UnitPlacement>();
  const planned: PlannedPlacement[] = [];
  for (const p of plan?.placements ?? []) {
    if (isPlanned(p)) planned.push(p);
    else if (!byId.has(p.machineId)) byId.set(p.machineId, p);
  }
  const onFloor = new Set(floor.map((m) => m.machineId));
  const placed: { machine: M; placement: UnitPlacement }[] = [];
  const unplaced: M[] = [];
  for (const m of floor) {
    const p = byId.get(m.machineId);
    if (p) placed.push({ machine: m, placement: p });
    else unplaced.push(m);
  }
  const gone = [...byId.values()].filter((p) => !onFloor.has(p.machineId));
  return { placed, unplaced, gone, planned };
}

/* ------------------------------------------------------------------ *
 * Use this layout, Delete draft, and their Undo
 * ------------------------------------------------------------------ */

/** One write the store sends: a whole set at the document's next rev. There is no delete. */
export interface Op {
  kind: "set";
  id: string;
  data: PlanBody;
}

type Content = Pick<LoadedPlan, "room" | "placements">;

export interface UndoRecord {
  draftId: string;
  /** The revs the batch wrote: Undo applies only while every one still stands. */
  currentRev: number;
  slotRev: number;
  /** The free slot that took the old layout as "Before …" (a draft with planned machines), or null. */
  beforeSlot: { id: DraftSlot; rev: number; name: string } | null;
  /** The draft kept its own content (it held machines still to buy). */
  kept: boolean;
  /** What the documents held before; `current` null when there was none (no Undo then). */
  before: { current: Content | null; draft: Content & { name: string } };
}

const SHORT_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

/** "Oct 12, 3:40 PM", in the studio's day. */
function stampWords(nowMs: number, comma: boolean): string {
  const at = new Date(nowMs);
  return `${formatStudioDate(at, SHORT_DATE)}${comma ? "," : ""} ${formatStudioTime(at)}`;
}

/** The names a layout is given: the old layout kept after Use this layout, a conflict's copy, a new draft. */
export const draftNames = {
  /** "Before Oct 12, 3:40 PM" */
  before: (nowMs: number) => `Before ${stampWords(nowMs, true)}`,
  /** "AJ's, Oct 12 3:40 PM": the writer's first name, or "Kept" when it isn't known. */
  kept: (authorName: string | null | undefined, nowMs: number) => {
    const first = authorName?.trim().split(/\s+/)[0];
    return `${first ? `${first}'s` : "Kept"}, ${stampWords(nowMs, false)}`.slice(0, PLAN_LIMITS.name);
  },
  /** "Remodel 3", the slot's number. */
  draft: (slot: DraftSlot) => `Remodel ${slot.slice(2)}`,
};

const unitsOnly = (ps: readonly Placement[]): Placement[] => ps.filter((p) => !isPlanned(p));

/**
 * Use this layout. The draft becomes `current`; every write is rev-checked,
 * in one batch.
 *
 * - No machine still to buy on the draft: two sets. `current` takes the
 *   draft; the draft's own slot takes the old layout as "Before …" (or,
 *   with no old layout, is retired). Writing the slot at its rev + 1 is
 *   what proves the batch's source.
 * - Machines still to buy: `current` takes the draft's room and its UNITS
 *   only; the draft is written back unchanged at rev + 1 (the planned
 *   machines stay on it, and the write still proves the source); and, with
 *   an old layout and a free slot, that slot takes the old layout as
 *   "Before …". With no free slot that third write is left out.
 */
export function useLayoutOps(
  current: (Content & { rev: number }) | null,
  draft: Content & { id: string; rev: number; name: string },
  free: { id: DraftSlot; rev: number | null } | null,
  nowMs: number,
): { ops: Op[]; record: UndoRecord } {
  const currentRev = current ? current.rev + 1 : 1;
  const slotRev = draft.rev + 1;
  const kept = draft.placements.some(isPlanned);
  const ops: Op[] = [{ kind: "set", id: CURRENT_ID, data: { name: LAYOUT_NAME, room: draft.room, placements: unitsOnly(draft.placements), rev: currentRev } }];
  let beforeSlot: UndoRecord["beforeSlot"] = null;
  if (!kept) {
    ops.push(
      current
        ? { kind: "set", id: draft.id, data: { name: draftNames.before(nowMs), room: current.room, placements: current.placements, rev: slotRev } }
        : { kind: "set", id: draft.id, data: { name: draft.name, room: draft.room, placements: draft.placements, rev: slotRev, retired: true } },
    );
  } else {
    ops.push({ kind: "set", id: draft.id, data: { name: draft.name, room: draft.room, placements: draft.placements, rev: slotRev } });
    if (current && free && free.id !== draft.id) {
      const rev = free.rev === null ? 1 : free.rev + 1;
      const name = draftNames.before(nowMs);
      ops.push({ kind: "set", id: free.id, data: { name, room: current.room, placements: current.placements, rev } });
      beforeSlot = { id: free.id, rev, name };
    }
  }
  return {
    ops,
    record: {
      draftId: draft.id,
      currentRev,
      slotRev,
      beforeSlot,
      kept,
      before: {
        current: current ? { room: current.room, placements: current.placements } : null,
        draft: { name: draft.name, room: draft.room, placements: draft.placements },
      },
    },
  };
}

/**
 * Use this layout's Undo: null unless there was a layout before and every
 * document still stands at the rev the batch wrote. `current` goes back to
 * the old layout; then the draft back to its own content (it took the old
 * layout), or the "Before" slot retired (the draft kept its content).
 */
export function undoUseLayoutOps(record: UndoRecord, revsNow: { current: number; slot: number; before: number | null }): Op[] | null {
  if (!record.before.current) return null;
  if (revsNow.current !== record.currentRev || revsNow.slot !== record.slotRev) return null;
  if (record.beforeSlot && revsNow.before !== record.beforeSlot.rev) return null;
  const ops: Op[] = [{ kind: "set", id: CURRENT_ID, data: { name: LAYOUT_NAME, ...record.before.current, rev: record.currentRev + 1 } }];
  if (!record.kept) {
    ops.push({ kind: "set", id: record.draftId, data: { ...record.before.draft, rev: record.slotRev + 1 } });
  } else if (record.beforeSlot) {
    ops.push({
      kind: "set",
      id: record.beforeSlot.id,
      data: { name: record.beforeSlot.name, ...record.before.current, rev: record.beforeSlot.rev + 1, retired: true },
    });
  }
  return ops;
}

/** Delete draft: the slot retired at rev + 1, its content kept so the Undo can bring it back. */
export function retireOps(draft: Content & { id: string; rev: number; name: string }): Op[] {
  return [{ kind: "set", id: draft.id, data: { name: draft.name, room: draft.room, placements: draft.placements, rev: draft.rev + 1, retired: true } }];
}

/** Delete draft's Undo: the slot back without `retired`, at the retired copy's rev + 1. */
export function restoreOps(retired: Content & { id: string; rev: number; name: string }): Op[] {
  return [{ kind: "set", id: retired.id, data: { name: retired.name, room: retired.room, placements: retired.placements, rev: retired.rev + 1 } }];
}

/** A stored document as the editor holds it. */
export function loadedPlanOf(id: string, plan: FloorPlanDoc, updatedAtMs: number): LoadedPlan {
  return {
    id,
    name: plan.name,
    rev: plan.rev,
    retired: plan.retired === true,
    room: plan.room,
    placements: plan.placements,
    updatedAtMs,
    updatedBy: plan.updatedBy,
  };
}
