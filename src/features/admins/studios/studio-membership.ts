/**
 * WHICH STUDIOS A PERSON WORKS AT — giving someone a second studio, and
 * taking them off a studio's team, from the Admins dashboard.
 * PURE: no React, no Firestore (StudiosDialog.tsx writes).
 *
 * The gap (Oct 1 2026, the scale re-read): a trainer can work at more than
 * their home studio — `accessibleStudioIds` ("also works at", a floater) and
 * `activeGuestStudioIds` (a guest) on trainers/{id}, which
 * src/lib/who-works-here.ts and the rules' trainerWorksAt both read — but no
 * screen could set either list once the account existed, and nothing took a
 * person off a studio's team. docs/rounds/2026-10-01-second-studio.md.
 *
 * The one picture this file keeps: the studios a person works at besides
 * home, each either "also works here" or "a guest here". From that:
 *
 *   ADD a studio      it goes into `accessibleStudioIds` ("also works at").
 *   REMOVE a studio   it comes out of `accessibleStudioIds`, out of
 *                     `activeGuestStudioIds`, and out of `managedStudioIds`
 *                     (the grant: helping run a studio you no longer work at
 *                     would leave the door open behind you). That is "Take off
 *                     this studio's team", and the same thing as removing it
 *                     from the list.
 *
 * Never touched by Add or Remove: the home studio (`primaryHomeStudioId`, and
 * its own entry in `accessibleStudioIds`, which approval writes there), the
 * role, the trainer record itself and everything they did — sessions, notes,
 * weeks stay where they are. `ownedStudioIds` is changed only by the Owns
 * control below, never by Add or Remove: an owner taken off a studio's team
 * still owns it. The home studio can't be taken away here: a person always
 * has one. They are given another first, on Operations → Setup → People &
 * access, and then the old one can be taken off.
 *
 * OWNS THIS STUDIO (the franchise partition, Oct 2026; ROADMAP Gate B). The
 * one place a studio becomes a franchise owner's: an administrator marks it
 * here, on `ownedStudioIds`, and the owner then runs it as its leaders do
 * (the rules' trainerLeads). Only a role that runs its own studios may own
 * one; never the home studio (they run it already, and an entry for it would
 * outlive a later change of home); never Demo Mode. Adding it also puts the
 * studio on "Also works at" when it isn't there, because the cross-train
 * rules count where a person works, not what they own (second review).
 * Removing it leaves "Also works at" as it is. A role change that no longer
 * runs studios takes every owned studio off (ownershipOnRoleChange).
 *
 * Demo Mode is never offered (the realm rule, features/demo-mode/access.ts).
 */
import { isDemoStudioId } from "../../demo-mode/is-demo";
import { LEADS_OWN_STUDIO_ROLES } from "../../../lib/staff-access";
import type { ActivityInput } from "../activity/activity";

/** The trainer document as this file reads it. */
export interface MemberLike {
  id?: string;
  fullName?: string | null;
  role?: string | null;
  primaryHomeStudioId?: string | null;
  accessibleStudioIds?: readonly string[] | null;
  activeGuestStudioIds?: readonly string[] | null;
  managedStudioIds?: readonly string[] | null;
  ownedStudioIds?: readonly string[] | null;
}

export interface StudioLike {
  id?: string;
  name?: string | null;
  isDemo?: boolean;
}

export type MembershipKind = "also" | "guest";

export interface Membership {
  studioId: string;
  kind: MembershipKind;
}

const clean = (list: readonly string[] | null | undefined): string[] => [...new Set((list ?? []).filter((s) => typeof s === "string" && s.trim()))];

/** The studios they work at besides home, "also works here" before "a guest here" when both. In the stored order. */
export function memberships(t: MemberLike): Membership[] {
  const home = t.primaryHomeStudioId ?? "";
  const out: Membership[] = [];
  const seen = new Set<string>([home]);
  for (const id of clean(t.accessibleStudioIds)) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ studioId: id, kind: "also" });
  }
  for (const id of clean(t.activeGuestStudioIds)) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ studioId: id, kind: "guest" });
  }
  return out;
}

function isDemo(s: StudioLike): boolean {
  return s.isDemo === true || isDemoStudioId(s.id);
}

/** The studios the picker may offer: every real studio, less home and those already on the list, by name. */
export function addableStudios<S extends StudioLike>(t: MemberLike, studios: readonly S[], current: readonly string[]): S[] {
  const taken = new Set<string>([t.primaryHomeStudioId ?? "", ...current]);
  return studios
    .filter((s) => s.id && !taken.has(s.id) && !isDemo(s))
    .slice()
    .sort((a, b) => (a.name || a.id || "").localeCompare(b.name || b.id || ""));
}

/** Why a studio can't be taken off: it is their home. Null when it can. */
export function whyNotRemovable(t: MemberLike, studioId: string): "home" | null {
  return studioId && studioId === t.primaryHomeStudioId ? "home" : null;
}

export type ListField = "accessibleStudioIds" | "activeGuestStudioIds" | "managedStudioIds" | "ownedStudioIds";

