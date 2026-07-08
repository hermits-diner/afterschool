import { ReactNode } from 'react';
import { categoryColor, courseStatusLabel } from '../lib/format';

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size];
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 py-10">
      <div className={`card w-full ${width} animate-[fadeIn_.15s_ease-out]`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="닫기">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  return <span className={`badge ${categoryColor(category)}`}>{category}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    open: 'bg-emerald-100 text-emerald-700',
    closed: 'bg-slate-200 text-slate-600',
    cancelled: 'bg-rose-100 text-rose-700',
  };
  return <span className={`badge ${cls[status] || cls.open}`}>{courseStatusLabel(status)}</span>;
}

export function Stat({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: ReactNode;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="card flex items-center gap-4 p-5">
      {icon && (
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${accent || 'bg-brand-50 text-brand-600'}`}>
          {icon}
        </div>
      )}
      <div>
        <div className="text-sm text-slate-500">{label}</div>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

export function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
      <div className="mb-2 text-4xl">📭</div>
      <p className="font-medium text-slate-600">{message}</p>
      {sub && <p className="mt-1 text-sm text-slate-400">{sub}</p>}
    </div>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const color = pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
    </div>
  );
}
