import { Check, CircleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState } from "react";

type Tone = "success" | "error";
interface ToastItem {
  id: number;
  tone: Tone;
  text: string;
}

const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));
  const push = useCallback((text: string, tone: Tone = "success") => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, tone, text }]);
    window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 3600);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`}>
            {t.tone === "success" ? <Check size={15} aria-hidden="true" /> : <CircleAlert size={15} aria-hidden="true" />}
            <span>{t.text}</span>
            <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
