import { ReactNode } from 'react';
import { categoryColor, courseStatusLabel, enrollStatusLabel } from '../lib/format';
import { Icons } from './icons';

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
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" aria-label="닫기">
            <Icons.close size={20} />
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

// Enrollment status pill: 수강확정(green)
export function EnrollBadge({ status }: { status?: string }) {
  const cls = status === 'enrolled' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600';
  return <span className={`badge ${cls}`}>{enrollStatusLabel(status)}</span>;
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
    <div className="card flex items-center gap-4 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft">
      {icon && (
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accent || 'bg-brand-50 text-brand-600'}`}>
          {icon}
        </div>
      )}
      <div>
        <div className="text-sm text-slate-500">{label}</div>
        <div className="text-2xl font-bold tracking-tight text-slate-900 [font-variant-numeric:tabular-nums]">{value}</div>
      </div>
    </div>
  );
}

export function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icons.inbox size={26} />
      </div>
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

/* ---- 스켈레톤 로더 — 목록/카드 화면의 레이아웃 형태를 유지한 로딩 표시 ---- */

// 카드 그리드 스켈레톤 (학생 카탈로그, 강사 내 강좌 등)
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <div className="skeleton h-5 w-14" />
            <div className="skeleton h-4 w-12" />
          </div>
          <div className="skeleton h-5 w-3/4" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-2 w-full" />
          <div className="flex gap-2 pt-1">
            <div className="skeleton h-8 flex-1" />
            <div className="skeleton h-8 flex-1" />
          </div>
        </div>
      ))}
    </div>
  );
}

// 테이블 스켈레톤 (관리자 목록 화면)
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="skeleton h-4 w-1/3" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="skeleton h-4 w-8" />
            <div className="skeleton h-4 w-1/4" />
            <div className="skeleton h-4 w-1/6" />
            <div className="skeleton h-4 w-1/5" />
            <div className="skeleton ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
