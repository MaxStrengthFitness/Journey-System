/**
 * THE FLOOR'S STATUS ON A MACHINE — "Out of service" and "Flagged", in the
 * Catalog's own words and colours. Round: the Learning vault redesign,
 * Oct 19 2026 (the judges' last fixes: all three found the prototypes
 * silent about a unit the floor can't use).
 *
 * Two forms, one for each place today's Catalog says it:
 *
 *   variant="chip"    a catalog row (catalog/FloorRow.tsx): the plum
 *                     "Out of service" and "Flagged" badges, and, where a
 *                     leader gave one, why it is out ("A new cable is on
 *                     order · Glorfindel") under them.
 *   variant="banner"  the top of a machine page (catalog/MachineArticle.tsx):
 *                     "Out of service · Glorfindel · Sep 27, 8:52 AM", the
 *                     reason, where it goes back in; and "Flagged by Jess ·
 *                     Oct 18, 8:52 AM", the note, where it is cleared.
 *
 * `status` is the machine's entry in useVaultData's `care`
 * (`data.care?.[machineId]`). Undefined or null draws nothing: either the
 * machine has nothing to say, or the floor's status is unknown, and an
 * unknown status is never said as "in service" (floor-care.ts).
 *
 * Read only: a leader takes a machine out of service on My Studio →
 * Machines, and a flag is cleared on Relay. Nothing here is a control.
 */

import { WikiBadge } from "../../wiki/WikiArticle";
import { flagLineOf } from "../../catalog/floor-index";
import { outOfServiceLineOf, outOfServiceShort, type OutOfService } from "../../catalog/out-of-service";
import { hasFloorStatus, type FloorCareNote, type MachineFloorCare } from "../floor-care";
import "../../wiki/wiki.css";
import "./floor-status.css";

export interface FloorStatusProps {
  /** The machine's entry in `data.care` (useVaultData). Undefined or null draws nothing. */
  status: MachineFloorCare | null | undefined;
  /** "chip" for a catalog row; "banner" for the top of a machine page. */
  variant: "chip" | "banner";
  /** chip only: why it is out of service, under the chips, as today's row says it. Default true. */
  why?: boolean;
  /** The studio's time zone for the banner's times; the app's studio zone when absent. */
  tz?: string;
}

function msOf(iso: string | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/** Back to the Catalog's own record, so its words come from its own functions. */
function outOfServiceRecord(n: FloorCareNote): OutOfService {
  return { reason: n.text, by: { uid: "", name: n.by ?? "" }, at: msOf(n.at) };
}

export function FloorStatus({ status, variant, why = true, tz }: FloorStatusProps) {
  if (!hasFloorStatus(status)) return null;
  const oosWhy = status.outOfService && status.outOfServiceWhy?.text ? status.outOfServiceWhy : null;

  if (variant === "chip") {
    return (
      <span className="vtf vtf--chip" data-floor-status="chip">
        <span className="vtf__chips">
          {status.outOfService && <WikiBadge tone="warn">Out of service</WikiBadge>}
          {status.flag && <WikiBadge tone="warn">Flagged</WikiBadge>}
        </span>
        {why && oosWhy && <span className="vtf__why">{outOfServiceShort(outOfServiceRecord(oosWhy))}</span>}
      </span>
    );
  }

  const oos = oosWhy ? outOfServiceLineOf(outOfServiceRecord(oosWhy), tz) : null;
  const flag = status.flag
    ? flagLineOf({ note: status.flag.text, by: { name: status.flag.by ?? "" }, at: msOf(status.flag.at) }, tz)
    : null;

  return (
    <div className="vtf vtf--banner" data-floor-status="banner">
      {status.outOfService && (
        <p className="vtf__note" role="status">
          <span className="vtf__who">
            {oos ? `Out of service · ${oos.who}${oos.when ? ` · ${oos.when}` : ""}` : "Out of service"}
          </span>
          {oos && <span className="vtf__text">{oos.reason}</span>}
          <span className="vtf__where">Back in service is on My Studio → Machines.</span>
        </p>
      )}
      {flag && (
        <p className="vtf__note" role="status">
          <span className="vtf__who">
            Flagged by {flag.who}
            {flag.when ? ` · ${flag.when}` : ""}
          </span>
          {flag.note && <span className="vtf__text">{flag.note}</span>}
          <span className="vtf__where">Cleared on My Studio → Relay.</span>
        </p>
      )}
    </div>
  );
}
