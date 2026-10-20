/**
 * ONE PERSON'S ACCESS — the editor behind Staff & Roles and My Studio → Team.
 *
 * Lifted out of AdminStaffTab in the My Studio round (Sep 2026) so the
 * studio's own leaders approve and manage their team with the same code the
 * Operations tab uses, and the two can never disagree about what a save
 * writes. What differs between the doors is passed in:
 *
 *   assignableRoles   what THIS caller may hand out. A studio leader gets
 *                     trainer, head trainer, studio leader (AJ, Sep 18:
 *                     "never owner and admin"); Operations gives owners and
 *                     administrators more.
 *   lockHomeStudio    My Studio approves people INTO this studio — the
 *                     home-studio select is not offered.
 *   grantStudioId     when set, the "Can manage My Studio" switch for that
 *                     studio (Trainer.managedStudioIds).
 *   viewer,           who is looking, so the row offers only what the rules
 *   viewerIsAdmin     let THEM save (edit-limits.ts; the franchise
 *                     partition, Oct 2026): your own role and studios are
 *                     head office's, a person based at a studio you don't
 *                     lead is read only, and an owner's role or someone out
 *                     of reach is locked, with one line saying why. A locked
 *                     field is never put in the save, so a stale form can't
 *                     send it.
 *
 * WHO THEY ARE (the Atlas answers, Oct 2 2026): a person's full name, email
 * and Mindbody Staff ID are a leader's to keep, here, not the trainer's own
 * Edit profile. Shown for anyone with an account; a save writes only the ones
 * that changed, and a Staff ID marks the Mindbody link.
 *
 * Every write is to trainers/{uid}: setDoc at the AUTH UID on approval,
 * never addDoc (a random id is a profile its owner cannot write), and
 * updateDoc with only the fields on this form otherwise.
 *
 * WHICH EMAIL SIGNS IN AS WHOM (the sign-in email round, Oct 20 2026;
 * features/sign-in-email/): "Signs in as" is Journey's address, with
 * Mindbody's beside it and copied only by a tap. Saving an address another
 * record holds moves it, after one question. On a record nobody has signed in
 * as, the address also opens its claim, so the first sign-in moves the record
 * to the person's uid. A request answers "Who is this?" first: an existing
 * record is linked (nothing new is made), someone on Mindbody's staff list
 * gets the account with their staff id, or a new person is approved as before.
 */

