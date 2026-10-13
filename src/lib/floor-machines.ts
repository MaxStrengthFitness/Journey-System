/**
 * THE STUDIO'S FLOOR, IN THE SHAPE THE FLOOR SCREENS ALREADY SPEAK.
 *
 * Claude Experiment, phase B — Sep 20 2026.
 *
 * ── The problem this exists to solve ─────────────────────────────────────
 *
 * Journey has a good three-layer machine model: the corporate catalog
 * (`machines/{id}`), the studio's own unit (`studios/{s}/roster/{machineId}`)
 * and the client's settings for it. `resolveMachine()` merges the first two,
 * `machine-template.ts` says what a studio may change, and there is a
 * full-screen editor for all of it.
 *
 * The Active Session used none of it. `WorkoutTrackerView` read the app-wide
 * legacy `machines` list and called `useStudioMachines` for exactly one
 * thing — `order`. So a studio's own dial labels, its custom machines, its
 * renamed units and every catalog correction reached the Learning → Catalog
 * page and NOTHING a trainer held during a session. The roster manager even
 * told the leader "Trainers running a session here see exactly this list",
 * which was not true.
 *
 * ── Why this is a merge and not a replacement ────────────────────────────
 *
 * Twenty-odd call sites across the tracker, the briefing, the machine sheet
 * and the routine picker read legacy `Machine` fields — `trainerTips`,
 * `anatomicalRegion`, `requiresHandoff`, `standardWeights`, `imageUrl` and
 * the rest. Swapping the list for `ResolvedMachine[]` would have emptied all
 * of them at once.
 *
 * So: start from the legacy document (everything keeps working), overlay the
 * studio's resolved truth (name, order, dials, defaults), and append the
 * machines the studio has that the global list has never heard of. The
 * result is a `Machine[]` every existing consumer understands, that finally
 * tells the truth about this studio's floor.
 *
 * When the roster is genuinely empty — westlake and Willoughby, as of Sep
 * 2026 — the caller passes `bridgeWhenRosterEmpty` to `useStudioMachines`
 * and the resolved list IS the catalog, so this function degrades to "the
 * legacy list, ordered", which is exactly today's behaviour.
 *
 * This is the first half of the §3.5 migration. The second half is deleting
 * the legacy list once every consumer reads a resolved field instead of a
 * legacy one; nothing here blocks that, and nothing here depends on it.
 */

import type { Machine, StudioMachineSetting } from "../types";
import type { ResolvedMachine } from "../types/machines";

/** Dial labels for a resolved machine, in the order the catalog declares them. */
export function dialLabelsOf(resolved: ResolvedMachine): string[] {
  return (resolved.settingFields || [])
    .map((f) => (f.label || f.key || "").trim())
    .filter(Boolean);
}

/**
 * STUDIO SETUP ON THE FLOOR (the studio machines round, Oct 13 2026).
 *
 * A machine's setting names are kept in two places: the machine's own dials
 * (`definition.settingFields`, the machine editor's The dials) and the
 * Studio setup card (`studioMachineSettings/{studio}_{machine}`, Learning →
 * Catalog and My Studio → Machines, which the Catalog's Preset line shows
 * first). Until this round the floor read only the first, so a studio-built
 * machine whose Seat was added on Studio setup (Strongsville's Hoist leg
 * press, AJ, Oct 13 2026) reached the client's machine card with no dials
 * at all: no catalog entry stood behind it, so nothing could be saved.
 *
 * The rule, kept small until the settings audit before the FileMaker import
 * (AJ: "ill have to audit all the machine settings before mass import ...
 * we will need to make a plan for that later"):
 *   - Names: a STUDIO-BUILT machine takes Studio setup's names first, in
 *     their order, then any of its own dials Studio setup didn't name (so a
 *     value already saved under one is never hidden). A standard machine
 *     keeps its own (the catalog's) names: mixing the two lists there would
 *     put "Seat" beside "Seat Position" on one card, which is the audit's
 *     to settle.
 *   - Standards: Studio setup's standard values, on every machine, over the
 *     machine's own defaults. They are only ever the hint on an empty dial
 *     (and what "Use studio standard for all" fills in), and they used to
 *     reach the card from a studio-document field nothing writes.
 * A setup not read yet (or a failed read) is no setup: the floor says what
 * it said before this round, never less.
 */
