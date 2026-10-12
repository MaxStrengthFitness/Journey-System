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
  draftNames,
  isPlanned,
  LAYOUT_NAME,
  placementId,
  PLACE_KINDS,
  PLACE_WORDS,
  PLAN_LIMITS,
  planProblems,
  reconcile,
  type LoadedPlan,
  type PlaceKind,
  type Placement,
  type PlanPoint,
  type RoomBox,
  type RoomPlace,
} from "../layout";
import { freeSpot, middleOf, placeAll } from "../place";
import { DEAD_PX, editorReducer, emptyWorking, initialEditor, kindOfId, type EditorState, type Tool, type Working } from "../placement";
import { practiceLayout } from "../demo-layout";
import { areaWords, roomProblems, roomShape } from "../room";
import { knownSizeOf, sizeOfUnit, sizeSourceWords, type UnitFacts } from "../sizes";
import { PLAN_WORDS } from "../states";
import { keepAsDraft, saveLayout } from "../store";
import { pickAt, pickRoomItem, handlesFor, type TapTarget } from "../tap";
import { listWords, sizeLine, sqFtWords } from "../units";
import { frameOf, roomBounds, ZOOMS } from "./drawing";
import { ItemPanel, type PanelActions, type PanelItem } from "./ItemPanel";
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
 * copy as a draft. The working copy is unsaved work: leaving asks.
 */
