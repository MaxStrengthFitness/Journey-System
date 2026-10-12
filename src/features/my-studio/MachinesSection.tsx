import { useMemo, useState } from "react";
import { Dumbbell, Map as MapIcon, Network, Sparkles } from "lucide-react";
import { auth } from "../../firebase";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { useToast } from "../../contexts/ToastContext";
import { useStudioMachines } from "../../hooks/useStudioMachines";
import { useStudioMachineSettings } from "../../hooks/useStudioMachineSettings";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import type { Trainer } from "../../types";
import type { MachineCatalogEntry, StudioMachineRosterEntry } from "../../types/machines";
import { StudioInventoryManager } from "../admin/machines/StudioInventoryManager";
import { AdminBadge, AdminButton, AdminEmpty, AdminNotice, AdminPanel, AdminRow, AdminRows } from "../admin/primitives";
import { adoptCatalogMachine, seedStandardSet } from "../admin/equipment/seed";
import { useStudioUpkeep } from "../admin/upkeep/useStudioUpkeep";
import { useStudioMachineNotes } from "../catalog/useStudioMachineNotes";
import { useFloorNotes } from "../floor-notes/useFloorNotes";
import { useStudioWiki } from "../wiki/useStudioWiki";
import { buildDatabase, planAdoption } from "../machine-db/database";
import { useSharedMachines } from "../machine-db/hooks";
import { adoptMachine } from "../machine-db/mutations";
import { MachineCard } from "../machine-card/MachineCard";
import type { MapMode } from "../machine-card/parts";
import { ContextPanel } from "../relay/board/ContextPanel";
import { MachineCareProvider } from "../relay/board/machine-care-context";
import { useRelayMaybe } from "../relay/board/RelayContext";
import { leadsHere } from "../relay/leads";
import { useFloorPlan } from "../studio-map/hooks";
import { reconcile } from "../studio-map/layout";
import { rememberMachinesView, rememberedMachinesView, takeArrange, type MachinesView } from "./machines-view-memory";
import { LazyFloorMapView, LazyLayoutView } from "../studio-map/lazy";
import { usePhone } from "../phone/device";
import { DEMO_STUDIO_ID } from "../demo-mode/constants";
import { UnsavedChangesScope, useLeaveScope } from "../unsaved-changes";
import { standardGaps, submissionLabel, type RosterSubmissionMarker } from "./floor";
// Every stylesheet this section draws with, imported here and not left to
// the shell: Operations → Floor mounts this section without My Studio's
// shell, so it cannot count on MyStudioView's imports (.pl__frame, .pl__body
// and the door's .cp from planner.css and relay.css, .ms__* from
// my-studio.css). css-imports.test.ts holds it.
import "../admin/admin.css";
import "../studio-tasks/studio-tasks.css";
import "../relay/planner.css";
import "../relay/board/relay.css";
import "./my-studio.css";

/**
 * MY STUDIO → MACHINES — the floor, and what the studio has done to it.
 *
 * Round: My Studio, Sep 2026. AJ (Sep 18): a new studio adopts the standard
 * set Max Strength recommends — usually the standard twenty — and "can always
 * add or remove machines from that"; over time it adopts machines the
 * standard added and removes ones it no longer has; it can create entirely
 * new machines or adopt already-created ones from the catalog; a leader can
 * submit a custom machine to corporate for the catalog; trainers view the
 * floor, the standard settings and the first-time set-up material, and
 * contribute notes to the machines on their floor.
 *
 *   New in the MSF standard    the standard machines this floor does not
 *                              have — adopted one at a time, or all at once
 *                              on an empty floor ("Adopt the MSF standard").
 *                              Never pushed: floor.ts / standardGaps.
 *   The floor                  the inventory manager (search, reorder, we
 *                              have this / we don't, out of service, a
 *                              custom machine) for leaders; the same list
 *                              read-only for trainers. Every row opens the
 *                              machine's door.
 *   The machine's card         the Context Panel beside the map or the list:
 *                              the one card from every door (features/
 *                              machine-card, the studio map's phase 4),
 *                              Learn · Clean · Maintain · Set up, Set up open
 *                              (Clean from the map in Cleaning): this
 *                              studio's standard settings, its size, the
 *                              floor's notes, Out of service, upkeep, local
 *                              set-up and the offer to the MSF catalog.
 *   The map | the list         the floor drawn (Look up, or the team's
 *                              Cleaning checklist), first once the studio
 *                              has a map (AJ, Oct 10 2026: "the trainers
 *                              know where all the machines are they dont
 *                              remember them alphabetically"); the list one
 *                              tap away, and always on a phone.
 *   Shared by other studios    machines other MSF studios built and listed;
 *                              a leader adopts one as a copy (machine-db).
 *
 * What this section does NOT do: it does not move the Catalog page. A
 * trainer standing at the Hip Adduction still opens it in Learning → Catalog
 * and finds the same settings card and notes box there; this is the same
 * card, reached from the floor list, so a leader can set twenty machines up
 * without walking the room. One implementation, two doors.
 */

