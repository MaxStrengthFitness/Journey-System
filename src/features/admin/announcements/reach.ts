/**
 * WHO OPERATIONS → SETUP → ANNOUNCEMENTS LETS THIS PERSON ADDRESS.
 *
 * A studio's leader addresses the studios they run; an owner adds their
 * network; administrators everyone. That was three lines in the shell until
 * Oct 1 2026, when an administrator inside Demo Mode found the composer
 * starting on "Everyone" and offering every real studio: a practice notice
 * one tap from every trainer's bell.
 *
 * THE REALM RULE (`features/demo-mode/access.ts`): from inside Demo Mode you
 * see Demo Mode and nothing else; from anywhere else you do not see it at all.
 * So inside Demo Mode the only audience is Demo Mode itself — one studio,
 * fixed, no "Everyone", no network — and the list of live notices is only the
 * ones addressed to it. Outside, the demo studio is never offered.
 *
 * THE FRANCHISE PARTITION (Oct 2026): an owner's network notice reaches every
 * studio in the network, so an owner is offered only a network whose EVERY
 * studio they run (their home and the studios an administrator marked them
 * as owning; the grant does not count) -- the rules' networkNoticeOfMine.
 * With no such network the network choice is not offered at all.
 */

import { DEMO_STUDIO_ID } from "../../demo-mode/constants";
import { isDemoStudioId } from "../../demo-mode/is-demo";
import { hasRunOfDemo, studiosInRealm } from "../../demo-mode/access";
import { isEveryStudioRole, leadsStudio, ownStudioIds } from "../../renewals/permissions";
import { FRANCHISE_ROLES } from "../../../lib/staff-access";
import type { Trainer } from "../../../types";
import type { AnnouncementScope } from "./audience";

export interface AnnouncementReach<S, N> {
  studios: S[];
  scopes: AnnouncementScope[];
  /** The networks this person may address; empty hides the network option. */
  networks: N[];
  /** Set inside Demo Mode: the audience is this studio and the picker is not drawn. */
  fixedStudioId?: string;
}

export function announcementReach<
  S extends { id?: string; isDemo?: boolean },
  N extends { studioIds?: string[] | null },
>({
  isAdmin,
  isOwnerTier,
  trainer,
  allStudios,
  readable,
  allNetworks,
  activeStudioId,
}: {
  isAdmin: boolean;
  isOwnerTier: boolean;
  /** The person posting: an owner's networks are the ones whose every studio they run. */
  trainer: Pick<Trainer, "role" | "primaryHomeStudioId" | "ownedStudioIds"> | null | undefined;
  /** Every studio the app knows. */
  allStudios: S[];
  /** The studios this person's Operations spans. */
  readable: S[];
  /** Every network the app knows. */
  allNetworks: N[];
  /** The studio the app is standing in, which decides the realm. */
  activeStudioId: string | null | undefined;
}): AnnouncementReach<S, N> {
  if (isDemoStudioId(activeStudioId ?? null)) {
    return {
      studios: studiosInRealm(allStudios, activeStudioId),
      scopes: ["studio"],
      networks: [],
      fixedStudioId: DEMO_STUDIO_ID,
    };
  }
  if (isAdmin) {
    return {
      studios: studiosInRealm(allStudios, activeStudioId),
      scopes: ["universal", "network", "studio"],
      networks: allNetworks,
    };
  }
  const studios = studiosInRealm(readable, activeStudioId);
  if (!isOwnerTier) return { studios, scopes: ["studio"], networks: [] };
  const own = new Set(ownStudioIds(trainer));
  const networks = allNetworks.filter((n) => {
    const ids = n.studioIds ?? [];
    return ids.length > 0 && ids.every((id) => own.has(id));
  });
  return { studios, scopes: networks.length > 0 ? ["network", "studio"] : ["studio"], networks };
}

/**
 * Whether a notice is addressed to this one studio by name — what the live
 * list shows inside Demo Mode. A notice to everyone or to a network is a real
 * one and is not shown there.
 */
export function addressedTo(
  a: { targetScope?: string; targetStudioIds?: string[]; targetId?: string; studioId?: string },
  studioId: string,
): boolean {
  if (a.targetScope && a.targetScope !== "studio") return false;
  return (
    Boolean(a.targetStudioIds?.includes(studioId)) ||
    a.targetId === studioId ||
    a.studioId === studioId
  );
}

/**
 * WHETHER THIS PERSON MAY TAKE A LIVE NOTICE DOWN -- the rules'
 * hubAnnouncementUpdateAllowed, take-down branch, so Operations → Setup →
 * Announcements lists only the notices whose Take down the database will
 * accept (the franchise partition's attack round, Oct 2026: the list was
 * every live notice in the company, and a franchise owner's or a studio
 * leader's Take down on head office's notice to everyone, or to a studio
 * they don't run, ended in an error toast).
 *
 * Administrators (the company tier) may take any notice down. Everyone else:
 *   - a notice they wrote (the rules compare the Auth uid, so `uid` is
 *     auth.currentUser.uid, never the trainer document's id);
 *   - a notice to ONE studio they lead (studioNoticeOfMine: it reaches that
 *     studio and no other -- targetId and targetStudioIds both say so --
 *     and they run it, by role, ownership or the grant; anyone in Demo Mode);
 *   - for a franchise owner, a network's notice (networkNoticeOfMine) whose
 *     every studio they run: the studios it reaches AND the network's own
 *     list. `networks` is what the screen knows; a network it doesn't know
 *     is "not theirs", so the button is withheld rather than offered and
 *     refused.
 */
export function mayTakeDown(
  // targetStudioIds is what audience.ts writes and the bell reads; it is not
  // on HubAnnouncement's type, so the notice is described here.
  a: {
    authorId?: string;
    studioId?: string;
    targetScope?: string;
    targetId?: string;
    targetStudioIds?: string[] | null;
  },
  viewer: {
    uid: string | null | undefined;
    trainer: Parameters<typeof leadsStudio>[0];
  },
  networks: readonly { id: string; studioIds?: string[] | null }[],
): boolean {
  const t = viewer.trainer;
  if (!t) return false;
  if (isEveryStudioRole(t)) return true;
  if (viewer.uid && a.authorId === viewer.uid) return true;

  const studioId = a.studioId ?? "";
  if (a.targetScope === "studio" && studioId !== "" && studioId !== "all") {
    const reachesOnlyIt =
      (a.targetId ?? studioId) === studioId &&
      (a.targetStudioIds ?? [studioId]).every((id) => id === studioId);
    return reachesOnlyIt && (leadsStudio(t, studioId) || hasRunOfDemo(t, studioId));
  }

  if (a.targetScope === "network" && studioId === "" && FRANCHISE_ROLES.has(t.role)) {
    const own = new Set(ownStudioIds(t));
    const reaches = a.targetStudioIds ?? [];
    const net = a.targetId ? networks.find((n) => n.id === a.targetId) : undefined;
    const netIds = net?.studioIds ?? [];
    return (
      reaches.length > 0 &&
      reaches.every((id) => own.has(id)) &&
      netIds.length > 0 &&
      netIds.every((id) => own.has(id))
    );
  }
  return false;
}
