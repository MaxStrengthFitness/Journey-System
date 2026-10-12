import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Flag } from "lucide-react";
import { useActiveStudio } from "../../../contexts/ActiveStudioContext";
import { useToast } from "../../../contexts/ToastContext";
import { useStudioMachines } from "../../../hooks/useStudioMachines";
import { cn } from "../../../lib/utils";
import type { TaskRow } from "../../studio-tasks/types";
import { MachineCard } from "../../machine-card/MachineCard";
import type { MapMode } from "../../machine-card/parts";
import { useFloorPlan } from "../../studio-map/hooks";
import { reconcile } from "../../studio-map/layout";
import { LazyFloorMapView } from "../../studio-map/lazy";
import { relayMapMode, rememberRelayMapMode } from "../../studio-map/map-mode-memory";
import { usePhone } from "../../phone/device";
import { UnsavedChangesScope, useLeaveScope } from "../../unsaved-changes";
import { useRelay } from "./RelayContext";
import {
  DEFAULT_DEEP_CLEAN_DAYS,
  DEFAULT_WIPE_AFTER_SESSIONS,
  HEAT_WORD,
  groupFloor,
  wearOf,
  weeklyMaintenanceLine,
  type MachineWear,
} from "./machine-care";
import { CLEAN_WORDS, checklistLine, cleanStateOf, markAllTargets, wipeRowsOf, type CleanState } from "./cleaning";
import { careReadState, useCareRead } from "./machine-care-context";
import { careActor, markWiped } from "./machine-care-store";
import { relayFloorView, rememberRelayFloorView, type RelayFloorView } from "./floor-view-memory";
import { useStudioSettings } from "../../studio-settings";
import "../planner.css";
import "./relay.css";

/**
 * THE FLOOR — Relay's floor of machines (Relay, Sep 2026; on the studio's
 * map since the studio map's phase 4, Oct 2026).
 *
 * ON THE MAP when the studio has one (not on a phone, the map read and at
 * least one machine of the roster on it, never the bridge's catalog
 * stand-in): the same map every door draws, with the AED and the fire
 * extinguisher, and its two modes, Look up and Cleaning. `Map | Tiles` in
 * the head row, remembered on this iPad (floor-view-memory.ts).
 *
 * THE TILES otherwise (no map yet, a phone, or chosen): one tile per
 * machine, grouped like the Catalog, warming with sessions since its wipe,
 * with the same Look up | Cleaning switch. In Cleaning each tile carries
 * its tick and its word and a tap marks it: this is where a phone cleans,
 * and three trainers can split the cleaning before a map is ever drawn.
 *
 * THE CARD. The care sheet is retired: a tap in Look up opens the one
 * machine card (features/machine-card) in the Context Panel, Clean open,
 * keyed by machine. Through relay.openPanel it is given ids and callbacks
 * only: its care record is the screen's one live read (useCareRead), so
 * Deep cleaned while it is open shows at once.
 *
 * ON THE BOARD (the Relay Board rebuild, Oct 3 2026) it sits under the cards
 * of today's parts, folded to its one line until something on the floor
 * asks for a hand: a machine wanting a wipe, due a deep clean, or flagged
 * opens it by itself, and the wipe chore's Show the floor opens it in
 * Cleaning. A tap on the line opens or folds it either way.
 */
