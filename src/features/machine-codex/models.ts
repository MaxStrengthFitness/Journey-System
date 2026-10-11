/**
 * THE MODEL RECORD — machineModels/{modelId} (Codex R2, Sep 28 2026).
 *
 * A seat 4 on a Nautilus is not a seat 4 on a Hoist. The model is the tier
 * between the movement (a catalog machine) and the unit (a studio's roster
 * entry): the dials and stacks every unit of one maker's model shares,
 * written once by an administrator and pointed at by each unit
 * (`RosterEntryBase.modelId`). The weekly machine-trends job pools settings
 * per model; weights keep pooling per movement.
 *
 * The document's shape is EXACTLY `MachineModel` in types/machines.ts —
 * { brand, model, movementId, dials?, notes?, size?, updatedAt, updatedBy } —
 * and firestore.rules holds it to that. `size` (the studio map, Oct 2026) is
 * the frame at rest in whole mm with its source, edited in inches. This file builds one (`modelDocument`),
 * checks one (`modelProblems`), mints its id once (`modelIdFor`) and names
 * one (`modelLabel`). PURE.
 */

import type { KnownSize, MachineModel, MachineSettingField, ModelDial, ModelSize } from "../../types/machines";
import { settingFieldKey } from "../../types/machines";

/** Every model id starts so, which keeps it apart from a machine id at a glance. */
export const MODEL_ID_PREFIX = "mm-";

/** Limits the rules hold too (firestore.rules, "WAVE 2 CODEX: the model record"). */
export const MODEL_LIMITS = {
  brand: 60,
  model: 80,
  notes: 2000,
  dials: 20,
  movementId: 100,
  /** A size's lengths in whole mm (the studio map): firestore.rules' sizeMmOk holds the same two. */
  sizeMinMm: 250,
  sizeMaxMm: 6100,
  sizeSource: 200,
  sizeNote: 400,
} as const;

/** A length as the editor takes it, in inches: 12 to 240 (1 to 20 ft). */
export const SIZE_INCHES = { min: 12, max: 240 } as const;

const MM_PER_INCH = 25.4;

/**
 * A length typed in inches ("62.8"), as whole millimetres, or null when it
 * isn't a number of inches with at most one decimal. The range is
 * `modelProblems`' to judge.
 */
export function inchesToMm(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,4}(\.\d)?$/.test(t)) return null;
  return Math.round(Number(t) * MM_PER_INCH);
}

/** Whole millimetres as inches with one decimal, for the editor ("1594" → "62.8"). */
function mmToInchesText(mm: unknown): string {
  return typeof mm === "number" && Number.isFinite(mm) && mm > 0 ? String(Math.round((mm / MM_PER_INCH) * 10) / 10) : "";
}

const sizeMmOk = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= MODEL_LIMITS.sizeMinMm && v <= MODEL_LIMITS.sizeMaxMm;

/**
 * A stored model's size, or null when it isn't one a screen can stand
 * behind (the studio map). Tolerant: Firestore documents are untyped at
 * runtime. The length and width must be lengths the rules would accept and
 * the source must be said; a height that isn't one reads as not on file.
 * Both model reads share it: the codex store's and the Catalog's.
 */
export function modelSizeOf(raw: unknown): (KnownSize & { source: string; note: string | null }) | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as { lengthMm?: unknown; widthMm?: unknown; heightMm?: unknown; source?: unknown; note?: unknown };
  if (!sizeMmOk(s.lengthMm) || !sizeMmOk(s.widthMm)) return null;
  const source = typeof s.source === "string" ? s.source.trim() : "";
  if (!source) return null;
  const note = typeof s.note === "string" && s.note.trim() ? s.note.trim() : null;
  return {
    lengthMm: Math.round(s.lengthMm),
    widthMm: Math.round(s.widthMm),
    heightMm: sizeMmOk(s.heightMm) ? Math.round(s.heightMm) : null,
    source,
    note,
  };
}

/**
 * "Hoist" + "ROC-IT Leg Press" → "mm-hoist-roc-it-leg-press". Minted ONCE,
 * when the model is created, and never again: the id is a foreign key on
 * every unit that names the model and in the trends job's pools, so a later
 * rename of the brand or model keeps the id it was born with.
 */
