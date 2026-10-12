import { Fragment, useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { formatStudioDate } from "../../../lib/studio-time";
import type { ModelsRead } from "../../catalog/models";
import { AdminButton, AdminNotice } from "../../admin/primitives";
import { IMAGINE_STRENGTH_BRAND, initialTicks, linksFor, sizeRows, sizesHeading, type FloorMachine, type SizeRow } from "../links";
import { ASSUMED_WORDS, type UnitFacts, type UnitSizeRead } from "../sizes";
import { linkModels, setUnitSize, unlinkModels } from "../store";
import { SizeForm } from "./SizeForm";
import { UnitModelField } from "./UnitModelField";
import "../../admin/admin.css";
import "../studio-map.css";

/** A row's size in short: "Measured on Oct 12", "IS2019 Leg Press · brochure", "Imagine Strength size, not confirmed", "Size not known". */
function shortWords(r: UnitSizeRead): string {
  if (r.state === "known") {
    if (r.from === "measured") {
      return r.at ? `Measured on ${formatStudioDate(r.at, { month: "short", day: "numeric" })}` : "Measured";
    }
    if (r.from === "assumed") return ASSUMED_WORDS;
    return `${r.model} · brochure`;
  }
  if (r.state === "loading") return "Checking the model's size…";
  if (r.state === "unreadable") return "The model's size couldn't be read.";
  return "Size not known";
}

/**
 * SIZES — every machine on the floor at once (the studio map, Oct 2026).
 *
 * One row per machine in walking order: a tick where one Imagine Strength
 * model fits its movement, its name and its size, Which model, and Measure.
 * AJ, Oct 11 2026, asked whether Solon's and Strongsville's machines are
 * Imagine Strength: "Yes, nearly all". So every catalog copy that offers
 * one STARTS TICKED, and a leader unticks the odd ones out; a studio's own
 * machines start unticked. NOTHING IS WRITTEN until Mark {n} as Imagine
 * Strength, and its toast carries Undo. The rows that need a size come
 * first (the Imagine Strength offers, then any other machine with none),
 * each group in walking order, so every ticked row is on screen beside the
 * buttons that act on it; the machines already sized follow under a quiet
 * "Already sized".
 * The same two controls as a machine's own Its size (one editor, two ways
 * in), each writing on its own and never awaited.
 */
export function SizesSheet({
  studioId,
  floor,
  units,
  models,
  authUid,
}: {
  studioId: string;
  floor: readonly FloorMachine[];
  units: Readonly<Record<string, UnitFacts>>;
  models: ModelsRead;
  authUid: string | null;
}) {
  const { toast, success: toastSuccess, error: toastError } = useToast();
  const rows = useMemo(() => sizeRows(floor, units, models), [floor, units, models]);
  // What needs a size first; the rest after, in walking order within each.
  const groups = useMemo(() => {
    const offered = rows.filter((r) => r.isOffer);
    const unsized = rows.filter((r) => !r.isOffer && r.size.state !== "known");
    const sized = rows.filter((r) => !r.isOffer && r.size.state === "known");
    return { first: [...offered, ...unsized], sized };
  }, [rows]);
  const offers = rows.filter((r) => r.isOffer);
  // The opening ticks, once the models have answered (a pre-tick writes nothing).
  const [ticked, setTicked] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (ticked === null && models.state === "ready") setTicked(initialTicks(rows));
  }, [ticked, models.state, rows]);
  const ticks = ticked ?? new Set<string>();
  const live = new Set([...ticks].filter((id) => offers.some((r) => r.machineId === id)));
  const [measuring, setMeasuring] = useState<string | null>(null);
  const noImagine = models.state === "ready" && !models.models.some((m) => m.brand === IMAGINE_STRENGTH_BRAND);

  const toggle = (id: string) =>
    setTicked((t) => {
      const next = new Set(t ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const mark = () => {
    const links = linksFor(rows, live);
    if (links.length === 0) return;
    const out = linkModels(studioId, links);
    out.done.catch((e: unknown) => {
      console.error("[studio map] the models weren't named", e);
      toastError("Those machines weren't marked. Check your connection.");
    });
    const n = out.written.length;
    setTicked(new Set());
    toast(`${n} ${n === 1 ? "machine" : "machines"} marked as Imagine Strength.`, "success", 8000, {
      label: "Undo",
      run: () => {
        unlinkModels(studioId, out.written).catch(() => toastError("The marks couldn't be taken back. Check your connection."));
      },
    });
    if (out.dropped.length > 0) toastError(`${out.dropped.length} ${out.dropped.length === 1 ? "was" : "were"} for another machine, so not marked.`);
  };

  const saveSize = (row: SizeRow, size: Parameters<typeof setUnitSize>[2]) => {
    if (!authUid) return;
    setUnitSize(studioId, row.machineId, size, authUid).catch(() => toastError(`The size of ${row.name} wasn't saved.`));
    setMeasuring(null);
    toastSuccess("Size saved.");
  };

  return (
    <div className="smap-sizes">
      <div className="smap-sizes__head">
        <p className="smap-start__title">{sizesHeading(rows)}</p>
        {offers.length > 0 &&
          (live.size > 0 ? (
            <AdminButton onClick={() => setTicked(new Set())}>Untick all</AdminButton>
          ) : (
            <AdminButton onClick={() => setTicked(new Set(offers.map((r) => r.machineId)))}>Tick all {offers.length}</AdminButton>
          ))}
      </div>
      {noImagine && <AdminNotice tone="info">Head office hasn't recorded the Imagine Strength sizes yet.</AdminNotice>}
      <div className="smap-sizes__rows">
        {[...groups.first, ...groups.sized].map((r, i) => {
          const on = live.has(r.machineId);
          const firstSized = i === groups.first.length && groups.first.length > 0;
          return (
            <Fragment key={r.machineId}>
              {firstSized && <p className="smap-quiet">Already sized</p>}
              <div className="smap-sizes__row">
                {r.isOffer ? (
                  <button
                    type="button"
                    className="smap-sizes__tick"
                    aria-pressed={on}
                    aria-label={`${r.name} is an Imagine Strength ${r.isOffer.model}`}
                    onClick={() => toggle(r.machineId)}
                  >
                    {on && <Check className="w-5 h-5" aria-hidden="true" />}
                  </button>
                ) : null}
                <div className="smap-sizes__main">
                  <span className="smap-sizes__name">{r.name}</span>
                  <span className="smap-quiet">{shortWords(r.size)}</span>
                  {measuring === r.machineId ? (
                    <SizeForm idPrefix={`smap-sizes-${r.machineId}`} onSave={(size) => saveSize(r, size)} onCancel={() => setMeasuring(null)} />
                  ) : (
                    <div className="smap-item__row">
                      {r.movementId && r.models.length > 0 && (
                        <UnitModelField
                          studioId={studioId}
                          machineId={r.machineId}
                          machineName={r.name}
                          movementId={r.movementId}
                          value={units[r.machineId]?.modelId ?? null}
                          models={r.models}
                          id={`smap-sizes-model-${r.machineId}`}
                        />
                      )}
                      <AdminButton onClick={() => setMeasuring(r.machineId)}>Measure</AdminButton>
                    </div>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
      <div className="smap-sizes__foot">
        <AdminButton variant="primary" disabled={live.size === 0} onClick={mark}>
          Mark {live.size} as Imagine Strength
        </AdminButton>
      </div>
    </div>
  );
}
