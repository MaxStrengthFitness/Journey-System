/**
 * OPERATIONS SCOPE — which studios a reader may LOOK AT from Operations.
 *
 * Round: Operations (Round B of the Operations audit), Sep 2026. The audit's
 * finding was "every studio to everyone": the Studios tab listed the whole
 * company to every leader, Insights offered studios the reader could not
 * read, and the Franchise dashboard existed because nothing else knew what
 * "my studios" meant. This is the one answer, for every tab:
 *
 *   company tier (administrators, founders)   every studio
 *   owner tier (franchise owners)              the studios an administrator
 *                                              marked them as owning
 *                                              (ownedStudioIds), and their
 *                                              home (leadsStudio)
 *   the studio tier                            the studios they run: a leader
 *                                              role at the home or an owned
 *                                              studio, or the grant
 *                                              (leadsStudio, which mirrors
 *                                              the rules)
 *
 * The franchise partition (Oct 2026; ROADMAP Gate B): a franchise owner is
 * a studio's leader, bounded by `ownedStudioIds`, and one answer decides
 * both tiers. A studio's `ownerId` (the administrator who created it) and a
 * network's owners grant nothing: the rules count neither.
 *
 * The rules are the real fence (`sessions` and `clients` are studio-scoped
 * by rule, so an unreadable studio's query is refused whole); this decides
 * what is OFFERED so nothing is offered that the rules refuse.
 *
 * "This studio" on Operations is the studio the APP is in — the same
 * streams (the roster, the schedule, today's sessions) every tab already
 * reads — so choosing a single studio here switches the app to it, exactly
 * as the studio picker in the header does. "All my studios" is the other
 * scope: tabs that can add studios up do; tabs that read one studio at a
 * time say so and offer the list. See scope-context.tsx.
 *
 * DEMO MODE (Sep 20 2026) is scoped by a rule of its own, applied last:
 * from inside Demo Mode this list is Demo Mode and nothing else, and from
 * anywhere else Demo Mode is not in it at all — for administrators too, whose
 * "every studio" would otherwise fold practice numbers into the company's.
 * One studio in the list also means `canSpan` is false, so "All my studios"
 * does not appear inside Demo Mode. That is the whole of the demo boundary in
 * Operations: no check in any of the nine tabs.
 */
import type { Studio, Trainer } from "../../types";
import { isEveryStudioRole, leadsStudio } from "../renewals/permissions";
import { hasRunOfDemo, studiosInRealm } from "../demo-mode/access";

/** Studios the reader may open in Operations, by name. */
export function operationsStudios(
  trainer: Trainer | null | undefined,
  studios: Studio[],
  isAdmin = false,
  /** The studio the app is standing in — see the demo rule in the header. */
  activeStudioId: string | null | undefined = null,
): Studio[] {
  if (!trainer) return [];
  const all = isAdmin || isEveryStudioRole(trainer);
  const visible = studios.filter((s) => {
    if (!s.id) return false;
    /* Everyone runs Demo Mode, whatever their role -- but the realm filter
       below still decides whether they can see it from where they are. */
    if (hasRunOfDemo(trainer, s.id)) return true;
    if (all) return true;
    return leadsStudio(trainer, s.id);
  });
  /* Last, and over the top of everything above: you are in one realm at a
     time. Inside Demo Mode, `all` does not reach back out. */
  return studiosInRealm(visible, activeStudioId).sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? ""),
  );
}

/**
 * What the Operations scope bar offers: the studio the app is in, or every
 * studio the reader may look at. "all" only exists when there is more than
 * one to look at.
 */
export type OperationsScope = { kind: "studio"; studioId: string } | { kind: "all" };

/** The scope's studios, in reading order. */
export function studiosInScope(scope: OperationsScope, readable: Studio[], active: Studio | null): Studio[] {
  if (scope.kind === "all") return readable;
  if (active && active.id === scope.studioId) return [active];
  return readable.filter((s) => s.id === scope.studioId);
}
