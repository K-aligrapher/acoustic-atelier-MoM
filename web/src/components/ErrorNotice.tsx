import { CircleAlert } from "lucide-react";
import { describeError } from "../lib/errors";

export function ErrorNotice({
  error,
  actions,
  compact = false,
}: {
  error: unknown;
  actions?: React.ReactNode;
  compact?: boolean;
}) {
  const e = describeError(error);
  return (
    <div className={`notice notice--error${compact ? " notice--compact" : ""}`} role="alert">
      <CircleAlert className="notice-icon" size={18} strokeWidth={1.5} aria-hidden="true" />
      <div className="notice-body">
        <p className="notice-title">{e.title}</p>
        <p className="notice-text">{e.message}</p>
        {actions && <div className="notice-actions">{actions}</div>}
      </div>
      <span className="notice-code">{e.code}</span>
    </div>
  );
}
