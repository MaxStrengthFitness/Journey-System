import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Trainer } from "../../types";
import { CardFrame } from "../machine-card/CardFrame";
import { MachineCard } from "../machine-card/MachineCard";
import type { CardReads } from "../machine-card/useMachineCardReads";
import { MachineCareProvider } from "../relay/board/machine-care-context";
import type { MachineCareState } from "../relay/board/machine-care-store";
import { UnsavedChangesScope, useLeaveScope } from "../unsaved-changes";
import { useWikiPageGuard } from "../wiki/page-guard";
import { footprint } from "../studio-map/geometry";
import { reconcile, type FloorPlanDoc } from "../studio-map/layout";
import { LazyStudioRoom } from "../studio-map/lazy";
import { roomShape } from "../studio-map/room";
import { knownSizeOf, sizeOfUnit } from "../studio-map/sizes";
import { roomIsTappable } from "../studio-map/tap";
import { frameOf, roomBounds } from "../studio-map/ui/drawing";
import type { MapMachine } from "../studio-map/ui/StudioRoom";
import type { ModelsRead } from "./models";
import { movementOf } from "./names";
import type { CatalogMachine } from "./types";
import "../studio-map/studio-map.css";
import "./catalog.css";

export interface FloorRoomViewProps {
  studioId: string;
  studioName: string;
  /** The studio's map (`current`), read and ready. */
  plan: FloorPlanDoc;
  /** The floor, in walking order. */
  machines: readonly CatalogMachine[];
  /** The Catalog's one read of the models (passed down, never a second listener). */
  models: ModelsRead;
  /** Find's narrowing: these machines are drawn faint. The AED and the extinguisher never are. */
  dimIds?: ReadonlySet<string>;
  /** The machine's Catalog page: the card's Learn opens it (phase 4). */
  onOpenMachine: (id: string) => void;
  /** The Catalog's one care read (its flags), handed to the card: never a second listener. */
  care: MachineCareState;
  authTrainer: Trainer | null;
  trainers?: readonly Trainer[];
  /** What the Catalog already reads for its pages, handed to the card. */
  reads?: Partial<CardReads>;
  /** Back to the list (the drawing's file gone after a deploy). */
  onList: () => void;
  /** The floor as a list: shown instead of the map when the map would be too small to tap. */
  list: ReactNode;
}

const OUT = { className: "smap-m--out", aria: "out of service" } as const;

/**
 * THE CATALOG'S MAP (the studio map, Oct 2026): Learning → Catalog → the
 * floor lens → Map. The same drawing every door shows (the room, its
 * places, the AED and the fire extinguisher above everything, every machine
 * at its true size or a round marker), read only. A tap on a machine opens
 * the one machine card (phase 4, features/machine-card) with Learn open, and
 * Learn's first action, Open its Catalog page, closes the card and opens the
 * page (asking first about typing on the page). No Cleaning here: the
 * Catalog is Learning. AJ, Oct 10 2026: "the trainers know where all the
 * machines are they dont remember them alphabetically".
 *
 * It measures its own width and checks the one tappable rule (every
 * machine's short side at least 24 px, design §B.10) BEFORE the drawing's
 * chunk is fetched; a room too small to tap at this width is the list, said
 * in one line. While a placed machine's size is still being read the map
 * waits rather than drawing a guess. A machine still to buy is never here:
 * the map is `current`, which can't hold one.
 */
export function FloorRoomView({ studioId, studioName, plan, machines, models, dimIds, onOpenMachine, onList, list, care, authTrainer, trainers, reads }: FloorRoomViewProps) {
  const pageGuard = useWikiPageGuard();
  const cardScope = useLeaveScope();
  const [card, setCard] = useState<string | null>(null);
  const cardName = machines.find((m) => m.id === card)?.name ?? "Machine";
  const openCard = (id: string) => {
    if (id === card) return;
    cardScope.guard(() => setCard(id));
  };
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth((w) => (w === el.clientWidth ? w : el.clientWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shape = useMemo(() => roomShape(plan.room.boxes), [plan.room.boxes]);
  const drawn = useMemo(() => {
    const floor = machines.map((m) => ({ machineId: m.id, name: m.name, code: movementOf(m)?.code ?? "", status: m.rosterStatus, m }));
    const { placed } = reconcile(plan, floor);
    let loading = false;
    const out: MapMachine[] = [];
    for (const { machine, placement } of placed) {
      const read = sizeOfUnit(
        { unitSize: machine.m.unitSize ?? null, modelId: machine.m.modelId?.trim() || null, movementId: movementOf(machine.m)?.id ?? null, catalogCopy: !machine.m.isStudioCustom },
        models,
      );
      if (read.state === "loading") loading = true;
      out.push({ id: machine.machineId, name: machine.name, code: machine.code, placement, size: knownSizeOf(read) });
    }
    return { machines: out, loading };
  }, [machines, plan, models]);
  const outIds = useMemo(() => new Set(machines.filter((m) => m.rosterStatus === "maintenance").map((m) => m.id)), [machines]);

  const tappable = useMemo(() => {
    const f = frameOf(roomBounds(plan.room, shape), width);
    return roomIsTappable(
      f.mmPerPx,
      drawn.machines.map((m) => ({ footprint: m.size ? footprint(m.placement, m.size) : null, centre: { x: m.placement.x, y: m.placement.y } })),
    );
  }, [plan.room, shape, width, drawn.machines]);

  return (
    <MachineCareProvider studioId={studioId} read={care}>
    <CardFrame
      panel={
        card
          ? {
              kicker: "Machine",
              title: cardName,
              tall: true,
              body: (
                <UnsavedChangesScope scope={cardScope}>
                  <MachineCard
                    key={card}
                    door="catalog"
                    mode="machines"
                    studioId={studioId}
                    studioName={studioName}
                    machineId={card}
                    authTrainer={authTrainer}
                    trainers={trainers}
                    reads={reads}
                    onOpenCatalogPage={(id) =>
                      pageGuard(() => {
                        setCard(null);
                        onOpenMachine(id);
                      })
                    }
                    onClose={() => cardScope.guard(() => setCard(null))}
                    nameShown={false}
                  />
                </UnsavedChangesScope>
              ),
            }
          : null
      }
      onClose={() => cardScope.guard(() => setCard(null))}
    >
    <div ref={ref} className="smap-read">
      {drawn.loading ? (
        <p className="smap-quiet">Loading the map…</p>
      ) : !tappable ? (
        <>
          <p className="smap-quiet">Too small to tap at this width. Use the list below.</p>
          {list}
        </>
      ) : (
        <div className="smap-frame">
          <LazyStudioRoom
            ariaLabel={`${studioName}'s map`}
            room={plan.room}
            shape={shape}
            machines={drawn.machines}
            widthPx={width}
            dimIds={dimIds}
            markOf={(id) => (outIds.has(id) ? OUT : null)}
            onPick={openCard}
            onDone={onList}
          />
        </div>
      )}
    </div>
    </CardFrame>
    </MachineCareProvider>
  );
}
