/**
 * ASK IN TEAMS — the form that opens in place under a line, or under a
 * page's title (the Learning vault redesign, Oct 19 2026).
 *
 * It opens where the person tapped, never as a dialog (InheritedSafety's
 * pattern: "Nothing here is a dialog"), and it shows, word for word, what
 * will leave the iPad: the page, the line, the link, and a question if they
 * type one. Then two ways out, both the person's own tap:
 *
 *   Share…     the iPad's share sheet, where Teams is one of the apps. Shown
 *              only where the browser has a share sheet (iPad Safari and the
 *              Home Screen app do; desktop Chrome may not).
 *   Copy link  always there, so the words can be pasted into Teams by hand.
 *
 * Journey never posts to Teams and never pings anyone ("In-app only, for
 * now"; "Nothing pings anyone"). A page title is the Academy's words or a
 * machine's name, never a client's, so it goes in the words; the question
 * is the person's own, so one quiet line under it asks them to keep client
 * names out ("Keep client names out of Teams.", the Teams proposal's first
 * guardrail).
 *
 * The share sheet gets exactly the words shown, with the link inside them,
 * and no separate url: some apps on the sheet add a separate url a second
 * time, and the words already carry it.
 *
 * A typed question is typing: it registers with useUnsavedChanges, so a
 * door that would close the page asks first, and so does this form's own
 * Close. Once the words have been copied or shared, the question has gone
 * where it was going, and leaving no longer asks.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link2, Share } from "lucide-react";
import { useUnsavedChanges } from "../../unsaved-changes";
import { QUESTION_MAX, learningLinkUrl, shareWords } from "../learning-link";
import { browserShareIo, copyShare, nativeShare, type ShareIo } from "../share";
import type { VaultBlock, VaultTarget } from "../types";
import "../../wiki/wiki.css";
import "./share.css";

export const NAMES_LINE = "Keep client names out of Teams.";
export const NO_LINK_LINE = "This page has no link yet, so the words say where to find it.";
export const COPIED_LINE = "Copied. Paste it into Teams.";
export const SHARED_LINE = "Shared.";
export const COPY_FAILED_LINE = "Couldn't copy here. Select the words above and copy them by hand.";
export const SHARE_FAILED_LINE = "The share sheet didn't open. Copy link works too.";
export const SHARE_FAILED_WORDS_LINE = "The share sheet didn't open. Copy the words instead.";

export interface ShareFormProps {
  target: VaultTarget;
  /** The line it is about; left out when it is about the whole page. */
  block?: VaultBlock;
  /** The section the line sits in ("Script & cues"), said after the page title. */
  sectionTitle?: string;
  /** The clipboard, the share sheet and the origin; the browser's own when left out. */
  io?: ShareIo;
  onDone: () => void;
}

type Said = { tone: "ok" | "plain"; line: string } | null;

/** The line as the words quote it: a glossary term or a method line keeps its label. */
function quoteOf(block: VaultBlock | undefined): string | undefined {
  if (!block) return undefined;
  const text = block.text.trim();
  if (!block.label) return text || undefined;
  return text ? `${block.label}: ${text}` : block.label;
}

export function ShareForm({ target, block, sectionTitle, io, onDone }: ShareFormProps) {
  const shareIo = useMemo(() => io ?? browserShareIo(), [io]);
  const url = learningLinkUrl(shareIo.origin, target.ref, block?.key);
  const canShare = typeof shareIo.share === "function";

  const [question, setQuestion] = useState("");
  const [handedOff, setHandedOff] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said>(null);

  const typed = question.trim();
  const dirty = typed !== "" && typed !== handedOff;
  const unsaved = useUnsavedChanges(dirty, "the question you're writing for Teams", {
    onDiscard: () => setQuestion(""),
  });

  const words = shareWords({ title: target.title, sectionTitle, quote: quoteOf(block), question, url });

  const titleId = useId();
  const fieldId = useId();
  const namesId = useId();

  // Bring the form into view where it opened: under a line near the foot of
  // the page it would otherwise open below the fold. Guarded: jsdom and old
  // browsers have no scrollIntoView, and an effect that throws takes the
  // screen down.
  const root = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof el.scrollIntoView !== "function") return;
    try {
      el.scrollIntoView({ block: "nearest" });
    } catch {
      /* an older scrollIntoView without options: leave the page where it is */
    }
  }, []);

  // Both calls start inside the tap (Safari allows the clipboard and the
  // share sheet only there): nothing is awaited before them.
  const onCopy = () => {
    if (busy) return;
    setBusy(true);
    void copyShare(words, shareIo).then((result) => {
      setBusy(false);
      if (result === "copied") {
        setHandedOff(typed);
        setSaid({ tone: "ok", line: COPIED_LINE });
      } else {
        setSaid({ tone: "plain", line: COPY_FAILED_LINE });
      }
    });
  };

  const onShare = () => {
    if (busy) return;
    setBusy(true);
    void nativeShare({ title: target.title, text: words }, shareIo).then((result) => {
      setBusy(false);
      if (result === "shared") {
        setHandedOff(typed);
        setSaid({ tone: "ok", line: SHARED_LINE });
      } else if (result === "cancelled") {
        // They closed the sheet without picking an app: nothing to say.
        setSaid(null);
      } else {
        setSaid({ tone: "plain", line: url ? SHARE_FAILED_LINE : SHARE_FAILED_WORDS_LINE });
      }
    });
  };

  const copyLabel = url ? "Copy link" : "Copy the words";

  return (
    <section ref={root} className="vts" aria-labelledby={titleId}>
      <p className="vts__title" id={titleId}>
        Ask in Teams
      </p>

      <div className="vts__field">
        <p className="vts__label">What Teams gets</p>
        <p className="vts__words">{words}</p>
        {url === null && <p className="vts__quiet">{NO_LINK_LINE}</p>}
      </div>

      <div className="vts__field">
        <label className="vts__label" htmlFor={fieldId}>
          Your question
        </label>
        <textarea
          id={fieldId}
          className="vts__input"
          value={question}
          rows={3}
          maxLength={QUESTION_MAX}
          placeholder="Optional. The link goes either way."
          autoCapitalize="sentences"
          aria-describedby={namesId}
          onChange={(e) => {
            setQuestion(e.target.value);
            setSaid(null);
          }}
        />
        <p className="vts__quiet" id={namesId}>
          {NAMES_LINE}
        </p>
      </div>

      <div className="vts__actions">
        {canShare && (
          <button type="button" className="vts__btn vts__btn--primary" disabled={busy} onClick={onShare}>
            <Share size={16} aria-hidden="true" />
            <span>{"Share…"}</span>
          </button>
        )}
        <button
          type="button"
          className={canShare ? "vts__btn" : "vts__btn vts__btn--primary"}
          disabled={busy}
          onClick={onCopy}
        >
          <Link2 size={16} aria-hidden="true" />
          <span>{copyLabel}</span>
        </button>
        <button type="button" className="vts__btn vts__btn--quiet" onClick={() => unsaved.guard(onDone)}>
          {handedOff !== null ? "Done" : "Close"}
        </button>
      </div>

      <p className={said?.tone === "ok" ? "vts__said vts__said--ok" : "vts__said"} role="status" aria-live="polite">
        {said?.line ?? ""}
      </p>
    </section>
  );
}
