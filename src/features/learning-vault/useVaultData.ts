/**
 * THE VAULT'S DATA — everything the three designs read, gathered once.
 *
 * Round: the Learning vault redesign, Oct 19 2026 (overnight prototypes).
 *
 * WHAT IT HOLDS, AND WHEN
 * -----------------------
 * The Academy is a generated corpus of JSON chunks (features/academy). The
 * small index travels with Learning; the rest arrives on demand. This hook
 * asks for the five small reference chunks (glossary, cues, cards, scripts,
 * deep dives, about 110 KB gzip together, the same set the Academy's own
 * index loads) once it is MOUNTED, never before, and a module's prose only
 * when a page asks for it (loadModule). The studio's floor comes from the
 * same read the Catalog uses (useCatalogMachines), in its walking order.
 *
 * Three things are BUILT from those, each with useMemo once its inputs have
 * all landed, so each is built once rather than three times as the chunks
 * trickle in: the entity index (the auto-linker and concept cards), the
 * knowledge graph (the constellation), and the quiz's question bank. They
 * are pure and take a few milliseconds.
 *
 * UNKNOWN IS NOT EMPTY
 * --------------------
 * The floor is null while it is loading or could not be read, and an empty
 * list only when the studio's roster was read and holds nothing (the Catalog's
 * four floor states, catalog/floor-index.ts). The MSF standard is never handed
 * over as if it were this studio's floor. A module chunk that failed says so
 * through moduleFailed; nothing retries by itself (a retry loop on a dead
 * connection would spin the iPad), and retryModule is the reader's own tap.
 * The same for the five reference chunks (review fix, Oct 19 2026): the
 * Academy's hooks never say a chunk failed, so this hook also asks for each
 * missing one through loadAcademyReference (the same import, fetched once)
 * and says `referenceFailed` when one cannot arrive, with `retryReference`
 * for the reader's tap. Every machine page, the glossary, the phrasebook,
 * the map and the quiz need them, so a design shows "didn't load / Try
 * again" rather than a spinner that never ends.
 *
 * THE FLOOR'S STATUS (judges' fix, Oct 19 2026)
 * ----------------------------------------------
 * `care` is what the Catalog says about a unit from the floor: Out of
 * service (the roster read above) and Flagged (Relay's care record, through
 * Relay's own useMachineCare: one listener, no new query or index). Null
 * while either is unknown or failed (floor-care.ts); ui/FloorStatus draws it.
 *
 * NAMES
 * -----
 * `names` is the Catalog's name for a machine (one name per machine across
 * Learning, AJ, Oct 2 2026): the live catalog's, else the standard's; a
 * studio's own machine is named by its floor.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildAcademyMachines,
  catalogNamesOf,
  machineName,
  type AcademyMachine,
} from "../academy/academy-machines";
import type {
  AcademyIndex,
  Block,
  CueMoment,
  MachineScript,
  ModuleContent,
  QuickCard,
} from "../academy/types";
import {
  ACADEMY_INDEX,
  cachedAcademyModule,
  loadAcademyModule,
  loadAcademyReference,
  useAcademyCards,
  useAcademyCues,
  useAcademyGlossary,
  useAcademyOverviews,
  useAcademyScripts,
  type AcademyReference,
  type AcademyReferenceName,
} from "../academy/useAcademyContent";
import type { FloorState } from "../catalog/floor-index";
import { movementOf } from "../catalog/names";
import { useCatalogMachines } from "../catalog/useCatalogMachines";
// Relay's care record, READ ONLY: the one listener the Catalog opens for flags.
import { useMachineCare } from "../relay/board/machine-care-store";
import { EXERCISE_SUBSTITUTES, MACHINE_CATEGORY, abbr as academyAbbr } from "../routine-builder/academy";
import { CLINICAL_FLAGS_MATRIX } from "../../data/clinical-matrix";
import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import type { Machine } from "../../types";
import type { MachineCatalogEntry } from "../../types/machines";
import { buildEntityIndex, type EntityIndex } from "./entities";
import { floorCareOf, type VaultCare } from "./floor-care";
import { buildVaultGraph, type GraphIndexFile } from "./graph";
import graphIndexJson from "./graph-index.json";
import { PILLARS, PLAYBOOKS, TRACKS } from "./playbooks";
import { questionBank } from "./quiz/bank";
import type { PillarId, PlaybookPage, QuizQuestion, Track, VaultGraph } from "./types";

export interface VaultData {
  index: AcademyIndex;
  /** One row per Academy machine, named the Catalog's way (buildAcademyMachines). */
  machines: AcademyMachine[];
  /** MACHINE_DEFINITIONS: the standard's seed. The studio's live copy is a later wiring. */
  defs: Record<string, MachineCatalogEntry>;
  /** The studio's floor in walking order; null while unknown (loading or unreadable), [] when read and empty. */
  floor: { id: string; name: string; code: string | null }[] | null;
  names: (machineId: string) => string;
  glossary: { term: string; definition: string }[] | null;
  cues: CueMoment[] | null;
  cards: QuickCard[] | null;
  scripts: MachineScript[] | null;
  overviews: { id: string; title: string; readingMinutes: number; words: number; blocks: Block[] }[] | null;
  /** Module prose that has arrived, by module id. */
  modules: Record<string, ModuleContent>;
  /** Ask for a module's prose. Safe to call while drawing; does nothing when it is here, coming, or failed. */
  loadModule: (id: string) => void;
  moduleFailed: (id: string) => boolean;
  /** A2's entity index, once the glossary and the machines have landed. */
  entities: EntityIndex | null;
  /** A3's knowledge graph, once every reference chunk has landed. */
  graph: VaultGraph | null;
  playbooks: PlaybookPage[];
  tracks: Track[];
  pillars: { id: PillarId; title: string; blurb: string }[];
  /** A5's question bank, once the glossary, cues, scripts and cards have landed. */
  quizBank: QuizQuestion[] | null;

  /* Beyond the contract, optional so a fixture can leave them out. */
  /** Which of the Catalog's four floor states the floor is in, for honest words ("Can't read Solon's floor"). */
  floorState?: FloorState;
  /** Try a failed module again: the reader's tap, never a timer. */
  retryModule?: (id: string) => void;
  /** A module this session already holds (the Academy may have fetched it), without waiting a render. */
  cachedModule?: (id: string) => ModuleContent | null;
  /**
   * A reference chunk (glossary, cues, cards, scripts, deep dives) could not
   * load and is still missing: a page waiting on it would spin forever, so a
   * design says it did not load and offers retryReference instead.
   */
  referenceFailed?: boolean;
  /** Ask again for every reference chunk that failed: the reader's tap, never a timer. */
  retryReference?: () => void;
  /**
   * The floor's status, as the Catalog says it (floor-care.ts): by machine
   * id, only the machines out of service or flagged; null while the roster
   * or Relay's care record is loading, when either failed, or with no studio
   * (unknown, never "all fine"). Draw it with ui/FloorStatus.
   */
  care?: VaultCare | null;
}