/** One list that changes: what goes in, what comes out, and the whole list after. */
export interface FieldChange {
  field: ListField;
  add: string[];
  remove: string[];
  next: string[];
}

export interface MembershipPlan {
  added: string[];
  removed: string[];
  /** Only the lists that change — nothing else is written (the admin README: only the diff). */
  changes: FieldChange[];
}

/**
 * What saving would write: `next` is the studios besides home the person
 * should work at. The home studio is never added or removed here, even if a
 * caller passes it. A list that comes out the same is not in `changes`.
 */
export function membershipPlan(t: MemberLike, next: readonly string[]): MembershipPlan {
  const home = t.primaryHomeStudioId ?? "";
  const before = memberships(t).map((m) => m.studioId);
  const wanted = clean(next).filter((id) => id !== home);
  const added = wanted.filter((id) => !before.includes(id));
  const removed = before.filter((id) => !wanted.includes(id));

  const changes: FieldChange[] = [];
  const change = (field: ListField, current: string[], add: string[], remove: string[]) => {
    const realAdd = add.filter((id) => !current.includes(id));
    const realRemove = remove.filter((id) => current.includes(id));
    if (realAdd.length === 0 && realRemove.length === 0) return;
    const after = [...current.filter((id) => !realRemove.includes(id)), ...realAdd];
    changes.push({ field, add: realAdd, remove: realRemove, next: after });
  };
  change("accessibleStudioIds", clean(t.accessibleStudioIds), added, removed);
  change("activeGuestStudioIds", clean(t.activeGuestStudioIds), [], removed);
  change("managedStudioIds", clean(t.managedStudioIds), [], removed);
  return { added, removed, changes };
}

/** Take one studio off: the plan, or null when it is their home (or not on their list). */
export function takeOffPlan(t: MemberLike, studioId: string): MembershipPlan | null {
  if (whyNotRemovable(t, studioId)) return null;
  const current = memberships(t).map((m) => m.studioId);
  if (!current.includes(studioId)) return null;
  return membershipPlan(
    t,
    current.filter((id) => id !== studioId),
  );
}

const nameOf = (studios: readonly StudioLike[], id: string) => studios.find((s) => s.id === id)?.name || id;

/** "Solon, Westlake", the list a person reads in the record; "home studio only" when empty. */
function listWords(t: MemberLike, ids: readonly string[], studios: readonly StudioLike[]): string {
  return ids.length ? ids.map((id) => nameOf(studios, id)).join(", ") : "home studio only";
}

/**
 * The Activity entries for a save: one per studio added or taken off, at
 * THAT studio, so its own leaders read it in their Activity. An
 * `assisted-change` every time — it is a person's place at a studio, not an
 * admin grant.
 */
export function membershipRecords(input: {
  person: MemberLike;
  plan: MembershipPlan;
  studios: readonly StudioLike[];
  byName: string;
}): ActivityInput[] {
  const { person, plan, studios, byName } = input;
  const who = (person.fullName ?? "").trim() || "someone";
  const before = memberships(person).map((m) => m.studioId);
  const after = [...before.filter((id) => !plan.removed.includes(id)), ...plan.added];
  const values = {
    before: { "Also works at": listWords(person, before, studios) },
    after: { "Also works at": listWords(person, after, studios) },
  };
  return [
    ...plan.added.map((id) => ({
      kind: "assisted-change" as const,
      what: `Added ${who} to ${nameOf(studios, id)}'s team: also works there.`,
      studioId: id,
      ...values,
      byName,
    })),
    ...plan.removed.map((id) => ({
      kind: "assisted-change" as const,
      what: `Took ${who} off ${nameOf(studios, id)}'s team.`,
      studioId: id,
      ...values,
      byName,
    })),
  ];
}

/** What will happen, in sentences, before it is saved (the confirmation rules: say what happens). */
export function membershipConsequences(input: { person: MemberLike; plan: MembershipPlan; studios: readonly StudioLike[] }): string[] {
  const { person, plan, studios } = input;
  const who = (person.fullName ?? "").trim() || "They";
  const out: string[] = [];
  if (plan.added.length) {
    out.push(`${who} joins the team at ${plan.added.map((id) => nameOf(studios, id)).join(" and ")}: they can choose it on the studio picker and are listed on its Team.`);
  }
  if (plan.removed.length) {
    const names = plan.removed.map((id) => nameOf(studios, id)).join(" and ");
    const grant = plan.changes.find((c) => c.field === "managedStudioIds");
    out.push(
      `${who} comes off the team at ${names}${grant ? ", and no longer helps run it" : ""}. Nothing they did there is deleted: their sessions, notes and history stay.`,
    );
  }
  if (out.length) {
    out.push("It reaches their iPad the next time they sign in or Journey reloads.");
    out.push("It's recorded in each studio's Activity, with your name.");
  }
  return out;
}

/** Said in place of the button when this studio is their home. */
export function homeStudioLine(person: MemberLike, studios: readonly StudioLike[]): string {
  const who = (person.fullName ?? "").trim() || "This person";
  const home = person.primaryHomeStudioId ? nameOf(studios, person.primaryHomeStudioId) : "this studio";
  return `${home} is ${who}'s home studio, so it can't be taken away here: everyone has one. Give them another home studio first on Operations → Setup → People & access, then take ${home} off here.`;
}

