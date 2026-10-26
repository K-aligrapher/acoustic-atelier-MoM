import { Info } from "lucide-react";
import { useId, useState } from "react";

/** Small accessible tooltip: shows on hover and on keyboard focus. */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="infotip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="infotip-btn"
        aria-label={`About ${label}`}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      >
        <Info size={13} strokeWidth={1.6} aria-hidden="true" />
      </button>
      {open && (
        <span role="tooltip" id={id} className="infotip-pop">
          {children}
        </span>
      )}
    </span>
  );
}
