/**
 * TODAY'S LIST — the briefing's machines for today, one list a trainer acts
 * on (the briefing round, Oct 17 2026; AJ's handoff, question 2, "What are we
 * doing today?": "Swap a machine out, or add one in: quick edit to today's
 * routine").
 *
 * It replaced five drawings of the same machines (the A and B buttons' count,
 * the routine line, the Road, the plan's meter, and the Routine Builder behind
 * Edit) and the five taps it took to add one. Now:
 *
 *   + Add a machine → the machine           2 taps (the sheet closes itself)
 *   Swap → the machine                       2 taps
 *   ×                                        1 tap, with Undo
 *   Reorder → drag → Done                    a mode, so nothing drags by accident
 *   Rebuild                                  the Routine Builder, for a bigger change
 *
 * Show it, don't label it (AJ, Oct 16 2026): no count, no "suggested", no
 * codes. The one word kept is "Last time" over the numbers, so they never
 * read as today's target (nothing here suggests a weight). The Academy's
 * order rules show under the list without a tap, each with its fix.
 *
 * Nothing here writes. Every change is today's only and goes up through
 * `onChange`; Start hands the list to the session (session-scope.test.ts).
 * today-list.ts is the pure half.
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Search, X } from "lucide-react";
import type { Machine } from "../../types";
import type { MachineHistoryEntry } from "../routine-builder/types";
import { PlanSheet } from "../routine-plan/ui/parts";
import "../routine-plan/ui/routine-plan.css";
import {
  addChoices,
  addTo,
  lastTimeWords,
  moveTo,
  orderWarnings,
  putBack,
  swapChoices,
  swapIn,
  takeOut,
  type TakenOut,
} from "./today-list";

/** The floor list gets a search box from this many machines, as the builder's picker does. */
const SEARCH_FROM = 12;

export interface TodayListProps {
  /** Today's machines, in order. */
  ids: readonly string[];
  onChange: (next: string[]) => void;
  /** This studio's floor, in its own (walking) order. */
  floor: readonly Machine[];
  nameOf: (id: string) => string;
  /** Last time on each machine, by the floor's id. */
  history: Record<string, MachineHistoryEntry>;
  /** Routine A's plan's next machine: first in + Add when today doesn't have it. */
  nextInPlan?: string | null;
  /** Routine B's next swap: first in Swap for the machine it replaces. */
  nextSwap?: { replaces: string; with: string } | null;
  /** Machines the client can't do today (Routine A's plan's marks): never offered. */
  held?: readonly string[];
  /** Said under the list, quietly: the plan's focus, the client's limits. */
  footnotes?: ReactNode;
  /** What an empty list says. */
  emptyWords: string;
  onRebuild: () => void;
  /**
   * Planned for the routine, not in it yet (the routine library round, Oct
   * 23 2026; §10.2), in the plan's order: each with Add, which puts it on
   * today's list and marks it to join the routine for good at Start (AJ:
   * "Adds it on for good"). Nothing here writes; Start does.
   */
  planned?: readonly string[];
  /** The planned machines marked to join the routine at Start. */
  forGood?: readonly string[];
  onForGood?: (machineId: string, on: boolean) => void;
  /** The routine's name as the screen says it ("Routine A", "Strength"). */
  routineName?: string;
}

type SheetState = { kind: "add" } | { kind: "swap"; id: string } | null;

