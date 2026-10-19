/**
 * Loading the Academy content, a module at a time.
 *
 * Round: MSF Topics, Sep 2026.
 *
 * The whole corpus is about a megabyte of JSON. The index — every module and
 * topic title, with reading times — is 16KB and is imported statically, so
 * browsing and searching are instant. A topic's actual prose is fetched only
 * when someone opens it, and cached for the session after that.
 *
 * `import()` with a template literal would defeat Vite's static analysis and
 * bundle nothing, so the loaders are an explicit map. Ten lines of repetition
 * buys a real chunk per module.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import index from "./content/index.json";
import type {
  AcademyIndex,
  CardsFile,
  CuesFile,
  GlossaryFile,
  ModuleContent,
  OverviewsFile,
  ScriptsFile,
} from "./types";

export const ACADEMY_INDEX = index as unknown as AcademyIndex;

/*
 * Typed as `unknown` rather than ModuleContent because TypeScript widens a
 * JSON import's string literals — `kind: "heading"` becomes `kind: string` —
 * so the inferred type never satisfies the union. The shape is guaranteed by
 * the generator and pinned by content.test.ts, which validates the real files
 * against these types; asserting here and checking there is the honest split.
 */
const MODULE_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  intro: () => import("./content/intro.json"),
  benefits: () => import("./content/benefits.json"),
  principles: () => import("./content/principles.json"),
  performance: () => import("./content/performance.json"),
  "continuous-tension": () => import("./content/continuous-tension.json"),
  programming: () => import("./content/programming.json"),
  variations: () => import("./content/variations.json"),
  equipment: () => import("./content/equipment.json"),
  instruction: () => import("./content/instruction.json"),
  mastery: () => import("./content/mastery.json"),
  consultation: () => import("./content/consultation.json"),
  further: () => import("./content/further.json"),
  summary: () => import("./content/summary.json"),
};

const cache = new Map<string, ModuleContent>();

