/**
 * COPY LINK for a client or a session: the quiet tool the hosts put beside
 * Close on the finished-session pop-up, and the profile header's fourth tool
 * calls the same `copyShareLink`. Offered only at the client's studio: the
 * hosts decide that, so this draws nothing it should not.
 *
 * The share document is written without waiting (./share.ts); the tap never
 * waits on the network, and a refused write comes back as a toast.
 */
import { Link2 } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { appShareIo, copyShareLink, type CopyShareFacts } from "./share";

export const COPY_LINK_LABEL: Record<CopyShareFacts["kind"], string> = {
  client: "Copy a link to this client",
  session: "Copy a link to this session",
};

/** The tap, for a host that draws its own button (the profile header's tool). */
export function useCopyShareLink(): (facts: CopyShareFacts) => void {
  const { success, error } = useToast();
  return (facts) => {
    copyShareLink(facts, appShareIo({ success, error }));
  };
}

export function CopyShareLinkButton({
  facts,
  className,
}: {
  facts: CopyShareFacts;
  /** The host's own button class (the pop-up's icon button, 40px). */
  className?: string;
}) {
  const copy = useCopyShareLink();
  return (
    <button
      type="button"
      onClick={() => copy(facts)}
      className={className ?? "inline-flex h-10 min-w-10 items-center justify-center rounded-xl"}
      title="Copy link"
      aria-label={COPY_LINK_LABEL[facts.kind]}
      data-testid="copy-share-link"
    >
      <Link2 className="w-5 h-5" aria-hidden />
    </button>
  );
}