/* ------------------------------------------------------------------ *
 * OWNS THIS STUDIO (the franchise partition, Oct 2026) — see the header.
 * ------------------------------------------------------------------ */

/** A role that may own studios: one that runs its own (the studio tier and the franchise owner). */
export function mayOwnStudios(role: string | null | undefined): boolean {
  return Boolean(role && LEADS_OWN_STUDIO_ROLES.has(role));
}

/** Whether this person owns this studio now. */
export function ownsStudio(t: MemberLike, studioId: string): boolean {
  return Boolean(studioId) && clean(t.ownedStudioIds).includes(studioId);
}

export interface OwnershipChange {
  /** `ownedStudioIds`, one studio in or out. */
  owned: FieldChange;
  /** `accessibleStudioIds` gaining the studio too, when owning it adds it to where they work; else null. */
  alsoWorksAt: FieldChange | null;
}

/**
 * What switching "Owns {studio}" to `owns` would write, or null when nothing
 * changes or it can't be done: the demo studio; adding for a role that may
 * not own studios; adding their own home studio (they run it already).
 * Removing is always allowed, the home included, so a stale entry can be
 * cleared.
 */
export function ownershipChange(t: MemberLike, studioId: string, owns: boolean): OwnershipChange | null {
  if (!studioId || isDemoStudioId(studioId)) return null;
  const current = clean(t.ownedStudioIds);
  const has = current.includes(studioId);
  if (owns === has) return null;
  if (!owns) {
    return { owned: { field: "ownedStudioIds", add: [], remove: [studioId], next: current.filter((id) => id !== studioId) }, alsoWorksAt: null };
  }
  if (!mayOwnStudios(t.role) || studioId === (t.primaryHomeStudioId ?? "")) return null;
  const also = clean(t.accessibleStudioIds);
  return {
    owned: { field: "ownedStudioIds", add: [studioId], remove: [], next: [...current, studioId] },
    alsoWorksAt: also.includes(studioId)
      ? null
      : { field: "accessibleStudioIds", add: [studioId], remove: [], next: [...also, studioId] },
  };
}

/** The Activity entry for Owns: an admin grant, at that studio, so its own leaders read it. */
export function ownershipRecord(input: {
  person: MemberLike;
  studioId: string;
  owns: boolean;
  studios: readonly StudioLike[];
  byName: string;
}): ActivityInput {
  const { person, studioId, owns, studios, byName } = input;
  const who = (person.fullName ?? "").trim() || "someone";
  const studio = nameOf(studios, studioId);
  return {
    kind: "admin-grant",
    what: owns ? `Made ${who} an owner of ${studio}: they run it as its leaders do.` : `${who} no longer owns ${studio}.`,
    studioId,
    before: { Owns: owns ? "no" : "yes" },
    after: { Owns: owns ? "yes" : "no" },
    byName,
  };
}

/** What switching Owns will do, in sentences, before it is saved. */
export function ownershipConsequences(input: {
  person: MemberLike;
  studioId: string;
  change: OwnershipChange;
  studios: readonly StudioLike[];
  /** "Also works at" as the dialog will save it. */
  alsoWorksAtAfter: readonly string[];
}): string[] {
  const { person, studioId, change, studios, alsoWorksAtAfter } = input;
  const who = (person.fullName ?? "").trim() || "They";
  const studio = nameOf(studios, studioId);
  if (change.owned.add.length) {
    const out = [
      `${who} will run ${studio}: Operations, My Studio's leader sections, its clients and its records, as its leaders do. It reaches their iPad the next time they sign in or Journey reloads.`,
    ];
    if (change.alsoWorksAt) out.push(`${studio} is added to where they work, so they can see its cross-train visitors.`);
    return out;
  }
  const out = [`${who} no longer runs ${studio}. Nothing they did there is deleted.`];
  if (alsoWorksAtAfter.includes(studioId)) {
    out.push(`They still work at ${studio} (Also works at, above): switch that off too if they no longer do.`);
  }
  return out;
}

/** Said in place of the Owns switch when it isn't offered. */
export function ownershipLine(person: MemberLike, studio: StudioLike): string {
  if (studio.id && studio.id === person.primaryHomeStudioId && mayOwnStudios(person.role)) {
    return "Their home studio: they run it already.";
  }
  return "Owning a studio counts for a Franchise Owner or a studio leader role. Change their role first (Change role, beside this).";
}

/**
 * What Change role takes off when the new role doesn't run studios: every
 * owned studio, in the same write (the franchise partition, Oct 2026,
 * review fix: a leftover `ownedStudioIds` would come back to life on a later
 * promotion). A promotion, or a change between two roles that run studios,
 * clears nothing.
 */
export function ownershipOnRoleChange(person: MemberLike, newRole: string | null | undefined): { clears: string[] } {
  if (mayOwnStudios(newRole)) return { clears: [] };
  return { clears: clean(person.ownedStudioIds) };
}
