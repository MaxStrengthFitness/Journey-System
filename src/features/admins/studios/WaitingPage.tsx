/**
 * ADMINS → STUDIOS → WAITING TO BE LET IN (Oct 16 2026).
 *
 * AJ: "as an admin, I need a quick way where I'm not jumping through figuring
 * out the studio and trying to find the name. I should be able to just see
 * all the requests from admin." Every pending request, every studio, on one
 * list, with the studio each asked for beside the name. Tapping one opens the
 * SAME editor as Operations → Setup → People & access (admin/staff/
 * StaffEditor), so an approval here writes exactly what one there does: the
 * trainer record at the person's sign-in uid, the role, the home studio (the
 * studio they asked for, unless you pick another).
 *
 * Studios keep letting their own people in on My Studio → Team; nothing about
 * that changes. Someone who already has an account and asked for ANOTHER
 * studio can't be approved by that form (it would replace their account), so
 * their row opens their studio's team, where Studios adds one.
 *
 * Reads: the staff roster's administrator listener (one query, status ==
 * "Pending", the index People & access already uses). No studio is picked,
 * so Mindbody's staff list is never fetched: no Mindbody call. Until the
 * listener answers the list says it is checking, never "nobody waiting".
 */
import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import type { Studio, Trainer } from "../../../types";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminHeader,
  AdminNotice,
  AdminPanel,
  AdminRows,
  AdminScreen,
} from "../../admin/primitives";
import { ADMIN_TIER_ROLES, StaffEditor } from "../../admin/staff/StaffEditor";
import { useStaffRoster } from "../../admin/staff/useStaffRoster";
import { waitingPeople, type WaitingPerson } from "./waiting";

export interface WaitingPageProps {
  authTrainer: Trainer;
  trainers: Trainer[];
  studios: Studio[];
  onRefresh?: (c: "studios" | "networks" | "trainers") => Promise<void>;
  /** Home's count and the sidebar's read again after an approval. */
  onChanged?: () => void;
  /** A studio's page, on its Team tab: where another studio is added to someone's account. */
  onOpenStudioTeam?: (studioId: string) => void;
}

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

function metaOf(p: WaitingPerson): string {
  const parts: string[] = [p.email ?? "no email"];
  if (p.kind === "another-studio") {
    parts.push(p.homeStudioName ? `already works at ${p.homeStudioName}` : "already has an account");
  }
  if (p.since != null) parts.push(`asked ${DAY.format(new Date(p.since))}`);
  return parts.join(" · ");
}

export function WaitingPage({ authTrainer, trainers, studios, onRefresh, onChanged, onOpenStudioTeam }: WaitingPageProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { rows, requestsRead } = useStaffRoster({ reader: authTrainer, trainers, studio: null, studioId: null, studioIds: null });
  const people = useMemo(() => waitingPeople(rows, studios), [rows, studios]);
  const selected = people.find((p) => p.key === selectedKey) ?? null;

  const title =
    requestsRead !== "ok"
      ? "Waiting"
      : people.length === 0
        ? "Nobody waiting"
        : people.length === 1
          ? "1 person waiting"
          : `${people.length} people waiting`;

  return (
    <AdminScreen>
      <AdminHeader
        icon={<UserPlus className="w-5 h-5" />}
        title="Waiting to be let in"
        subtitle="Everyone who signed in and asked to join, at every studio. A studio's leaders can let their own people in on My Studio → Team; approving here does the same."
      />

      {requestsRead === "failed" && (
        <AdminNotice tone="warn">Couldn&apos;t read the requests just now. That is unknown, not empty: reload to try again.</AdminNotice>
      )}

      <div className="adm-ov__cols">
        <div className="adm-ov__stack">
          <AdminPanel title={title} flush>
            {requestsRead === "loading" ? (
              <div className="p-4">
                <AdminEmpty title="Checking">Reading the requests from every studio.</AdminEmpty>
              </div>
            ) : people.length === 0 ? (
              <div className="p-4">
                <AdminEmpty title={requestsRead === "ok" ? "Nobody is waiting" : "Not read"}>
                  {requestsRead === "ok"
                    ? "When someone signs in and asks to join a studio, they show here."
                    : "The requests couldn't be read."}
                </AdminEmpty>
              </div>
            ) : (
              <AdminRows>
                {people.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className="adm-row adm-row--tappable"
                    onClick={() => setSelectedKey(p.key)}
                    aria-current={p.key === selectedKey ? "true" : undefined}
                    data-testid="waiting-row"
                  >
                    <span className="adm-row__main">
                      <span className="adm-row__name">{p.name}</span>
                      <span className="adm-row__meta">{metaOf(p)}</span>
                    </span>
                    <AdminBadge tone="neutral">{p.studioName ?? "No studio named"}</AdminBadge>
                  </button>
                ))}
              </AdminRows>
            )}
          </AdminPanel>
        </div>

        <div className="adm-ov__stack">
          {selected ? (
            <>
              <StaffEditor
                key={selected.key}
                row={selected.row}
                // Administrators: every studio, every role (People & access
                // gives an administrator the same).
                studios={studios}
                // The home studio starts as the studio they asked for.
                activeStudioId={selected.studioId}
                assignableRoles={ADMIN_TIER_ROLES}
                canChangeRole
                viewer={authTrainer}
                viewerIsAdmin
                onDone={async () => {
                  setSelectedKey(null);
                  await onRefresh?.("trainers");
                  onChanged?.();
                }}
              />
              {selected.kind === "another-studio" && selected.homeStudioId && onOpenStudioTeam && (
                <div>
                  <AdminButton variant="primary" onClick={() => onOpenStudioTeam(selected.homeStudioId!)}>
                    Open {selected.homeStudioName ?? "their studio"}&apos;s team
                  </AdminButton>
                </div>
              )}
            </>
          ) : (
            <AdminPanel title="Nobody selected">
              <AdminEmpty title="Pick someone on the left">
                Approving gives them an account, a role and a home studio. They can sign in straight away.
              </AdminEmpty>
            </AdminPanel>
          )}
        </div>
      </div>
    </AdminScreen>
  );
}
