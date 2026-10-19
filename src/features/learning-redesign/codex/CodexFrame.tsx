import type { ReactNode } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { LoadingArea } from "../../../components/LoadingMark";
import { WikiShell } from "../../wiki";
import { PeekFrame, PeekSheet } from "../../learning-vault/ui/PeekSheet";
import type { VaultRoute } from "../../learning-vault/types";
import { crumbLabel, useCodex } from "./codex-context";
import { resolveOpen } from "./codex-model";
import { PeekBody } from "./CodexPeek";
import "./codex.css";

/**
 * Every Codex page's frame: Learning's masthead and trail (WikiShell), the
 * page's actions on the trail's row (the version switch), and the peek
 * beside the page (from 1024px) or under it (a sheet on the bottom bar).
 */
export function CodexFrame({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  const { crumbs, peekStack, data, nav } = useCodex();
  const openFull = (r: VaultRoute) => {
    nav.push(resolveOpen(nav.stack, r));
    peekStack.close();
  };
  const open = peekStack.stack.length > 0;
  return (
    <WikiShell crumbs={crumbs} actions={actions} className="cdx__root">
      <PeekFrame
        open={open}
        peek={
          <PeekSheet
            stack={peekStack.stack}
            titleOf={(r) => crumbLabel(r, data)}
            render={(r) => <PeekBody route={r} />}
            onBack={peekStack.back}
            onCrumb={peekStack.crumb}
            onClose={peekStack.close}
            onOpenFull={openFull}
            scope={peekStack.scope}
          />
        }
      >
        <div className={`cdx__page${open ? " cdx__page--peek" : ""}`}>{children}</div>
      </PeekFrame>
    </WikiShell>
  );
}

/** A page that is still on its way. */
export function CodexLoading({ label }: { label: string }) {
  return (
    <CodexFrame>
      <LoadingArea label={label} />
    </CodexFrame>
  );
}

/** A page whose module could not be fetched: says so, and the reader tries again. */
export function CodexFailed({ moduleId }: { moduleId: string }) {
  const { data } = useCodex();
  return (
    <CodexFrame>
      <div className="cdx__gone">
        <p className="cdx__gone-title">This part of the Academy didn't load</p>
        <p className="cdx__gone-body">The connection may have dropped. Nothing you wrote is lost.</p>
        {data.retryModule && (
          <button type="button" className="cdx__btn" onClick={() => data.retryModule?.(moduleId)}>
            <RotateCcw size={16} aria-hidden />
            Try again
          </button>
        )}
      </div>
    </CodexFrame>
  );
}

/** A link to a page the Academy no longer has. Calm, with the way back. */
export function CodexGone() {
  const { nav } = useCodex();
  return (
    <CodexFrame>
      <div className="cdx__gone">
        <p className="cdx__gone-title">This page has moved</p>
        <p className="cdx__gone-body">The Academy was rebuilt since this link was made, so its page has a new place.</p>
        {nav.canBack && (
          <button type="button" className="cdx__btn" onClick={nav.back}>
            <ArrowLeft size={16} aria-hidden />
            Back
          </button>
        )}
      </div>
    </CodexFrame>
  );
}
