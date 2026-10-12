import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { auth } from "../../../firebase";
import { useStudioMachines } from "../../../hooks/useStudioMachines";
import { studioDateKey } from "../../../lib/studio-time";
import type { Trainer, WorkoutSession } from "../../../types";
import { useMachineModels } from "../../catalog/useMachineModels";
import { movementOf } from "../../catalog/names";
import type { CardDoor, MapMode } from "../../machine-card/parts";
import { CLEAN_WORDS, checklistLine, cleanStateOf, markAllTargets, type CleanState } from "../../relay/board/cleaning";
import { careReadState, useCareRead, useLiveCare } from "../../relay/board/machine-care-context";
import { wearOf } from "../../relay/board/machine-care";
import { careActor, markWiped } from "../../relay/board/machine-care-store";
import { useShiftNow, useWipeRows } from "../../relay/board/useWipeRows";
import type { TaskRow } from "../../studio-tasks/types";
import { footprint } from "../geometry";
import { useFloorPlan } from "../hooks";
import { isSafety, placeName, reconcile, type RoomPlace } from "../layout";
import { relayMapMode, rememberRelayMapMode } from "../map-mode-memory";
import { roomShape } from "../room";
import { knownSizeOf, sizeNeedsModels, sizeOfUnit, unitFactsOfEntry } from "../sizes";
import { roomIsTappable } from "../tap";
import { frameOf, roomBounds } from "./drawing";
import StudioRoom, { type MapMachine } from "./StudioRoom";
import "../studio-map.css";

/**
 * THE MAP, AND THE TEAM'S CLEANING CHECKLIST (the studio map, phase 4, Oct
 * 2026). The read view of My Studio → Machines (and Operations → Floor),
 * Relay's floor and Admins → a studio → Floor. AJ, Oct 10 2026: "the
 * trainers know where all the machines are they dont remember them
 * alphabetically".
 *
 * TWO MODES, ONE ROW. Above the drawing: the switch `Look up | Cleaning`,
 * the head line, and in Cleaning "Mark all {n} wiped" at the row's end, so
 * AJ's "just hit mark all and we'll go do it" never needs a scroll. Arrange
 * the floor is never here: it lives in the host panel's actions.
 *
 *   Look up    a tap opens the machine's card at the door's part.
 *   Cleaning   the team's checklist (AJ: "have the team just check off what
 *              they did just like a a checklist ... it doesn't need to be
 *              that military"): a tap on a machine not wiped today marks it
 *              (one batch, never awaited, Undo on the toast); a tap on one
 *              already wiped opens its card at Clean (a mark can't be taken
 *              back from the map: the record holds only the last wipe).
 *              Mark all is one tap, one batch. Marks arrive live on every
 *              iPad through the screen's one care read. No name, no minute,
 *              no count per person, no claim, no ping.
 *
 * WHICH MODE IT OPENS IN (Oct 11 reviews, A19): My Studio, Operations and
 * Admins always open in Look up and never remember Cleaning; only Relay
 * remembers its mode (map-mode-memory.ts; first time Cleaning, design §G
 * question 1's default). While Cleaning is on, "Tap a machine when it's
 * wiped." is always shown, so the mode is never invisible.
 *
 * A failed or unanswered care read draws no clean marks and no state word
 * (unknown is never a state); a tap still marks, but no toast carries Undo
 * (Journey never restores what it didn't read). A phone never mounts this:
 * the hosts keep the list or the tiles there.
 */
