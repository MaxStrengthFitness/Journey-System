/**
 * Which columns the table shows on a wide screen (directory redesign, Oct 21
 * 2026; AJ: the Renewal / Total / Age / Height buttons "just feel very
 * different" from the filters). They are a display choice, not a filter, so
 * they live behind one "Columns" button at the end of the filter row, in the
 * sort's own pill and panel. Wide screens only (`.cd-columns` is hidden under
 * 1000px, where those columns aren't drawn at all).
 */
import { useEffect, useId, useRef, useState } from "react";
import { Check, Columns3 } from "lucide-react";

export function ColumnsMenu<K extends string>({
  columns,
  words,
  shown,
  onToggle,
}: {
  columns: ReadonlyArray<K>;
  words: Record<string, string>;
  shown: ReadonlySet<K>;
  onToggle: (column: K) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="cd-columns cd-sort" ref={wrap}>
      <button type="button" className="cd-tool" aria-expanded={open} aria-controls={panelId} aria-label="Choose the columns shown" onClick={() => setOpen((v) => !v)}>
        <Columns3 size={16} aria-hidden="true" />
        <span>Columns</span>
      </button>
      {open && (
        <div className="cd-sort-panel cd-columns-panel" id={panelId} role="dialog" aria-label="Columns shown">
          <div className="cd-sort-group">
            <p className="cd-sort-title">Show these beside Last in, Next and Left</p>
            <div className="cd-sort-tiles">
              {columns.map((c) => (
                <button key={c} type="button" className="cd-sort-tile cd-display-toggle" aria-pressed={shown.has(c)} onClick={() => onToggle(c)}>
                  <span>{words[c]}</span>
                  {shown.has(c) && <Check size={16} aria-hidden="true" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
