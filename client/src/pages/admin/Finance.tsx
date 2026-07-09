import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Stat, Spinner, EmptyState, CategoryBadge } from '../../components/ui';
import { Icons } from '../../components/icons';
import { useToast } from '../../context/ToastContext';

export interface FinanceRow {
  id: number;
  title: string;
  category: string;
  status: string;
  teacher_id: number | null;
  teacher_name: string;
  enrolled_count: number;
  fee: number;
  revenue: number;
  pay_rate: number;
  session_count: number;
  teacher_pay: number;
}

export interface FinanceData {
  semester: string;
  courses: FinanceRow[];
  byTeacher: {
    teacher_id: number | null;
    teacher_name: string;
    course_count: number;
    session_count: number;
    teacher_pay: number;
    revenue: number;
  }[];
  totals: { revenue: number; teacher_pay: number; net: number };
}

const won = (n: number) => `${n.toLocaleString()}원`;

export default function AdminFinance() {
  const toast = useToast();
  const [data, setData] = useState<FinanceData | null>(null);

  useEffect(() => {
    api.get<FinanceData>('/admin/finance').then(setData);
  }, []);

  function exportCsv() {
    if (!data) return;
    const header = ['강좌', '교과', '강사', '수강인원', '수강료단가', '수강료수입', '회당강사료', '실시회차', '강사료'];
    const lines = data.courses.map((r) =>
      [r.title, r.category, r.teacher_name, r.enrolled_count, r.fee, r.revenue, r.pay_rate, r.session_count, r.teacher_pay].join(',')
    );
    const csv = '﻿' + [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `정산_${data.semester}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV가 다운로드되었습니다.', 'success');
  }

  if (!data) return <Spinner />;
  const { courses, byTeacher, totals } = data;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">정산 관리</h1>
          <p className="text-sm text-slate-500">
            수강료 수입과 강사료(회당 단가 × 실시 회차)를 집계합니다. 실시 회차는 출석부 기록 날짜 수로 자동 계산됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => window.open('/admin/print/finance', '_blank')}>
            <Icons.printer size={16} /> 정산 보고서 인쇄
          </button>
          <button className="btn-secondary" onClick={exportCsv}>
            <Icons.download size={16} /> CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="총 수강료 수입" value={won(totals.revenue)} accent="bg-brand-50 text-brand-600" icon={<Icons.wallet size={22} />} />
        <Stat label="총 강사료" value={won(totals.teacher_pay)} accent="bg-emerald-50 text-emerald-600" icon={<Icons.users size={22} />} />
        <Stat
          label="수지 (수입 − 강사료)"
          value={<span className={totals.net < 0 ? 'text-rose-600' : ''}>{won(totals.net)}</span>}
          accent="bg-amber-50 text-amber-600"
          icon={<Icons.chart size={22} />}
        />
      </div>

      {/* 강사별 집계 */}
      <h2 className="mb-3 mt-8 text-base font-bold text-slate-900">강사별 강사료 집계</h2>
      {byTeacher.length === 0 ? (
        <EmptyState message="정산할 강좌가 없습니다." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th">강사</th>
                  <th className="th text-center">담당 강좌</th>
                  <th className="th text-center">총 실시 회차</th>
                  <th className="th text-right">수강료 수입</th>
                  <th className="th text-right">강사료 합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byTeacher.map((t) => (
                  <tr key={t.teacher_id ?? 'none'} className="hover:bg-slate-50">
                    <td className="td font-semibold">{t.teacher_name}</td>
                    <td className="td text-center">{t.course_count}개</td>
                    <td className="td text-center">{t.session_count}회</td>
                    <td className="td text-right text-slate-500">{won(t.revenue)}</td>
                    <td className="td text-right font-bold text-emerald-700">{won(t.teacher_pay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 강좌별 정산 */}
      <h2 className="mb-3 mt-8 text-base font-bold text-slate-900">강좌별 정산 내역</h2>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="th">강좌</th>
                <th className="th">강사</th>
                <th className="th text-center">인원</th>
                <th className="th text-right">수강료 단가</th>
                <th className="th text-right">수강료 수입</th>
                <th className="th text-right">회당 강사료</th>
                <th className="th text-center">실시 회차</th>
                <th className="th text-right">강사료</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {courses.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <CategoryBadge category={r.category} />
                      <span className="font-medium">{r.title}</span>
                    </div>
                  </td>
                  <td className="td">{r.teacher_name}</td>
                  <td className="td text-center">{r.enrolled_count}</td>
                  <td className="td text-right">{won(r.fee)}</td>
                  <td className="td text-right">{won(r.revenue)}</td>
                  <td className="td text-right">
                    {r.pay_rate === 0 ? <span className="badge bg-amber-100 text-amber-700">미책정</span> : won(r.pay_rate)}
                  </td>
                  <td className="td text-center">{r.session_count}</td>
                  <td className="td text-right font-semibold">{won(r.teacher_pay)}</td>
                </tr>
              ))}
              {courses.length === 0 && (
                <tr><td colSpan={8} className="td py-8 text-center text-slate-400">정산할 강좌가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-500">
        💡 회당 강사료가 <b>미책정</b>인 강좌는 <b>강좌 관리 → 수정</b>에서 단가를 입력하세요.
        실시 회차는 강사가 출석부를 기록하면 자동으로 올라갑니다.
      </div>
    </div>
  );
}