export type StudioSetupLike = Pick<StudioMachineSetting, "settingOptions" | "standardSettings">;
export type StudioSetupById = Readonly<Record<string, StudioSetupLike | undefined>>;

const nameKey = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * A studio-built machine's dial names: Studio setup's first, then its own not
 * named there. A name both hold keeps the machine's own spelling: a dial's
 * name is the key a client's value is saved under, and only the machine's
 * own names have ever been saved under.
 */
export function studioBuiltDialNames(own: readonly string[], setup: readonly string[] | undefined): string[] {
  const ownByKey = new Map<string, string>();
  for (const raw of own) {
    const name = typeof raw === "string" ? raw.trim() : "";
    const key = nameKey(name);
    if (key && !ownByKey.has(key)) ownByKey.set(key, name);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...(setup ?? []), ...own]) {
    const name = typeof raw === "string" ? raw.trim() : "";
    const key = nameKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(ownByKey.get(key) ?? name);
  }
  return out;
}

/** Studio setup's standard values over the machine's own defaults; empty values never count. */
export function withSetupStandards(
  defaults: Readonly<Record<string, string>> | undefined,
  setup: StudioSetupLike | undefined,
): Record<string, string> | undefined {
  const studio = Object.entries(setup?.standardSettings ?? {}).filter(
    ([k, v]) => k.trim() !== "" && v !== undefined && v !== null && String(v).trim() !== "",
  );
  if (studio.length === 0) return defaults ? { ...defaults } : undefined;
  const out: Record<string, string> = { ...(defaults ?? {}) };
  for (const [k, v] of studio) out[k] = String(v).trim();
  return out;
}

/**
 * The studio's floor in the legacy `Machine` shape.
 *
 * @param resolved   `useStudioMachines(studioId).machines` — already ordered.
 * @param legacyById the app-wide `machines` prop, keyed by id.
 * @param setupById  the studio's Studio setup cards (`useStudioMachineSettings`), keyed by machine.
 */
export function toFloorMachines(
  resolved: readonly ResolvedMachine[],
  legacyById: Readonly<Record<string, Machine>>,
  setupById?: StudioSetupById | null,
): Machine[] {
  return resolved.map((r) => {
    const legacy = legacyById[r.machineId];
    const setup = setupById?.[r.machineId];

    // The studio's dial labels win. A studio that has never touched its
    // roster inherits the catalog's, which is the same list the editor
    // shows — so this is "the catalog, finally", not a new source. A
    // studio-built machine also takes Studio setup's names (above).
    const dials = dialLabelsOf(r);
    const named = r.source === "custom" ? studioBuiltDialNames(dials, setup?.settingOptions) : dials;
    const settingOptions = named.length ? named : legacy?.settingOptions;

    // Same precedence for the dial defaults: the resolved machine already
    // carries the studio's override merged over the catalog's; Studio
    // setup's standards go over both.
    const defaults = withSetupStandards(
      r.defaultSettings && Object.keys(r.defaultSettings).length
        ? r.defaultSettings
        : legacy?.standardSettings,
      setup,
    );

    return {
      // Everything the legacy document knows, so no consumer loses a field.
      ...(legacy || {}),

      // What the studio owns, per the template boundary.
      id: r.machineId,
      name: r.name || legacy?.name || r.machineId,
      // Lineage: which catalog machine a studio's own machine is, so the
      // clinical matrix's watch-outs reach "our Hammer leg press" too.
      ...(r.comparisonKey ? { comparisonKey: r.comparisonKey } : {}),
      order: r.order,
      ...(settingOptions ? { settingOptions } : {}),
      ...(defaults ? { standardSettings: defaults } : {}),
      ...(r.imageUrl ? { imageUrl: r.imageUrl } : {}),
      ...(r.formVideoUrl ? { formVideoUrl: r.formVideoUrl } : {}),
    } as Machine;
  });
}

