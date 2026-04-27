'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info';

type ToastInput = {
  title?: string;
  description: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastRecord = ToastInput & {
  id: number;
  tone: ToastTone;
};

type ToastContextValue = {
  dismissToast: (id: number) => void;
  showToast: (input: ToastInput) => number;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneClassMap: Record<ToastTone, string> = {
  success:
    'border-emerald-300/30 bg-emerald-400/12 text-emerald-50 shadow-[0_18px_60px_rgba(16,185,129,0.22)]',
  error:
    'border-rose-300/30 bg-rose-400/12 text-rose-50 shadow-[0_18px_60px_rgba(244,63,94,0.22)]',
  info:
    'border-cyan-300/30 bg-cyan-400/12 text-cyan-50 shadow-[0_18px_60px_rgba(34,211,238,0.2)]',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextToastIdRef = useRef(0);
  const timeoutMapRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: number) => {
    const timeoutHandle = timeoutMapRef.current.get(id);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutMapRef.current.delete(id);
    }

    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (input: ToastInput) => {
      nextToastIdRef.current += 1;
      const id = nextToastIdRef.current;
      const nextToast: ToastRecord = {
        ...input,
        id,
        tone: input.tone ?? 'info',
      };

      setToasts((current) => [...current, nextToast]);

      const timeoutHandle = setTimeout(() => {
        dismissToast(id);
      }, input.durationMs ?? 4200);

      timeoutMapRef.current.set(id, timeoutHandle);
      return id;
    },
    [dismissToast]
  );

  useEffect(() => {
    const timeoutMap = timeoutMapRef.current;
    return () => {
      for (const timeoutHandle of timeoutMap.values()) {
        clearTimeout(timeoutHandle);
      }
      timeoutMap.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ dismissToast, showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[120] flex justify-end px-4 py-4 sm:px-6">
        <div className="flex w-full max-w-sm flex-col gap-3">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={cn(
                'pointer-events-auto rounded-2xl border px-4 py-3 backdrop-blur transition-all',
                toneClassMap[toast.tone]
              )}
              role="status"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  {toast.title ? (
                    <p className="text-sm font-semibold tracking-tight">{toast.title}</p>
                  ) : null}
                  <p className="text-sm leading-6 opacity-95">{toast.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