export interface MachinesSectionProps {
  authTrainer?: Trainer | null;
  trainers?: Trainer[];
}

interface Door {
  machineId: string;
  /** The map's mode when it was tapped ("machines" from the list). */
  mode: MapMode;
  /** What the door was opened for; "submit" opens the offer dialog too. */
  intent?: "open" | "submit";
}

export function MachinesSection({ authTrainer, trainers }: MachinesSectionProps) {
  const { activeStudio, activeStudioId } = useActiveStudio();
  // Inside My Studio the Relay shell says who leads; on Operations → Floor
  // (the same editor, a second door — Operations overhaul, Sep 2026) there
  // is no shell, so the answer comes from leadsHere directly.
  const relay = useRelayMaybe();
  const { success: toastSuccess, error: toastError } = useToast();
  const studioId = activeStudioId ?? null;
  const studioName = activeStudio?.name ?? "this studio";
  const canLead = relay ? relay.canLead : leadsHere(authTrainer ?? null, studioId);

  const { rosterEntries, catalog, byId, loading } = useStudioMachines(studioId, {
    includeInactive: true,
    includeUnrostered: true,
  });
  const { settingsByMachineId } = useStudioMachineSettings(studioId);
  // The floor's notes (notes round, Oct 3 2026): read once for the studio,
  // with the two old stores they took over from, shown under the list.
  const { notesByMachineId } = useStudioMachineNotes(studioId);
  const floorNotes = useFloorNotes(studioId);
  const { overlayFor } = useStudioWiki(studioId);
  const upkeep = useStudioUpkeep(studioId);
  const shared = useSharedMachines(true, studioId);

  const gaps = useMemo(
    () => standardGaps(catalog as MachineCatalogEntry[], rosterEntries),
    [catalog, rosterEntries],
  );
  const entryById = useMemo(() => {
    const m = new Map<string, StudioMachineRosterEntry>();
    for (const e of rosterEntries) m.set(e.machineId, e);
    return m;
  }, [rosterEntries]);
  const noLongerStandard = useMemo(() => new Set(gaps.noLongerStandard.map((e) => e.machineId)), [gaps]);

  /* Flags drawn under a row in the inventory manager. */
  const flags = useMemo(() => {
    const out: Record<string, string> = {};
    for (const e of rosterEntries) {
      const marker = (e as { submission?: RosterSubmissionMarker }).submission;
      const label = submissionLabel(marker);
      if (label) out[e.machineId] = label;
    }
    for (const id of noLongerStandard) {
      out[id] = out[id] ? `${out[id]} · No longer in the MSF standard` : "No longer in the MSF standard — still yours to use";
    }
    return out;
  }, [rosterEntries, noLongerStandard]);

  const [door, setDoor] = useState<Door | null>(null);
  // The door holds typing (the floor's notes, the studio's settings), and its
  // own ways out would unmount it or swap its machine: the X, Escape, and a
  // tap on another machine in the list beside it. Each asks first (a leave
  // scope, unsaved-changes), as My Studio's sections and the bottom bar do.
  const doorScope = useLeaveScope();
  // Arrange the floor (the studio map, Oct 2026): the leaders' editor, rare
  // and behind one button, in place of the floor list inside the same panel.
  // Leaving it while it holds unsaved work asks (its own leave scope).
  const phone = usePhone();
  // The Catalog's Draw the floor sends a leader straight here (machines-view-memory.ts), taken once as this mounts.
  const [arranging, setArranging] = useState(() => takeArrange() && canLead && !phone);
  const viewScope = useLeaveScope();
  /*
   * MAP FIRST (the studio map, phase 4). The layout is read on an iPad; the
   * section opens on the map once it is ready with a machine of the floor on
   * it, else on the list (and on the list while it is still being read: never
   * a blank panel, never a flash of "No map yet"). A pick on this iPad wins;
   * a phone is always the list.
   */
  const layout = useFloorPlan(studioId, { enabled: !phone });
  const placed = useMemo(
    () =>
      layout.state === "ready" && layout.plan
        ? reconcile(
            layout.plan,
            rosterEntries.filter((e) => e.status !== "inactive").map((e) => ({ machineId: e.machineId, name: "", code: "", status: e.status })),
          ).placed.length
        : 0,
    [layout.state, layout.plan, rosterEntries],
  );
  const [picked, setPicked] = useState<MachinesView | null>(rememberedMachinesView);
  const shownView: MachinesView = phone ? "list" : (picked ?? (placed > 0 ? "map" : "list"));
  const pickView = (next: MachinesView) => {
    if (next === shownView) return;
    viewScope.guard(() => {
      rememberMachinesView(next);
      setPicked(next);
    });
  };
  const hasMap = layout.state === "ready";
  const [seeding, setSeeding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const floorEmpty = !loading && rosterEntries.length === 0;

  const adoptStandard = async () => {
    if (!studioId) return;
    setSeeding(true);
    try {
      const { added, alreadyPresent } = await seedStandardSet(studioId, catalog);
      toastSuccess(
        added > 0
          ? `${added} machines adopted. ${studioName} runs the MSF standard set — add or remove from here.`
          : alreadyPresent > 0
            ? `${studioName} already has every standard machine.`
            : "Nothing in the catalog qualifies for the standard set yet.",
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `studios/${studioId}/roster`);
    } finally {
      setSeeding(false);
    }
  };

  const adoptOne = async (machineId: string) => {
    if (!studioId) return;
    setBusy(machineId);
    try {
      await adoptCatalogMachine(studioId, machineId);
      toastSuccess(`${byId[machineId]?.name ?? machineId} is on ${studioName}'s floor.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `studios/${studioId}/roster/${machineId}`);
    } finally {
      setBusy(null);
    }
  };

  /* Shared machines, as the database sees them from this floor. */
  const sharedEntries = useMemo(() => {
    const floor = rosterEntries.map((e) => ({
      id: e.machineId,
      comparisonKey: (e as { basedOn?: string }).basedOn ?? e.machineId,
      adoptedFrom: (e as { adoptedFrom?: { studioId: string; machineId: string; studioName: string } }).adoptedFrom,
    }));
    return buildDatabase({ msf: [], shared: shared.machines, floor, studioId }).filter(
      (e) => e.origin === "studio" && e.sharedBy?.studioId !== studioId,
    );
  }, [shared.machines, rosterEntries, studioId]);

  const adoptShared = async (key: string) => {
    if (!studioId) return;
    const entry = sharedEntries.find((e) => e.key === key);
    if (!entry) return;
    const plan = planAdoption(entry, {
      studioId,
      studioName,
      floorSource: rosterEntries.length > 0 ? "roster" : "global",
      takenIds: new Set(rosterEntries.map((e) => e.machineId)),
      roster: rosterEntries.map((e) => ({
        machineId: e.machineId,
        status: e.status,
        adoptedFrom: (e as { adoptedFrom?: { studioId: string; machineId: string } }).adoptedFrom ?? null,
      })),
    });
    if (!plan.ok) {
      toastError(plan.reason);
      return;
    }
    setBusy(key);
    try {
      await adoptMachine(studioId, plan);
      toastSuccess(
        plan.reactivates
          ? `${entry.machine.name} is back on ${studioName}'s floor.`
          : `${entry.machine.name} added to ${studioName}'s floor, as your own copy.`,
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `studios/${studioId}/roster`);
    } finally {
      setBusy(null);
    }
  };

  if (!studioId) {
    return (
      <div className="pl__frame">
        <div className="pl__body adm ms__page">
          <AdminNotice tone="info">Choose a studio to see its floor.</AdminNotice>
        </div>
      </div>
    );
  }

  const doorEntry = door ? entryById.get(door.machineId) ?? null : null;
  const doorMachine = door ? byId[door.machineId] ?? null : null;
  const doorName = doorMachine?.name ?? doorEntry?.machineId ?? "";
  const cardDoor = relay ? "my-studio" : "operations";
  const openDoor = (machineId: string, mode: MapMode) => {
    // The machine already open changes nothing, so it never asks.
    if (machineId === door?.machineId && mode === door.mode) return;
    doorScope.guard(() => setDoor({ machineId, mode }));
  };

  // Without My Studio's shell (Operations → Floor) nothing bounds this
  // frame's height, so the machine's door rides the page's own scroller
  // instead of sitting at the top or the foot of a long list, off-screen
  // (my-studio.css, .ms__frame--hosted).
  const frame = (
    <div className={relay ? "pl__frame" : "pl__frame ms__frame--hosted"}>
      <div className="pl__body adm ms__page" role="tabpanel" id="ms-panel" aria-labelledby="ms-tab-machines">
        {/* ── New in the MSF standard ─────────────────────────────────── */}
        {!loading && gaps.newInStandard.length > 0 && (
          <AdminPanel
            title={floorEmpty ? "The MSF standard set" : "New in the MSF standard"}
            icon={<Sparkles className="w-3.5 h-3.5" />}
            subtitle={
              floorEmpty
                ? "Most locations run the same twenty machines. Adopt the standard set to start, then add or remove from there — nothing is ever pushed onto your floor."
                : "Machines the standard lists that this floor does not have. Take each one when you are ready; nothing is pushed onto your floor."
            }
            actions={
              canLead && floorEmpty ? (
                <AdminButton variant="primary" busy={seeding} onClick={() => void adoptStandard()}>
                  <Sparkles className="w-3.5 h-3.5" />
                  Adopt the MSF standard
                </AdminButton>
              ) : (
                <AdminBadge tone="neutral">
                  {gaps.newInStandard.length} not on the floor
                </AdminBadge>
              )
            }
            flush
          >
            <AdminRows>
              {gaps.newInStandard.map((c) => (
                <AdminRow
                  key={c.id}
                  name={c.name}
                  meta={c.movementPattern ? `${c.movementPattern}` : undefined}
                  trailing={
                    canLead ? (
                      <AdminButton size="sm" busy={busy === c.id} onClick={() => void adoptOne(c.id)}>
                        Adopt
                      </AdminButton>
                    ) : (
                      <AdminBadge tone="neutral">Not on the floor</AdminBadge>
                    )
                  }
                />
              ))}
            </AdminRows>
          </AdminPanel>
        )}

        {/* ── The floor ───────────────────────────────────────────────── */}
        <AdminPanel
          title="The floor"
          icon={<Dumbbell className="w-3.5 h-3.5" />}
          subtitle={
            canLead
              ? "What this location has, in the order trainers see it. Tap a machine for its card: learn it, clean it, maintain it, set it up."
              : "What this location has, in the order you see it. Tap a machine for its card: learn it, clean it, maintain it, and the studio's settings."
          }
          actions={
            !phone && !arranging && !floorEmpty ? (
              <span className="flex flex-wrap items-center gap-2">
                {!floorEmpty && (
                  <div className="adm-segmented" role="tablist" aria-label="The floor as">
                    {(["map", "list"] as const).map((v) => (
                      <button key={v} type="button" role="tab" className="adm-seg" aria-selected={shownView === v} onClick={() => pickView(v)}>
                        {v === "map" ? "Map" : "List"}
                      </button>
                    ))}
                  </div>
                )}
                {canLead && !floorEmpty && (
                  <AdminButton onClick={() => viewScope.guard(() => setArranging(true))}>
                    <MapIcon className="w-3.5 h-3.5" />
                    {hasMap ? "Arrange the floor" : "Draw the floor"}
                  </AdminButton>
                )}
              </span>
            ) : undefined
          }
        >
          {arranging && canLead ? (
            <UnsavedChangesScope scope={viewScope}>
              <LazyLayoutView
                studioId={studioId}
                studioName={studioName}
                canLead={canLead}
                authUid={auth.currentUser?.uid ?? null}
                authorName={authTrainer?.fullName ?? null}
                isDemo={studioId === DEMO_STUDIO_ID}
                nameOf={(uid) => trainers?.find((t) => t.id === uid || t.authUid === uid)?.fullName ?? null}
                onDone={() => viewScope.guard(() => setArranging(false))}
              />
            </UnsavedChangesScope>
          ) : floorEmpty && !canLead ? (
            <AdminEmpty title="No floor set up yet">
              A studio leader adopts the MSF standard set from here; until then the Catalog shows every MSF machine.
            </AdminEmpty>
          ) : shownView === "map" && !floorEmpty ? (
            <UnsavedChangesScope scope={viewScope}>
              <LazyFloorMapView
                door={cardDoor}
                studioId={studioId}
                studioName={studioName}
                authTrainer={authTrainer ?? null}
                onOpenCard={openDoor}
                onDone={() => pickView("list")}
              />
            </UnsavedChangesScope>
          ) : (
            <StudioInventoryManager
              studioId={studioId}
              studioName={studioName}
              readOnly={!canLead}
              authorName={authTrainer?.fullName ?? null}
              flags={flags}
              onOpenMachine={(machineId) => openDoor(machineId, "machines")}
              hideHeading
            />
          )}
        </AdminPanel>

        {/* ── Shared by other MSF studios ─────────────────────────────── */}
        <AdminPanel
          title="Shared by other MSF studios"
          icon={<Network className="w-3.5 h-3.5" />}
          subtitle="Machines other studios built and listed for everyone. Adopting one makes your own copy; the whole MSF catalog is under Learning → Catalog → All MSF machines."
          flush
        >
          {shared.error ? (
            <div className="p-4">
              <AdminNotice tone="warn">{shared.error}</AdminNotice>
            </div>
          ) : shared.loading ? (
            <p className="ms__quiet">Loading…</p>
          ) : sharedEntries.length === 0 ? (
            <p className="ms__quiet">No studio has shared a machine yet.</p>
          ) : (
            <AdminRows>
              {sharedEntries.map((e) => (
                <AdminRow
                  key={e.key}
                  name={e.machine.name}
                  meta={`From ${e.sharedBy?.studioName ?? "another studio"}`}
                  trailing={
                    e.floorMachineId ? (
                      <AdminBadge tone="ok">On your floor</AdminBadge>
                    ) : canLead ? (
                      <AdminButton size="sm" busy={busy === e.key} onClick={() => void adoptShared(e.key)}>
                        Add to {studioName}
                      </AdminButton>
                    ) : null
                  }
                />
              ))}
            </AdminRows>
          )}
        </AdminPanel>
      </div>

      <ContextPanel
        content={
          door && studioId
            ? {
                kicker: "Machine",
                title: doorName || door.machineId,
                tall: true,
                body: (
                  <UnsavedChangesScope scope={doorScope}>
                    {/* Keyed by machine (and the mode it was opened in): each opening is a fresh card, so a
                        Leave's discard never re-seeds onto the next one. */}
                    <MachineCard
                      key={`${door.machineId}:${door.mode}`}
                      door={cardDoor}
                      mode={door.mode}
                      studioId={studioId}
                      studioName={studioName}
                      machineId={door.machineId}
                      authTrainer={authTrainer ?? null}
                      trainers={trainers}
                      reads={{
                        floor: { rosterEntries, byId, catalog, loading },
                        settingsByMachineId,
                        floorNotes,
                        oldNotes: notesByMachineId,
                        overlayFor,
                        upkeep: { events: upkeep.events, state: upkeep.state },
                      }}
                      onOpenCatalogPage={relay?.openCatalogMachine}
                      onClose={() => doorScope.guard(() => setDoor(null))}
                      nameShown={false}
                      openOffer={door.intent === "submit"}
                    />
                  </UnsavedChangesScope>
                ),
              }
            : null
        }
        onClose={() => doorScope.guard(() => setDoor(null))}
      />
    </div>
  );
  // Inside My Studio the shell holds the floor's one care read; Operations → Floor has no shell, so the section does.
  return relay ? frame : <MachineCareProvider studioId={studioId}>{frame}</MachineCareProvider>;
}
