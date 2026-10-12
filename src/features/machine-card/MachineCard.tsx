import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Flag, StickyNote } from "lucide-react";
import { auth } from "../../firebase";
import { studioDateKey } from "../../lib/studio-time";
import type { Trainer } from "../../types";
import type { MachineCatalogEntry } from "../../types/machines";
import { AdminButton } from "../admin/primitives";
import { outOfServiceOfEntry, outOfServiceShort } from "../catalog/out-of-service";
import { floorNameHidesMovement, movementOf } from "../catalog/names";
import { floorThreads } from "../floor-notes/floor-notes";
import { writesForStudioPerRules } from "../learning/permissions";
import { standardGaps } from "../my-studio/floor";
import { cleanStateOf, careLines, CLEAN_WORDS, flagLine } from "../relay/board/cleaning";
import { careReadState, useCareRead } from "../relay/board/machine-care-context";
import { DEFAULT_DEEP_CLEAN_DAYS, wearOf } from "../relay/board/machine-care";
import { useRelayMaybe } from "../relay/board/RelayContext";
import { leadsHere } from "../relay/leads";
import { measuredSizeOf, sizeNeedsModels, unitFactsOfEntry } from "../studio-map/sizes";
import { sizeLine } from "../studio-map/units";
import type { TaskRow } from "../studio-tasks/types";
import { CleanPart } from "./CleanPart";
import { LearnPart, learnSummary } from "./LearnPart";
import { MaintainPart, ReportProblem } from "./MaintainPart";
import { CARD_PARTS, PART_TITLE, firstPartFor, type CardDoor, type CardPart, type MapMode } from "./parts";
import { SetupPart } from "./SetupPart";
import { useCardFloor, type CardReads } from "./useMachineCardReads";
// The card is mounted by four hosts (My Studio's panel, Relay's panel, the
// Catalog's map, Admins' floor), so it brings its own stylesheets.
import "../admin/admin.css";
import "./machine-card.css";

/**
 * THE MACHINE'S CARD — one card for a studio's machine, from every door (the
 * studio map, phase 4, Oct 2026).
 *
 * AJ, Oct 11 2026: "this map allows people to interact and click on a
 * machine to learn,clean,maintaince the machines among other posssible
 * things", and after a picture of the same Leg Press card from three doors,
 * "1a": one card, the first part matching the door. The parts run Learn ·
 * Clean · Maintain · Set up in that order everywhere (parts.ts); the door
 * chooses only which opens first (Relay: Clean; the Catalog: Learn; My
 * Studio, Operations and Admins: Set up; any door in Cleaning: Clean). Any
 * part can be opened or folded; none remembers.
 *
 * It is My Studio → Machines' old door (the studio's settings, its size,
 * the floor's notes, local set-up, upkeep, the offer to the MSF catalog)
 * with Relay's care sheet split by what each button is for: Wiped and Deep
 * cleaned are Clean, Flag and Clear are Maintain's Report a problem.
 *
 * READS. The card reads only what its host doesn't hand it, and a part's
 * reads mount only while it is open (useMachineCardReads.ts). The care
 * record is the screen's one live read (`useCareRead`), never a prop: a card
 * opened through relay.openPanel is an element held in state, so a prop
 * would be frozen at the moment it opened. Through openPanel a host gives it
 * ids and callbacks only.
 *
 * What it never shows: who wiped, cleaned or flagged it and at what minute,
 * a count of anyone's cleaning, a rank, a next weight, a client. The floor's
 * notes keep their signed authors and dates (a note is a person's words),
 * and Out of service keeps its leader's name (wave 2: "who set it").
 */
export interface MachineCardProps {
  door: CardDoor;
  /** The map's mode when it was tapped ("machines" from a list). */
  mode: MapMode;
  studioId: string;
  studioName: string;
  machineId: string;
  authTrainer: Trainer | null;
  trainers?: readonly Trainer[];
  /** What the host already reads; the card reads the rest. Never passed through relay.openPanel. */
  reads?: Partial<CardReads>;
  /** Today's wipe-chore rows, filtered with the studio's categories, when the host renders the card itself (My Studio's map in Cleaning). */
  rows?: readonly TaskRow[];
  /** Learn's door to the method (each host routes it); with none, Learn shows its lines and no button. */
  onOpenCatalogPage?: (machineId: string) => void;
  /** A leader's way to the floor list, for a machine not on it yet (a catalog stand-in). */
  onOpenFloorList?: () => void;
  /** After Wiped, and Out of service's Save. */
  onClose: () => void;
  /** The host's panel already titles it with the name: the header leaves it out. */
  nameShown?: boolean;
  /** Arrived to offer the studio's own machine (the floor list's Offer): Set up opens with the offer. */
  openOffer?: boolean;
}

