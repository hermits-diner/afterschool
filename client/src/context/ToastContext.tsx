import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

const ToastContext = createContext<{
  toast: (message: string, type?: ToastType) => void;
}>(null as any);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++counter;
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const styles: Record<ToastType, string> = {
    success: 'bg-emerald-600',
    error: 'bg-rose-600',
    info: 'bg-slate-800',
  };
  const icons: Record<ToastType, string> = { success: '✓', error: '!', info: 'ℹ' };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-soft ${styles[t.type]}`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-xs">
              {icons[t.type]}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext).toast;
}