/**
 * The studio's floor for a screen that holds the app-wide `machines` list
 * and the studio's resolved roster (`useStudioMachines(studioId).machines`)
 * - the client profile, for the codex's Body & Pulse -> Watch-outs.
 *
 * The app-wide list is the `machines` collection plus the defaults: it has
 * no studio's own machines and no lineage (`comparisonKey` is set only
 * here), so a watch-out judged against it never reaches "our Hammer leg
 * press" and says "names no machine on this floor" against the whole
 * catalog rather than the floor. A studio whose roster is empty (not set up
 * yet) gets the app-wide list back - the same bridge the Active Session
 * uses - rather than a floor with nothing on it.
 */
export function studioFloorOf(
  resolved: readonly ResolvedMachine[],
  machines: readonly Machine[],
  setupById?: StudioSetupById | null,
): Machine[] {
  if (resolved.length === 0) {
    // No roster: the app-wide list, with the studio's standards (a standard
    // machine's names stay its own, as on a rostered floor).
    if (!setupById) return [...machines];
    return machines.map((m) => {
      const setup = m.id ? setupById[m.id] : undefined;
      const standards = setup ? withSetupStandards(m.standardSettings, setup) : undefined;
      return standards ? { ...m, standardSettings: standards } : m;
    });
  }
  const legacyById: Record<string, Machine> = {};
  for (const m of machines) if (m.id) legacyById[m.id] = m;
  return toFloorMachines(resolved, legacyById, setupById);
}

/**
 * The profile's Journey grid rows (Oct 2 2026, AJ: "This studio's floor, its
 * own machines included"): the studio's floor in its own order, the same list
 * the Active Session draws, and after it every machine she has history on
 * that the floor no longer has, so her sets on it are never hidden. A machine
 * off the floor is taken from the app-wide list; one that list has never
 * heard of keeps its id as its name rather than vanishing.
 */
export function floorWithHistoryMachines(
  floor: readonly Machine[],
  machines: readonly Machine[],
  historyMachineIds: Iterable<string>,
): Machine[] {
  const onFloor = new Set(floor.map((m) => m.id).filter(Boolean) as string[]);
  const legacyById = new Map<string, Machine>();
  for (const m of machines) if (m.id) legacyById.set(m.id, m);
  const extra: Machine[] = [];
  const seen = new Set<string>();
  for (const id of historyMachineIds) {
    if (!id || onFloor.has(id) || seen.has(id)) continue;
    seen.add(id);
    extra.push(legacyById.get(id) ?? ({ id, name: id, order: Number.MAX_SAFE_INTEGER } as Machine));
  }
  extra.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || "").localeCompare(b.name || ""));
  return [...floor, ...extra];
}

/**
 * True when this machine logs a Left and a Right set.
 *
 * It used to be `name.includes("torso rotation")` inline in the tracker,
 * which meant a studio that renamed its unit — exactly what the template
 * boundary invites — silently lost its per-side fields. The catalog carries
 * no `perSide` flag yet (a gap worth closing), so this still reads the name,
 * but it reads the CANONICAL id first and only falls back to the name.
 */
export function isPerSideMachine(m: {
  id?: string;
  name?: string;
  comparisonKey?: string;
}): boolean {
  const id = (m.comparisonKey || m.id || "").toLowerCase();
  if (id === "m-torso-rotation" || id === "torso_rotation") return true;
  return (m.name || "").toLowerCase().includes("torso rotation");
}