export function MachineCard({
  door,
  mode,
  studioId,
  studioName,
  machineId,
  authTrainer,
  trainers,
  reads,
  rows,
  onOpenCatalogPage,
  onOpenFloorList,
  onClose,
  nameShown = true,
  openOffer = false,
}: MachineCardProps) {
  const relay = useRelayMaybe();
  // Relay's floor publishes its roster and cleaning settings while it is mounted: a panel card reads those, live.
  const shellReads = relay?.floorReads && relay.floorReads.studioId === studioId ? relay.floorReads : null;
  const floor = useCardFloor(studioId, reads?.floor ?? shellReads?.floor);
  const care = useCareRead(studioId);
  const careState = careReadState(care);
  const record = careState === "ready" ? care.byMachineId[machineId] : undefined;
  const uid = auth.currentUser?.uid ?? null;
  const canLead = leadsHere(authTrainer ?? null, studioId);
  const canWrite = writesForStudioPerRules(authTrainer ?? null, studioId);

  const entry = floor.rosterEntries.find((e) => e.machineId === machineId) ?? null;
  const machine = floor.byId[machineId] ?? null;
  const name = machine?.name ?? entry?.machineId ?? machineId;
  const standIn = !entry;
  const catalogEntry = useMemo(
    () =>
      entry && entry.source === "catalog"
        ? ((floor.catalog as MachineCatalogEntry[]).find((c) => c.id === (entry as { basedOn?: string }).basedOn) ?? null)
        : null,
    [entry, floor.catalog],
  );
  const floorIds = useMemo(() => new Set([...floor.rosterEntries.map((e) => e.machineId), ...Object.keys(floor.byId)]), [floor.rosterEntries, floor.byId]);

  const [open, setOpen] = useState<ReadonlySet<CardPart>>(() => new Set([firstPartFor(door, mode)]));
  const toggle = (p: CardPart) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  const show = (p: CardPart) => setOpen((prev) => (prev.has(p) ? prev : new Set([...prev, p])));

  const todayKey = studioDateKey(new Date()) ?? "";
  const nowMs = Date.now();
  // Today's sessions on it since its wipe: Relay's shell has them; elsewhere there are none to count.
  const sessions = relay && relay.studioId === studioId ? relay.sessions : null;
  const wear = sessions ? wearOf(machineId, { sessions, care: record, now: nowMs }) : null;

  if (!machine && !entry) {
    return (
      <div className="adm mdc">
        <p className="mdc-line mdc-line--quiet">{floor.loading ? "Reading the floor…" : "This machine isn't on the floor any more."}</p>
      </div>
    );
  }

  /* ---- the header ---- */
  const movement = machine ? movementOf({ id: machine.machineId, comparisonKey: machine.comparisonKey, name }) : null;
  const movementLine = movement && floorNameHidesMovement(name, movement.name) ? movement.name : null;
  const origin = !entry
    ? "MSF catalog · not on this floor's list yet"
    : entry.source === "custom"
      ? (entry as { adoptedFrom?: { studioName: string } }).adoptedFrom
        ? `Copied from ${(entry as { adoptedFrom?: { studioName: string } }).adoptedFrom?.studioName}`
        : `${studioName}'s own machine`
      : standardGaps(floor.catalog as MachineCatalogEntry[], [entry]).noLongerStandard.length > 0
        ? "MSF catalog · no longer in the standard"
        : "MSF catalog";
  const outOf = entry?.status === "maintenance" ? outOfServiceOfEntry(entry) : null;
  const flag = flagLine(record);
  const notesInHand = reads?.floorNotes && reads.floorNotes.state === "ready" ? reads.floorNotes : null;
  const openNotes = notesInHand ? floorThreads(notesInHand.notes, machineId).filter((t) => !t.closed).length : null;

  /* ---- the folded lines, from what is already in hand ---- */
  const cleanState = cleanStateOf({ careRead: careState, care: record, wear, todayKey, nowMs, outOfService: entry?.status === "maintenance" });
  const cleanSummary =
    cleanState === "wiped" || cleanState === "used"
      ? CLEAN_WORDS[cleanState]
      : careState === "ready"
        ? careLines(record, null, todayKey, DEFAULT_DEEP_CLEAN_DAYS, nowMs)[0]
        : null;
  const measured = entry ? measuredSizeOf(entry.unit?.size) : null;
  const summaries: Record<CardPart, string | null> = {
    learn: learnSummary(machine, name),
    clean: cleanSummary,
    maintain: standIn ? "Report a problem" : openNotes !== null && openNotes > 0 ? `${openNotes} open ${openNotes === 1 ? "note" : "notes"}` : "Notes, out of service, upkeep",
    setup: standIn
      ? null
      : measured
        ? `Size: ${sizeLine(measured.size)}`
        : entry && !sizeNeedsModels(unitFactsOfEntry(entry))
          ? "Size not known yet"
          : null,
  };

  const notOnList = (
    <>
      <p className="mdc-line">Not on the floor list yet.</p>
      {canLead && onOpenFloorList && (
        <div className="mdc-actions">
          <AdminButton onClick={onOpenFloorList}>Go to the floor list</AdminButton>
        </div>
      )}
    </>
  );

  const body: Record<CardPart, () => ReactNode> = {
    learn: () => <LearnPart machine={machine} machineId={machineId} name={name} onOpenCatalogPage={onOpenCatalogPage} />,
    clean: () => (
      <CleanPart
        studioId={studioId}
        machineId={machineId}
        name={name}
        care={care}
        sessions={sessions}
        todayKey={todayKey}
        have={reads?.cleaning ?? shellReads?.cleaning}
        rows={rows}
        floorIds={floorIds}
        authTrainer={authTrainer}
        uid={uid}
        canWrite={canWrite}
        onWiped={onClose}
      />
    ),
    maintain: () =>
      entry ? (
        <MaintainPart
          studioId={studioId}
          studioName={studioName}
          machineId={machineId}
          name={name}
          entry={entry}
          shareKey={machine?.comparisonKey || machineId}
          care={record}
          have={{ floorNotes: reads?.floorNotes, oldNotes: reads?.oldNotes, overlayFor: reads?.overlayFor, upkeep: reads?.upkeep }}
          authTrainer={authTrainer}
          uid={uid}
          canWrite={canWrite}
          canLead={canLead}
          onClose={onClose}
        />
      ) : (
        // A machine with no roster entry (Relay's stand-in) can still be flagged and cleared; the rest needs the list.
        <>
          <ReportProblem studioId={studioId} machineId={machineId} name={name} care={record} authTrainer={authTrainer} uid={uid} canWrite={canWrite} />
          {notOnList}
        </>
      ),
    setup: () =>
      entry ? (
        <SetupPart
          studioId={studioId}
          studioName={studioName}
          machineId={machineId}
          name={name}
          entry={entry}
          catalogEntry={catalogEntry}
          catalogName={entry.source === "catalog" ? (catalogEntry?.name ?? name) : name}
          have={reads?.settingsByMachineId}
          authTrainer={authTrainer}
          trainers={trainers}
          uid={uid}
          canLead={canLead}
          openOffer={openOffer}
        />
      ) : (
        notOnList
      ),
  };

  return (
    <div className="adm mdc" data-door={door}>
      <header className="mdc-head">
        {nameShown && <h2 className="mdc-head__name">{name}</h2>}
        {movementLine && <p className="mdc-head__line">{movementLine}</p>}
        <p className="mdc-head__line">{origin}</p>
        {(outOf || entry?.status === "maintenance" || flag || (openNotes !== null && openNotes > 0)) && (
          <div className="mdc-head__flags">
            {entry?.status === "maintenance" && (
              // Its reason and Back in service live in Maintain: the chip opens it, as the flag's does.
              <button type="button" className="mdc-flag" onClick={() => show("maintain")}>
                {outOf ? `Out of service: ${outOfServiceShort(outOf)}` : "Out of service"}
              </button>
            )}
            {flag && (
              <button type="button" className="mdc-flag" onClick={() => show("maintain")}>
                <Flag className="w-3.5 h-3.5" aria-hidden />
                {flag}
              </button>
            )}
            {openNotes !== null && openNotes > 0 && (
              <button type="button" className="mdc-flag mdc-flag--notes" onClick={() => show("maintain")}>
                <StickyNote className="w-3.5 h-3.5" aria-hidden />
                {`${openNotes} open ${openNotes === 1 ? "note" : "notes"}`}
              </button>
            )}
          </div>
        )}
      </header>

      {CARD_PARTS.map((p) => {
        const isOpen = open.has(p);
        return (
          <section key={p} className="mdc-part" data-part={p}>
            <button type="button" className="mdc-part__head" aria-expanded={isOpen} onClick={() => toggle(p)}>
              {isOpen ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
              <span className="mdc-part__title">{PART_TITLE[p]}</span>
              {!isOpen && summaries[p] && <span className="mdc-part__sum">{summaries[p]}</span>}
            </button>
            {isOpen && <div className="mdc-part__body">{body[p]()}</div>}
          </section>
        );
      })}
    </div>
  );
}
