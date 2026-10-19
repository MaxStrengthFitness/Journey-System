/**
 * A PAGE'S ACCENT — the colour a spoken line and a cue's rule take (review
 * fix, Oct 19 2026).
 *
 * Blue in Learning means one thing: act, select, Save. A chosen line is
 * outlined in it. So a spoken line ("Have a seat…") can no longer borrow the
 * blue as its band: it takes its PAGE's accent, the machine's category as the
 * Catalog colours it (green for the Leg Press, the pull blue for the
 * Pulldown), and a page that belongs to no machine reads in the neutral grey
 * ("other"), which is article.css's fallback.
 *
 * PURE MODULE — no React.
 */

import type { CSSProperties } from "react";
import { MACHINE_CATEGORY } from "../../routine-builder/academy";
import { accentForAcademyCategory, accentStyle } from "../../wiki/categories";
import type { VaultRoute, VaultTarget } from "../types";

/** The category accent of one machine (a studio's own, with no category, is the grey "other"). */
export function machineAccentStyle(machineId: string): CSSProperties {
  return accentStyle(accentForAcademyCategory(MACHINE_CATEGORY[machineId] ?? null)) as CSSProperties;
}

/** The machine a page belongs to: a machine page's own id, or the machine node a card, script or deep dive hangs on. */
export function machineOfPage(page: { route?: VaultRoute; nodeId?: string; target?: VaultTarget }): string | null {
  if (page.route?.kind === "machine") return page.route.id;
  if (page.target?.ref.kind === "machine") return page.target.ref.id;
  const node = page.nodeId ?? "";
  return node.startsWith("machine:") ? node.slice("machine:".length) || null : null;
}

/**
 * A page's accent for ArticleBlocks' `accent` prop: its machine's category,
 * or undefined (ArticleBlocks then inherits an accent an ancestor set, else
 * the neutral grey). `pageAccent(page)` with a VaultPage from pageFor.
 */
export function pageAccent(page: { route?: VaultRoute; nodeId?: string; target?: VaultTarget }): CSSProperties | undefined {
  const id = machineOfPage(page);
  return id ? machineAccentStyle(id) : undefined;
}
