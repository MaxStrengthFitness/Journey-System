import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Briefcase, DoorOpen, FireExtinguisher, HeartPulse, LampDesk, Lock, Plus, Shirt, Square, Toilet } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { useStudioMachines } from "../../../hooks/useStudioMachines";
import type { KnownSize, ResolvedMachine, StudioMachineRosterEntry } from "../../../types/machines";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { onFloor } from "../../admin/machines/floor-editor";
import { AdminButton, AdminInput, AdminNotice, ConfirmDialog } from "../../admin/primitives";
import { movementOf } from "../../catalog/names";
import { useMachineModels } from "../../catalog/useMachineModels";
import { useUnsavedChanges } from "../../unsaved-changes";
import { usePhone } from "../../phone/device";
import { overlapChecks, pairChecks, type CheckMachine } from "../checks";
import { footprint } from "../geometry";
import { useFloorPlans } from "../hooks";
import {
  CURRENT_ID,
  DRAFT_SLOTS,
  draftNames,
  isPlanned,
  LAYOUT_NAME,
  placementId,
  PLACE_KINDS,
  PLACE_WORDS,
  PLAN_LIMITS,
  planProblems,
  reconcile,
  type DraftSlot,
  type LoadedPlan,
  type PlaceKind,
  type Placement,
  type PlannedPlacement,
  type PlanPoint,
  type PlanRoom,
  type RoomBox,
  type RoomPlace,
} from "../layout";
import { freeSpot, middleOf, placeAll } from "../place";
import { DEAD_PX, editorReducer, emptyWorking, initialEditor, kindOfId, type EditorState, type Tool, type Working } from "../placement";
import { practiceLayout } from "../demo-layout";
import { areaWords, roomProblems, roomShape } from "../room";
import { knownSizeOf, sizeOfUnit, sizeSourceWords, type UnitFacts } from "../sizes";
import { PLAN_WORDS } from "../states";
import { keepAsDraft, saveLayout, tryAChange } from "../store";
import { newPlanned, plannedKnownSize, plannedSizeOf, plannedSizeWords, stillToBuyWords, swapCandidates } from "../planned";
import { pickAt, pickRoomItem, handlesFor, type TapTarget } from "../tap";
import { listWords, sizeLine, sqFtWords } from "../units";
import { frameOf, roomBounds, ZOOMS } from "./drawing";
import { DraftTabs, type ShownContent } from "./DraftTabs";
import { ItemPanel, type PanelActions, type PanelItem } from "./ItemPanel";
import { PlanMachineSheet, type PlannedChoice } from "./PlanMachineSheet";
import { SizesSheet } from "./SizesSheet";
import { StudioRoom, type MapMachine, type RoomInteraction } from "./StudioRoom";
import type { LayoutViewProps } from "./types";
import { movementOfEntry } from "./UnitSizeCard";
import "../../admin/admin.css";
import "../studio-map.css";

/**
 * ARRANGE THE FLOOR — the leaders' editor (the studio map, Oct 2026).
 *
 * Rare and behind one button (AJ, Oct 10 2026: "the rearranging is going to
 * be EXTREMELY rare as these machines are huge"). It starts from the square
 * footage (AJ, Oct 11 2026: "realistically, you just need to put how many
 * square feet it is"), draws one box of that area, and the room tool does
 * the rest: boxes added, moved and resized on whole feet, and a palette of
 * places in AJ's order. Machines are drawn at their true size and placed
 * roughly: a 6 in step, a soft pull flush onto a neighbour or a wall, Place
 * them all along the walls, and only an overlap a person can see marked, a
 * plum edge and one line in the machine's own panel. No spacing check, no
 * path check (design §0.3).
 *
 * Nothing on a tap waits: Save issues the write and the screen moves on; a
 * refusal comes back as a notice, and a save someone else beat keeps the
 * copy as a plan. The working copy is unsaved work: leaving asks.
 */
export default function LayoutView(props: LayoutViewProps) {
  if (!props.canLead) {
    return (
      <div className="smap-editor">
        <p className="smap-note">Only a studio leader arranges the floor.</p>
        <div className="smap-bar">
          <AdminButton onClick={props.onDone}>Done</AdminButton>
        </div>
      </div>
    );
  }
  return <Editor {...props} />;
}

const EMPTY_ROOM = { boxes: [] as RoomBox[], places: [] as RoomPlace[] };
const PLACE_GLYPHS: Record<PlaceKind, typeof Square> = {
  pillar: Square,
  door: DoorOpen,
  desk: LampDesk,
  bathroom: Toilet,
  changing: Shirt,
  lockers: Lock,
  office: Briefcase,
  extinguisher: FireExtinguisher,
  aed: HeartPulse,
};

/** The working copy for a stored layout (or what a write is about to make it), against the floor. */
function workingOf(
  plan: { room: PlanRoom; placements: readonly Placement[] },
  floor: readonly { machineId: string; name: string; code: string; status: string }[],
): Working {
  const r = reconcile({ placements: [...plan.placements] }, floor);
  return { room: plan.room, placements: [...r.placed.map((p) => p.placement), ...r.planned], gone: r.gone };
}

/** The live slot behind a tab: the map, or a draft that isn't retired. */
function docOf(plans: { current: LoadedPlan | null; slots: readonly LoadedPlan[] }, id: string): LoadedPlan | null {
  if (id === CURRENT_ID) return plans.current;
  return plans.slots.find((s) => s.id === id && !s.retired) ?? null;
}

/** The first slot free for a new plan, with the rev it holds now (null: never written). */
function firstFree(slots: readonly LoadedPlan[]): { id: DraftSlot; baseRev: number | null } | null {
  for (const id of DRAFT_SLOTS) {
    const s = slots.find((d) => d.id === id);
    if (!s) return { id, baseRev: null };
    if (s.retired) return { id, baseRev: s.rev };
  }
  return null;
}

