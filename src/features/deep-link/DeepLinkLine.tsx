/**
 * The one quiet line a held link gets: "Opens when you finish this session".
 * Drawn under the status bar on the session screens, in the new-version
 * line's shape (features/new-version/NewVersionLine.tsx); never a dialog
 * over the floor.
 */
import { Link2 } from "lucide-react";

export function DeepLinkLine({ line }: { line: string | null }) {
  if (!line) return null;
  return (
    <div
      className="flex-none flex items-center gap-3 border-b border-border bg-muted px-4 py-1.5 text-sm text-foreground"
      role="status"
      aria-live="polite"
      data-testid="deep-link-line"
    >
      <Link2 className="size-4 flex-none text-muted-foreground" strokeWidth={2.4} aria-hidden="true" />
      <p className="m-0 min-w-0 flex-1 leading-snug">{line}</p>
    </div>
  );
}
