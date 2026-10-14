/**
 * WHAT THE SCRIPT WRITES FOR A FILEMAKER FLOOR — the pure half of
 * scripts/build-floors-from-filemaker.ts (Oct 12 2026; read floors.ts and
 * this folder's README first).
 *
 * One roster document per unit, in FileMaker's order (`order` 1..n, the
 * walking order the floor editor keeps):
 *
 *  - THE UNIT THAT FOLLOWS THE STANDARD, one per movement: the Imagine
 *    Strength unit if FileMaker names one, else the first in FileMaker's
 *    order (AJ). A catalog copy at the movement's own id, its floor name in
 *    `overrides.name`, live-inheriting everything else.
 *  - EVERY OTHER UNIT OF THAT MOVEMENT: the studio's own machine
 *    (`source: "custom"`, `basedOn` the movement), carrying the movement's
 *    definition as the catalog document holds it today, copied once — a
 *    custom entry inherits nothing (resolveMachine), so a later correction
 *    reaches the first unit only. Its set-up guide stays its own: the app
 *    looks a guide up by a unit's own id, never its lineage (equipment
 *    adapters' knowledgeOf).
 *  - A STUDIO'S OWN MACHINE with no MSF movement (Calf): custom, no lineage,
 *    a name and FileMaker's dials only.
 *
 * THE DIALS ("build both for now", AJ): `standard` leaves a catalog copy's
 * dials to the catalog and gives a second unit the movement's; `filemaker`
 * gives every unit FileMaker's letters. A studio's own machine has no
 * standard, so it takes FileMaker's letters either way. A catalog copy whose
 * FileMaker chart shows no dials keeps the standard's in both, because an
 * empty list on a copy falls back to the catalog's anyway (floor-machines'
 * toFloorMachines), and saying otherwise would be untrue.
 *
 * `planDialSwitch` changes only the dials, and only on a unit nobody has
 * saved since the script wrote it (`updatedBy` is still the script's).
 * `planRemove` is stricter, because some of the app's writes (a unit's size
 * and model on the Sizes sheet, the walking-order reset) don't restamp
 * `updatedBy`: it deletes only a unit that is EXACTLY as the script wrote it.
 *
 * PURE: no Firestore. The server's time is the caller's to add.
 */

import type { MachineDefinition, MachineSettingField } from "../../types/machines";
import { settingFieldKey, studioMachineId } from "../../types/machines";
import { stripUndefined } from "../admin/machines/definition-defaults";
import { definitionFieldsOnly } from "../../lib/machine-template";
import { IMAGINE_STRENGTH_MODELS } from "../studio-map/imagine-strength";
import type { FilemakerFloor, FloorUnitSpec } from "./floors";

/** Who wrote a unit, on every document the script writes. A person's save replaces it with their uid. */
export const FLOORS_SCRIPT_SIGNATURE = "floors-from-filemaker";

export type DialSet = "standard" | "filemaker";

export type UnitKind = "standard" | "second" | "own";

/** A catalog document as Firestore holds it (production's carry the dial labels as `settingOptions`). */
export type CatalogDoc = Record<string, unknown>;

export interface PlannedUnit {
  order: number;
  fm: string;
  movement: string | null;
  kind: UnitKind;
  id: string;
  modelId: string | null;
  /** The labels each dial set would give this unit, for the dry run. */
  standardDials: string[];
  filemakerDials: string[];
  /** The roster document, without updatedAt (the caller adds the server's time). */
  doc: Record<string, unknown>;
}

export interface FloorPlan {
  studioId: string;
  units: PlannedUnit[];
  problems: string[];
}

const isImagine = (u: FloorUnitSpec) => u.imagineStrength === true;

/** Which unit of each movement follows the standard: the Imagine Strength one, else the first. */
export function standardIndexes(units: readonly FloorUnitSpec[]): Map<string, number> {
  const out = new Map<string, number>();
  units.forEach((u, i) => {
    if (!u.movement) return;
    const held = out.get(u.movement);
    if (held === undefined) out.set(u.movement, i);
    else if (isImagine(u) && !isImagine(units[held])) out.set(u.movement, i);
  });
  return out;
}

/** Imagine Strength's model for a movement, from the twenty head office records. */
export function imagineModelFor(movement: string): string | null {
  return IMAGINE_STRENGTH_MODELS.find((m) => m.movementId === movement)?.id ?? null;
}

/** Labels to setting fields: the key is the label's slug, as the editor mints one. */
export function fieldsFromLabels(labels: readonly string[]): MachineSettingField[] {
  return labels.map((label) => ({ key: settingFieldKey(label), label, type: "text" as const }));
}