export function TodayList({
  ids,
  onChange,
  floor,
  nameOf,
  history,
  nextInPlan = null,
  nextSwap = null,
  held = [],
  footnotes,
  emptyWords,
  onRebuild,
  planned = [],
  forGood = [],
  onForGood,
  routineName = "the routine",
}: TodayListProps) {
  const [sheet, setSheet] = useState<SheetState>(null);
  const [undo, setUndo] = useState<TakenOut | null>(null);
  const [reordering, setReordering] = useState(false);
  /** The machine that just went in, edged blue so the eye finds it. */
  const [fresh, setFresh] = useState<string | null>(null);

  const floorList = useMemo(() => floor.filter((m) => !!m.id).map((m) => ({ id: m.id!, name: m.name })), [floor]);
  const warnings = useMemo(() => orderWarnings(ids, nameOf, floorList), [ids, nameOf, floorList]);

  const change = (next: string[], freshId: string | null = null) => {
    setUndo(null);
    setFresh(freshId);
    onChange(next);
  };

  const remove = (id: string) => {
    const { next, undo: taken } = takeOut(ids, id);
    setFresh(null);
    onChange(next);
    setUndo(taken);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    change(moveTo(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  };

  const rows = ids.map((id, i) => (
    <TodayRow
      key={id}
      id={id}
      position={i + 1}
      name={nameOf(id)}
      last={lastTimeWords(history[id])}
      fresh={fresh === id}
      reordering={reordering}
      onSwap={() => setSheet({ kind: "swap", id })}
      onRemove={() => remove(id)}
    />
  ));

  return (
    <div className="br-today" data-testid="briefing-today">
      {ids.length === 0 ? (
        <p className="br-today__empty">{emptyWords}</p>
      ) : (
        <>
          <div className="br-today__head" aria-hidden="true">
            <span>Last time</span>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={[...ids]} strategy={verticalListSortingStrategy}>
              <ol className="br-today__list" aria-label="Today's machines">
                {rows}
              </ol>
            </SortableContext>
          </DndContext>
        </>
      )}

      {undo && (
        <p className="br-today__undo" role="status">
          <span>{nameOf(undo.id)} out</span>
          <button
            type="button"
            onClick={() => {
              setUndo(null);
              setFresh(undo.id);
              onChange(putBack(ids, undo));
            }}
          >
            Undo
          </button>
        </p>
      )}

      {warnings.length > 0 && (
        <ul className="br-today__warnings" data-testid="briefing-order-warnings">
          {warnings.map((w) => (
            <li key={w.key} className="br-today__warning" data-severity={w.severity}>
              <span>{w.title}</span>
              {w.fix && (
                <button type="button" onClick={() => change(w.fix!.next)}>
                  {w.fix.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {onForGood && planned.length > 0 && (
        <section className="br-today__planned" aria-label={`Planned for ${routineName}`} data-testid="briefing-planned">
          <p className="br-today__planned-label">Planned for the routine</p>
          <ul className="br-today__planned-list">
            {planned.map((id) => {
              const joining = forGood.includes(id) && ids.includes(id);
              return (
                <li key={id} className="br-today__planned-row">
                  <span className="br-today__planned-name">
                    {nameOf(id)}
                    {joining ? <span className="br-today__planned-joins"> · joins {routineName} at Start</span> : null}
                  </span>
                  {joining ? (
                    <button type="button" className="br-today__planned-btn" onClick={() => onForGood(id, false)} aria-label={`Keep ${nameOf(id)} for today only`}>
                      Today only
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="br-today__planned-btn"
                      onClick={() => {
                        if (!ids.includes(id)) change(addTo(ids, id), id);
                        onForGood(id, true);
                      }}
                      aria-label={`Add ${nameOf(id)} to today and to ${routineName}`}
                    >
                      <Plus className="w-4 h-4" aria-hidden />
                      Add
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {footnotes}

      {reordering ? (
        <div className="br-today__actions">
          <button type="button" className="br-today__add" onClick={() => setReordering(false)}>
            Done
          </button>
        </div>
      ) : (
        <div className="br-today__actions">
          <button type="button" className="br-today__add" onClick={() => setSheet({ kind: "add" })}>
            <Plus className="w-4 h-4" aria-hidden />
            Add a machine
          </button>
          {ids.length > 1 && (
            <button type="button" className="br-today__quiet" onClick={() => setReordering(true)}>
              Reorder
            </button>
          )}
          <button type="button" className="br-today__quiet" onClick={onRebuild}>
            Rebuild
          </button>
        </div>
      )}

      {sheet?.kind === "add" && (
        <AddSheet
          today={ids}
          floor={floorList}
          nameOf={nameOf}
          history={history}
          nextInPlan={nextInPlan}
          held={held}
          onPick={(id) => {
            setSheet(null);
            change(addTo(ids, id), id);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "swap" && (
        <SwapSheet
          target={sheet.id}
          today={ids}
          floor={floorList}
          nameOf={nameOf}
          history={history}
          held={held}
          nextSwap={nextSwap}
          onPick={(replacements) => {
            const target = sheet.id;
            setSheet(null);
            change(swapIn(ids, target, replacements), replacements[0] ?? null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

/* ── One row ────────────────────────────────────────────────────────────── */

function TodayRow({
  id,
  position,
  name,
  last,
  fresh,
  reordering,
  onSwap,
  onRemove,
}: {
  id: string;
  position: number;
  name: string;
  last: string | null;
  fresh: boolean;
  reordering: boolean;
  onSwap: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !reordering });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="br-today__row"
      data-fresh={fresh || undefined}
      data-dragging={isDragging || undefined}
    >
      {reordering ? (
        <span className="br-today__grip" aria-label={`Move ${name}`} {...attributes} {...listeners}>
          <GripVertical className="w-5 h-5" aria-hidden />
        </span>
      ) : (
        <span className="br-today__pos" aria-hidden="true">
          {position}
        </span>
      )}
      <span className="br-today__name">{name}</span>
      <span className="br-today__last">{last ?? "—"}</span>
      {!reordering && (
        <>
          <button type="button" className="br-today__btn" onClick={onSwap} aria-label={`Swap ${name}`}>
            Swap
          </button>
          <button type="button" className="br-today__btn br-today__x" onClick={onRemove} aria-label={`Take ${name} out of today`}>
            <X className="w-5 h-5" aria-hidden />
          </button>
        </>
      )}
    </li>
  );
}

/* ── The sheets: one tap picks and closes ──────────────────────────────── */

function PickRow({
  name,
  last,
  onPick,
  testId,
}: {
  name: string;
  last: string | null;
  onPick: () => void;
  testId?: string;
}) {
  return (
    <button type="button" className="br-pick" onClick={onPick} data-testid={testId}>
      <span className="br-pick__name">{name}</span>
      {last && <span className="br-pick__last">{last}</span>}
    </button>
  );
}

function filterByName(ids: readonly string[], nameOf: (id: string) => string, query: string): string[] {
  const q = query.trim().toLowerCase();
  return q ? ids.filter((id) => nameOf(id).toLowerCase().includes(q)) : [...ids];
}

function FloorSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="br-pick__search">
      <Search className="w-4 h-4" aria-hidden />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search the floor" aria-label="Search the floor" />
    </label>
  );
}

function AddSheet({
  today,
  floor,
  nameOf,
  history,
  nextInPlan,
  held,
  onPick,
  onClose,
}: {
  today: readonly string[];
  floor: readonly { id: string; name?: string }[];
  nameOf: (id: string) => string;
  history: Record<string, MachineHistoryEntry>;
  nextInPlan: string | null;
  held: readonly string[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const { next, rest } = addChoices({ today, floor, nextInPlan, held });
  const shown = filterByName(rest, nameOf, query);
  return (
    <PlanSheet open title="Add a machine" onClose={onClose}>
      <div className="br-picks" data-testid="briefing-add-sheet">
        {next && !query && (
          <section className="br-picks__group" aria-label="Next in the plan">
            <p className="br-picks__label">Next in the plan</p>
            <PickRow name={nameOf(next)} last={lastTimeWords(history[next])} onPick={() => onPick(next)} testId={`add-${next}`} />
          </section>
        )}
        {rest.length >= SEARCH_FROM && <FloorSearch value={query} onChange={setQuery} />}
        <section className="br-picks__group" aria-label="The floor">
          {shown.length === 0 ? (
            <p className="br-picks__none">{query ? `No machine on the floor matches "${query.trim()}".` : "Every machine on the floor is already in."}</p>
          ) : (
            shown.map((id) => <PickRow key={id} name={nameOf(id)} last={lastTimeWords(history[id])} onPick={() => onPick(id)} testId={`add-${id}`} />)
          )}
        </section>
      </div>
    </PlanSheet>
  );
}

function SwapSheet({
  target,
  today,
  floor,
  nameOf,
  history,
  held,
  nextSwap,
  onPick,
  onClose,
}: {
  target: string;
  today: readonly string[];
  floor: readonly { id: string; name?: string }[];
  nameOf: (id: string) => string;
  history: Record<string, MachineHistoryEntry>;
  held: readonly string[];
  nextSwap: { replaces: string; with: string } | null;
  onPick: (replacements: string[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const { planned, documented, rest } = swapChoices({ target, today, floor, nameOf, held, nextSwap });
  const shown = filterByName(rest, nameOf, query);
  return (
    <PlanSheet open title={`Swap ${nameOf(target)}`} onClose={onClose}>
      <div className="br-picks" data-testid="briefing-swap-sheet">
        {planned && !query && (
          <section className="br-picks__group" aria-label="Next in B's plan">
            <p className="br-picks__label">Next in B's plan</p>
            <PickRow name={nameOf(planned)} last={lastTimeWords(history[planned])} onPick={() => onPick([planned])} testId={`swap-${planned}`} />
          </section>
        )}
        {documented.length > 0 && !query && (
          <section className="br-picks__group" aria-label="The same work">
            <p className="br-picks__label">The same work</p>
            {documented.map((set) => (
              <PickRow
                key={set.ids.join("+")}
                name={set.ids.map(nameOf).join(" + ")}
                last={null}
                onPick={() => onPick(set.ids)}
                testId={`swap-${set.ids.join("+")}`}
              />
            ))}
          </section>
        )}
        {rest.length >= SEARCH_FROM && <FloorSearch value={query} onChange={setQuery} />}
        <section className="br-picks__group" aria-label="The floor">
          {(planned || documented.length > 0) && !query && <p className="br-picks__label">The floor</p>}
          {shown.length === 0 ? (
            <p className="br-picks__none">{query ? `No machine on the floor matches "${query.trim()}".` : "Every machine on the floor is already in."}</p>
          ) : (
            shown.map((id) => <PickRow key={id} name={nameOf(id)} last={lastTimeWords(history[id])} onPick={() => onPick([id])} testId={`swap-${id}`} />)
          )}
        </section>
      </div>
    </PlanSheet>
  );
}
