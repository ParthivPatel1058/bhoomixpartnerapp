import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { className: string; Icon: typeof Info }> = {
  success: {
    className: 'bg-secondary text-on-secondary',
    Icon: CheckCircle2,
  },
  error: {
    className: 'bg-error-container text-on-error-container border border-error/30',
    Icon: AlertCircle,
  },
  info: {
    className: 'bg-surface-container-high text-on-surface border border-outline-variant/40',
    Icon: Info,
  },
};

const AUTO_DISMISS_MS = 4000;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current++;
      setItems((list) => [...list, { id, message, tone }]);
      // Tracked so unmount/dismiss can't leave a timer pointing at dead state.
      timers.current.set(id, window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
    },
    [dismiss],
  );

  // The map was tracked but never drained: unmounting with toasts still on
  // screen left their dismiss timers running against dead state.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed left-1/2 -translate-x-1/2 bottom-32 z-[60] w-[calc(100%-2.5rem)] max-w-sm flex flex-col gap-2 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        {items.map(({ id, message, tone }) => {
          const { className, Icon } = TONE_STYLES[tone];
          return (
            <div
              key={id}
              className={`pointer-events-auto rounded-2xl px-4 py-3 shadow-lg flex items-start gap-2.5 animate-slideUp ${className}`}
            >
              <Icon className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="text-xs font-semibold leading-snug flex-1">{message}</span>
              <button
                onClick={() => dismiss(id)}
                className="shrink-0 opacity-70 hover:opacity-100"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