export function modelIdFor(brand: string, model: string): string {
  const slug = `${brand} ${model}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${MODEL_ID_PREFIX}${slug || "model"}`;
}

/** "Hoist ROC-IT Leg Press" — the brand, then the model, never cut short. */
export function modelLabel(m: Pick<MachineModel, "brand" | "model"> | null | undefined): string {
  if (!m) return "";
  const brand = (m.brand ?? "").trim();
  const model = (m.model ?? "").trim();
  if (!brand) return model;
  if (!model) return brand;
  // "Hoist" + "Hoist ROC-IT" should not read "Hoist Hoist ROC-IT".
  return model.toLowerCase().startsWith(brand.toLowerCase()) ? model : `${brand} ${model}`;
}

/** What the editor holds while an administrator types. */
export interface ModelDraft {
  brand: string;
  model: string;
  movementId: string;
  dials: ModelDial[];
  notes: string;
  /** Its size (the studio map): the three lengths in inches as typed, one decimal allowed. */
  size: ModelSizeDraft;
}

export interface ModelSizeDraft {
  length: string;
  width: string;
  height: string;
  source: string;
  note: string;
}

const emptySizeDraft = (): ModelSizeDraft => ({ length: "", width: "", height: "", source: "", note: "" });

export function emptyModelDraft(movementId = ""): ModelDraft {
  return { brand: "", model: "", movementId, dials: [], notes: "", size: emptySizeDraft() };
}

/** A stored model as the editor's draft. Untrusted input: every part is checked. */
export function draftOf(raw: Partial<MachineModel> | null | undefined): ModelDraft {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const dials = Array.isArray(raw?.dials)
    ? raw!.dials.filter((d): d is ModelDial => !!d && typeof d.key === "string" && typeof d.label === "string")
    : [];
  return {
    brand: str(raw?.brand),
    model: str(raw?.model),
    movementId: str(raw?.movementId),
    dials: dials.map((d) => ({ ...d })),
    notes: str(raw?.notes),
    size: sizeDraftOf(raw?.size),
  };
}

/** A stored size as the editor's inches. Junk reads as empty, never as a number. */
function sizeDraftOf(raw: unknown): ModelSizeDraft {
  if (!raw || typeof raw !== "object") return emptySizeDraft();
  const s = raw as { lengthMm?: unknown; widthMm?: unknown; heightMm?: unknown; source?: unknown; note?: unknown };
  return {
    length: mmToInchesText(s.lengthMm),
    width: mmToInchesText(s.widthMm),
    height: mmToInchesText(s.heightMm),
    source: typeof s.source === "string" ? s.source : "",
    note: typeof s.note === "string" ? s.note : "",
  };
}

/** What the draft's size says, worked out once for the checks and the document. */
function sizeOfDraft(z: ModelSizeDraft | undefined) {
  const t = z ?? emptySizeDraft();
  const length = t.length.trim();
  const width = t.width.trim();
  const height = t.height.trim();
  const source = t.source.trim();
  const note = t.note.trim();
  return { length, width, height, source, note, given: !!(length || width || height || source || note) };
}

const inchesOk = (text: string) => {
  const mm = inchesToMm(text);
  return mm !== null && Number(text) >= SIZE_INCHES.min && Number(text) <= SIZE_INCHES.max;
};

/**
 * What stops a save, named — never a greyed-out button. Empty means the
 * model can be written.
 */
export function modelProblems(d: ModelDraft): string[] {
  const out: string[] = [];
  const brand = d.brand.trim();
  const model = d.model.trim();
  if (!brand) out.push("Give it a brand — Hoist, Nautilus, MedX.");
  if (!model) out.push("Give it a model name — ROC-IT Leg Press.");
  if (!d.movementId.trim()) out.push("Say which MSF movement it is.");
  if (brand.length > MODEL_LIMITS.brand) out.push(`The brand is longer than ${MODEL_LIMITS.brand} characters.`);
  if (model.length > MODEL_LIMITS.model) out.push(`The model name is longer than ${MODEL_LIMITS.model} characters.`);
  if (d.notes.length > MODEL_LIMITS.notes) out.push(`The notes are longer than ${MODEL_LIMITS.notes} characters.`);
  const dials = d.dials.filter((x) => x.label.trim());
  if (dials.length > MODEL_LIMITS.dials) out.push(`A model can list up to ${MODEL_LIMITS.dials} dials.`);
  const keys = new Set<string>();
  for (const x of dials) {
    const k = x.key.trim() || settingFieldKey(x.label);
    if (keys.has(k)) out.push(`Two dials share the key “${k}”.`);
    keys.add(k);
  }
  const z = sizeOfDraft(d.size);
  if (z.given) {
    if (!z.length || !z.width) out.push("Give both the length and the width, or neither.");
    if ([z.length, z.width, z.height].some((v) => v && !inchesOk(v))) out.push("Lengths are 12 to 240 inches.");
    if (z.length && z.width && !z.source) out.push("Say where the size came from.");
    if (z.source.length > MODEL_LIMITS.sizeSource) out.push(`The source is longer than ${MODEL_LIMITS.sizeSource} characters.`);
    if (z.note.length > MODEL_LIMITS.sizeNote) out.push(`The note is longer than ${MODEL_LIMITS.sizeNote} characters.`);
  }
  return out;
}