export function FloorMap({ rows, showCleaning = 0 }: { rows: TaskRow[]; showCleaning?: number }) {
  const relay = useRelay();
  const studioId = relay.studioId;
  const { activeStudio } = useActiveStudio();
  const { error: toastError, toast } = useToast();
  const phone = usePhone();
  const { machines, source, loading: machinesLoading, failed: machinesFailed } = useStudioMachines(studioId, { bridgeWhenRosterEmpty: true });
  const care = useCareRead(studioId);
  const careState = careReadState(care);
  /*
   * THE STUDIO'S OWN CLEANING LOG (the second wave, Sep 28 2026): the deep
   * clean's interval, the wipe-after number and the weekly maintenance day
   * are the studio's settings (features/studio-settings).
   */
  const settings = useStudioSettings(studioId, activeStudio);
  const deepDays = settings.value("deepCleanDays") ?? DEFAULT_DEEP_CLEAN_DAYS;
  const wipeAfter = settings.value("wipeAfterSessions") ?? DEFAULT_WIPE_AFTER_SESSIONS;
  const weekly = weeklyMaintenanceLine(settings.value("weeklyMaintenanceDay"), relay.now.todayKey);

  /* The map, when there is one to draw. */
  const plan = useFloorPlan(studioId, { enabled: !phone });
  const placed = useMemo(
    () =>
      plan.state === "ready" && plan.plan && source === "roster"
        ? reconcile(plan.plan, machines.map((m) => ({ machineId: m.machineId, name: m.name, code: "", status: m.rosterStatus }))).placed.length
        : 0,
    [plan.state, plan.plan, source, machines],
  );
  const mapDrawable = !phone && !machinesFailed && placed > 0;
  const [view, setViewState] = useState<RelayFloorView>(relayFloorView);
  const setView = (next: RelayFloorView) => {
    setViewState(next);
    rememberRelayFloorView(next);
    // The map keeps the mode in the same memory: the tiles pick it up where the map left it.
    setModeState(relayMapMode());
  };
  const shownView: RelayFloorView = mapDrawable ? view : "tiles";

  /* The mode the tiles share with the map: remembered on this iPad (Relay alone does). */
  const [mode, setModeState] = useState<MapMode>(relayMapMode);
  const setMode = (next: MapMode) => {
    setModeState(next);
    rememberRelayMapMode(next);
  };

  const tiles = useMemo(() => {
    const list = machines.length
      ? machines.map((m) => ({ id: m.machineId, name: m.name, movementPattern: m.movementPattern ?? null }))
      : relay.machines.filter((m) => m.id).map((m) => ({ id: m.id!, name: m.name, movementPattern: null }));
    return groupFloor(list);
  }, [machines, relay.machines]);
  const outIds = useMemo(() => new Set(machines.filter((m) => m.rosterStatus === "maintenance").map((m) => m.machineId)), [machines]);
  const order = useMemo(() => tiles.flatMap((g) => g.machines), [tiles]);
  const floorIds = useMemo(() => new Set(order.map((m) => m.id)), [order]);

  const now = Date.now();
  const wear = useMemo(() => {
    const out: Record<string, MachineWear> = {};
    for (const m of order) out[m.id] = wearOf(m.id, { sessions: relay.sessions, care: care.byMachineId[m.id], now, deepCleanDays: deepDays, wipeAfterSessions: wipeAfter });
    return out;
    // `now` moves every render; the wear follows its reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, relay.sessions, care.byMachineId, deepDays, wipeAfter]);
  const states = useMemo(() => {
    const out = new Map<string, CleanState>();
    for (const m of order) {
      out.set(m.id, cleanStateOf({ careRead: careState, care: care.byMachineId[m.id], wear: wear[m.id] ?? null, todayKey: relay.now.todayKey, nowMs: now, outOfService: outIds.has(m.id) }));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, careState, care.byMachineId, wear, relay.now.todayKey, outIds]);
  const ordered = useMemo(() => order.map((m) => ({ machineId: m.id, state: states.get(m.id) ?? ("unknown" as CleanState) })), [order, states]);
  const checklist = checklistLine(ordered.map((r) => r.state));
  const targets = markAllTargets(ordered);
  const wipeRows = useMemo(() => wipeRowsOf(rows), [rows]);

  /* The card, in the Context Panel: ids and callbacks only (its reads are its own, live). */
  const cardScope = useLeaveScope();
  const openCard = (m: { id: string; name: string }, at: MapMode) => {
    const id = m.id;
    relay.openPanel({
      id: `card:${id}`,
      kicker: "Machine",
      title: m.name,
      tall: true,
      guard: cardScope.guard,
      body: (
        <UnsavedChangesScope scope={cardScope}>
          <MachineCard
            key={id}
            door="relay"
            mode={at}
            studioId={studioId ?? ""}
            studioName={relay.studioName}
            machineId={id}
            authTrainer={relay.authTrainer}
            trainers={relay.trainers}
            onOpenCatalogPage={relay.openCatalogMachine}
            onClose={relay.closePanel}
            nameShown={false}
          />
        </UnsavedChangesScope>
      ),
    });
  };
  const openCardById = (id: string, at: MapMode) => openCard({ id, name: order.find((m) => m.id === id)?.name ?? "Machine" }, at);

  /* Marking on the tiles: one batch, never awaited; Undo when the care read answered. */
  const mark = (ids: string[], words: string) => {
    if (!studioId || !relay.uid) {
      toastError("Sign in again before marking machines wiped.");
      return;
    }
    const res = markWiped({
      studioId,
      machineIds: ids,
      floorIds,
      author: careActor(relay.uid, relay.authTrainer?.fullName),
      taskAuthor: relay.authTrainer?.id ? { id: relay.authTrainer.id, name: relay.authTrainer.fullName ?? "A trainer" } : null,
      before: careState === "ready" ? care.byMachineId : null,
      rows: wipeRows,
    });
    if (res.written.length === 0) return;
    res.done.catch((err: unknown) => {
      console.warn("[relay] marking failed:", err);
      toastError("Couldn't mark those. Check your connection.");
    });
    const undo = res.undo;
    toast(words, "success", 8000, undo ? { label: "Undo", run: () => void undo().catch(() => toastError("Couldn't undo that.")) } : undefined);
  };
  const tapTile = (m: { id: string; name: string }) => {
    if (mode === "machines") return openCard(m, "machines");
    const s = states.get(m.id);
    if (s === "wiped" || s === "out") return openCard(m, "cleaning");
    mark([m.id], `${m.name} wiped today.`);
  };

  const flagged = Object.values(care.byMachineId).filter((c) => c.flag).length;
  const hot = Object.values(wear).filter((w) => w.heat >= 2).length;
  const wantWipe = Object.values(wear).filter((w) => w.wantsWipe).length;
  const deepDue = Object.values(wear).filter((w) => w.deepDue).length;
  // Folded until the floor asks for a hand; a tap decides either way.
  const asks = wantWipe + flagged + deepDue > 0;
  const [choice, setChoice] = useState<boolean | null>(null);
  const shown = choice ?? asks;

  // The wipe chore's Show the floor: open, in Cleaning, in view.
  const sectionRef = useRef<HTMLElement | null>(null);
  const seen = useRef(showCleaning);
  useEffect(() => {
    if (showCleaning === seen.current) return;
    seen.current = showCleaning;
    setChoice(true);
    setModeState("cleaning");
    rememberRelayMapMode("cleaning");
    sectionRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [showCleaning]);

  const cleaning = mode === "cleaning";
  // On the map, its own row says the checklist; the fold's line keeps the floor's counts.
  const sayChecklist = cleaning && shownView === "tiles";
  const sub = care.error
    ? "Can't read the cleaning marks right now."
    : sayChecklist
      ? (checklist ?? "Can't read the cleaning marks right now.")
      : [
          wantWipe ? `${wantWipe} ${wantWipe === 1 ? "wants" : "want"} a wipe` : null,
          hot && !wantWipe ? `${hot} running hot` : null,
          flagged ? `${flagged} flagged` : null,
          deepDue > 0 ? `${deepDue} due a deep clean` : null,
        ]
          .filter(Boolean)
          .join(" · ") || `A machine wants a wipe after ${wipeAfter} ${wipeAfter === 1 ? "session" : "sessions"}`;

  return (
    <section ref={sectionRef} className="fm" aria-label="The floor">
      <button type="button" className="rl-h fm__head" aria-expanded={shown} onClick={() => setChoice(!shown)}>
        {shown ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        <h2 className="rl-h__title">The floor</h2>
        <span className="rl-h__sub">{sub}</span>
      </button>
      {weekly && <p className="fm__weekly">{weekly}</p>}
      {!shown ? null : machinesFailed ? (
        <p className="rk-hint">Can't read the floor right now.</p>
      ) : machinesLoading && tiles.length === 0 ? (
        <p className="sh__loading">Loading the floor…</p>
      ) : tiles.length === 0 ? (
        <p className="rk-hint">No equipment is set up for this studio yet.</p>
      ) : (
        <>
          {mapDrawable && (
            <div className="fm__views" role="group" aria-label="The floor as">
              <button type="button" className="fm__view" aria-pressed={shownView === "map"} onClick={() => setView("map")}>
                Map
              </button>
              <button type="button" className="fm__view" aria-pressed={shownView === "tiles"} onClick={() => setView("tiles")}>
                Tiles
              </button>
            </div>
          )}
          {shownView === "map" && studioId ? (
            <LazyFloorMapView
              door="relay"
              studioId={studioId}
              studioName={relay.studioName}
              rows={rows}
              sessions={relay.sessions}
              authTrainer={relay.authTrainer}
              onOpenCard={openCardById}
              cleaningAsk={showCleaning}
              onDone={() => setView("tiles")}
            />
          ) : (
            <>
              <div className="fm__modes">
                <div className="fm__views" role="group" aria-label="What a tap does">
                  <button type="button" className="fm__view" aria-pressed={!cleaning} onClick={() => setMode("machines")}>
                    Look up
                  </button>
                  <button type="button" className="fm__view" aria-pressed={cleaning} onClick={() => setMode("cleaning")}>
                    Cleaning
                  </button>
                </div>
                {cleaning && targets.length > 0 && (
                  <button type="button" className="pl__btn pl__btn--primary" onClick={() => mark(targets, `${targets.length} ${targets.length === 1 ? "machine" : "machines"} marked wiped today.`)}>
                    <Check size={14} aria-hidden /> {`Mark all ${targets.length} wiped`}
                  </button>
                )}
              </div>
              {cleaning && <p className="fm__weekly">Tap a machine when it's wiped.</p>}
              {tiles.map((g) => (
                <div key={g.key} className="fm__group">
                  <h3 className="fm__group-title">{g.label}</h3>
                  <div className="fm__grid">
                    {g.machines.map((m) => {
                      const w = wear[m.id];
                      const s = states.get(m.id) ?? "unknown";
                      const word = cleaning ? CLEAN_WORDS[s] : s === "out" ? CLEAN_WORDS.out : "";
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={cn(
                            "fm__tile",
                            !cleaning && `fm__tile--heat${w.heat}`,
                            w.flag && "fm__tile--flagged",
                            !cleaning && w.deepDue && "fm__tile--deep",
                            !cleaning && w.wantsWipe && "fm__tile--wipe",
                            cleaning && s === "wiped" && "fm__tile--wiped",
                          )}
                          aria-pressed={cleaning ? s === "wiped" : undefined}
                          onClick={() => tapTile(m)}
                          aria-label={
                            cleaning
                              ? `${m.name}${word ? `: ${word.toLowerCase()}` : ""}${s === "wiped" || s === "out" ? "" : ". Tap when it's wiped"}`
                              : `${m.name}: ${HEAT_WORD[w.heat].toLowerCase()}, ${w.touches} since the last wipe${w.wantsWipe ? ", wants a wipe" : ""}${w.flag ? ", flagged" : ""}`
                          }
                        >
                          <span className="fm__name">{m.name}</span>
                          <span className="fm__facts">
                            {cleaning ? (
                              <>
                                {s === "wiped" && <Check size={14} aria-hidden className="fm__tick" />}
                                {word && <span className={s === "used" ? "fm__state fm__state--used" : "fm__state"}>{word}</span>}
                              </>
                            ) : (
                              <span className="fm__touches">{w.touches}</span>
                            )}
                            {w.flag && <Flag size={12} aria-hidden className="fm__flag" />}
                          </span>
                          {!cleaning && (
                            <span className="fm__deep" aria-hidden>
                              <span className="fm__deep-fill" style={{ width: `${Math.round(w.deepFraction * 100)}%` }} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}
