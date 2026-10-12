import { BookOpen } from "lucide-react";
import type { ResolvedMachine } from "../../types/machines";
import { AdminButton } from "../admin/primitives";
import { academyCategoryOf, groupLabelOf } from "../catalog/grouping";
import { movementOf } from "../catalog/names";
import { muscleLabel } from "../routine-builder/engine";
import "./machine-card.css";

/**
 * LEARN — the movement, and the way to its Catalog page (the studio map,
 * phase 4). AJ, Oct 11 2026: "the map will like to the main MSF catalog
 * page and the my studio map will hold the unique to that studio version".
 * Max Strength owns the method, so nothing of it is copied here: the page
 * is the method. A studio's own machine with no MSF movement has its own
 * definition's one line and its own page.
 */
export function LearnPart({
  machine,
  machineId,
  name,
  onOpenCatalogPage,
}: {
  machine: ResolvedMachine | null;
  machineId: string;
  name: string;
  onOpenCatalogPage?: (machineId: string) => void;
}) {
  const movement = machine ? movementOf({ id: machine.machineId, comparisonKey: machine.comparisonKey, name }) : null;
  const family = machine ? academyCategoryOf({ id: machine.machineId, comparisonKey: machine.comparisonKey }) : null;
  const muscles = (machine?.primaryMuscles ?? []).map((m) => muscleLabel(m)).filter(Boolean);
  const own = !movement;
  return (
    <>
      {movement ? (
        <p className="mdc-line">
          {movement.name}
          {family ? ` · ${groupLabelOf(family, "academy")}` : ""}
        </p>
      ) : (
        machine?.clinicalNote && <p className="mdc-line">{machine.clinicalNote}</p>
      )}
      {muscles.length > 0 && <p className="mdc-line mdc-line--quiet">Works the {muscles.join(", ").toLowerCase()}.</p>}
      {onOpenCatalogPage && (
        <div className="mdc-actions">
          <AdminButton onClick={() => onOpenCatalogPage(machineId)}>
            <BookOpen className="w-3.5 h-3.5" aria-hidden />
            {own ? "Open its page" : "Open its Catalog page"}
          </AdminButton>
        </div>
      )}
    </>
  );
}

/** Learn's folded line: the movement's name, when the machine is one. */
export function learnSummary(machine: ResolvedMachine | null, name: string): string | null {
  if (!machine) return null;
  return movementOf({ id: machine.machineId, comparisonKey: machine.comparisonKey, name })?.name ?? null;
}
