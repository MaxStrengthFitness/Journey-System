import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { KnownSize } from "../../../types/machines";
import { AdminButton, AdminInput } from "../../admin/primitives";
import { modelsOfMovement, type ModelsRead } from "../../catalog/models";
import { ACADEMY_MOVEMENT_NAME, MOVEMENT_IDS } from "../../catalog/names";
import { ACADEMY_CATEGORIES, CATEGORY_LABEL, MACHINE_CATEGORY } from "../../routine-builder/academy";
import { useUnsavedChanges } from "../../unsaved-changes";
import { PLAN_LIMITS } from "../layout";
import { plannedLabel } from "../planned";
import { sizeLine } from "../units";
import { SizeForm } from "./SizeForm";
import "../../admin/admin.css";
import "../studio-map.css";

/** What the sheet hands back: the machine, its model or typed size, and its name. */
export interface PlannedChoice {
  movementId: string | null;
  modelId: string | null;
  label: string;
  typed: KnownSize | null;
}

type SizeWay = { kind: "model"; modelId: string } | { kind: "typed"; size: KnownSize | null } | { kind: "unknown" };

const SOMETHING_ELSE = "__else";

/**
 * ADD A MACHINE TO BUY (the studio map, Oct 2026): a remodel plan's sheet
 * for a machine the studio doesn't own yet (AJ, Oct 11 2026, Q2: "AJ
 * agrees"; drafts only). Three steps, top to bottom:
 *
 *   1. Which machine: the MSF movements by the Academy's five families, or
 *      Something else with a name of the leader's own.
 *   2. Its size: one of the movement's recorded models, each with its size
 *      line; or Type its size (the same form as Measure); or Size not known
 *      yet (drawn as a round marker).
 *   3. Add it (blue), which places it on the plan where there is room.
 *
 * What is chosen is unsaved work until Add it: leaving asks. The size of a
 * model is never copied onto the plan; it is looked up live, so a
 * correction to the model reaches every plan.
 */
