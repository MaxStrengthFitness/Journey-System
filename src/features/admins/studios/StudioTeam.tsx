/**
 * A STUDIO'S TEAM, on its page in Admins — the one complete place to run a
 * studio's people (the sign-in email round, Oct 20 2026).
 *
 * AJ: "we need to have ultimate control over user profiles from the admin
 * screen, we need to be able to organize the studio staff list a better,
 * make sure emails are linked and synced with mindbody and also any names or
 * nicknames are easy to deal with." My Studio → Team is read-only for the
 * studio's leaders since the same day ("Read-only for leaders").
 *
 * The list is team-board.ts: Needs fixing first (one person on two records:
 * Merge; signed in with no Mindbody link: Link), then the team, then the
 * people on Mindbody who haven't signed in, the Rotation rows, and the
 * accounts switched off. One line of counts leads (Operations says it
 * once). A row opens the full editor (StaffEditor: name, nickname, sign-in
 * address with Mindbody's beside it, the Mindbody staff member picked from
 * Mindbody's own list, initials, calendar, home studio); sign-in requests
 * for the studio wait at the top, answered with Who is this?.
 *
 * Merge writes two documents (sign-in-email/merge.ts): the record the
 * person signs in to takes the Mindbody link and what it lacks, and the
 * other becomes a pointer at it. The Hub reads a booking that names the old
 * record as the kept one's (hub-schedule/columns.ts mergedAliases), and the
 * next sync rewrites today onward. scripts/merge-trainer-records.ts also
 * moves the stored references, for a record with history behind it.
 *
 * Change role (Sep 28 2026) and Studios (Oct 1 2026) stay on each row; both
 * record who changed what in the Activity record. Nobody changes their own
 * role here.
 */
import { useMemo, useState } from "react";
import { deleteField, doc, updateDoc, writeBatch } from "firebase/firestore";
import { Link2, Merge, UserCheck, UserX, Users } from "lucide-react";
import { db } from "../../../firebase";
import type { Client, Studio, Trainer } from "../../../types";
import { FRANCHISE_ROLES } from "../../../lib/staff-access";
import { AdminButton, AdminEmpty, AdminNotice, AdminPanel, ConfirmDialog } from "../../admin/primitives";
import { switchedOffWhat } from "../../sign-out/account-off";
import { logActivity } from "../activity/log-activity";
import { ProvisionalPanel } from "../../admin/provisional/ProvisionalPanel";
import { useStaffRoster } from "../../admin/staff/useStaffRoster";
import { ADMIN_TIER_ROLES, StaffEditor } from "../../admin/staff/StaffEditor";
import { mindbodyOnly, type MindbodyStaff, type StaffRow } from "../../admin/staff/roster";
import { keptPatch, tombstonePatch } from "../../sign-in-email/merge";
import { HqRow, HqRows, HqStatus } from "../kit";
import { roleLabel } from "./role-change";
import { RoleDialog } from "./RoleDialog";
import { StudiosDialog } from "./StudiosDialog";
import { GROUP_TITLES, mindbodyNotInJourney, teamBoard, type TeamEntry, type TeamGroup } from "./team-board";

type Pending = { kind: "merge"; entry: TeamEntry } | { kind: "link"; entry: TeamEntry };