export interface FloorMapViewProps {
  door: Exclude<CardDoor, "catalog">;
  studioId: string;
  studioName: string;
  /**
   * Today's WIPE-CHORE rows when the host has them (Relay, My Studio in
   * Cleaning), already filtered with the studio's categories (`wipeRowsOf`);
   * else the map reads them itself, in Cleaning only.
   */
  rows?: readonly TaskRow[];
  /** Today's sessions (Relay's shell): a machine used since its wipe gets its plum dot. Absent elsewhere. */
  sessions?: readonly WorkoutSession[];
  authTrainer: Trainer | null;
  /** The host opens the one card (machine-card), at the part for this mode. */
  onOpenCard: (machineId: string, mode: MapMode) => void;
  /** Relay's Show the floor: each change switches the map to Cleaning. */
  cleaningAsk?: number;
  /** Told when the mode changes, so a host that reads today's rows for the map and its card reads them only in Cleaning. */
  onModeChange?: (mode: MapMode) => void;
}

const OUT = { className: "smap-m--out", aria: "out of service" } as const;
const WIPED = { className: "smap-m--wiped", aria: "wiped today" } as const;
const USED = { className: "smap-m--used", aria: "used since its wipe, tap when it's wiped" } as const;
/** Cleaning, not wiped today: the empty box where its tick will go. */
const OPEN = { className: "smap-m--open", aria: "tap when it's wiped" } as const;
const OUT_CLEAN = { className: "smap-m--out", aria: "out of service" } as const;

/** "AED · Fire extinguisher ×2": the safety places, said once at the foot of the list. */
export function safetyLineOf(places: readonly RoomPlace[]): string | null {
  const counts = new Map<string, number>();
  for (const p of places) if (isSafety(p.kind)) counts.set(placeName(p), (counts.get(placeName(p)) ?? 0) + 1);
  if (counts.size === 0) return null;
  return [...counts.entries()].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(" · ");
}