export default function LayoutView(props: LayoutViewProps) {
  if (!props.canLead) {
    return (
      <div className="smap-editor">
        <p className="smap-note">Only a studio leader arranges the floor.</p>
        <div className="smap-bar">
          <AdminButton onClick={props.onDone}>Back to the map</AdminButton>
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

/** The working copy for a stored layout, against the floor. */
function workingOf(plan: LoadedPlan, floor: readonly { machineId: string; name: string; code: string; status: string }[]): Working {
  const r = reconcile(plan, floor);
  return { room: plan.room, placements: [...r.placed.map((p) => p.placement), ...r.planned], gone: r.gone };
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
  const sizeOf = useCallback((id: string): KnownSize | null => sizes.get(id) ?? null, [sizes]);
  const sizesFloor = useMemo(() => floor.map((m) => ({ machineId: m.machineId, name: m.name, source: entryById.get(m.machineId)?.source ?? null })), [floor, entryById]);

  /* ── The working copy ───────────────────────────────────────────── */
  const [state, dispatch] = useReducer(editorReducer, undefined, (): EditorState => ({
    ...initialEditor({ id: CURRENT_ID, rev: null }, emptyWorking(EMPTY_ROOM)),
    tool: "machines",
  }));
  const { working } = state;
  const current = plans.current;
  const floorKey = floorUnits.map((u) => u.machineId).join("|");
  useEffect(() => {
    if (!current) return;
    dispatch({ type: "load", id: CURRENT_ID, rev: current.rev, working: workingOf(current, floorUnits) });
    // The layout's rev and the floor's machines are what change it; a snapshot that differs only in metadata never reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.rev, floorKey, plans.state]);

  const discard = () => {
    if (current) dispatch({ type: "load", id: CURRENT_ID, rev: current.rev, working: workingOf(current, floorUnits), force: true });
    else dispatch({ type: "load", id: CURRENT_ID, rev: null, working: emptyWorking(EMPTY_ROOM), force: true });
  };
  useUnsavedChanges(state.dirty, "the layout", { onDiscard: discard });

  /* ── The room's shape, worked out once per room change ──────────── */
  const shape = useMemo(() => roomShape(working.room.boxes), [working.room.boxes]);
  const bounds = useMemo(() => roomBounds(working.room, shape), [working.room, shape]);
  const [zoomIx, setZoomIx] = useState(0);
  const zoom = ZOOMS[zoomIx];
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [widthPx, setWidthPx] = useState(0);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    setWidthPx(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidthPx(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [working.room.boxes.length > 0]);
  const frame = useMemo(() => frameOf(bounds, widthPx, zoom), [bounds, widthPx, zoom]);

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
        out.push({ id, name: p.label, code: "", placement, size: null, planned: true });
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

  /* ── Save, and a save someone else beat ─────────────────────────── */
  const [note, setNote] = useState<string | null>(null);
  const save = () => {
    if (!authUid) {
      toastError("Sign in again to save the layout.");
      return;
    }
    const copy = working;
    const baseRev = state.base.rev;
    const problem = planProblems({ name: LAYOUT_NAME, room: copy.room, placements: [...copy.placements, ...copy.gone] }, { planId: CURRENT_ID })[0];
    if (problem) {
      toastError(problem);
      return;
    }
    dispatch({ type: "saved", id: CURRENT_ID, rev: (baseRev ?? 0) + 1 });
    setNote(null);
    toastSuccess("Layout saved.");
    void saveLayout(studioId, CURRENT_ID, copy, LAYOUT_NAME, baseRev, authUid).then((out) => {
      if (!("why" in out)) return;
      if (out.why === "changed") {
        const who = (out.by && nameOf(out.by)) || "Someone";
        const name = draftNames.kept(authorName, Date.now());
        void keepAsDraft(studioId, copy, name, plans.slots, authUid).then((kept) => {
          if ("id" in kept) {
            setNote(`${who} saved a newer layout, so yours was kept as a draft, “${name}”.`);
          } else {
            setNote(`${who} saved a newer layout, and all five drafts are in use, so yours is still on screen.`);
            dispatch({ type: "load", id: CURRENT_ID, rev: baseRev, working: copy, force: true, dirty: true });
          }
        });
        return;
      }
      if (out.why === "invalid") toastError(out.problem);
      else if (out.why === "offline-kept") toast("The layout is kept on this iPad and goes to the studio when it's back online.", "info");
      else toastError("The layout wasn't saved. Only a studio leader arranges the floor.");
    });
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
        <p className="smap-note">Add machines to the floor first: switch to List.</p>
        <div className="smap-bar">
          <AdminButton onClick={onDone}>List</AdminButton>
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

  const newer = !!current && state.dirty && (state.base.rev === null || current.rev > state.base.rev);
  const roomLine = state.tool === "room" ? roomProblems(working.room.boxes, shape)[0] : undefined;

  return (
    <div className="smap-editor">
      {/* The page's one note. */}
      {newer ? (
        <p className="smap-note" role="status">
          {(current && nameOf(current.updatedBy)) || "Someone"} saved a newer layout. Yours is still on screen; Save keeps it as a draft.
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

      <p className="smap-area" aria-live="polite">
        {areaWords(shape, working.room.areaSqFt, tally)}
      </p>

      {/* The drawing. */}
      <div className="smap-stage">
        <div ref={frameRef} className={`smap-frame smap-frame--arrange smap-frame--${state.tool}`}>
          <StudioRoom
            ariaLabel={`${studioName}'s map`}
            room={displayRoom}
            shape={shape}
            bounds={bounds}
            machines={mapMachines}
            widthPx={widthPx}
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
        <div className="smap-zoom" role="group" aria-label="Zoom">
          <button type="button" className="smap-zoom__btn" aria-label="Zoom out" disabled={zoomIx === 0} onClick={() => setZoomIx((i) => Math.max(0, i - 1))}>
            −
          </button>
          <button type="button" className="smap-zoom__btn" aria-label="Fit the room" disabled={zoomIx === 0} onClick={() => setZoomIx(0)}>
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

      {/* The selected thing. */}
      {panel && <ItemPanel key={sel ?? ""} item={panel} actions={actions} />}

      {state.tool === "machines" ? (
        <>
          {noSize > 0 && (
            <p className="smap-note">
              {noSize === 1 ? "1 machine has no size yet" : `${noSize} machines have no size yet`} ·
              <AdminButton onClick={() => setSizesOpen(true)}>Sizes</AdminButton>
            </p>
          )}
          {unplaced.length > 0 && (
            <section className="smap-editor" aria-label="Not placed yet">
              <h3 className="smap-h">Not placed yet</h3>
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
                  <span className="smap-list__meta">{size ? sizeLine(size) : "Size not known"}</span>
                  {!placedIds.has(u.machineId) && <span className="smap-list__meta">Not placed yet</span>}
                </button>
              </li>
            );
          })}
        </ul>
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

      <ConfirmDialog
        open={practiceAsk}
        title="Start over from the practice layout?"
        body={`The room and every machine's spot go back to the practice layout. Nothing is saved until you tap Save; Undo brings back what's on screen now. ${sqFtWords(1800)}.`}
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
