import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/** Overlay panel for secondary information (About, Refine, Export). Closes on Esc, backdrop or ✕. */
export function Modal({
  title,
  kicker,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  kicker?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className={`modal${wide ? " modal--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="modal-head">
          <div>
            {kicker && <p className="eyebrow">{kicker}</p>}
            <h2 className="modal-title">{title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