function Editor({ studioId, studioName, authUid, authorName, isDemo, nameOf = () => null, onDone }: LayoutViewProps) {
  const { success: toastSuccess, error: toastError, toast } = useToast();
  const phone = usePhone();
  const { machines, rosterEntries, loading, failed } = useStudioMachines(studioId, { includeInactive: true });
  const plans = useFloorPlans(studioId, { enabled: true });
  const models = useMachineModels(true);

  /* ── The floor, its units and their sizes ───────────────────────── */
  const entryById = useMemo(() => {
    const m = new Map<string, StudioMachineRosterEntry>();
    for (const e of rosterEntries) m.set(e.machineId, e);
    return m;
  }, [rosterEntries]);
  const floor = useMemo(() => onFloor(machines, new Set(rosterEntries.map((e) => e.machineId))), [machines, rosterEntries]);
  const floorUnits = useMemo(
    () =>
      floor.map((m: ResolvedMachine) => ({
        machineId: m.machineId,
        name: m.name,
        code: movementOf({ id: m.machineId, comparisonKey: m.comparisonKey, name: m.name })?.code ?? "",
        status: m.rosterStatus,
      })),
    [floor],
  );
  const unitById = useMemo(() => new Map(floorUnits.map((u) => [u.machineId, u])), [floorUnits]);
  const units = useMemo(() => {
    const out: Record<string, UnitFacts> = {};
    for (const m of floor) {
      const e = entryById.get(m.machineId);
      out[m.machineId] = {
        unitSize: e?.unit?.size ?? null,
        modelId: typeof e?.modelId === "string" && e.modelId.trim() ? e.modelId.trim() : null,
        movementId: e ? movementOfEntry(e) : null,
      };
    }
    return out;
  }, [floor, entryById]);
  const sizeReads = useMemo(() => new Map(floor.map((m) => [m.machineId, sizeOfUnit(units[m.machineId], models)])), [floor, units, models]);
  const sizes = useMemo(() => new Map([...sizeReads].map(([id, r]) => [id, knownSizeOf(r)])), [sizeReads]);
  const sizesFloor = useMemo(() => floor.map((m) => ({ machineId: m.machineId, name: m.name, source: entryById.get(m.machineId)?.source ?? null })), [floor, entryById]);

  /* ── The working copy ───────────────────────────────────────────── */
  const [state, dispatch] = useReducer(editorReducer, undefined, (): EditorState => ({
    ...initialEditor({ id: CURRENT_ID, rev: null }, emptyWorking(EMPTY_ROOM)),
    tool: "machines",
  }));
  const { working } = state;
  const current = plans.current;
  // The tab open is the document the working copy came from: the map, or a remodel plan (a draft slot).
  const openId = state.base.id;
  const onDraft = openId !== CURRENT_ID;
  const open = docOf(plans, openId);
  const floorKey = floorUnits.map((u) => u.machineId).join("|");
  // The latest of each, for a save's answer that comes back later.
  const plansRef = useRef(plans);
  plansRef.current = plans;
  const stateRef = useRef(state);
  stateRef.current = state;
  const floorRef = useRef(floorUnits);
  floorRef.current = floorUnits;
  useEffect(() => {
    if (!open) return;
    dispatch({ type: "load", id: open.id, rev: open.rev, working: workingOf(open, floorUnits) });
    // The document's rev, who wrote it and when, and the floor's machines are what change it. Who and when matter at
    // the same rev: a refused save of ours is put back by the SDK to the other leader's document at the rev ours had
    // claimed, and that copy must reach the screen (unless ours is still unsaved work there, which `load` keeps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id, open?.rev, open?.updatedAtMs, open?.updatedBy, floorKey, plans.state]);

  /** Show a tab now: with what a write is about to give it, or as the listener has it. */
  const showTab = useCallback((id: string, content: ShownContent | null) => {
    const floor = floorRef.current;
    if (content) {
      dispatch({ type: "load", id, rev: content.rev, working: workingOf(content, floor), force: true });
      return;
    }
    const doc = docOf(plansRef.current, id);
    if (doc) dispatch({ type: "load", id, rev: doc.rev, working: workingOf(doc, floor), force: true });
    else if (id === CURRENT_ID) dispatch({ type: "load", id, rev: null, working: emptyWorking(EMPTY_ROOM), force: true });
  }, []);

  // A plan another leader deleted while it was open here (and nothing typed on it): back to the map. Only a delete
  // at least as new as what the screen shows counts: a plan this screen is bringing back (Delete plan's Undo) or
  // starting afresh in that slot (Plan a remodel) sits at a higher rev than the retired copy the listener still has,
  // because the cache's answer to our own write arrives after this effect has run.
  const seen = useRef(new Set<string>());
  if (open) seen.current.add(open.id);
  const retiredRev = onDraft && !open ? (plans.slots.find((s) => s.id === openId)?.rev ?? null) : null;
  useEffect(() => {
    if (!onDraft || open || !seen.current.has(openId) || state.dirty || plans.state !== "ready") return;
    const shown = state.base.rev;
    if (retiredRev !== null && shown !== null && retiredRev < shown) return;
    showTab(CURRENT_ID, null);
  }, [onDraft, open, openId, retiredRev, state.base.rev, state.dirty, plans.state, showTab]);

  const discard = () => showTab(openId, null);
  const { guard } = useUnsavedChanges(state.dirty, onDraft ? (open ? open.name : "the plan") : "the layout", { onDiscard: discard });

  /* ── Machines still to buy: their sizes, looked up live ─────────── */
  const plannedReads = useMemo(
    () => new Map(working.placements.filter(isPlanned).map((p) => [p.id, plannedSizeOf(p, models)] as const)),
    [working.placements, models],
  );
  const sizeOf = useCallback(
    (id: string): KnownSize | null => {
      if (kindOfId(id) === "planned") {
        const r = plannedReads.get(id);
        return r ? plannedKnownSize(r) : null;
      }
      return sizes.get(id) ?? null;
    },
    [sizes, plannedReads],
  );

  /* ── The room's shape, worked out once per room change ──────────── */
  const shape = useMemo(() => roomShape(working.room.boxes), [working.room.boxes]);
  const bounds = useMemo(() => roomBounds(working.room, shape), [working.room, shape]);
  const [zoomIx, setZoomIx] = useState(0);
  const zoom = ZOOMS[zoomIx];
  const frameRef = useRef<HTMLDivElement | null>(null);
  // The frame's width, and the most it may grow to (its max-height, read from the stylesheet so the measure never
  // depends on what is drawn in it): 0 until measured, and where there is nothing to read (a test).
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      let h = 0;
      try {
        h = parseFloat(getComputedStyle(el).maxHeight) || 0;
      } catch {
        h = 0;
      }
      setBox((b) => (b.w === el.clientWidth && b.h === h ? b : { w: el.clientWidth, h }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [working.room.boxes.length > 0]);
  const widthPx = box.w;
  // The drawing keeps its scale while the room is edited: an edge pulled in stays where the finger left it, and the
  // drawing rescales only when the room grows past what is drawn, or on Fit, a zoom, a new tool or a resized frame.
  const [fitTick, setFitTick] = useState(0);
  const held = useRef<{ key: string; bounds: typeof bounds } | null>(null);
  const holdKey = `${zoomIx}|${state.tool}|${box.w}|${box.h}|${fitTick}`;
  const drawnBounds = useMemo(() => {
    const h = held.current;
    const within = !!h && h.key === holdKey && bounds.x0 >= h.bounds.x0 && bounds.y0 >= h.bounds.y0 && bounds.x1 <= h.bounds.x1 && bounds.y1 <= h.bounds.y1;
    if (within) return h!.bounds;
    held.current = { key: holdKey, bounds };
    return bounds;
  }, [bounds, holdKey]);
  const frame = useMemo(() => frameOf(drawnBounds, widthPx, zoom, box.h), [drawnBounds, widthPx, zoom, box.h]);
  const fitted = zoomIx === 0 && drawnBounds === bounds;

  /* ── What is drawn: the working copy, with a drag in progress ───── */
  const live = state.drag.phase === "dragging" ? state.drag : null;
  const liveKind = live ? kindOfId(live.id) : null;
  const displayRoom = useMemo(() => {
    if (!live || (liveKind !== "box" && liveKind !== "place")) return working.room;
    return liveKind === "box"
      ? { ...working.room, boxes: working.room.boxes.map((b) => (b.id === live.id ? (live.at as RoomBox) : b)) }
      : { ...working.room, places: working.room.places.map((p) => (p.id === live.id ? (live.at as RoomPlace) : p)) };
  }, [working.room, live, liveKind]);

  const mapMachines = useMemo<MapMachine[]>(() => {
    const out: MapMachine[] = [];
    for (const p of working.placements) {
      const id = placementId(p);
      const placement = live && live.id === id ? (live.at as Placement) : p;
      if (isPlanned(p)) {
        out.push({ id, name: p.label, code: "", placement, size: sizeOf(id), planned: true });
        continue;
      }
      const u = unitById.get(id);
      if (!u) continue;
      out.push({ id, name: u.name, code: u.code, placement, size: sizeOf(id) });
    }
    return out;
  }, [working.placements, live, unitById, sizeOf]);

  /* ── Overlaps: once after a change settles (120 ms), never during a drag ── */
  const checkInput = useCallback(
    (ms: readonly MapMachine[]) => ({
      shape,
      places: working.room.places,
      placed: ms.map((m): CheckMachine => ({ id: m.id, name: m.name, placement: m.placement, size: m.size, planned: !!m.planned })),
    }),
    [shape, working.room.places],
  );
  const [checks, setChecks] = useState<ReturnType<typeof overlapChecks>>(() => ({ linesById: new Map(), warnIds: new Set() }));
  const settledMachines = useRef(mapMachines);
  if (!live) settledMachines.current = mapMachines;
  useEffect(() => {
    const t = setTimeout(() => setChecks(overlapChecks(checkInput(settledMachines.current))), 120);
    return () => clearTimeout(t);
  }, [working.placements, working.room, sizes, checkInput]);
  const warnIds = useMemo(() => {
    if (!live || (liveKind !== "unit" && liveKind !== "planned")) return checks.warnIds;
    const pair = pairChecks(checkInput(mapMachines), live.id).warnIds;
    const out = new Set([...checks.warnIds].filter((id) => id !== live.id));
    for (const id of pair) out.add(id);
    return out;
  }, [checks.warnIds, live, liveKind, checkInput, mapMachines]);

  /* ── Pointer handling: a press becomes a drag after 8 px; one move a frame ── */
  const targets = useMemo<TapTarget[]>(
    () => mapMachines.map((m) => ({ id: m.id, footprint: m.size ? footprint(m.placement, m.size) : null, centre: { x: m.placement.x, y: m.placement.y } })),
    [mapMachines],
  );
  const selectedRoomItem = useMemo<RoomInteraction["selected"]>(() => {
    const id = state.selectedId;
    if (!id) return null;
    const box = displayRoom.boxes.find((b) => b.id === id);
    if (box) return { id, rect: box };
    const place = displayRoom.places.find((p) => p.id === id);
    if (place) return { id, rect: place, kind: place.kind };
    return null;
  }, [state.selectedId, displayRoom]);

  const pending = useRef<{ id: string | null; tap: boolean; start: PlanPoint } | null>(null);
  const raf = useRef<number | null>(null);
  const lastPx = useRef<{ px: PlanPoint; mmPerPx: number } | null>(null);
  const flushMove = useCallback(() => {
    raf.current = null;
    const l = lastPx.current;
    if (!l) return;
    const id = state.drag.phase === "idle" ? null : state.drag.id;
    const marker = !!id && (kindOfId(id) === "unit" || kindOfId(id) === "planned") && !sizeOf(id);
    dispatch({ type: "move", px: l.px, mmPerPx: l.mmPerPx, marker });
  }, [state.drag, sizeOf]);

  const interaction: RoomInteraction = {
    tool: state.tool,
    selected: state.tool === "room" ? selectedRoomItem : null,
    onPointerDown: (e: ReactPointerEvent<SVGSVGElement>, mm, f) => {
      const px = { x: e.clientX, y: e.clientY };
      const slop = 22 * f.mmPerPx;
      if (state.tool === "room") {
        const sel = selectedRoomItem ? { id: selectedRoomItem.id, rect: selectedRoomItem.rect, handles: handlesFor({ ...selectedRoomItem.rect, kind: selectedRoomItem.kind }, f.mmPerPx) } : null;
        const pick = pickRoomItem(mm, shape, displayRoom.places, slop, sel);
        if (pick && (pick.edge || pick.id === state.selectedId)) {
          dispatch({ type: "press", id: pick.id, px, edge: pick.edge });
          pending.current = { id: pick.id, tap: false, start: px };
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* a synthetic event in a test has no pointer to capture */
          }
          return;
        }
        pending.current = { id: pick?.id ?? null, tap: true, start: px };
        return;
      }
      const id = pickAt(mm, targets, slop);
      if (id && state.tool === "machines") {
        dispatch({ type: "press", id, px });
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* as above */
        }
      }
      pending.current = { id, tap: !id || state.tool !== "machines", start: px };
    },
    onPointerMove: (e, _mm, f) => {
      if (state.drag.phase === "idle") return;
      lastPx.current = { px: { x: e.clientX, y: e.clientY }, mmPerPx: f.mmPerPx };
      if (raf.current === null) raf.current = requestAnimationFrame(flushMove);
    },
    onPointerUp: (e) => {
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current);
        flushMove();
      }
      lastPx.current = null;
      const p = pending.current;
      pending.current = null;
      if (state.drag.phase !== "idle") dispatch({ type: "release", sizeOf });
      if (p?.tap && Math.hypot(e.clientX - p.start.x, e.clientY - p.start.y) < DEAD_PX) dispatch({ type: "select", id: p.id });
    },
    onPointerCancel: () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      lastPx.current = null;
      pending.current = null;
      dispatch({ type: "cancel" });
    },
  };

  // Escape cancels a drag, and goes no further (an outer panel stays open).
  const dragging = state.drag.phase !== "idle";
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      dispatch({ type: "cancel" });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dragging]);

  /* ── Save, and a save that didn't land ──────────────────────────── */
  const [note, setNote] = useState<string | null>(null);
  const save = () => {
    if (!authUid) {
      toastError("Sign in again to save the layout.");
      return;
    }
    const copy = working;
    const planId = openId;
    const baseRev = state.base.rev;
    const name = planId === CURRENT_ID ? LAYOUT_NAME : (open?.name ?? draftNames.draft(planId as DraftSlot));
    const problem = planProblems({ name, room: copy.room, placements: [...copy.placements, ...copy.gone] }, { planId })[0];
    if (problem) {
      toastError(problem);
      return;
    }
    dispatch({ type: "saved", id: planId, rev: (baseRev ?? 0) + 1 });
    setNote(null);
    toastSuccess(planId === CURRENT_ID ? "Layout saved." : `${name} saved.`);
    // Still on the tab the save was made from: another tab's copy is never put back over this one.
    const here = () => stateRef.current.base.id === planId;
    // Any refusal is final (nothing retries it), so what was sent is unsaved work again, against the rev it was
    // opened at: changes made since stay as they are; otherwise the copy that was sent comes back on screen, whatever
    // the listener showed in between.
    const putBack = () => {
      if (!here()) return;
      if (stateRef.current.dirty) dispatch({ type: "unsaved", rev: baseRev });
      else dispatch({ type: "load", id: planId, rev: baseRev, working: copy, force: true, dirty: true });
    };
    void saveLayout(studioId, planId, copy, name, baseRev, authUid).then((out) => {
      if (!("why" in out)) return;
      if (out.why === "changed") {
        const who = (out.by && nameOf(out.by)) || "Someone";
        const what = planId === CURRENT_ID ? "a newer layout" : `a newer copy of ${name}`;
        const keptName = draftNames.kept(authorName, Date.now());
        void keepAsDraft(studioId, copy, keptName, plansRef.current.slots, authUid).then((kept) => {
          if ("id" in kept) {
            if (here()) setNote(`${who} saved ${what}, so yours was kept as a plan, “${keptName}”.`);
            // Yours is safe in the plan: the screen shows theirs, at their rev, unless you've changed it since.
            const now = docOf(plansRef.current, planId);
            if (!here()) return;
            if (stateRef.current.dirty) dispatch({ type: "unsaved", rev: baseRev });
            else if (now) dispatch({ type: "load", id: planId, rev: now.rev, working: workingOf(now, floorRef.current), force: true });
          } else {
            if (here()) {
              setNote(
                "full" in kept
                  ? `${who} saved ${what}, and all five plans are in use, so yours is still on screen.`
                  : `${who} saved ${what}, and yours couldn't be kept as a plan, so it's still on screen.`,
              );
            }
            putBack();
          }
        });
        return;
      }
      putBack();
      if (out.why === "invalid") toastError(out.problem);
      else if (out.why === "unchecked") toastError("The layout wasn't saved, and Journey couldn't check why. It's still on screen: tap Save to try again.");
      else toastError("The layout wasn't saved. Only a studio leader arranges the floor.");
    });
  };

  /* ── Plan a remodel: what is on screen, into a free slot ─────────── */
  const planRemodel = () => {
    if (!authUid) {
      toastError("Sign in again to plan a remodel.");
      return;
    }
    const slot = firstFree(plans.slots);
    if (!slot) {
      toastError("Five plans is the most. Make one the map or delete one first.");
      return;
    }
    const copy = working;
    const name = draftNames.draft(slot.id);
    const rev = slot.baseRev === null ? 1 : slot.baseRev + 1;
    const carried = state.dirty;
    void tryAChange(studioId, copy, plans.slots, authUid).then((out) => {
      if (!("why" in out)) {
        // Another leader took that slot at the same moment: the copy went to the next one.
        if (out.id && out.id !== slot.id && stateRef.current.base.id === slot.id && !stateRef.current.dirty) showTab(out.id, null);
        return;
      }
      if (out.why === "invalid") toastError(out.problem);
      else if (out.why === "full") toastError("Five plans is the most. Make one the map or delete one first.");
      else toastError(`${name} wasn't saved. It's still on screen: tap Save to keep it.`);
      if (stateRef.current.base.id === slot.id) dispatch({ type: "unsaved", rev: slot.baseRev });
    });
    dispatch({ type: "load", id: slot.id, rev, working: copy, force: true });
    setNote(null);
    toastSuccess(carried ? `${name} holds the changes that were on screen. The map is as it was saved.` : `${name} started from what was on screen. The map hasn't changed.`);
  };

  /* ── Add a machine to buy (a remodel plan only) ─────────────────── */
  const [buyOpen, setBuyOpen] = useState(false);
  const buyGuard = useRef<((proceed: () => void) => void) | null>(null);
  const closeBuy = () => (buyGuard.current ? buyGuard.current(() => setBuyOpen(false)) : setBuyOpen(false));
  const addToBuy = (c: PlannedChoice) => {
    setBuyOpen(false);
    const draftOf = (at: PlanPoint): PlannedPlacement => newPlanned({ ...c, at });
    const probe = draftOf({ x: 0, y: 0 });
    const size = plannedKnownSize(plannedSizeOf(probe, models));
    const spot = freeSpot({ shape, places: working.room.places, placed: placedFootprints(), markers: markerCentres(), size }, probe.id);
    const at = spot ?? middleOf(shape, probe.id);
    dispatch({ type: "addPlanned", planned: { ...probe, x: at.x, y: at.y, rotationDeg: at.rotationDeg } });
    if (!spot) toast("No clear spot: placed in the middle. Move it where it goes.", "info");
  };

  /* ── Placing a machine not placed yet ───────────────────────────── */
  const placedIds = new Set(working.placements.map(placementId));
  const unplaced = floorUnits.filter((u) => !placedIds.has(u.machineId));
  const placedFootprints = () =>
    mapMachines.filter((m) => m.size).map((m) => ({ footprint: footprint(m.placement, m.size!) }));
  const markerCentres = () => mapMachines.filter((m) => !m.size).map((m) => ({ x: m.placement.x, y: m.placement.y }));
  const placeOne = (id: string) => {
    const spot = freeSpot({ shape, places: working.room.places, placed: placedFootprints(), markers: markerCentres(), size: sizeOf(id) }, id);
    if (spot) {
      dispatch({ type: "place", id, at: spot });
      return;
    }
    dispatch({ type: "place", id, at: middleOf(shape, id) });
    toast("No clear spot: placed in the middle. Move it where it goes.", "info");
  };
  const placeEvery = () => {
    const { placed, noRoom } = placeAll(
      { shape, places: working.room.places, placed: placedFootprints(), markers: markerCentres() },
      unplaced.map((u) => ({ id: u.machineId, size: sizeOf(u.machineId) })),
    );
    dispatch({ type: "placeMany", at: [...placed, ...noRoom.map((id) => middleOf(shape, id))] });
    if (noRoom.length > 0) {
      const names = noRoom.map((id) => unitById.get(id)?.name ?? id);
      toast(`${listWords(names)} didn't fit along the walls; ${noRoom.length === 1 ? "it's" : "they're"} in the middle.`, "info", 8000);
    }
  };

  /* ── The room tool ──────────────────────────────────────────────── */
  const visibleCentre = (): PlanPoint => {
    const el = frameRef.current;
    if (!el || el.clientWidth === 0) return { x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 };
    return frame.toMm({ x: el.scrollLeft + el.clientWidth / 2, y: el.scrollTop + el.clientHeight / 2 });
  };
  const doors = working.room.places.filter((p) => p.kind === "door").length;
  const [sqFtText, setSqFtText] = useState("");
  const [sqFtProblem, setSqFtProblem] = useState<string | null>(null);
  const readSqFt = (text: string): number | null => {
    const n = Number(text.trim().replace(/,/g, ""));
    return Number.isInteger(n) && n >= PLAN_LIMITS.sqFtMin && n <= PLAN_LIMITS.sqFtMax ? n : null;
  };

  /* ── The selected thing's panel ─────────────────────────────────── */
  const sel = state.selectedId;
  const selKind = sel ? kindOfId(sel) : null;
  let panel: PanelItem | null = null;
  if (sel && selKind === "box") {
    const i = working.room.boxes.findIndex((b) => b.id === sel);
    if (i >= 0) panel = { kind: "box", box: working.room.boxes[i], index: i + 1, canRemove: working.room.boxes.length > 1 };
  } else if (sel && selKind === "place") {
    const p = working.room.places.find((x) => x.id === sel);
    if (p) panel = { kind: "place", place: p };
  } else if (sel && selKind === "planned") {
    const p = working.placements.find((x): x is PlannedPlacement => isPlanned(x) && x.id === sel);
    const read = plannedReads.get(sel);
    if (p && read) {
      panel = {
        kind: "planned",
        id: sel,
        label: p.label,
        size: plannedKnownSize(read),
        source: plannedSizeWords(p, read, models),
        lines: (checks.linesById.get(sel) ?? []).map((l) => l.text),
        swap: swapCandidates(
          p,
          unplaced.map((u) => ({ machineId: u.machineId, name: u.name, movementId: units[u.machineId]?.movementId ?? null })),
        ),
      };
    }
  } else if (sel) {
    const m = mapMachines.find((x) => x.id === sel);
    if (m) {
      const read = sizeReads.get(sel);
      panel = {
        kind: "machine",
        id: sel,
        name: m.planned ? `${m.name} (to buy)` : m.name,
        code: m.code,
        size: m.size,
        source: read ? sizeSourceWords(read, nameOf) : m.planned ? "Size not known yet." : "",
        lines: (checks.linesById.get(sel) ?? []).map((l) => l.text),
      };
    }
  }
  const actions: PanelActions = {
    movable: state.tool === "machines",
    onTurn: (by) => dispatch({ type: "turn", by }),
    onToWall: () => sel && dispatch({ type: "toWall", size: sizeOf(sel) }),
    onTakeOff: () => sel && dispatch({ type: "takeOff", id: sel }),
    onNudge: (dir) => dispatch({ type: "nudge", dir, marker: !!sel && !sizeOf(sel) }),
    onTypedBox: (id, w, h) => dispatch({ type: "typedBox", id, wMm: w, hMm: h }),
    onRemoveBox: (id) => dispatch({ type: "removeBox", id }),
    onLabel: (id, text) => dispatch({ type: "label", id, text }),
    onTypedPlace: (id, w, h) => dispatch({ type: "typedPlace", id, wMm: w, hMm: h }),
    onRemovePlace: (id) => dispatch({ type: "removePlace", id }),
    onSwapIn: (plannedId, machineId) => dispatch({ type: "swapIn", plannedId, machineId }),
  };

  /* ── Sizes, the square footage, the practice layout ─────────────── */
  const [sizesOpen, setSizesOpen] = useState(false);
  const noSize = floor.filter((m) => !sizes.get(m.machineId)).length;
  const tally = useMemo(() => {
    let sized = 0;
    let unsized = 0;
    let mm2 = 0;
    let planned = 0;
    for (const m of mapMachines) {
      if (!m.size) {
        if (!m.planned) unsized++;
        continue;
      }
      sized++;
      mm2 += m.size.lengthMm * m.size.widthMm;
      if (m.planned) planned += m.size.lengthMm * m.size.widthMm;
    }
    return { sized, unsized, mm2, planned };
  }, [mapMachines]);
  const [practiceAsk, setPracticeAsk] = useState(false);
  const startFromPractice = () => {
    const { room, placements } = practiceLayout(
      floor.map((m) => ({ machineId: m.machineId, basedOn: units[m.machineId]?.movementId ?? null })),
      sizeOf,
    );
    dispatch({ type: "practice", room, placements });
  };
  const safetyWords = (() => {
    const aed = working.room.places.filter((p) => p.kind === "aed").length;
    const ext = working.room.places.filter((p) => p.kind === "extinguisher").length;
    const parts = [aed ? `AED${aed > 1 ? ` ×${aed}` : ""}` : "", ext ? `Fire extinguisher${ext > 1 ? ` ×${ext}` : ""}` : ""].filter(Boolean);
    return parts.join(" · ");
  })();

  /* ── The map and its remodel plans ─────────────────────────────── */
  const planned = working.placements.filter(isPlanned);
  const plannedCount = planned.length;
  const stillToBuy = stillToBuyWords(planned);
  const tabs = (
    <DraftTabs
      studioId={studioId}
      current={plans.current}
      drafts={plans.drafts}
      slots={plans.slots}
      open={openId}
      dirty={state.dirty}
      authUid={authUid}
      onOpen={(id) => guard(() => showTab(id, null))}
      onPlan={planRemodel}
      onShow={showTab}
      onRenamed={(id, from, to) => {
        // Only a copy based on the rev the rename moved from moves with it; one based on an older rev keeps its
        // base, so the newer copy's note stays and Save keeps the work as a plan instead of overwriting it.
        const s = stateRef.current;
        if (s.base.id === id && s.dirty && s.base.rev === from) dispatch({ type: "unsaved", rev: to });
      }}
      guard={guard}
    />
  );

  /* ── The states ─────────────────────────────────────────────────── */
  // A phone never draws the floor (the hosts don't offer it there). An iPad
  // narrowed into Split View keeps the editor mounted, so nothing typed is
  // lost, and draws it again when it widens.
  if (phone) {
    return (
      <div className="smap-editor">
        <p className="smap-note">The floor is arranged on an iPad.</p>
        <div className="smap-bar">
          <AdminButton variant="ghost" onClick={onDone}>
            Done
          </AdminButton>
        </div>
      </div>
    );
  }
  if (failed) return <AdminNotice tone="warn">Can't read this studio's machines right now.</AdminNotice>;
  if (loading || plans.state === "loading" || plans.state === "off") return <p className="smap-quiet">{PLAN_WORDS.loading}</p>;
  if (plans.state === "unreadable") return <AdminNotice tone="warn">{PLAN_WORDS.unreadable}</AdminNotice>;
  if (floor.length === 0) {
    return (
      <div className="smap-editor">
        <p className="smap-note">Add machines to the floor first.</p>
        <div className="smap-bar">
          <AdminButton onClick={onDone}>Done</AdminButton>
        </div>
      </div>
    );
  }

  if (working.room.boxes.length === 0) {
    const draw = () => {
      const n = readSqFt(sqFtText);
      if (n === null) {
        setSqFtProblem("Between 200 and 20,000 sq ft.");
        return;
      }
      dispatch({ type: "firstRoom", areaSqFt: n });
    };
    return (
      <div className="smap-editor">
        {plans.drafts.length > 0 && tabs}
        <div className="smap-start">
          <label className="smap-start__title" htmlFor="smap-sqft">
            How big is the studio?
          </label>
          <div className="smap-start__row">
            <AdminInput
              id="smap-sqft"
              className="smap-num"
              inputMode="numeric"
              value={sqFtText}
              invalid={!!sqFtProblem}
              onChange={(e) => {
                setSqFtText(e.target.value);
                setSqFtProblem(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") draw();
              }}
            />
            <span className="smap-quiet">sq ft</span>
            <AdminButton variant="primary" onClick={draw}>
              Draw the room
            </AdminButton>
          </div>
          {sqFtProblem && <p className="smap-form__problem">{sqFtProblem}</p>}
          {isDemo && (
            <div className="smap-start__row">
              <AdminButton onClick={startFromPractice}>Start from the practice layout</AdminButton>
            </div>
          )}
        </div>
        <div className="smap-bar">
          <AdminButton variant="ghost" onClick={onDone}>
            Done
          </AdminButton>
        </div>
      </div>
    );
  }

  const newer = !!open && state.dirty && (state.base.rev === null || open.rev > state.base.rev);
  const roomLine = state.tool === "room" ? roomProblems(working.room.boxes, shape)[0] : undefined;

  return (
    <div className="smap-editor">
      {/* The page's one note. */}
      {newer ? (
        <p className="smap-note" role="status">
          {(open && nameOf(open.updatedBy)) || "Someone"} saved {onDraft ? `a newer copy of ${open?.name ?? "this plan"}` : "a newer layout"}. Yours is still
          on screen; Save keeps it as a plan.
        </p>
      ) : note ? (
        <p className="smap-note" role="status">
          {note}
        </p>
      ) : working.gone.length > 0 ? (
        <p className="smap-note">
          {working.gone.length === 1
            ? "1 machine on this layout is no longer on the floor list, so it's left off the drawing."
            : `${working.gone.length} machines on this layout are no longer on the floor list, so they're left off the drawing.`}
          <AdminButton variant="ghost" onClick={() => dispatch({ type: "dropGone" })}>
            Take them off the layout
          </AdminButton>
        </p>
      ) : null}

      {/* The map and its remodel plans. */}
      {tabs}

      {/* The bar: the tool, Undo, Save, Done. */}
      <div className="smap-bar">
        <div className="smap-tool" role="group" aria-label="Tool">
          {(
            [
              ["machines", "Machines"],
              ["room", "The room"],
            ] as [Tool, string][]
          ).map(([t, word]) => (
            <button key={t} type="button" className="smap-tool__btn" aria-pressed={state.tool === t} onClick={() => dispatch({ type: "tool", tool: t })}>
              {word}
            </button>
          ))}
        </div>
        <span className="smap-bar__gap" />
        {state.history.length > 0 && <AdminButton onClick={() => dispatch({ type: "undo" })}>Undo</AdminButton>}
        {state.dirty && (
          <AdminButton variant="primary" onClick={save}>
            Save
          </AdminButton>
        )}
        <AdminButton variant="ghost" onClick={onDone}>
          Done
        </AdminButton>
      </div>

      {/* The tally, and the zoom beside it: nothing drawn is ever under a control. */}
      <div className="smap-area-row">
        <p className="smap-area" aria-live="polite">
          {areaWords(shape, working.room.areaSqFt, tally)}
        </p>
        <div className="smap-zoom" role="group" aria-label="Zoom">
          <button type="button" className="smap-zoom__btn" aria-label="Zoom out" disabled={zoomIx === 0} onClick={() => setZoomIx((i) => Math.max(0, i - 1))}>
            −
          </button>
          <button
            type="button"
            className="smap-zoom__btn"
            aria-label="Fit the room"
            disabled={fitted}
            onClick={() => {
              setZoomIx(0);
              setFitTick((t) => t + 1);
            }}
          >
            Fit
          </button>
          <button
            type="button"
            className="smap-zoom__btn"
            aria-label="Zoom in"
            disabled={zoomIx === ZOOMS.length - 1}
            onClick={() => setZoomIx((i) => Math.min(ZOOMS.length - 1, i + 1))}
          >
            +
          </button>
        </div>
      </div>

      {/* The drawing. */}
      <div className="smap-stage">
        <div ref={frameRef} className={`smap-frame smap-frame--arrange smap-frame--${state.tool}`}>
          <StudioRoom
            ariaLabel={`${studioName}'s map`}
            room={displayRoom}
            shape={shape}
            bounds={drawnBounds}
            machines={mapMachines}
            widthPx={widthPx}
            heightPx={box.h}
            zoom={zoom}
            selectedId={selKind === "unit" || selKind === "planned" ? sel : null}
            warnIds={warnIds}
            ariaOf={(id) => {
              const lines = checks.linesById.get(id);
              return lines && lines.length ? lines.map((l) => l.text.replace(/\.$/, "").toLowerCase()).join(", ") : null;
            }}
            onPick={(id) => dispatch({ type: "select", id })}
            interaction={interaction}
          />
        </div>
      </div>

      {/* The selected thing. */}
      {/* Keyed on the size too, so its Width and Length boxes follow an edge that was dragged. */}
      {panel && (
        <ItemPanel
          key={panel.kind === "box" ? `${sel}:${panel.box.w}x${panel.box.h}` : panel.kind === "place" ? `${sel}:${panel.place.w}x${panel.place.h}` : (sel ?? "")}
          item={panel}
          actions={actions}
        />
      )}

      {state.tool === "machines" ? (
        <>
          {noSize > 0 && (
            <p className="smap-note">
              {noSize === 1 ? "1 machine has no size yet." : `${noSize} machines have no size yet.`}
              <AdminButton onClick={() => setSizesOpen(true)}>Sizes</AdminButton>
            </p>
          )}
          {(unplaced.length > 0 || onDraft) && (
            <section className="smap-editor" aria-label="Not placed yet">
              {unplaced.length > 0 && <h3 className="smap-h">Not placed yet</h3>}
              <div className="smap-chips">
                {unplaced.map((u) => (
                  <button key={u.machineId} type="button" className="smap-chip" onClick={() => placeOne(u.machineId)}>
                    <span className="smap-chip__name">{u.name}</span>
                  </button>
                ))}
                {unplaced.length >= 2 && (
                  <AdminButton variant="primary" onClick={placeEvery}>
                    Place them all
                  </AdminButton>
                )}
                {/* Machines the studio doesn't own yet go on a remodel plan, never on the map. */}
                {onDraft && plannedCount < PLAN_LIMITS.planned && (
                  <AdminButton onClick={() => setBuyOpen(true)}>
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    Add a machine to buy
                  </AdminButton>
                )}
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="smap-editor" aria-label="The room">
          {working.room.boxes.length === 1 && <p className="smap-quiet">Drag an edge where the walls narrow; Add a box where the room gets bigger.</p>}
          {roomLine && <p className="smap-note">{roomLine}</p>}
          <div className="smap-chips" role="group" aria-label="Add to the room">
            {working.room.boxes.length < PLAN_LIMITS.boxes && (
              <button type="button" className="smap-palette__chip" onClick={() => dispatch({ type: "addBox" })}>
                <Plus className="w-4 h-4" aria-hidden="true" />
                Add a box
              </button>
            )}
            {PLACE_KINDS.map((kind) => {
              const Glyph = PLACE_GLYPHS[kind];
              const full = working.room.places.length >= PLAN_LIMITS.places || (kind === "door" && doors >= PLAN_LIMITS.doors);
              return (
                <button
                  key={kind}
                  type="button"
                  className="smap-palette__chip"
                  disabled={full}
                  onClick={() => dispatch({ type: "addPlace", kind, at: visibleCentre() })}
                >
                  <Glyph className="w-4 h-4" aria-hidden="true" />
                  {PLACE_WORDS[kind]}
                </button>
              );
            })}
          </div>
          <div className="smap-start__row">
            <label className="smap-row-label" htmlFor="smap-sqft-room">
              Studio size
            </label>
            <AdminInput
              id="smap-sqft-room"
              key={working.room.areaSqFt ?? "none"}
              className="smap-num"
              inputMode="numeric"
              defaultValue={working.room.areaSqFt ? String(working.room.areaSqFt) : ""}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t === "") return dispatch({ type: "setArea", sqFt: null });
                const n = readSqFt(t);
                if (n !== null) dispatch({ type: "setArea", sqFt: n });
              }}
            />
            <span className="smap-quiet">sq ft</span>
          </div>
        </section>
      )}

      {/* The floor in walking order: the list that always works. */}
      <section className="smap-editor" aria-label="The floor in walking order">
        <div className="smap-sizes__head">
          <h3 className="smap-h">The floor in walking order</h3>
          {noSize === 0 && <AdminButton onClick={() => setSizesOpen(true)}>Sizes</AdminButton>}
        </div>
        <ul className="smap-list">
          {floorUnits.map((u, i) => {
            const size = sizes.get(u.machineId);
            const over = checks.warnIds.has(u.machineId);
            const lines = checks.linesById.get(u.machineId)?.map((l) => l.text) ?? [];
            return (
              <li key={u.machineId}>
                <button
                  type="button"
                  className="smap-list__row"
                  aria-pressed={sel === u.machineId}
                  aria-label={[`${i + 1} · ${u.name}`, size ? sizeLine(size) : "size not known", ...(placedIds.has(u.machineId) ? [] : ["not placed yet"]), ...lines].join(", ")}
                  onClick={() => {
                    dispatch({ type: "tool", tool: "machines" });
                    dispatch({ type: "select", id: u.machineId });
                  }}
                >
                  {over && <span className="smap-dot" aria-hidden="true" />}
                  <span className="smap-list__name">
                    {i + 1} · {u.name}
                  </span>
                  <span className="smap-list__meta">
                    {size ? sizeLine(size) : "Size not known"}
                    {!placedIds.has(u.machineId) && " · Not placed yet"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {stillToBuy && <p className="smap-quiet">{stillToBuy}</p>}
        {safetyWords && <p className="smap-quiet">{safetyWords}</p>}
        {isDemo && (
          <div className="smap-bar">
            <AdminButton variant="ghost" onClick={() => setPracticeAsk(true)}>
              Start over from the practice layout
            </AdminButton>
          </div>
        )}
      </section>

      <Dialog open={sizesOpen} onOpenChange={(o) => !o && setSizesOpen(false)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sizes</DialogTitle>
          </DialogHeader>
          {sizesOpen && <SizesSheet studioId={studioId} floor={sizesFloor} units={units} models={models} authUid={authUid} />}
        </DialogContent>
      </Dialog>

      <Dialog open={buyOpen} onOpenChange={(o) => !o && closeBuy()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add a machine to buy</DialogTitle>
          </DialogHeader>
          {buyOpen && <PlanMachineSheet models={models} onAdd={addToBuy} onCancel={() => setBuyOpen(false)} guardRef={buyGuard} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={practiceAsk}
        title="Start over from the practice layout?"
        body={`The room and every machine's spot go back to the practice layout. Nothing is saved until you tap Save; Undo brings back what's on screen now. The practice room is ${sqFtWords(1800)}.`}
        confirmLabel="Start over"
        onConfirm={() => {
          setPracticeAsk(false);
          startFromPractice();
        }}
        onCancel={() => setPracticeAsk(false)}
      />
    </div>
  );
}