/** The five reference chunks, in the order they are asked for. */
const REFERENCE_NAMES: readonly AcademyReferenceName[] = ["glossary", "cues", "cards", "scripts", "overviews"];

const GRAPH_INDEX = graphIndexJson as unknown as GraphIndexFile;
/** One empty list, so the data object keeps its identity while the machine chunks are on their way. */
const NO_MACHINES: AcademyMachine[] = [];
const DEFS: Record<string, MachineCatalogEntry> = MACHINE_DEFINITIONS;

/** A key that changes only when a machine's id or name does, so a new array with the same machines rebuilds nothing. */
function namesKeyOf(machines: readonly { id?: string; name?: string }[]): string {
  return machines.map((m) => `${m.id ?? ""}\u0001${m.name ?? ""}`).join("\u0002");
}

export function useVaultData(opts: { studioId: string | null; machines: Machine[] }): VaultData {
  const { studioId, machines: legacyMachines } = opts;

  /* The five reference chunks, asked for once mounted (each hook's effect),
     and again through loadAcademyReference so a chunk that cannot arrive
     says so (see the header). Whichever lands first is used: it is the same
     chunk. */
  const hooked: { [K in AcademyReferenceName]: AcademyReference[K] | null } = {
    glossary: useAcademyGlossary(true),
    cues: useAcademyCues(true),
    cards: useAcademyCards(true),
    scripts: useAcademyScripts(true),
    overviews: useAcademyOverviews(true),
  };
  const [own, setOwn] = useState<Partial<AcademyReference>>({});
  const [refFailed, setRefFailed] = useState<ReadonlySet<AcademyReferenceName>>(() => new Set());
  const [refAttempt, setRefAttempt] = useState(0);
  const glossary = hooked.glossary ?? own.glossary ?? null;
  const cues = hooked.cues ?? own.cues ?? null;
  const cards = hooked.cards ?? own.cards ?? null;
  const scripts = hooked.scripts ?? own.scripts ?? null;
  const overviews = hooked.overviews ?? own.overviews ?? null;
  const landed = { glossary, cues, cards, scripts, overviews };
  const landedRef = useRef(landed);
  landedRef.current = landed;

  useEffect(() => {
    let alive = true;
    for (const name of REFERENCE_NAMES) {
      if (landedRef.current[name]) continue;
      loadAcademyReference(name)
        .then((value) => {
          if (alive) setOwn((prev) => (prev[name] ? prev : { ...prev, [name]: value }));
        })
        .catch(() => {
          if (!alive) return;
          setRefFailed((prev) => {
            if (prev.has(name)) return prev;
            const next = new Set(prev);
            next.add(name);
            return next;
          });
        });
    }
    return () => {
      alive = false;
    };
  }, [refAttempt]);

  const referenceFailed = REFERENCE_NAMES.some((n) => refFailed.has(n) && !landed[n]);
  const retryReference = useCallback(() => {
    setRefFailed(new Set());
    setRefAttempt((n) => n + 1);
  }, []);

  /* The floor, as the Catalog reads it. */
  const catalog = useCatalogMachines(studioId, legacyMachines);
  const floorState = catalog.floor;
  const floor = useMemo<VaultData["floor"]>(() => {
    if (floorState === "empty") return [];
    if (floorState !== "ready") return null;
    return catalog.machines.map((m) => ({
      id: m.id,
      name: m.name,
      code: movementOf(m)?.code ?? academyAbbr(m.id),
    }));
  }, [floorState, catalog.machines]);

  /* Out of service and Flagged (floor-care.ts): the roster read above, and
     Relay's care record through Relay's own hook. The ONE care listener on
     a Learning screen: each design calls this hook once, at its root, and
     a prototype is drawn in place of the Catalog and the Overview, which
     open their own. */
  const careRead = useMachineCare(studioId);
  const care = useMemo<VaultCare | null>(
    () => floorCareOf({ studioId, floorState, units: catalog.machines, care: careRead }),
    [studioId, floorState, catalog.machines, careRead],
  );

  /* Names. */
  const namesKey = namesKeyOf(legacyMachines ?? []);
  // Keyed on the names, not the array: the parent may hand a new array with the same machines.
  const catalogNames = useMemo(() => catalogNamesOf(legacyMachines), [namesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const floorNames = useMemo(() => {
    const out = new Map<string, string>();
    for (const m of catalog.machines) if (m.id && m.name && !out.has(m.id)) out.set(m.id, m.name);
    return out;
  }, [catalog.machines]);
  const names = useCallback(
    (machineId: string) => machineName(machineId, catalogNames) ?? floorNames.get(machineId) ?? machineId,
    [catalogNames, floorNames],
  );
  // The quiz only asks about the standard machines, so its names never wait on, or change with, the floor.
  const standardNames = useCallback((machineId: string) => machineName(machineId, catalogNames) ?? machineId, [catalogNames]);

  const academyReady = Boolean(cards && scripts && overviews);
  const academyMachines = useMemo(
    () => (cards && scripts && overviews ? buildAcademyMachines(cards, scripts, overviews, catalogNames) : NO_MACHINES),
    [cards, scripts, overviews, catalogNames],
  );

  /* Module prose, on demand. Refs hold what is here, coming or failed, so
     loadModule can be asked while a page draws without setting state then. */
  const [modules, setModules] = useState<Record<string, ModuleContent>>({});
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(() => new Set());
  const have = useRef(new Set<string>());
  const coming = useRef(new Set<string>());
  const failed = useRef(new Set<string>());
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const startLoad = useCallback((id: string) => {
    coming.current.add(id);
    loadAcademyModule(id)
      .then((content) => {
        coming.current.delete(id);
        have.current.add(id);
        if (live.current) setModules((prev) => (prev[id] ? prev : { ...prev, [id]: content }));
      })
      .catch(() => {
        coming.current.delete(id);
        failed.current.add(id);
        if (live.current) setFailedIds(new Set(failed.current));
      });
  }, []);

  const loadModule = useCallback(
    (id: string) => {
      if (!id || have.current.has(id) || coming.current.has(id) || failed.current.has(id)) return;
      startLoad(id);
    },
    [startLoad],
  );

  const retryModule = useCallback(
    (id: string) => {
      if (!failed.current.has(id)) return;
      failed.current.delete(id);
      setFailedIds(new Set(failed.current));
      startLoad(id);
    },
    [startLoad],
  );

  const moduleFailed = useCallback((id: string) => failedIds.has(id), [failedIds]);

  /* The three builds. */
  const entities = useMemo<EntityIndex | null>(() => {
    if (!glossary || !academyReady) return null;
    return buildEntityIndex({
      glossary,
      machines: academyMachines,
      clinical: CLINICAL_FLAGS_MATRIX,
      playbooks: PLAYBOOKS,
      modules: ACADEMY_INDEX.modules,
    });
  }, [glossary, academyReady, academyMachines]);

  const graph = useMemo<VaultGraph | null>(() => {
    if (!glossary || !cues || !academyReady) return null;
    return buildVaultGraph({
      index: ACADEMY_INDEX,
      machines: academyMachines,
      glossary,
      cues,
      clinical: CLINICAL_FLAGS_MATRIX,
      playbooks: PLAYBOOKS,
      graphIndex: GRAPH_INDEX,
      substitutes: EXERCISE_SUBSTITUTES,
      categories: MACHINE_CATEGORY,
    });
  }, [glossary, cues, academyReady, academyMachines]);

  const quizBank = useMemo<QuizQuestion[] | null>(() => {
    if (!glossary || !cues || !scripts || !cards) return null;
    // The playbooks let a question drawn from docs/business open the page written from it.
    return questionBank({ glossary, cues, scripts, cards, defs: DEFS, names: standardNames, playbooks: PLAYBOOKS });
  }, [glossary, cues, scripts, cards, standardNames]);

  return useMemo<VaultData>(
    () => ({
      index: ACADEMY_INDEX,
      machines: academyMachines,
      defs: DEFS,
      floor,
      names,
      glossary,
      cues,
      cards,
      scripts,
      overviews,
      modules,
      loadModule,
      moduleFailed,
      entities,
      graph,
      playbooks: PLAYBOOKS,
      tracks: TRACKS,
      pillars: PILLARS,
      quizBank,
      floorState,
      retryModule,
      cachedModule: cachedAcademyModule,
      referenceFailed,
      retryReference,
      care,
    }),
    [
      academyMachines,
      floor,
      names,
      glossary,
      cues,
      cards,
      scripts,
      overviews,
      modules,
      loadModule,
      moduleFailed,
      entities,
      graph,
      quizBank,
      floorState,
      retryModule,
      referenceFailed,
      retryReference,
      care,
    ],
  );
}
