import { ArrowLeft, Upload } from "lucide-react";
import { BrandMark, Wordmark } from "./BrandMark";

export type NavTarget = "home" | "instrument" | "how" | "docs";

export function SiteHeader({
  onNavigate,
  onCreate,
  current,
  hasSession,
}: {
  onNavigate: (t: NavTarget) => void;
  onCreate: () => void;
  current: "landing" | "docs";
  hasSession: boolean;
}) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a
          href="#/"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            onNavigate("home");
          }}
          aria-label="Acoustic Atelier — home"
        >
          <BrandMark />
          <Wordmark />
        </a>
        <nav className="site-nav" aria-label="Primary">
          <a
            href="#/instrument"
            onClick={(e) => {
              e.preventDefault();
              onNavigate("instrument");
            }}
          >
            The Instrument{hasSession && <span className="nav-dot" aria-label="(open)" />}
          </a>
          <a
            href="#/how"
            onClick={(e) => {
              e.preventDefault();
              onNavigate("how");
            }}
          >
            How It Works
          </a>
          <a
            href="#/docs"
            aria-current={current === "docs" ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              onNavigate("docs");
            }}
          >
            Documentation
          </a>
        </nav>
        <button type="button" className="btn btn--outline btn--sm" onClick={onCreate}>
          Create a Scale
        </button>
      </div>
    </header>
  );
}

export function WorkspaceHeader({
  filename,
  status,
  onNewSound,
  onHome,
}: {
  filename: string;
  status: { tone: "ok" | "busy" | "error"; label: string };
  onNewSound: () => void;
  onHome: () => void;
}) {
  return (
    <header className="ws-header">
      <div className="ws-header-inner">
        <button type="button" className="brand brand--compact" onClick={onHome} aria-label="Back to the landing page">
          <BrandMark size={24} />
          <Wordmark />
        </button>
        <div className="ws-file" title={filename}>
          <span className="ws-file-label">Sound</span>
          <span className="ws-file-name">{filename}</span>
          <span className={`status-pill status-pill--${status.tone}`} aria-live="polite">
            <span className="status-dot" aria-hidden="true" />
            {status.label}
          </span>
        </div>
        <div className="ws-actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onHome}>
            <ArrowLeft size={15} strokeWidth={1.6} aria-hidden="true" />
            <span className="hide-sm">Landing</span>
          </button>
          <button type="button" className="btn btn--outline btn--sm" onClick={onNewSound}>
            <Upload size={15} strokeWidth={1.6} aria-hidden="true" />
            <span>New sound</span>
          </button>
        </div>
      </div>
    </header>
  );
}
