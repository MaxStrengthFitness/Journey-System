import { useState } from "react";
import { Upload } from "lucide-react";
import type { Trainer } from "../../types";
import type { MachineCatalogEntry, StudioMachineRosterEntry } from "../../types/machines";
import { AdminButton, AdminNotice } from "../admin/primitives";
import { LocalSetupDialog } from "../admin/equipment/LocalSetupDialog";
import { StudioSetupCard } from "../catalog/StudioSetupCard";
import { canOffer, canWithdraw, submissionLabel, type RosterSubmissionMarker } from "../my-studio/floor";
import { UnitSizeCard } from "../studio-map/ui/UnitSizeCard";
import { DecisionNote, OfferDialog, WithdrawOffer } from "./offer";
import { useCardSetup, type CardReads } from "./useMachineCardReads";
import "./machine-card.css";

/**
 * SET UP — this studio's unit (the studio map, phase 4). AJ, Oct 11 2026:
 * "the my studio map will hold the unique to that studio version". What
 * trainers preset the machine to as they walk up (the studio's standard
 * settings, the same card the Catalog page shows), its size, and for a
 * leader the local set-up of a Max Strength machine or the offer of the
 * studio's own to the MSF catalog. Trainers read it; leaders change it.
 */
export function SetupPart({
  studioId,
  studioName,
  machineId,
  name,
  entry,
  catalogEntry,
  catalogName,
  have,
  authTrainer,
  trainers,
  uid,
  canLead,
  openOffer = false,
}: {
  studioId: string;
  studioName: string;
  machineId: string;
  name: string;
  entry: StudioMachineRosterEntry;
  catalogEntry: MachineCatalogEntry | null;
  catalogName: string;
  have?: CardReads["settingsByMachineId"];
  authTrainer: Trainer | null;
  trainers?: readonly Trainer[];
  uid: string | null;
  canLead: boolean;
  /** Arrived to offer it (the floor list's Offer): the offer dialog opens with the part. */
  openOffer?: boolean;
}) {
  const settings = useCardSetup(studioId, have);
  const [localSetup, setLocalSetup] = useState(false);
  const [offer, setOffer] = useState(openOffer);
  const marker = (entry as { submission?: RosterSubmissionMarker }).submission ?? null;
  const markerLabel = submissionLabel(marker);
  const ownMachine = entry.source === "custom" && !(entry as { adoptedFrom?: unknown }).adoptedFrom;

  return (
    <>
      <section aria-label="This studio's standard settings">
        <h3 className="mdc-h">This studio's standard settings</h3>
        <p className="mdc-line mdc-line--quiet">What trainers preset the machine to as they walk up. Trainers read these; leaders change them.</p>
        <StudioSetupCard
          machineId={machineId}
          machineName={name}
          studioId={studioId}
          setting={settings[machineId]}
          canEdit={canLead}
          authorId={authTrainer?.id ?? null}
        />
      </section>

      <section aria-label="Its size">
        <h3 className="mdc-h">Its size</h3>
        <UnitSizeCard
          studioId={studioId}
          entry={entry}
          machineName={name}
          canEdit={canLead}
          authUid={uid}
          nameOf={(who) => (trainers ?? []).find((t) => t.authUid === who || t.id === who)?.fullName ?? null}
        />
      </section>

      {canLead && (entry.source === "catalog" || (ownMachine && canOffer(marker)) || (canWithdraw(marker) && marker)) && (
        <div className="mdc-actions">
          {/* A Max Strength machine's only: saving Local set-up on a studio's own machine took it off the floor (Sep 28 2026). */}
          {entry.source === "catalog" && <AdminButton onClick={() => setLocalSetup(true)}>Local set-up</AdminButton>}
          {ownMachine && canOffer(marker) && (
            <AdminButton onClick={() => setOffer(true)}>
              <Upload className="w-3.5 h-3.5" aria-hidden />
              {marker ? "Offer it again" : "Offer to the MSF catalog"}
            </AdminButton>
          )}
          {canWithdraw(marker) && marker && <WithdrawOffer submissionId={marker.id} studioId={studioId} machineId={machineId} machineName={name} />}
        </div>
      )}
      {markerLabel && <AdminNotice tone={marker?.status === "declined" ? "warn" : "info"}>{markerLabel}</AdminNotice>}
      {marker && <DecisionNote submissionId={marker.id} status={marker.status} />}

      {localSetup && (
        <LocalSetupDialog studioId={studioId} machineId={machineId} catalogName={catalogName} catalog={catalogEntry} entry={entry} onClose={() => setLocalSetup(false)} />
      )}
      {offer && <OfferDialog studioId={studioId} studioName={studioName} entry={entry} machineName={name} authTrainer={authTrainer} onClose={() => setOffer(false)} />}
    </>
  );
}