export function StudioTeam({
  studio,
  studios = [],
  trainers,
  clients,
  authTrainer,
  onCreated,
  onRolesChanged,
}: {
  studio: Studio;
  /** Every studio, for the Studios picker and the names in it. */
  studios?: readonly Studio[];
  trainers: Trainer[];
  clients: Client[];
  authTrainer: Trainer;
  onCreated?: () => Promise<void> | void;
  /** A role was changed: the dashboard reads the people again. */
  onRolesChanged?: () => Promise<void> | void;
}) {
  const studioId = studio.id ?? "";
  const [changing, setChanging] = useState<Trainer | null>(null);
  const [placing, setPlacing] = useState<Trainer | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const roster = useStaffRoster({ reader: authTrainer, trainers, studio, studioId });
  const board = useMemo(
    () => teamBoard({ trainers, studioId, mindbodyStaff: roster.mindbodyStaff, mindbodyRead: roster.mindbodyChecked }),
    [trainers, studioId, roster.mindbodyStaff, roster.mindbodyChecked],
  );
  const requests = useMemo(() => roster.rows.filter((r) => r.state === "awaiting-approval"), [roster.rows]);
  const notInJourney = useMemo(() => mindbodyNotInJourney(trainers, roster.mindbodyStaff), [trainers, roster.mindbodyStaff]);
  const owners = useMemo(() => trainers.filter((t) => (t.ownedStudioIds ?? []).includes(studioId)), [trainers, studioId]);
  const count = (g: TeamGroup) => board.filter((e) => e.group === g).length;
  const isMe = (t: Trainer) => t.id === authTrainer.id;
  const studioList = (studios.length ? studios : [studio]) as Studio[];

  // The editor's row: the roster's (it carries Mindbody's side), else the record alone.
  const rowFor = (t: Trainer): StaffRow =>
    roster.rows.find((r) => r.trainer?.id === t.id) ?? {
      key: `t:${t.id}`,
      name: t.fullName || "Unnamed person",
      email: t.email,
      initials: t.initials,
      role: t.role,
      homeStudioId: t.primaryHomeStudioId,
      state: "account",
      matchedBy: null,
      trainer: t,
    };
  const openRow: StaffRow | null = useMemo(() => {
    if (!openKey) return null;
    const req = requests.find((r) => r.key === openKey);
    if (req) return req;
    const entry = board.find((e) => `t:${e.trainer.id}` === openKey);
    return entry ? rowFor(entry.trainer) : null;
    // rowFor reads roster.rows, which requests and board already follow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, requests, board, roster.rows]);

  const record = (what: string, before: Record<string, string>, after: Record<string, string>) =>
    logActivity({ kind: "assisted-change", what, studioId, before, after, byName: authTrainer.fullName });

  const merge = async (entry: TeamEntry) => {
    const kept = entry.trainer;
    const old = entry.mergeWith;
    if (!old) return;
    setBusy(kept.id);
    setProblem(null);
    try {
      const nowIso = new Date().toISOString();
      const batch = writeBatch(db);
      const patch = keptPatch(old as never, kept as never, old.id, "merge");
      if (Object.keys(patch).length) batch.update(doc(db, "trainers", kept.id), patch);
      batch.update(doc(db, "trainers", old.id), tombstonePatch(old as never, kept.id, nowIso));
      await batch.commit();
      await record(
        `Merged ${old.fullName || "a record"}'s older record into the one ${kept.fullName || "they"} sign in to.`,
        { Records: "Two" },
        { Records: "One", "Mindbody staff": String(old.mindbodyStaffId || kept.mindbodyStaffId || "none") },
      );
      await onRolesChanged?.();
    } catch (err) {
      setProblem(`Couldn't merge ${kept.fullName || "the records"}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
      setPending(null);
    }
  };

  const link = async (entry: TeamEntry) => {
    const t = entry.trainer;
    const staff = entry.linkTo;
    if (!staff) return;
    setBusy(t.id);
    setProblem(null);
    try {
      await updateDoc(doc(db, "trainers", t.id), { mindbodyStaffId: String(staff.id), mindbodyLinked: true });
      await record(`Linked ${t.fullName || "a trainer"} to Mindbody staff ${staff.fullName}.`, { "Mindbody staff": "none" }, { "Mindbody staff": String(staff.id) });
      await onRolesChanged?.();
    } catch (err) {
      setProblem(`Couldn't link ${t.fullName || "them"}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
      setPending(null);
    }
  };

  const switchOn = async (t: Trainer) => {
    setBusy(t.id);
    setProblem(null);
    try {
      await updateDoc(doc(db, "trainers", t.id), { isActive: true, switchedOffAt: deleteField(), switchedOffBy: deleteField() });
      await record(switchedOffWhat(t.fullName || "", false), { Account: "Switched off" }, { Account: "On" });
      await onRolesChanged?.();
    } catch (err) {
      setProblem(`Couldn't switch ${t.fullName || "the account"} back on: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const say = (e: TeamEntry) => {
    const t = e.trainer;
    return (
      <>
        <span>{t.email || "No sign-in address"}</span>
        {t.mindbodyStaffId ? (
          <HqStatus tone="ok">Mindbody: {e.mindbody?.fullName ?? `staff ${t.mindbodyStaffId}`}</HqStatus>
        ) : (
          <HqStatus tone="idle">Not linked to Mindbody</HqStatus>
        )}
        {e.mindbodyName || e.mindbodyEmail ? (
          <span>Mindbody has {[e.mindbodyName, e.mindbodyEmail].filter(Boolean).join(", ")}</span>
        ) : null}
        {t.primaryHomeStudioId !== studioId ? <span>{(t.accessibleStudioIds ?? []).includes(studioId) ? "Also works here" : "A guest here"}</span> : null}
        {FRANCHISE_ROLES.has(t.role) && (t.ownedStudioIds ?? []).length === 0 ? (
          <span>Runs only their home studio until you mark the studios they own (Studios, on their row).</span>
        ) : null}
        {e.note ? <span>{e.note}</span> : null}
      </>
    );
  };

  const actions = (e: TeamEntry) => {
    const t = e.trainer;
    const name = t.fullName || "this person";
    if (e.group === "off") {
      return (
        <AdminButton size="sm" busy={busy === t.id} disabled={busy !== null} onClick={() => void switchOn(t)} aria-label={`Switch ${name}'s account back on`}>
          Switch back on
        </AdminButton>
      );
    }
    return (
      <>
        {e.mergeWith ? (
          <AdminButton size="sm" variant="primary" busy={busy === t.id} disabled={busy !== null} onClick={() => setPending({ kind: "merge", entry: e })}>
            <Merge className="w-3.5 h-3.5" />
            Merge
          </AdminButton>
        ) : null}
        {e.linkTo ? (
          <AdminButton size="sm" variant="primary" busy={busy === t.id} disabled={busy !== null} onClick={() => setPending({ kind: "link", entry: e })}>
            <Link2 className="w-3.5 h-3.5" />
            Link
          </AdminButton>
        ) : null}
        <AdminButton size="sm" onClick={() => setPlacing(t)} aria-label={`Studios: ${name}`}>
          Studios
        </AdminButton>
        {isMe(t) ? null : (
          <AdminButton size="sm" onClick={() => setChanging(t)} aria-label={`Change role: ${name}`}>
            Change role
          </AdminButton>
        )}
      </>
    );
  };

  const groups: TeamGroup[] = ["needs", "team", "waiting", "rotation", "off"];
  const summary = [
    requests.length ? `${requests.length} waiting to be let in` : null,
    count("needs") ? `${count("needs")} need fixing` : null,
    `${count("team")} on the team`,
    count("waiting") ? `${count("waiting")} not signed in yet` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-4">
      <AdminPanel
        title="Who works here"
        icon={<Users className="w-3.5 h-3.5" />}
        subtitle={owners.length ? `${summary}. Owned by ${owners.map((o) => `${o.fullName} (${roleLabel(o.role)})`).join(", ")}.` : `${summary}.`}
        flush
      >
        {roster.staffStatus ? (
          <div className="p-3">
            <AdminNotice tone="info">{roster.staffStatus}</AdminNotice>
          </div>
        ) : null}
        {problem ? (
          <div className="p-3">
            <AdminNotice tone="alert">{problem}</AdminNotice>
          </div>
        ) : null}

        {requests.length > 0 ? (
          <>
            <p className="adm-hint" style={{ padding: "12px 16px 4px" }}>
              Waiting to be let in
            </p>
            <HqRows label={`Waiting to be let in at ${studio.name}`}>
              {requests.map((r) => (
                <HqRow
                  key={r.key}
                  name={r.name}
                  context="Signed in, waiting"
                  say={<span>{r.email || "No address on the request"}</span>}
                  onOpen={() => setOpenKey(openKey === r.key ? null : r.key)}
                  selected={openKey === r.key}
                  action={
                    <AdminButton size="sm" variant="primary" onClick={() => setOpenKey(r.key)}>
                      <UserCheck className="w-3.5 h-3.5" />
                      Who is this?
                    </AdminButton>
                  }
                />
              ))}
            </HqRows>
          </>
        ) : null}

        {board.length === 0 && requests.length === 0 ? (
          <div className="p-4">
            <AdminEmpty title="Nobody works here yet">They come in by signing in with Microsoft: their request waits here.</AdminEmpty>
          </div>
        ) : (
          groups
            .filter((g) => count(g) > 0)
            .map((g) => (
              <div key={g}>
                <p className="adm-hint" style={{ padding: "12px 16px 4px" }}>
                  {GROUP_TITLES[g]}
                </p>
                <HqRows label={`${GROUP_TITLES[g]} at ${studio.name}`}>
                  {board
                    .filter((e) => e.group === g)
                    .map((e) => {
                      const key = `t:${e.trainer.id}`;
                      return (
                        <HqRow
                          key={key}
                          name={
                            <>
                              {e.trainer.fullName || "Unnamed person"}
                              {e.trainer.nickname ? <span className="hq-row__ctx">“{e.trainer.nickname}”</span> : null}
                            </>
                          }
                          context={isMe(e.trainer) ? `${roleLabel(e.trainer.role)} · you` : roleLabel(e.trainer.role)}
                          say={say(e)}
                          onOpen={() => setOpenKey(openKey === key ? null : key)}
                          openLabel={`Edit ${e.trainer.fullName || "this person"}`}
                          selected={openKey === key}
                          action={actions(e)}
                        />
                      );
                    })}
                </HqRows>
              </div>
            ))
        )}
      </AdminPanel>

      {openRow ? (
        <StaffEditor
          key={openRow.key}
          row={openRow}
          studios={studioList}
          activeStudioId={studioId}
          assignableRoles={ADMIN_TIER_ROLES}
          // A role changes on Change role, which records who changed it.
          canChangeRole={false}
          viewer={authTrainer}
          viewerIsAdmin
          people={trainers}
          mindbodyStaffOnly={mindbodyOnly(roster.rows)}
          mindbodyStaff={roster.mindbodyStaff}
          onDone={async () => {
            setOpenKey(null);
            await onRolesChanged?.();
          }}
        />
      ) : null}

      {notInJourney.length > 0 ? (
        <AdminPanel title="On Mindbody, not in Journey" icon={<UserX className="w-3.5 h-3.5" />} subtitle={`${notInJourney.length} on ${studio.name}'s Mindbody staff list with no Journey record. When one signs in, Who is this? links them.`}>
          <p className="adm-hint">{notInJourney.map((s: MindbodyStaff) => s.fullName).join(" · ")}</p>
        </AdminPanel>
      ) : null}

      <ProvisionalPanel studio={studio} clients={clients} trainers={trainers} authTrainer={authTrainer} onCreated={onCreated} />

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === "merge"
            ? `Merge ${pending.entry.trainer.fullName}'s two records?`
            : `Link ${pending?.entry.trainer.fullName ?? ""} to Mindbody?`
        }
        body={
          pending?.kind === "merge"
            ? `Keeps the record ${pending.entry.trainer.fullName} signs in to (${pending.entry.trainer.email || "no address"}). It takes the Mindbody link${pending.entry.mergeWith?.mindbodyStaffId ? ` (staff ${pending.entry.mergeWith.mindbodyStaffId})` : ""}, and the Hub shows the other record's bookings as theirs. The other record is kept as a pointer, never deleted.`
            : pending?.kind === "link"
              ? `${pending.entry.trainer.fullName}'s bookings with ${pending.entry.linkTo?.fullName} (Mindbody staff ${pending.entry.linkTo?.id}) come to them from the next sync.`
              : ""
        }
        confirmLabel={pending?.kind === "merge" ? "Merge" : "Link"}
        busy={busy !== null}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending?.kind === "merge") void merge(pending.entry);
          else if (pending?.kind === "link") void link(pending.entry);
        }}
      />
      <RoleDialog
        person={changing}
        studioId={studioId}
        studioName={studio.name}
        studios={studioList}
        byName={authTrainer.fullName}
        onClose={() => setChanging(null)}
        onSaved={onRolesChanged}
      />
      <StudiosDialog
        person={placing}
        studio={studio}
        studios={studioList}
        byName={authTrainer.fullName}
        onClose={() => setPlacing(null)}
        onSaved={onRolesChanged}
      />
    </div>
  );
}