/** The standard's dial labels as the app shows them: the document's fields, else its legacy `settingOptions`. */
export function standardLabels(doc: CatalogDoc | undefined): string[] {
  if (!doc) return [];
  const fields = doc.settingFields;
  if (Array.isArray(fields) && fields.length) {
    return fields
      .map((f) => String((f as { label?: unknown; key?: unknown }).label ?? (f as { key?: unknown }).key ?? "").trim())
      .filter(Boolean);
  }
  const options = doc.settingOptions;
  return Array.isArray(options) ? options.map((o) => String(o).trim()).filter(Boolean) : [];
}

/**
 * A second unit's definition: ONLY the definition fields the catalog
 * document holds, under the unit's name and dials — never the blank
 * machine's filled-in defaults (definitionOf's "no handoff", "compound-
 * linear", a 6/6 cadence), which the Catalog would read over the knowledge
 * base's real facts (catalog/adapters.ts reads `execution.requiresHandoff ??`
 * the knowledge base). The standard unit beside it resolves from the same
 * bare document, so the two say the same things. The review found it, Oct 12.
 */
function secondUnitDefinition(doc: CatalogDoc, name: string, fields: MachineSettingField[]): MachineDefinition {
  const { modelId: _referenceModel, ...rest } = definitionFieldsOnly(doc) as MachineDefinition;
  return stripUndefined({ ...rest, name, settingFields: fields, defaultSettings: {} } as MachineDefinition);
}

/** A studio's own machine: its name and dials, nothing invented. */
function ownDefinition(name: string, fields: MachineSettingField[]): MachineDefinition {
  return { name, settingFields: fields, defaultSettings: {} } as unknown as MachineDefinition;
}

/** The dials a unit gets in one set, as labels. */
export function dialLabelsFor(kind: UnitKind, unit: FloorUnitSpec, doc: CatalogDoc | undefined, dials: DialSet): string[] {
  if (kind === "own") return [...unit.dials];
  if (dials === "standard") return standardLabels(doc);
  // A copy with nothing in FileMaker keeps the standard's (see the header).
  if (kind === "standard" && unit.dials.length === 0) return standardLabels(doc);
  return [...unit.dials];
}

/** Every unit's document, given the catalog's documents by id. */
export function planFloor(
  floor: FilemakerFloor,
  catalog: Readonly<Record<string, CatalogDoc>>,
  dials: DialSet,
): FloorPlan {
  const problems: string[] = [];
  const standards = standardIndexes(floor.units);
  const taken = new Set<string>();
  const units: PlannedUnit[] = [];

  floor.units.forEach((u, i) => {
    const order = i + 1;
    const doc = u.movement ? catalog[u.movement] : undefined;
    if (u.movement && !doc) problems.push(`${u.fm}: the catalog has no ${u.movement}`);
    const kind: UnitKind = !u.movement ? "own" : standards.get(u.movement) === i ? "standard" : "second";

    let id = kind === "standard" ? u.movement! : studioMachineId(floor.studioId, u.fm);
    if (kind !== "standard") {
      const base = id;
      for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
    }
    if (taken.has(id)) problems.push(`${u.fm}: two units would share the id ${id}`);
    taken.add(id);

    const modelId = isImagine(u) && u.movement ? imagineModelFor(u.movement) : null;
    if (isImagine(u) && !modelId) problems.push(`${u.fm}: no Imagine Strength model for ${u.movement}`);

    const labels = dialLabelsFor(kind, u, doc, dials);
    const keys = labels.map(settingFieldKey);
    if (new Set(keys).size !== keys.length) problems.push(`${u.fm}: two dials share a key (${keys.join(", ")})`);
    if (keys.some((k) => !k)) problems.push(`${u.fm}: a dial has no letters or digits`);
    const fields = fieldsFromLabels(labels);

    const base = {
      machineId: id,
      studioId: floor.studioId,
      status: "active",
      order,
      ...(modelId ? { modelId } : {}),
      updatedBy: FLOORS_SCRIPT_SIGNATURE,
    };

    let data: Record<string, unknown>;
    if (kind === "standard") {
      // The standard's own dials are no override at all: the copy keeps inheriting them.
      const ownDials = dials === "filemaker" && u.dials.length > 0;
      data = {
        ...base,
        source: "catalog",
        basedOn: u.movement,
        overrides: { name: u.fm, ...(ownDials ? { settingFields: fields } : {}) },
      };
    } else if (kind === "second") {
      data = {
        ...base,
        source: "custom",
        basedOn: u.movement,
        definition: doc ? secondUnitDefinition(doc, u.fm, fields) : ownDefinition(u.fm, fields),
      };
    } else {
      data = { ...base, source: "custom", definition: ownDefinition(u.fm, fields) };
    }

    units.push({
      order,
      fm: u.fm,
      movement: u.movement,
      kind,
      id,
      modelId,
      standardDials: dialLabelsFor(kind, u, doc, "standard"),
      filemakerDials: dialLabelsFor(kind, u, doc, "filemaker"),
      doc: data,
    });
  });

  return { studioId: floor.studioId, units, problems };
}

