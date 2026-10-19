import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DesignProps } from "../design-props";
import type { LearningViewId } from "../../learning/LearningView";
import { routeForRef, sameRoute } from "../../learning-vault/routes";
import { useVaultNav } from "../../learning-vault/useVaultNav";
import { useVaultData } from "../../learning-vault/useVaultData";
import { ConceptLayer } from "../../learning-vault/ui/ConceptLayer";
import type { MapState } from "../../learning-vault/map/map-model";
import { usePeekStack } from "../../learning-vault/ui/PeekSheet";
import { useOptionalVault } from "../../learning-vault/ui/VaultProvider";
import type { VaultRoute } from "../../learning-vault/types";
import type { WikiCrumb } from "../../wiki";
import { usePhone } from "../../phone/device";
import { CodexContext, crumbLabel, type CodexValue } from "./codex-context";
import { resolveOpen, rootForSection } from "./codex-model";
import { CodexScreen } from "./CodexScreen";
import "./codex.css";

/**
 * THE TACTICAL CODEX — Design 1 of the Learning vault redesign (Oct 19 2026).
 *
 * Every entry is a codex page in layers: the first is what a trainer needs
 * standing at the machine, each deeper one is a tap. The home page is paths
 * for each role, the studio's floor as entries, the method as chapters, and
 * the quiz. Read README.md beside this file for the idea and the screens.
 *
 * WHERE A TRAIL STARTS
 * --------------------
 * Each masthead section (Overview, Catalog, Academy) is its own trail, as it
 * is in today's Learning. A visit is one trail: it starts on the section's
 * root, and a jump from outside (search, the bell, a link) starts a fresh
 * one on that page. Both were asked about before they arrived (AppContent's
 * guarded screen, LearningView's `through`), so a new visit is a remount
 * with nothing to ask: the old trail, its open forms and its peek go with
 * it. Inside a visit every move goes through useVaultNav, which asks first.
 *
 * The Learning title on the Overview, or the section already on, is a new
 * visit too (`resetSignal`; LearningView asked first): the section's front
 * page, wherever the trail had got to.
 *
 * The vault's data is read once, here, above the visits, so a new trail
 * never reloads the Academy.
 */
export default function CodexLearning({
  section,
  onSection,
  machines,
  studioId,
  studioName,
  jump,
  onJumpHandled,
  resetSignal = 0,
}: DesignProps) {
  const data = useVaultData({ studioId, machines });
  const vault = useOptionalVault();
  const name = vault?.studio.name || studioName || "This studio";

  const [visit, setVisit] = useState<{ n: number; section: LearningViewId; start: VaultRoute | null }>(() => ({
    n: 0,
    section,
    start: null,
  }));

  // Each new visit is set in a LAYOUT effect, so the commit that changed the
  // section or brought the jump is redrawn before the browser paints it: the
  // old section's page never shows under the new section's tab, and a jump
  // never flashes the section's front page first (the Vault and the Course
  // do the same).

  // A new section: a new trail on its root.
  useLayoutEffect(() => {
    setVisit((v) => (v.section === section ? v : { n: v.n + 1, section, start: null }));
  }, [section]);

  // Back to the section's front page: a fresh trail on its root.
  const seenReset = useRef(resetSignal);
  useLayoutEffect(() => {
    if (resetSignal === seenReset.current) return;
    seenReset.current = resetSignal;
    setVisit((v) => ({ n: v.n + 1, section, start: null }));
  }, [resetSignal, section]);

  // A page asked for from outside: a fresh trail, root then that page.
  useLayoutEffect(() => {
    if (!jump) return;
    const start = routeForRef(jump);
    setVisit((v) => ({ n: v.n + 1, section, start }));
    onJumpHandled();
  }, [jump, section, onJumpHandled]);

  return (
    <CodexVisit
      key={visit.n}
      root={rootForSection(visit.section)}
      start={visit.start}
      data={data}
      studioName={name}
      onSection={onSection}
    />
  );
}

function CodexVisit({
  root,
  start,
  data,
  studioName,
  onSection,
}: {
  root: VaultRoute;
  start: VaultRoute | null;
  data: CodexValue["data"];
  studioName: string;
  onSection: (id: LearningViewId) => void;
}) {
  const nav = useVaultNav(root);
  const peekStack = usePeekStack();
  const phone = usePhone();

  // The page a jump asked for goes on top of the root once, on arrival, in a
  // layout effect (before the root is ever painted) and with set, which does
  // not ask again: the jump was asked about before it arrived.
  const started = useRef(false);
  useLayoutEffect(() => {
    if (started.current || !start) return;
    started.current = true;
    if (!sameRoute(root, start)) nav.set([root, start]);
    // Only on arrival: later moves are the reader's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The tier each page was last read at, for this visit only (never stored).
  const tiers = useRef(new Map<string, string>());
  const tierFor = useCallback((key: string) => tiers.current.get(key) ?? null, []);
  const rememberTier = useCallback((key: string, tier: string) => {
    tiers.current.set(key, tier);
  }, []);
  // The lens each index was last read through (Floor / Map, Chapters / Map,
  // Read / Drill these) and the map's own state: this visit only, never stored.
  const lenses = useRef(new Map<string, string>());
  const lensFor = useCallback((key: string) => lenses.current.get(key) ?? null, []);
  const rememberLens = useCallback((key: string, lens: string) => {
    lenses.current.set(key, lens);
  }, []);
  const maps = useRef(new Map<string, MapState>());
  const mapFor = useCallback((key: string) => maps.current.get(key) ?? null, []);
  const rememberMap = useCallback((key: string, state: MapState) => {
    maps.current.set(key, state);
  }, []);

  const { stack, push } = nav;
  const open = useCallback((r: VaultRoute) => push(resolveOpen(stack, r)), [push, stack]);
  const peek = peekStack.push;

  const crumbs = useMemo<WikiCrumb[]>(
    () =>
      stack.map((r, i) => {
        const label = crumbLabel(r, data, i > 0 ? stack[i - 1] : null);
        return i < stack.length - 1 ? { label, onClick: () => push(stack[i]) } : { label };
      }),
    [stack, data, push],
  );

  const value = useMemo<CodexValue>(
    () => ({
      data,
      nav,
      open,
      peek,
      peekStack,
      crumbs,
      studioName,
      onSection,
      tierFor,
      rememberTier,
      lensFor,
      rememberLens,
      mapFor,
      rememberMap,
      phone,
    }),
    [data, nav, open, peek, peekStack, crumbs, studioName, onSection, tierFor, rememberTier, lensFor, rememberLens, mapFor, rememberMap, phone],
  );

  return (
    <CodexContext.Provider value={value}>
      <ConceptLayer index={data.entities} onOpen={open} onPeek={peek}>
        <CodexScreen route={nav.route} />
      </ConceptLayer>
    </CodexContext.Provider>
  );
}
