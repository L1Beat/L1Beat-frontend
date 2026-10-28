import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION = 2500;
const MAX_TOASTS = 4;
let nextId = 1;

export function ToasterProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // The portal waits for mount: the pre-rendered HTML has no toast container,
  // and rendering one during hydration made React discard the whole page.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, variant }].slice(-MAX_TOASTS));
    setTimeout(() => dismiss(id), TOAST_DURATION);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {mounted &&
        createPortal(
          <div
            aria-live="polite"
            className="pointer-events-none fixed bottom-4 right-4 z-[80] flex flex-col items-end gap-2 max-w-[min(360px,calc(100vw-2rem))]"
          >
            {toasts.map((t) => (
              <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = toast.variant === 'success' ? CheckCircle2 : toast.variant === 'error' ? AlertTriangle : Info;
  const iconColor =
    toast.variant === 'success'
      ? 'text-up'
      : toast.variant === 'error'
        ? 'text-brand'
        : 'text-foreground';
  return (
    <div
      role="status"
      className="pointer-events-auto inline-flex items-start gap-2.5 min-h-9 px-3.5 py-2 rounded-md bg-popover border border-border shadow-xl text-[12px] font-medium text-foreground"
    >
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconColor}`} />
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  // Safe fallback so calls outside the provider don't crash; logs once per call.
  return {
    toast: (msg, variant) => {
      // eslint-disable-next-line no-console
      console.warn('[useToast] called outside ToasterProvider:', variant ?? 'info', msg);
    },
  };
}

export type { ToastVariant };