/** One unit's change of dials: Firestore field paths, a null meaning "delete the field". */
export interface DialUpdate {
  id: string;
  fm: string;
  fields: Record<string, unknown>;
}

export interface DialSwitchPlan {
  updates: DialUpdate[];
  /** Units a person has saved since the script wrote them, or that are not there: named, never touched. */
  skipped: { id: string; fm: string; why: string }[];
  /** Units already on the asked-for dials. */
  unchanged: string[];
}

const sameLabels = (a: unknown, b: readonly string[]) =>
  Array.isArray(a) &&
  a.length === b.length &&
  a.every((f, i) => (f as { label?: unknown }).label === b[i] && (f as { key?: unknown }).key === settingFieldKey(b[i]));

/**
 * Switch the floor the script built to another dial set. `roster` is the
 * studio's roster as read now, by id. Only the dials move: a catalog copy's
 * `overrides.settingFields` (deleted for the standard's), a custom unit's
 * `definition.settingFields` and its `definition.defaultSettings` (emptied,
 * because a default for a dial that is gone means nothing).
 */
export function planDialSwitch(
  floor: FilemakerFloor,
  catalog: Readonly<Record<string, CatalogDoc>>,
  roster: Readonly<Record<string, Record<string, unknown>>>,
  dials: DialSet,
): DialSwitchPlan {
  const target = planFloor(floor, catalog, dials);
  const out: DialSwitchPlan = { updates: [], skipped: [], unchanged: [] };

  for (const unit of target.units) {
    const now = roster[unit.id];
    if (!now) {
      out.skipped.push({ id: unit.id, fm: unit.fm, why: "not on the floor" });
      continue;
    }
    if (now.updatedBy !== FLOORS_SCRIPT_SIGNATURE) {
      out.skipped.push({ id: unit.id, fm: unit.fm, why: "saved by a person since the script wrote it" });
      continue;
    }
    if (unit.kind === "own") {
      out.unchanged.push(unit.id);
      continue;
    }
    if (unit.kind === "standard") {
      const want = (unit.doc.overrides as { settingFields?: MachineSettingField[] }).settingFields;
      const has = (now.overrides as { settingFields?: unknown } | undefined)?.settingFields;
      if (want ? sameLabels(has, want.map((f) => f.label)) : has === undefined) {
        out.unchanged.push(unit.id);
        continue;
      }
      out.updates.push({ id: unit.id, fm: unit.fm, fields: { "overrides.settingFields": want ?? null } });
      continue;
    }
    const want = (unit.doc.definition as MachineDefinition).settingFields;
    const has = (now.definition as { settingFields?: unknown } | undefined)?.settingFields;
    if (sameLabels(has, want.map((f) => f.label))) {
      out.unchanged.push(unit.id);
      continue;
    }
    out.updates.push({
      id: unit.id,
      fm: unit.fm,
      fields: { "definition.settingFields": want, "definition.defaultSettings": {} },
    });
  }
  return out;
}

/** The same document, whatever the order of its keys (Firestore's server time aside). */
export function sameDoc(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .filter((k) => k !== "updatedAt")
          .sort()
          .map((k) => [k, canon((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

/** Units the script signed that the table no longer names (a renamed unit's old id, say): named, never touched. */
export function unitsNotInTable(
  floor: FilemakerFloor,
  catalog: Readonly<Record<string, CatalogDoc>>,
  roster: Readonly<Record<string, Record<string, unknown>>>,
): string[] {
  const planned = new Set(planFloor(floor, catalog, "standard").units.map((u) => u.id));
  return Object.keys(roster).filter((id) => roster[id].updatedBy === FLOORS_SCRIPT_SIGNATURE && !planned.has(id));
}

export interface RemovePlan {
  remove: { id: string; fm: string }[];
  kept: { id: string; fm: string; why: string }[];
  notInTable: string[];
}

/**
 * The way back, for before trainers use the floor: only a unit that is
 * exactly as the script wrote it (with either set of dials) is deleted. A
 * unit a person changed in any way, even by a write that leaves `updatedBy`
 * alone, is named and kept; so is one the table no longer names.
 */
export function planRemove(
  floor: FilemakerFloor,
  catalog: Readonly<Record<string, CatalogDoc>>,
  roster: Readonly<Record<string, Record<string, unknown>>>,
): RemovePlan {
  const sets = (["standard", "filemaker"] as const).map((d) => planFloor(floor, catalog, d).units);
  const out: RemovePlan = { remove: [], kept: [], notInTable: unitsNotInTable(floor, catalog, roster) };
  sets[0].forEach((unit, i) => {
    const now = roster[unit.id];
    if (!now) return;
    if (sameDoc(now, unit.doc) || sameDoc(now, sets[1][i].doc)) out.remove.push({ id: unit.id, fm: unit.fm });
    else out.kept.push({ id: unit.id, fm: unit.fm, why: "changed since the script wrote it" });
  });
  return out;
}
