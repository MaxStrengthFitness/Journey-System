import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import { draftOf, MODEL_LIMITS, modelIdFor, modelProblems } from "../machine-codex/models";
import {
  IMAGINE_STRENGTH_BRAND,
  IMAGINE_STRENGTH_MODELS,
  IMAGINE_STRENGTH_SEED_BY,
  IMAGINE_STRENGTH_SOURCE,
  removePlan,
  seedModelDocument,
  seedPlan,
} from "./imagine-strength";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("the Imagine Strength seed", () => {
  it("names each model by the app's own id", () => {
    for (const row of IMAGINE_STRENGTH_MODELS) expect(row.id).toBe(modelIdFor(IMAGINE_STRENGTH_BRAND, row.model));
    expect(new Set(IMAGINE_STRENGTH_MODELS.map((r) => r.id)).size).toBe(20);
  });

  it("has one model for each of the twenty MSF movements", () => {
    expect(IMAGINE_STRENGTH_MODELS.map((r) => r.movementId).sort()).toEqual(Object.keys(MACHINE_DEFINITIONS).sort());
  });

  it("keeps every length inside what the rules accept", () => {
    for (const r of IMAGINE_STRENGTH_MODELS) {
      for (const mm of [r.lengthMm, r.widthMm, r.heightMm]) {
        expect(Number.isInteger(mm), r.id).toBe(true);
        expect(mm, r.id).toBeGreaterThanOrEqual(MODEL_LIMITS.sizeMinMm);
        expect(mm, r.id).toBeLessThanOrEqual(MODEL_LIMITS.sizeMaxMm);
      }
    }
  });

  it("gives every doubtful row a note, and every dry-run fact a line of its own", () => {
    for (const r of IMAGINE_STRENGTH_MODELS) {
      if (r.flags.some((f) => f === "length-doubtful" || f === "copied-entry" || f === "match-inferred")) {
        expect(r.note, r.id).toBeTruthy();
      }
      if (r.flags.some((f) => f === "height-revision" || f === "weight-doubtful")) expect(r.dryRunOnly, r.id).toBeTruthy();
    }
  });

  it("stores notes in feet and inches only, naming no retailer, within the note's limit", () => {
    for (const r of IMAGINE_STRENGTH_MODELS) {
      if (!r.note) continue;
      expect(r.note, r.id).not.toMatch(/\bmm\b|\bcm\b|millimet/i);
      expect(r.note, r.id).not.toMatch(/triumph|retail/i);
      expect(r.note.length, r.id).toBeLessThanOrEqual(MODEL_LIMITS.sizeNote);
    }
  });

  it("writes only what isn't there, and a second run writes nothing", () => {
    const first = seedPlan(new Set());
    expect(first.write.length).toBe(20);
    expect(first.skip).toEqual([]);
    const edited = IMAGINE_STRENGTH_MODELS[3].id;
    expect(seedPlan(new Set([edited])).skip).toEqual([edited]);
    expect(seedPlan(new Set(IMAGINE_STRENGTH_MODELS.map((r) => r.id))).write).toEqual([]);
  });

  it("takes back only its own unedited models that no unit names", () => {
    const [a, b, c] = IMAGINE_STRENGTH_MODELS.map((r) => r.id);
    const found: Record<string, { updatedBy: unknown } | null> = Object.fromEntries(
      IMAGINE_STRENGTH_MODELS.map((r) => [r.id, { updatedBy: IMAGINE_STRENGTH_SEED_BY }]),
    );
    found[a] = { updatedBy: "uid-admin" };
    found[c] = null;
    const plan = removePlan(found, { [b]: ["solon/m-leg-press"] });
    expect(plan.edited).toEqual([a]);
    expect(plan.named).toEqual([{ id: b, units: ["solon/m-leg-press"] }]);
    expect(plan.absent).toEqual([c]);
    expect(plan.remove.length).toBe(17);
    expect(plan.remove).not.toContain(a);
  });

  it("builds documents the model editor and the rules both accept", () => {
    const rules = readFileSync(join(ROOT, "firestore.rules"), "utf8");
    const modelKeys = /function machineModelValid\(d\) \{\s*return d\.keys\(\)\.hasOnly\(\[([^\]]+)\]\)/.exec(rules);
    const sizeKeys = /function modelSizeValid\(s\) \{[\s\S]*?s\.keys\(\)\.hasOnly\(\[([^\]]+)\]\)/.exec(rules);
    expect(modelKeys && sizeKeys).toBeTruthy();
    const list = (m: RegExpExecArray) => m[1].split(",").map((k) => k.trim().replace(/'/g, ""));
    for (const row of IMAGINE_STRENGTH_MODELS) {
      const doc = seedModelDocument(row);
      expect(doc.size.source).toBe(IMAGINE_STRENGTH_SOURCE);
      for (const k of [...Object.keys(doc), "updatedAt", "updatedBy"]) expect(list(modelKeys!), `${row.id}: ${k}`).toContain(k);
      for (const k of Object.keys(doc.size)) expect(list(sizeKeys!), `${row.id}: size.${k}`).toContain(k);
      expect(modelProblems(draftOf(doc)), row.id).toEqual([]);
    }
  });
});