/**
 * The document to write, without its stamp (the store adds `updatedAt` and
 * `updatedBy`). Empty parts are left out rather than stored as "" or [], so
 * the document holds only what the model actually says.
 */
export function modelDocument(d: ModelDraft): Omit<MachineModel, "updatedAt" | "updatedBy"> {
  const dials: ModelDial[] = d.dials
    .filter((x) => x.label.trim())
    .map((x) => {
      const out: ModelDial = { key: x.key.trim() || settingFieldKey(x.label), label: x.label.trim() };
      if (x.letter?.trim()) out.letter = x.letter.trim();
      if (x.type) out.type = x.type;
      if (x.options?.length) out.options = x.options.map((o) => o.trim()).filter(Boolean);
      if (typeof x.min === "number" && Number.isFinite(x.min)) out.min = x.min;
      if (typeof x.max === "number" && Number.isFinite(x.max)) out.max = x.max;
      if (typeof x.step === "number" && Number.isFinite(x.step)) out.step = x.step;
      if (x.default?.trim()) out.default = x.default.trim();
      if (out.options && out.options.length === 0) delete out.options;
      return out;
    });
  const doc: Omit<MachineModel, "updatedAt" | "updatedBy"> = {
    brand: d.brand.trim(),
    model: d.model.trim(),
    movementId: d.movementId.trim(),
  };
  if (dials.length) doc.dials = dials;
  if (d.notes.trim()) doc.notes = d.notes.trim();
  // The size only when both the length and the width are given: the whole
  // `size` key is never written empty, null or undefined.
  const z = sizeOfDraft(d.size);
  const lengthMm = z.length ? inchesToMm(z.length) : null;
  const widthMm = z.width ? inchesToMm(z.width) : null;
  if (lengthMm !== null && widthMm !== null) {
    const size: ModelSize = { lengthMm, widthMm, source: z.source };
    const heightMm = z.height ? inchesToMm(z.height) : null;
    if (heightMm !== null) size.heightMm = heightMm;
    if (z.note) size.note = z.note;
    doc.size = size;
  }
  return doc;
}

/** A model's dials as the movement's dials, to start a model from the standard. */
export function dialsFromMovement(fields: readonly MachineSettingField[] | undefined): ModelDial[] {
  return (fields ?? []).map((f) => {
    const d: ModelDial = { key: f.key, label: f.label || f.key };
    if (f.letter) d.letter = f.letter;
    if (f.type) d.type = f.type;
    if (f.options?.length) d.options = [...f.options];
    return d;
  });
}

export interface ModelWithId extends MachineModel {
  id: string;
}

/** The models of one movement, by label. */
export function modelsFor<T extends Pick<ModelWithId, "brand" | "model" | "movementId">>(
  models: readonly T[],
  movementId: string | null | undefined,
): T[] {
  if (!movementId) return [];
  return models
    .filter((m) => m.movementId === movementId)
    .sort((a, b) => modelLabel(a).localeCompare(modelLabel(b)));
}

/** "4 dials: G · P · SP · S" or "No dials recorded". */
export function dialSummary(m: Pick<MachineModel, "dials">): string {
  const dials = m.dials ?? [];
  if (dials.length === 0) return "No dials recorded";
  const names = dials.map((d) => d.letter || d.label).join(" · ");
  return `${dials.length} ${dials.length === 1 ? "dial" : "dials"}: ${names}`;
}