export function PlanMachineSheet({
  models,
  onAdd,
  onCancel,
  guardRef,
}: {
  models: ModelsRead;
  onAdd: (choice: PlannedChoice) => void;
  onCancel: () => void;
  /** The sheet's own question about its typing, for the host's close (the X, a tap outside). */
  guardRef?: MutableRefObject<((proceed: () => void) => void) | null>;
}) {
  const [movement, setMovement] = useState<string | null>(null);
  const [otherName, setOtherName] = useState("");
  const [way, setWay] = useState<SizeWay | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const reset = () => {
    setMovement(null);
    setOtherName("");
    setWay(null);
    setProblem(null);
  };
  const dirty = movement !== null || way !== null || otherName.trim() !== "";
  const { guard } = useUnsavedChanges(dirty, "the machine to buy", { onDiscard: reset });
  useEffect(() => {
    if (!guardRef) return;
    guardRef.current = guard;
    return () => {
      guardRef.current = null;
    };
  }, [guard, guardRef]);

  const isElse = movement === SOMETHING_ELSE;
  const movementId = movement && !isElse ? movement : null;
  const recorded = useMemo(
    () => (movementId && models.state === "ready" ? modelsOfMovement(models.models, movementId).filter((m) => m.size) : []),
    [movementId, models],
  );
  const pickedModel = way?.kind === "model" ? (recorded.find((m) => m.id === way.modelId) ?? null) : null;

  const groups = ACADEMY_CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABEL[c], ids: MOVEMENT_IDS.filter((id) => MACHINE_CATEGORY[id] === c) }));

  const pickMovement = (id: string) => {
    setMovement(id);
    setWay(null);
    setProblem(null);
  };

  const add = () => {
    if (!movement) {
      setProblem("Pick the machine first.");
      return;
    }
    const name = isElse ? otherName.replace(/\s+/g, " ").trim() : plannedLabel(ACADEMY_MOVEMENT_NAME[movement] ?? null, pickedModel?.model ?? null);
    if (!name || name.length > PLAN_LIMITS.plannedLabel) {
      setProblem(`Name it in 1 to ${PLAN_LIMITS.plannedLabel} characters.`);
      return;
    }
    if (way?.kind === "typed" && !way.size) {
      setProblem("Save its size first, or pick Size not known yet.");
      return;
    }
    onAdd({
      movementId,
      modelId: pickedModel?.id ?? null,
      label: name,
      typed: way?.kind === "typed" ? way.size : null,
    });
    reset();
  };

  const pressed = (on: boolean) => ({ "aria-pressed": on });

  return (
    <div className="smap-plan">
      <section className="smap-plan__step" aria-labelledby="smap-plan-which">
        <h3 id="smap-plan-which" className="smap-h">
          Which machine
        </h3>
        {groups.map((g) => (
          <div key={g.key} className="smap-plan__group" role="group" aria-label={g.label}>
            <p className="smap-plan__family">{g.label}</p>
            <div className="smap-chips">
              {g.ids.map((id) => (
                <button key={id} type="button" className="smap-chip" {...pressed(movement === id)} onClick={() => pickMovement(id)}>
                  <span className="smap-chip__name">{ACADEMY_MOVEMENT_NAME[id]}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="smap-chips">
          <button type="button" className="smap-chip" {...pressed(isElse)} onClick={() => pickMovement(SOMETHING_ELSE)}>
            <span className="smap-chip__name">Something else</span>
          </button>
        </div>
        {isElse && (
          <div className="smap-start__row">
            <label className="smap-row-label" htmlFor="smap-buy-name">
              Its name
            </label>
            <AdminInput
              id="smap-buy-name"
              maxLength={PLAN_LIMITS.plannedLabel}
              value={otherName}
              onChange={(e) => {
                setOtherName(e.target.value);
                setProblem(null);
              }}
            />
          </div>
        )}
      </section>

      {movement && (
        <section className="smap-plan__step" aria-labelledby="smap-plan-size">
          <h3 id="smap-plan-size" className="smap-h">
            Its size
          </h3>
          <div className="smap-chips" role="group" aria-label="Its size">
            {recorded.map((m) => (
              <button key={m.id} type="button" className="smap-chip" {...pressed(way?.kind === "model" && way.modelId === m.id)} onClick={() => setWay({ kind: "model", modelId: m.id })}>
                <span className="smap-chip__name">
                  {m.model} · {sizeLine(m.size!)}
                </span>
              </button>
            ))}
            <button type="button" className="smap-chip" {...pressed(way?.kind === "typed")} onClick={() => setWay({ kind: "typed", size: null })}>
              <span className="smap-chip__name">Type its size</span>
            </button>
            <button type="button" className="smap-chip" {...pressed(way?.kind === "unknown")} onClick={() => setWay({ kind: "unknown" })}>
              <span className="smap-chip__name">Size not known yet</span>
            </button>
          </div>
          {movementId && models.state === "ready" && recorded.length === 0 && <p className="smap-quiet">Head office hasn't recorded a size for this machine yet.</p>}
          {way?.kind === "typed" &&
            (way.size ? (
              <p className="smap-quiet">
                {sizeLine(way.size)}{" "}
                <AdminButton variant="ghost" onClick={() => setWay({ kind: "typed", size: null })}>
                  Change
                </AdminButton>
              </p>
            ) : (
              <SizeForm idPrefix="smap-plan-size" onSave={(size) => setWay({ kind: "typed", size })} onCancel={() => setWay(null)} />
            ))}
        </section>
      )}

      {problem && (
        <p className="smap-form__problem" role="alert">
          {problem}
        </p>
      )}
      <div className="smap-sizes__foot">
        <AdminButton variant="ghost" onClick={() => guard(onCancel)}>
          Cancel
        </AdminButton>
        <AdminButton variant="primary" onClick={add}>
          Add it
        </AdminButton>
      </div>
    </div>
  );
}
