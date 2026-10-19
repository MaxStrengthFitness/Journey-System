import { useMemo } from "react";
import { useVault } from "../../learning-vault/ui/VaultProvider";
import { useCodex } from "./codex-context";
import { pathShelf } from "./codex-model";
import { BandHead } from "./CodexBits";
import { CodexFrame } from "./CodexFrame";
import {
  FloorGrid,
  HeadOfficeDoor,
  MethodList,
  PathCard,
  PathRows,
  PlayCard,
  ReferencePair,
  SectionDoor,
} from "./CodexShelves";
import "./codex.css";

/**
 * THE OVERVIEW — the Codex's front page.
 *
 *   Paths       a path for each role (a new Life Transformer's first, as the
 *               lead card), then the pillars' paths as rows
 *   The floor   the studio's machines as codex entries, in walking order
 *   The method  the Academy's thirteen chapters, the glossary and the
 *               phrasebook beside them
 *   Play        the quiz
 *
 * Head office sees its queue's door first: it is the one thing on this page
 * that is waiting for someone.
 */
export function CodexHome() {
  const { data, studioName, onSection } = useCodex();
  const vault = useVault();
  const shelf = useMemo(() => pathShelf(data.tracks), [data.tracks]);

  return (
    <CodexFrame>
      <div className="cdx__home">
        {vault.viewer.isHeadOffice && (
          <section className="cdx__band cdx__band--first" aria-label="Head office">
            <HeadOfficeDoor />
          </section>
        )}

        <section className="cdx__band cdx__band--first" aria-labelledby="cdx-paths">
          <BandHead id="cdx-paths" title="Paths" />
          <div className="cdx__paths">
            {shelf.lead && <PathCard track={shelf.lead} lead />}
            {shelf.roles.map((t) => (
              <PathCard key={t.id} track={t} />
            ))}
          </div>
          <PathRows tracks={shelf.pillars} />
        </section>

        <section className="cdx__band" aria-labelledby="cdx-floor">
          <BandHead
            id="cdx-floor"
            title={`On ${studioName}'s floor`}
            action={<SectionDoor label="Catalog" onClick={() => onSection("machine-anatomy")} />}
          />
          <FloorGrid />
        </section>

        <section className="cdx__band" aria-labelledby="cdx-method">
          <BandHead id="cdx-method" title="The method" action={<SectionDoor label="Academy" onClick={() => onSection("academy")} />} />
          <div className="cdx__method">
            <MethodList />
            <ReferencePair />
          </div>
        </section>

        <div className="cdx__band">
          <PlayCard />
        </div>
      </div>
    </CodexFrame>
  );
}