export function useAcademyModule(moduleId: string | null) {
  const [content, setContent] = useState<ModuleContent | null>(
    moduleId ? (cache.get(moduleId) ?? null) : null,
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef<string | null>(null);

  useEffect(() => {
    active.current = moduleId;
    if (!moduleId) {
      setContent(null);
      return;
    }
    const cached = cache.get(moduleId);
    if (cached) {
      setContent(cached);
      setFailed(false);
      return;
    }
    const load = MODULE_LOADERS[moduleId];
    if (!load) {
      setFailed(true);
      return;
    }
    setLoading(true);
    setFailed(false);
    load()
      .then((m) => {
        const loaded = m.default as ModuleContent;
        cache.set(moduleId, loaded);
        // A slow chunk arriving after the reader moved on must not overwrite
        // what they are looking at now.
        if (active.current === moduleId) setContent(loaded);
      })
      .catch(() => {
        if (active.current === moduleId) setFailed(true);
      })
      .finally(() => {
        if (active.current === moduleId) setLoading(false);
      });
  }, [moduleId]);

  return { content, loading, failed };
}

/**
 * One module's prose, for a caller that asks while it draws rather than from
 * an effect (the Learning vault's page builder, Oct 19 2026). It shares the
 * cache above, so the Academy and the vault never fetch a module twice.
 * Rejects for an id with no loader.
 */
export function loadAcademyModule(moduleId: string): Promise<ModuleContent> {
  const cached = cache.get(moduleId);
  if (cached) return Promise.resolve(cached);
  const load = MODULE_LOADERS[moduleId];
  if (!load) return Promise.reject(new Error(`No Academy module "${moduleId}".`));
  return load().then((m) => {
    const loaded = m.default as ModuleContent;
    cache.set(moduleId, loaded);
    return loaded;
  });
}

/** A module's prose if this session already has it, else null. Never fetches. */
export function cachedAcademyModule(moduleId: string): ModuleContent | null {
  return cache.get(moduleId) ?? null;
}

/** The per-machine cards. One chunk, loaded on demand. */
export function useAcademyCards(enabled: boolean) {
  const [cards, setCards] = useState<CardsFile["cards"] | null>(null);
  useEffect(() => {
    if (!enabled || cards) return;
    let live = true;
    import("./content/cards.json").then((m) => {
      if (live) setCards((m.default as unknown as CardsFile).cards);
    });
    return () => {
      live = false;
    };
  }, [enabled, cards]);
  return cards;
}

export function useAcademyGlossary(enabled: boolean) {
  const [terms, setTerms] = useState<GlossaryFile["glossary"] | null>(null);
  useEffect(() => {
    if (!enabled || terms) return;
    let live = true;
    import("./content/glossary.json").then((m) => {
      if (live) setTerms((m.default as unknown as GlossaryFile).glossary);
    });
    return () => {
      live = false;
    };
  }, [enabled, terms]);
  return terms;
}

/** The cue phrasebook and the per-machine scripts. One chunk each. */
export function useAcademyCues(enabled: boolean) {
  const [cues, setCues] = useState<CuesFile["cues"] | null>(null);
  useEffect(() => {
    if (!enabled || cues) return;
    let live = true;
    import("./content/cues.json").then((m) => {
      if (live) setCues((m.default as unknown as CuesFile).cues);
    });
    return () => {
      live = false;
    };
  }, [enabled, cues]);
  return cues;
}

export function useAcademyScripts(enabled: boolean) {
  const [scripts, setScripts] = useState<ScriptsFile["scripts"] | null>(null);
  useEffect(() => {
    if (!enabled || scripts) return;
    let live = true;
    import("./content/scripts.json").then((m) => {
      if (live) setScripts((m.default as unknown as ScriptsFile).scripts);
    });
    return () => {
      live = false;
    };
  }, [enabled, scripts]);
  return scripts;
}

export function useAcademyOverviews(enabled: boolean) {
  const [overviews, setOverviews] = useState<OverviewsFile["overviews"] | null>(null);
  useEffect(() => {
    if (!enabled || overviews) return;
    let live = true;
    import("./content/overviews.json").then((m) => {
      if (live) setOverviews((m.default as unknown as OverviewsFile).overviews);
    });
    return () => {
      live = false;
    };
  }, [enabled, overviews]);
  return overviews;
}

/**
 * Search across every topic title in the index.
 *
 * Titles only, deliberately: full-text would mean shipping the corpus to
 * search it, which is the thing this file exists to avoid. A trainer looking
 * for "turnaround" finds the topic; a trainer looking for a phrase inside an
 * essay opens the module and reads.
 */
export function useTopicSearch() {
  return useCallback((query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits: { moduleId: string; moduleTitle: string; topicId: string; title: string }[] = [];
    for (const mod of ACADEMY_INDEX.modules) {
      for (const t of mod.topics) {
        if (t.title.toLowerCase().includes(q)) {
          hits.push({
            moduleId: mod.id,
            moduleTitle: mod.title,
            topicId: t.id,
            title: t.title,
          });
        }
      }
    }
    return hits.slice(0, 40);
  }, []);
}

/* ------------------------------------------------------------------ *
 * The five reference chunks as promises (the Learning vault, Oct 19 2026)
 * ------------------------------------------------------------------ */

/** The Academy's five small reference chunks, by name. */
export type AcademyReferenceName = "glossary" | "cues" | "cards" | "scripts" | "overviews";

export interface AcademyReference {
  glossary: GlossaryFile["glossary"];
  cues: CuesFile["cues"];
  cards: CardsFile["cards"];
  scripts: ScriptsFile["scripts"];
  overviews: OverviewsFile["overviews"];
}

const REFERENCE_LOADERS: { [K in AcademyReferenceName]: () => Promise<AcademyReference[K]> } = {
  glossary: () => import("./content/glossary.json").then((m) => (m.default as unknown as GlossaryFile).glossary),
  cues: () => import("./content/cues.json").then((m) => (m.default as unknown as CuesFile).cues),
  cards: () => import("./content/cards.json").then((m) => (m.default as unknown as CardsFile).cards),
  scripts: () => import("./content/scripts.json").then((m) => (m.default as unknown as ScriptsFile).scripts),
  overviews: () => import("./content/overviews.json").then((m) => (m.default as unknown as OverviewsFile).overviews),
};

/**
 * One reference chunk, for a caller that must know when it CANNOT arrive
 * (the hooks above never say: a chunk a deploy removed leaves them null
 * forever). The same import() as the hooks, so the browser fetches it once.
 * Rejects when the chunk will not load; the caller decides what to say.
 */
export function loadAcademyReference<K extends AcademyReferenceName>(name: K): Promise<AcademyReference[K]> {
  return REFERENCE_LOADERS[name]() as Promise<AcademyReference[K]>;
}
