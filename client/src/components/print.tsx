import { CSSProperties, ReactNode } from 'react';
import { Icons } from './icons';
import { SEMESTER_LABEL, todayString } from '../lib/format';

// Shared chrome for standalone print routes: preview toolbar + paper sheet + document header.
export function PrintShell({
  title,
  hint,
  width = 'md',
  pageStyle,
  children,
}: {
  title: string;
  hint: string;
  width?: 'md' | 'lg' | 'xl';
  pageStyle?: string; // extra @media print rules (e.g. landscape @page)
  children: ReactNode;
}) {
  const maxW = { md: 'max-w-3xl', lg: 'max-w-4xl', xl: 'max-w-5xl' }[width];
  return (
    <div className="min-h-full bg-slate-100 py-8 print:bg-white print:py-0">
      {pageStyle && <style>{pageStyle}</style>}
      <div className={`no-print mx-auto mb-4 flex ${maxW} items-center justify-between px-4`}>
        <button className="btn-secondary" onClick={() => window.close()}>← 닫기</button>
        <div className="text-sm text-slate-500">{hint}</div>
        <button className="btn-primary" onClick={() => window.print()}>
          <Icons.printer size={16} /> 인쇄하기
        </button>
      </div>
      <div className={`print-sheet mx-auto ${maxW} rounded-xl bg-white p-10 shadow-card print:max-w-none print:rounded-none print:p-0 print:shadow-none`}>
        <div className="mb-1 text-center text-sm text-slate-500">{SEMESTER_LABEL}</div>
        <h1 className="mb-6 text-center text-2xl font-bold text-slate-900">{title}</h1>
        {children}
      </div>
    </div>
  );
}

// Left-aligned summary line + right-aligned print date.
export function PrintMeta({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between text-sm">
      <span className="font-semibold text-slate-700">{children}</span>
      <span className="text-slate-500">출력일: {todayString()}</span>
    </div>
  );
}

export function PrintLoading() {
  return <div className="p-10 text-center text-slate-400">불러오는 중...</div>;
}

/* ---- Bordered table cells for print forms ---- */

export function Th({ children, w }: { children?: ReactNode; w?: string }) {
  return (
    <th style={{ width: w }} className="border border-slate-400 px-2 py-2 text-center text-xs font-bold text-slate-700">
      {children}
    </th>
  );
}

export function Td({
  children,
  center,
  colSpan,
  className = '',
  style,
}: {
  children?: ReactNode;
  center?: boolean;
  colSpan?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <td colSpan={colSpan} style={style} className={`border border-slate-300 px-2 py-1.5 ${center ? 'text-center' : ''} ${className}`}>
      {children}
    </td>
  );
}

// Header/value cell pair for document info blocks (e.g. 강좌명 | 값).
export function InfoCell({ children, head, colSpan }: { children?: ReactNode; head?: boolean; colSpan?: number }) {
  return (
    <td
      colSpan={colSpan}
      className={`border border-slate-300 px-3 py-2 ${head ? 'bg-slate-100 text-center font-semibold text-slate-600' : 'text-slate-800'}`}
    >
      {children}
    </td>
  );
}