import React, { useEffect, useMemo, useState } from "react";
import { arrayRemove, arrayUnion, doc, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { CircleUserRound, Link2, ShieldAlert, UserCheck } from "lucide-react";
import { auth, db } from "../../../firebase";
import type { Studio, Trainer, UserRole } from "../../../types";
import { ROLE_LABELS } from "../../../types";
import { useToast } from "../../../contexts/ToastContext";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import { generateSearchTokens } from "@/lib/utils";
import {
  AdminBadge,
  AdminButton,
  AdminField,
  AdminGrid,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminSelect,
  ConfirmDialog,
} from "../primitives";
import { isStudioAccessRequest, requestStudioId, type MindbodyStaff, type StaffRow, type StaffState } from "./roster";
import { staffEditLimits } from "./edit-limits";
import {
  emailWrites,
  holdersOf,
  looksLikeEmail,
  neverSignedIn,
  normalEmail,
  whoIsThis,
  type EmailWrite,
} from "../../sign-in-email/sign-in-email";
import { movedRecord, tombstonePatch } from "../../sign-in-email/merge";

export const STATE_BADGE: Record<
  StaffState,
  { label: string; tone: "ok" | "warn" | "alert" | "neutral" | "live" | "hero" }
> = {
  linked: { label: "Active", tone: "ok" },
  "app-only": { label: "No Mindbody match", tone: "warn" },
  "mindbody-only": { label: "No app account", tone: "neutral" },
  "awaiting-approval": { label: "Waiting for approval", tone: "hero" },
  temporary: { label: "Temporary", tone: "warn" },
  placeholder: { label: "Never signed in", tone: "warn" },
  account: { label: "Has an account", tone: "neutral" },
};

/**
 * What a studio's own leaders may hand out (AJ, Sep 18): never owner or admin.
 * Life Transformer, Head Trainer, Studio Leader — one label each since the
 * voice review follow-up (Sep 27 2026); a head trainer used to read "Studio
 * Leader" as well, so the picker offered it twice.
 */
export const STUDIO_TIER_ROLES: UserRole[] = ["LifeTransformer", "HeadTrainer", "StudioLeader"];
/** What a franchise owner may hand out from Operations: the studio tier and the owner tier, never an administrator. */
export const OWNER_TIER_ROLES: UserRole[] = [...STUDIO_TIER_ROLES, "StudioOwner", "Owner"];
/** Administrators: everything, including another administrator. */
export const ADMIN_TIER_ROLES: UserRole[] = [...OWNER_TIER_ROLES, "Admin"];

export interface StaffEditorProps {
  row: StaffRow;
  studios: Studio[];
  activeStudioId: string | null;
  assignableRoles: UserRole[];
  /** May change an EXISTING person's role (approval always sets one). */
  canChangeRole: boolean;
  lockHomeStudio?: boolean;
  grantStudioId?: string | null;
  /** Who is looking (edit-limits.ts). Null: nothing is locked on their account. */
  viewer?: Trainer | null;
  /** The company tier: nothing locked but an owner's role. */
  viewerIsAdmin?: boolean;
  /**
   * Everyone the viewer can see (the sign-in email round): who else holds an
   * address, and who a request could be linked to. Empty: neither is checked.
   */
  people?: Trainer[];
  /** Mindbody staff with no Journey record: the rest of "Who is this?". */
  mindbodyStaffOnly?: MindbodyStaff[];
  /**
   * The studio site's whole Mindbody staff list (Admins → Team): the Mindbody
   * link is picked from it by name, never typed. Empty: the typed box.
   */
  mindbodyStaff?: MindbodyStaff[];
  /**
   * Shown, never saved, with this one line (AJ, Oct 20 2026: My Studio → Team
   * is read-only for leaders; administrators change people on Admins → Team).
   */
  lockedReason?: string | null;
  onDone: () => Promise<void> | void;
}

const NO_PEOPLE: Trainer[] = [];
const NO_STAFF: MindbodyStaff[] = [];
/** "Who is this?" when the answer is nobody Journey or Mindbody knows. */
const NEW_PERSON = "new";

export function StaffEditor({
  row,
  studios,
  activeStudioId,
  assignableRoles,
  canChangeRole,
  lockHomeStudio = false,
  grantStudioId = null,
  viewer = null,
  viewerIsAdmin = false,
  people = NO_PEOPLE,
  mindbodyStaffOnly = NO_STAFF,
  mindbodyStaff = NO_STAFF,
  lockedReason = null,
  onDone,
}: StaffEditorProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [role, setRole] = useState<UserRole>(row.role ?? "LifeTransformer");
  const [homeStudioId, setHomeStudioId] = useState(row.homeStudioId ?? activeStudioId ?? "");
  const [initials, setInitials] = useState(row.initials ?? initialsFrom(row.name));
  const [onCalendar, setOnCalendar] = useState(row.trainer?.isVisibleOnCalendar ?? true);
  const [managesHere, setManagesHere] = useState(
    Boolean(grantStudioId && row.trainer?.managedStudioIds?.includes(grantStudioId)),
  );
  const [fullName, setFullName] = useState(row.trainer?.fullName ?? "");
  const [nickname, setNickname] = useState(row.trainer?.nickname ?? "");
  const [email, setEmail] = useState(row.trainer?.email ?? "");
  const [staffId, setStaffId] = useState(String(row.trainer?.mindbodyStaffId ?? ""));
  const [busy, setBusy] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  /** The address moves from someone else: the writes, held until confirmed. */
  const [pendingMove, setPendingMove] = useState<EmailWrite[] | null>(null);
  const [who, setWho] = useState<string>(NEW_PERSON);

  useEffect(() => {
    setRole(row.role ?? "LifeTransformer");
    setHomeStudioId(lockHomeStudio ? (activeStudioId ?? "") : (row.homeStudioId ?? activeStudioId ?? ""));
    setInitials(row.initials ?? initialsFrom(row.name));
    setOnCalendar(row.trainer?.isVisibleOnCalendar ?? true);
    setManagesHere(Boolean(grantStudioId && row.trainer?.managedStudioIds?.includes(grantStudioId)));
    setFullName(row.trainer?.fullName ?? "");
    setNickname(row.trainer?.nickname ?? "");
    setEmail(row.trainer?.email ?? "");
    setStaffId(String(row.trainer?.mindbodyStaffId ?? ""));
  }, [row, activeStudioId, lockHomeStudio, grantStudioId]);

  // A role this caller may not hand out is shown, not offered: the select
  // keeps the person's current role as its only extra option, so opening the
  // editor never silently demotes an owner to the first thing on the list.
  const roleOptions: UserRole[] =
    row.role && !assignableRoles.includes(row.role) ? [row.role, ...assignableRoles] : assignableRoles;
  // What this viewer may save on this row (the franchise partition, Oct
  // 2026). A request row has no trainer document, so nothing is locked by it:
  // the approval path has its own checks.
  const limits = useMemo(
    () => staffEditLimits({ viewer, target: row.trainer ?? null, viewerIsAdmin, studios }),
    [viewer, row.trainer, viewerIsAdmin, studios],
  );
  const readOnly = limits.readOnly || Boolean(lockedReason);
  const roleLocked = (!canChangeRole && row.state !== "awaiting-approval") || limits.roleLocked || readOnly;
  const roleOutOfReach = Boolean(row.role && !assignableRoles.includes(row.role));
  const homeLocked = limits.homeLocked || readOnly;
  const emailLocked = limits.emailLocked || readOnly;
  const grantShown = Boolean(grantStudioId) && !limits.grantHidden && !readOnly;
  // Mindbody's address: a reference beside Journey's, never its stand-in.
  const mindbodyEmail = normalEmail(row.mindbody?.email);
  // The same for the name: Mindbody's whole name when it differs (a nickname is Journey's own).
  const mindbodyName = (row.mindbody?.fullName ?? "").trim().replace(/\s+/g, " ");
  const staffChoices = useMemo(
    () => [...mindbodyStaff].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [mindbodyStaff],
  );

  // The studio picker's Request Access comes from someone who already has an
  // account. Approving writes a WHOLE new trainers/{uid}, which would replace
  // that account, so this path is never offered for one (roster.ts).
  const studioAccess = Boolean(row.request && isStudioAccessRequest(row.request));
  const askedFor = row.request ? requestStudioId(row.request) : null;
  const studioName = (id: string | null | undefined) => studios.find((s) => s.id === id)?.name;

  /* ---- Who is this? (a sign-up only) ---------------------------------- */
  const asking = row.state === "awaiting-approval" && !studioAccess && Boolean(row.request);
  const choices = useMemo(() => {
    if (!asking || !row.request) return [];
    // Only records whose address this viewer may set: the rules' reach.
    const linkable = people.filter((t) => {
      const l = staffEditLimits({ viewer, target: t, viewerIsAdmin, studios });
      return !l.readOnly && !l.emailLocked;
    });
    // An administrator may also link to an account someone already signs in
    // as (Mike Palko's gmail admin record, Oct 20 2026).
    return whoIsThis(row.request, linkable, mindbodyStaffOnly, { includeSignedIn: viewerIsAdmin });
  }, [asking, row.request, people, mindbodyStaffOnly, viewer, viewerIsAdmin, studios]);
  // The likeliest answer is offered, never assumed: only one with a reason.
  // Keyed on a string, so a re-render never undoes the leader's own pick.
  const suggested = choices[0]?.why ? choices[0].key : NEW_PERSON;
  useEffect(() => {
    setWho(suggested);
  }, [row.key, suggested]);
  const chosen = choices.find((c) => c.key === who) ?? null;
  const linking = chosen?.kind === "record";

  const approve = async () => {
    const req = row.request;
    if (!req || studioAccess) return;
    if (!req.userId) {
      toastError("No signed-in account is attached to this request. Ask them to sign in first: the account is keyed on that.");
      return;
    }
    if (chosen?.kind === "record") {
      await link(chosen.id, chosen.name);
      return;
    }
    if (initials.trim().length < 2) {
      toastError("Initials must be at least two characters.");
      return;
    }
    if (!assignableRoles.includes(role)) {
      toastError(`You can't hand out ${ROLE_LABELS[role]} from here.`);
      return;
    }
    setBusy(true);
    try {
      // setDoc at the AUTH UID, never addDoc. Firestore rules only accept
      // writes to trainers/{uid}; a random id is a profile its owner cannot
      // write, which is exactly what broke the Kaizen Roster.
      await setDoc(doc(db, "trainers", req.userId), {
        fullName: req.fullName,
        initials: initials.trim().toUpperCase(),
        role,
        primaryHomeStudioId: homeStudioId,
        accessibleStudioIds: [homeStudioId],
        activeGuestStudioIds: [],
        ...(grantStudioId && managesHere ? { managedStudioIds: [grantStudioId] } : {}),
        isVisibleOnCalendar: onCalendar,
        email: (req.email || "").trim().toLowerCase(),
        // Someone on Mindbody's staff list: the account carries the link.
        ...(chosen?.kind === "mindbody" ? { mindbodyStaffId: chosen.staffId, mindbodyLinked: true } : {}),
        authUid: req.userId,
        systemStatus: "active",
        createdAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, "access_requests", req.id), {
        status: "Approved",
        approvedTrainerId: req.userId,
        updatedAt: new Date().toISOString(),
      });
      toastSuccess(`${req.fullName} can now sign in as ${ROLE_LABELS[role]}.`);
      await onDone();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "trainers");
    } finally {
      setBusy(false);
      setConfirmApprove(false);
    }
  };

  /**
   * The request is someone Journey already has: their address goes on that
   * record and opens its claim, and the request is answered, in one batch.
   * When they press Check again, sign-in finds the record by the address and
   * moves it to their uid with its role, studios and Mindbody link. Nothing
   * new is made.
   */
  const link = async (targetId: string, targetName: string) => {
    const req = row.request;
    const target = people.find((t) => t.id === targetId);
    const mail = normalEmail(req?.email);
    if (!req || !target) return;
    if (!looksLikeEmail(mail)) {
      toastError("This request has no email address to link. Ask them to sign in again.");
      return;
    }
    if (!req.userId) {
      toastError("No signed-in account is attached to this request. Ask them to sign in first: the account is keyed on that.");
      return;
    }
    setBusy(true);
    try {
      // The record moves to their sign-in NOW (Oct 20 2026): written at
      // trainers/{uid} with its role, studios and Mindbody link, the old one
      // left as a pointer (switched off when someone signed in as it). A
      // claim at their next sign-in can't carry Admin, and Mike Palko's
      // never ran: the rules know a person only at trainers/{uid}.
      const nowIso = new Date().toISOString();
      const uid = req.userId;
      const moved = movedRecord(target as never, targetId, uid, { email: mail, nowIso });
      if (!moved.initials) moved.initials = initialsFrom(target.fullName || req.fullName || "") || "XX";
      const batch = writeBatch(db);
      batch.set(doc(db, "trainers", uid), moved);
      batch.update(
        doc(db, "trainers", targetId),
        tombstonePatch(target as never, uid, nowIso, { fromId: targetId, by: { uid: auth.currentUser?.uid ?? viewer?.id ?? "", name: viewer?.fullName ?? "" } }),
      );
      // One address, one person: anyone else still holding it lets it go.
      for (const other of holdersOf(mail, people, targetId)) if (other.id !== uid) batch.update(doc(db, "trainers", other.id), { email: "" });
      batch.update(doc(db, "access_requests", req.id), {
        status: "Approved",
        approvedTrainerId: uid,
        updatedAt: nowIso,
      });
      await batch.commit();
      toastSuccess(`Linked. ${mail} now opens ${targetName}'s account: they press Check again.`);
      await onDone();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `trainers/${targetId}`);
    } finally {
      setBusy(false);
      setConfirmApprove(false);
    }
  };

  const saveAccess = async (moveConfirmed = false) => {
    const t = row.trainer;
    if (!t || readOnly) return;
    if (!roleLocked && role !== t.role && !assignableRoles.includes(role)) {
      toastError(`You can't hand out ${ROLE_LABELS[role]} from here.`);
      return;
    }
    // Who signs in as this record (features/sign-in-email): only when the
    // address changed, so an initials save never reaches for the email's rule.
    const mail = normalEmail(email);
    const mailChanged = !emailLocked && mail !== normalEmail(t.email);
    if (mailChanged && mail && !looksLikeEmail(mail)) {
      toastError("That isn't a whole email address.");
      return;
    }
    const writes = mailChanged ? emailWrites(t, mail, people) : [];
    if (writes.length > 1 && !moveConfirmed) {
      setPendingMove(writes);
      return;
    }
    setPendingMove(null);
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {
        isVisibleOnCalendar: onCalendar,
        initials: initials.trim().toUpperCase(),
      };
      if (!roleLocked && role !== t.role) patch.role = role;
      // Who they are: only what changed (a blank name is never written).
      const name = fullName.trim().replace(/\s+/g, " ");
      if (name && name !== (t.fullName ?? "")) {
        patch.fullName = name;
        patch.searchTokens = generateSearchTokens(name);
      }
      const nick = nickname.trim().replace(/\s+/g, " ");
      if (nick !== (t.nickname ?? "").trim()) patch.nickname = nick;
      // A locked field is never in the patch (edit-limits.ts): the rules
      // refuse the whole write for one field out of reach.
      Object.assign(patch, writes[0]?.patch);
      const sid = staffId.trim();
      if (sid !== String(t.mindbodyStaffId ?? "").trim()) {
        patch.mindbodyStaffId = sid;
        patch.mindbodyLinked = sid.length > 0;
      }
      if (!lockHomeStudio && !homeLocked && homeStudioId && homeStudioId !== t.primaryHomeStudioId) {
        patch.primaryHomeStudioId = homeStudioId;
      }
      if (grantStudioId && grantShown) {
        const had = (t.managedStudioIds ?? []).includes(grantStudioId);
        if (managesHere && !had) patch.managedStudioIds = arrayUnion(grantStudioId);
        if (!managesHere && had) patch.managedStudioIds = arrayRemove(grantStudioId);
      }
      // One batch: this record, and the address cleared from whoever held it.
      const batch = writeBatch(db);
      batch.update(doc(db, "trainers", t.id), patch);
      for (const w of writes.slice(1)) batch.update(doc(db, "trainers", w.id), w.patch);
      await batch.commit();
      toastSuccess(
        writes.length > 1 ? `Access updated. ${mail} moved to ${t.fullName}.` : "Access updated.",
      );
      await onDone();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `trainers/${t.id}`);
    } finally {
      setBusy(false);
    }
  };

  const linkToMindbody = async () => {
    const t = row.trainer;
    const mb = row.mindbody;
    if (!t || !mb) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "trainers", t.id), {
        mindbodyStaffId: mb.id,
        mindbodyLinked: true,
      });
      toastSuccess(`Linked to Mindbody staff ${mb.id}.`);
      await onDone();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `trainers/${t.id}`);
    } finally {
      setBusy(false);
    }
  };

  const grantStudioName = grantStudioId ? (studios.find((s) => s.id === grantStudioId)?.name ?? "this studio") : null;

  return (
    <>
      <AdminPanel
        title={row.name}
        icon={<CircleUserRound className="w-3.5 h-3.5" />}
        subtitle={row.email}
        actions={<AdminBadge tone={STATE_BADGE[row.state].tone}>{STATE_BADGE[row.state].label}</AdminBadge>}
      >
        {row.state === "mindbody-only" && (
          <AdminNotice tone="info">
            {row.name} is in Mindbody, so their bookings already show on the schedule. When they sign
            in with their Microsoft address they wait here: choose them under Who is this? and the
            account is made with their Mindbody link.
          </AdminNotice>
        )}

        {row.state === "placeholder" && (
          <AdminNotice tone="warn">
            {row.trainer?.email
              ? `Nobody has signed in as ${row.name} yet. Their first sign-in with ${row.trainer.email} opens this account.`
              : `Nobody has signed in as ${row.name} yet. Set the address they sign in with below.`}
          </AdminNotice>
        )}

        {row.duplicateTrainerIds && (
          <div style={{ marginTop: 10 }}>
            <AdminNotice tone="alert">
              <ShieldAlert className="w-3.5 h-3.5 inline mr-1" />
              Two accounts match this person: {row.duplicateTrainerIds.join(", ")}. Almost certainly
              one document created by the old admin path and one created at sign-in. Run the trainer
              identity report before deleting either — see TRAINER-IDENTITY.md.
            </AdminNotice>
          </div>
        )}

        {studioAccess && (
          <div style={{ marginTop: 10 }}>
            <AdminNotice tone="info">
              {row.name} already has an account
              {studioName(row.homeStudioId) ? ` at ${studioName(row.homeStudioId)}` : ""} and asked to work at{" "}
              {studioName(askedFor) ?? "another studio"} too. This request can't be approved from here: an
              administrator adds the studio on Admins → Studios →{" "}
              {studioName(row.homeStudioId) ?? "their home studio"} → Team → Studios.
            </AdminNotice>
          </div>
        )}

        {!studioAccess && askedFor && askedFor !== activeStudioId && (
          <div style={{ marginTop: 10 }}>
            <AdminNotice tone="info">
              They asked for {studioName(askedFor) ?? "another studio"}.
              Approving here puts them at {studioName(homeStudioId) ?? "this studio"} instead.
            </AdminNotice>
          </div>
        )}

        {lockedReason && (
          <div style={{ marginTop: 10 }}>
            <AdminNotice tone="info">{lockedReason}</AdminNotice>
          </div>
        )}

        {!studioAccess && !lockedReason && limits.reason && (
          <div style={{ marginTop: 10 }}>
            <AdminNotice tone="info">{limits.reason}</AdminNotice>
          </div>
        )}

        {asking && !lockedReason && choices.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <AdminField
              label="Who is this?"
              wide
              hint={
                chosen?.why
                  ? `Suggested: ${chosen.why}. Check it before you approve.`
                  : `They signed in as ${row.request?.email ?? "an address Journey doesn't know"}.`
              }
            >
              <AdminSelect value={who} onChange={(e) => setWho(e.target.value)}>
                <option value={NEW_PERSON}>A new person: make an account</option>
                {choices.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.kind === "record"
                      ? c.signsInAs
                        ? `${c.name}, already in Journey (signs in as ${c.signsInAs})`
                        : `${c.name}, already in Journey`
                      : `${c.name}, on Mindbody's staff list`}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
          </div>
        )}

        {linking && (
          <div style={{ marginTop: 10 }}>
            <AdminNotice tone="info">
              Linking moves {chosen?.name}'s record to this sign-in now, with their role, studios and Mindbody
              link.{chosen?.kind === "record" && chosen.signsInAs
                ? ` Their sign-in as ${chosen.signsInAs} is switched off: one person, one account.`
                : ""}
            </AdminNotice>
          </div>
        )}

        {!studioAccess && !linking && (
          <div style={{ marginTop: 12 }}>
            <AdminGrid>
              <AdminField
                label="Role"
                hint={
                  roleOutOfReach
                    ? "A role above what you can hand out — an owner or administrator changes it."
                    : undefined
                }
              >
                <AdminSelect
                  value={role}
                  disabled={roleLocked || roleOutOfReach}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                >
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              {lockHomeStudio ? (
                <AdminField label="Home studio" hint="Approved here, they belong here.">
                  <AdminInput value={studios.find((s) => s.id === homeStudioId)?.name ?? ""} readOnly />
                </AdminField>
              ) : (
                <AdminField label="Home studio">
                  <AdminSelect value={homeStudioId} disabled={homeLocked} onChange={(e) => setHomeStudioId(e.target.value)}>
                    <option value="">Choose a studio</option>
                    {studios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </AdminSelect>
                </AdminField>
              )}
              {row.trainer && (
                <>
                  <AdminField label="Full name">
                    <AdminInput
                      value={fullName}
                      disabled={readOnly}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="First and last name"
                    />
                    {mindbodyName && mindbodyName !== fullName.trim().replace(/\s+/g, " ") && (
                      <p className="adm-hint" style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        Mindbody has {mindbodyName}
                        {!readOnly && (
                          <AdminButton variant="quiet" onClick={() => setFullName(mindbodyName)}>
                            Use this
                          </AdminButton>
                        )}
                      </p>
                    )}
                  </AdminField>
                  <AdminField label="Nickname" hint="What the team calls them, shown beside their name. Blank: none.">
                    <AdminInput
                      value={nickname}
                      disabled={readOnly}
                      maxLength={40}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="e.g. AJ"
                    />
                  </AdminField>
                  <AdminField label="Signs in as" hint={signInHint(row.trainer)}>
                    <AdminInput
                      type="email"
                      value={email}
                      readOnly={emailLocked}
                      disabled={readOnly}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@maxstrengthfitness.com"
                    />
                    {mindbodyEmail && mindbodyEmail !== normalEmail(email) && (
                      <p className="adm-hint" style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        Mindbody has {mindbodyEmail}
                        {!emailLocked && !readOnly && (
                          <AdminButton variant="quiet" onClick={() => setEmail(mindbodyEmail)}>
                            Use this
                          </AdminButton>
                        )}
                      </p>
                    )}
                  </AdminField>
                  <AdminField label="Mindbody Staff ID" hint="Links them to their Mindbody bookings. Blank: not linked.">
                    {staffChoices.length > 0 ? (
                      // Picked from Mindbody's own list by name (Admins → Team):
                      // a typed number can't be checked against anyone.
                      <AdminSelect value={staffId} disabled={readOnly} onChange={(e) => setStaffId(e.target.value)}>
                        <option value="">Not linked</option>
                        {staffId && !staffChoices.some((s) => String(s.id) === staffId) && (
                          <option value={staffId}>Staff {staffId} (not on this studio's Mindbody list)</option>
                        )}
                        {staffChoices.map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {s.fullName} · {s.id}
                          </option>
                        ))}
                      </AdminSelect>
                    ) : (
                      <AdminInput
                        inputMode="numeric"
                        disabled={readOnly}
                        value={staffId}
                        onChange={(e) => setStaffId(e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="e.g. 100000123"
                      />
                    )}
                  </AdminField>
                </>
              )}
              <AdminField label="Initials" hint="Shown on the schedule and session grid.">
                <AdminInput
                  value={initials}
                  maxLength={4}
                  disabled={readOnly}
                  onChange={(e) => setInitials(e.target.value)}
                />
              </AdminField>
              <AdminField label="Calendar" hint="Whether they appear on the studio schedule.">
                <AdminSelect
                  value={onCalendar ? "yes" : "no"}
                  disabled={readOnly}
                  onChange={(e) => setOnCalendar(e.target.value === "yes")}
                >
                  <option value="yes">Shown on the schedule</option>
                  <option value="no">Hidden from the schedule</option>
                </AdminSelect>
              </AdminField>
              {grantShown && (
                <AdminField
                  label="Can manage My Studio"
                  hint={`Opens Team at ${grantStudioName}, and lets them change its studio settings and machines, without changing their role — how a studio grows its next leader.`}
                >
                  <AdminSelect
                    value={managesHere ? "yes" : "no"}
                    onChange={(e) => setManagesHere(e.target.value === "yes")}
                  >
                    <option value="no">No — a trainer here</option>
                    <option value="yes">Yes — helps run {grantStudioName}</option>
                  </AdminSelect>
                </AdminField>
              )}
            </AdminGrid>
          </div>
        )}

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {row.state === "awaiting-approval" && !studioAccess && !lockedReason && (
            <AdminButton
              variant="hero"
              busy={busy}
              disabled={!homeStudioId}
              onClick={() => setConfirmApprove(true)}
            >
              <UserCheck className="w-3.5 h-3.5" />
              {linking ? `Link to ${chosen?.name}` : "Approve and create the account"}
            </AdminButton>
          )}

          {row.trainer && !readOnly && (
            <AdminButton variant="primary" busy={busy} onClick={() => void saveAccess()}>
              Save access
            </AdminButton>
          )}

          {row.trainer && !readOnly && row.mindbody && row.matchedBy !== "staffId" && (
            <AdminButton variant="quiet" busy={busy} onClick={() => void linkToMindbody()}>
              <Link2 className="w-3.5 h-3.5" />
              Confirm the Mindbody link
            </AdminButton>
          )}
        </div>

        {row.trainer && !readOnly && row.mindbody && row.matchedBy !== "staffId" && (
          <p className="adm-hint" style={{ marginTop: 8 }}>
            Matched on {row.matchedBy === "email" ? "email address" : "name"} rather than a stored
            staff id. Confirming writes the id, which is what makes the match survive a rename.
          </p>
        )}
      </AdminPanel>

      <ConfirmDialog
        open={confirmApprove}
        title={linking ? `Is this ${chosen?.name}?` : `Give ${row.name} an account?`}
        body={
          linking
            ? `${row.request?.email} will sign in as ${chosen?.name}, with their role, studios and Mindbody link.${chosen?.kind === "record" && chosen.signsInAs ? ` Their sign-in as ${chosen.signsInAs} is switched off.` : ""} The old record is kept as a pointer.`
            : `They will sign in as ${ROLE_LABELS[role]} at ${studios.find((s) => s.id === homeStudioId)?.name ?? "the selected studio"}${chosen?.kind === "mindbody" ? `, linked to ${chosen.name} in Mindbody` : ""}. Roles can be changed afterwards.`
        }
        confirmLabel={linking ? "Link" : "Approve"}
        busy={busy}
        onCancel={() => setConfirmApprove(false)}
        onConfirm={() => void approve()}
      />

      <ConfirmDialog
        open={pendingMove !== null}
        title="Move this address?"
        body={`${normalEmail(email)} is on ${(pendingMove ?? [])
          .slice(1)
          .map((w) => w.name)
          .join(" and ")}'s record. Saving moves it to ${row.name} and clears it there: only one person signs in with an address.`}
        confirmLabel="Move it"
        busy={busy}
        onCancel={() => setPendingMove(null)}
        onConfirm={() => void saveAccess(true)}
      />
    </>
  );
}

/** What "Signs in as" means for this record (features/sign-in-email). */
function signInHint(t: Trainer | undefined): string {
  if (!t || !neverSignedIn(t)) return "The address on their account. They've signed in, so changing it doesn't move them.";
  if (t.pendingClaim && t.email) return "Waiting for their first sign-in with this address.";
  return "Their first Microsoft sign-in with this address opens this account. Check it with them: it isn't always their first name.";
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}
