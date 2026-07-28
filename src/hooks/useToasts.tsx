import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { uid } from "../lib/money";

export type ToastTone = "fern" | "brass" | "clay";
interface Toast { id: string; msg: string; tone: ToastTone; }
type Push = (msg: string, tone?: ToastTone) => void;

const Ctx = createContext<Push>(() => {});
export const useToast = (): Push => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback<Push>((msg, tone = "fern") => {
    const id = uid();
    setToasts((t) => [...t.slice(-3), { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="gl-toast" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} style={{ borderLeftColor: `var(--${t.tone})` }}><span>{t.msg}</span></div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