export default function FloorMapView({ door, studioId, studioName, rows, sessions, authTrainer, onOpenCard, cleaningAsk, onModeChange }: FloorMapViewProps) {
  const { toast, error: toastError } = useToast();
  const plan = useFloorPlan(studioId, { enabled: true });
  const { machines, rosterEntries, loading: floorLoading, failed: floorFailed } = useStudioMachines(studioId, { includeInactive: false });
  const care = useCareRead(studioId);
  const careState = careReadState(care);
  const live = useLiveCare(studioId, care);
  const shiftNow = useShiftNow(studioId);

  const [mode, setModeState] = useState<MapMode>(() => (door === "relay" ? relayMapMode() : "machines"));
  const setMode = (next: MapMode) => {
    setModeState(next);
    onModeChange?.(next);
    if (door === "relay") rememberRelayMapMode(next);
  };
  // The host hears the mode it opened in too (a map mounted again after the list starts in Look up).
  useEffect(() => {
    onModeChange?.(mode);
    // Once, as it mounts: every later change goes through setMode or the ask below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Relay's Show the floor: Cleaning, whatever was picked.
  const asked = useRef(cleaningAsk ?? 0);
  useEffect(() => {
    if (cleaningAsk === undefined || cleaningAsk === asked.current) return;
    asked.current = cleaningAsk;
    setModeState("cleaning");
    onModeChange?.("cleaning");
    if (door === "relay") rememberRelayMapMode("cleaning");
    // onModeChange is the host's setter; a new one each render changes nothing here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleaningAsk, door]);

  // Today's wipe-chore rows: the host's, else this map's own read, only in Cleaning (a look-up never pays for it).
  const own = useWipeRows(mode === "cleaning" && !rows ? studioId : null);
  const wipeRows = rows ?? own;

  /* The floor in walking order, its sizes, and what is on the map. */
  const entryOf = useMemo(() => new Map(rosterEntries.map((e) => [e.machineId, e])), [rosterEntries]);
  const floor = useMemo(
    () => machines.map((m) => ({ machineId: m.machineId, name: m.name, code: movementOf({ id: m.machineId, comparisonKey: m.comparisonKey, name: m.name })?.code ?? "", status: m.rosterStatus })),
    [machines],
  );
  // The models are read while any unit names one or is a catalog copy that takes its Imagine Strength size.
  const needsModels = rosterEntries.some((e) => sizeNeedsModels(unitFactsOfEntry(e)));
  const models = useMachineModels(needsModels);
  const shape = useMemo(() => (plan.plan ? roomShape(plan.plan.room.boxes) : null), [plan.plan]);
  const drawn = useMemo(() => {
    if (!plan.plan) return { machines: [] as MapMachine[], loading: false };
    const { placed } = reconcile(plan.plan, floor);
    let loading = false;
    const out: MapMachine[] = [];
    for (const { machine, placement } of placed) {
      const e = entryOf.get(machine.machineId);
      const read = sizeOfUnit(unitFactsOfEntry(e), models);
      if (read.state === "loading") loading = true;
      out.push({ id: machine.machineId, name: machine.name, code: machine.code, placement, size: knownSizeOf(read) });
    }
    return { machines: out, loading };
  }, [plan.plan, floor, entryOf, models]);

  /* The checklist's states, for every machine on the floor. */
  const todayKey = studioDateKey(new Date()) ?? "";
  const nowMs = Date.now();
  const outIds = useMemo(() => new Set(machines.filter((m) => m.rosterStatus === "maintenance").map((m) => m.machineId)), [machines]);
  const states = useMemo(() => {
    const out = new Map<string, CleanState>();
    for (const m of machines) {
      const record = care.byMachineId[m.machineId];
      const wear = sessions ? wearOf(m.machineId, { sessions: [...sessions], care: record, now: nowMs }) : null;
      out.set(m.machineId, cleanStateOf({ careRead: careState, care: record, wear, todayKey, nowMs, outOfService: outIds.has(m.machineId) }));
    }
    return out;
    // nowMs moves every render; the states follow the reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines, care.byMachineId, careState, sessions, todayKey, outIds]);
  const ordered = useMemo(() => machines.map((m) => ({ machineId: m.machineId, state: states.get(m.machineId) ?? "unknown" })), [machines, states]);
  const line = checklistLine(ordered.map((r) => r.state));
  const targets = markAllTargets(ordered);
  const floorIds = useMemo(() => new Set(machines.map((m) => m.machineId)), [machines]);
  const nameOf = (id: string) => machines.find((m) => m.machineId === id)?.name ?? "The machine";

  /* Width: measured before the drawing is drawn, so a room too small to tap is the list. */
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const measure = () => setWidth((w) => (w === el.clientWidth ? w : el.clientWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  const tappable = useMemo(() => {
    if (!plan.plan || !shape) return false;
    const f = frameOf(roomBounds(plan.plan.room, shape), width);
    return roomIsTappable(
      f.mmPerPx,
      drawn.machines.map((m) => ({ footprint: m.size ? footprint(m.placement, m.size) : null, centre: { x: m.placement.x, y: m.placement.y } })),
    );
  }, [plan.plan, shape, width, drawn.machines]);

  /* Marking. One batch, never awaited; Undo only when the care read answered. */
  const mark = (ids: string[], words: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toastError("Sign in again before marking machines wiped.");
      return;
    }
    const res = markWiped({
      studioId,
      machineIds: ids,
      floorIds,
      author: careActor(uid, authTrainer?.fullName),
      taskAuthor: authTrainer?.id ? { id: authTrainer.id, name: authTrainer.fullName ?? "A trainer" } : null,
      before: careState === "ready" ? care.byMachineId : null,
      live,
      rows: wipeRows,
      shiftNow,
    });
    if (res.written.length === 0) return;
    res.done.catch((err: unknown) => {
      console.warn("[studio map] marking failed:", err);
      toastError("Couldn't mark those. Check your connection.");
    });
    const undo = res.undo;
    toast(words, "success", 8000, undo ? { label: "Undo", run: () => void undo().catch(() => toastError("Couldn't undo that.")) } : undefined);
  };
  const tapMachine = (id: string) => {
    if (mode === "machines") return onOpenCard(id, "machines");
    const state = states.get(id);
    if (state === "wiped" || state === "out") return onOpenCard(id, "cleaning");
    mark([id], `${nameOf(id)} wiped today.`);
  };
  const markAll = () => {
    if (targets.length === 0) return;
    mark(targets, `${targets.length} ${targets.length === 1 ? "machine" : "machines"} marked wiped today.`);
  };

  const markOf = (id: string) => {
    const s = states.get(id);
    if (s === "out") return mode === "cleaning" ? OUT_CLEAN : OUT;
    if (mode !== "cleaning") return null;
    if (s === "wiped") return WIPED;
    if (s === "used") return USED;
    if (s === "open") return OPEN;
    return null;
  };

  /* ---- states of the map ---- */
  if (plan.state === "loading" || plan.state === "off" || (floorLoading && machines.length === 0)) {
    return <p className="smap-quiet">Loading the map…</p>;
  }
  if (plan.state === "unreadable" || floorFailed) return <p className="smap-quiet">Can't show the map right now.</p>;
  if (plan.state === "empty" || !plan.plan || !shape) return <p className="smap-quiet">No map yet.</p>;

  const safety = safetyLineOf(plan.plan.room.places);
  const cleaning = mode === "cleaning";

  return (
    <div ref={setEl} className="smap-map" data-door={door} data-mode={mode}>
      <div className="smap-head">
        <div className="smap-mode" role="group" aria-label="What a tap does">
          <button type="button" className="smap-mode__btn" aria-pressed={!cleaning} onClick={() => setMode("machines")}>
            Look up
          </button>
          <button type="button" className="smap-mode__btn" aria-pressed={cleaning} onClick={() => setMode("cleaning")}>
            Cleaning
          </button>
        </div>
        {cleaning && (
          <p className="smap-head__line">
            {line ?? (careState === "loading" ? "Reading the cleaning marks…" : "Can't read the cleaning marks right now.")}
          </p>
        )}
        {cleaning && targets.length > 0 && (
          <button type="button" className="smap-btn smap-btn--primary" onClick={markAll}>
            <Check size={16} aria-hidden />
            {`Mark all ${targets.length} wiped`}
          </button>
        )}
      </div>
      {cleaning && <p className="smap-quiet">Tap a machine when it's wiped.</p>}

      {drawn.loading ? (
        <p className="smap-quiet">Loading the map…</p>
      ) : !tappable ? (
        <p className="smap-quiet">Too small to tap at this width. Use the list below.</p>
      ) : (
        <div className="smap-frame">
          <StudioRoom
            ariaLabel={`${studioName}'s map`}
            room={plan.plan.room}
            shape={shape}
            machines={drawn.machines}
            widthPx={width}
            markOf={markOf}
            onPick={tapMachine}
          />
        </div>
      )}

      <ol className="smap-clean" aria-label={`${studioName}'s floor in walking order`}>
        {machines.map((m) => {
          const s = states.get(m.machineId) ?? "unknown";
          const word = cleaning ? CLEAN_WORDS[s] : s === "out" ? CLEAN_WORDS.out : "";
          return (
            <li key={m.machineId} className="smap-clean__row" data-id={m.machineId}>
              {cleaning && (
                <button
                  type="button"
                  className="smap-tick"
                  aria-pressed={s === "wiped"}
                  aria-label={`Mark ${m.name} wiped`}
                  disabled={s === "out"}
                  onClick={() => (s === "wiped" ? onOpenCard(m.machineId, "cleaning") : mark([m.machineId], `${m.name} wiped today.`))}
                >
                  <span className="smap-tick__box" aria-hidden>
                    {s === "wiped" && <Check size={16} strokeWidth={3} />}
                  </span>
                </button>
              )}
              <button type="button" className="smap-clean__name" onClick={() => onOpenCard(m.machineId, mode)}>
                {m.name}
              </button>
              {word && <span className={s === "used" ? "smap-clean__state smap-clean__state--used" : "smap-clean__state"}>{word}</span>}
            </li>
          );
        })}
      </ol>
      {safety && <p className="smap-quiet">{safety}</p>}
    </div>
  );
}
