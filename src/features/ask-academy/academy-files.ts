/**
 * The whole Academy content, statically imported — for the server and the
 * trial, never the app's screens.
 *
 * About a megabyte of JSON. The Academy screen loads a module at a time
 * (`academy/useAcademyContent.ts`) and must keep doing so; this file is the
 * other case, where every page is needed at once to be picked from. Nothing
 * on the first screen may import it (`src/first-screen.test.ts`).
 */
import index from "../academy/content/index.json";
import intro from "../academy/content/intro.json";
import benefits from "../academy/content/benefits.json";
import principles from "../academy/content/principles.json";
import performance from "../academy/content/performance.json";
import continuousTension from "../academy/content/continuous-tension.json";
import programming from "../academy/content/programming.json";
import variations from "../academy/content/variations.json";
import equipment from "../academy/content/equipment.json";
import instruction from "../academy/content/instruction.json";
import mastery from "../academy/content/mastery.json";
import consultation from "../academy/content/consultation.json";
import further from "../academy/content/further.json";
import summary from "../academy/content/summary.json";
import overviews from "../academy/content/overviews.json";
import scripts from "../academy/content/scripts.json";
import cards from "../academy/content/cards.json";
import cues from "../academy/content/cues.json";
import glossary from "../academy/content/glossary.json";
import type {
  AcademyIndex,
  CardsFile,
  CuesFile,
  GlossaryFile,
  ModuleContent,
  OverviewsFile,
  ScriptsFile,
} from "../academy/types";
import type { AcademyFiles } from "./pages";

/*
 * Asserted through `unknown`, as useAcademyContent does: a JSON import widens
 * `kind: "heading"` to `kind: string`. academy/content.test.ts checks the real
 * files against these types.
 */
const MODULES: Record<string, unknown> = {
  intro,
  benefits,
  principles,
  performance,
  "continuous-tension": continuousTension,
  programming,
  variations,
  equipment,
  instruction,
  mastery,
  consultation,
  further,
  summary,
};

/** Every module in the index's order, and the other five files. Throws if the index names a module this file doesn't import. */
export function academyFiles(): AcademyFiles {
  const order = (index as unknown as AcademyIndex).modules.map((m) => m.id);
  const modules = order.map((id) => {
    const mod = MODULES[id];
    if (!mod) throw new Error(`ask-academy: the Academy index names module "${id}", which academy-files.ts does not import`);
    return mod as ModuleContent;
  });
  return {
    modules,
    overviews: overviews as unknown as OverviewsFile,
    scripts: scripts as unknown as ScriptsFile,
    cards: cards as unknown as CardsFile,
    cues: cues as unknown as CuesFile,
    glossary: glossary as unknown as GlossaryFile,
  };
}
