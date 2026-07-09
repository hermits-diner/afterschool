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
  session_auto: number;
  planned_sessions: number;
  session_source: 'manual' | 'planned' | 'attendance';
  teacher_pay: number;
}

const SOURCE_LABEL = { manual: '수동', planned: '계획', attendance: '출석부' } as const;
const SOURCE_STYLE = {
  manual: 'bg-brand-100 text-brand-700',
  planned: 'bg-emerald-100 text-emerald-700',
  attendance: 'bg-slate-100 text-slate-500',
} as const;

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
  const [editId, setEditId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');

  async function load() {
    const r = await api.get<FinanceData>('/admin/finance');
    setData(r);
  }
  useEffect(() => {
    load();
  }, []);

  async function saveSessions(id: number, count: number | null) {
    try {
      await api.patch(`/admin/courses/${id}/sessions`, { count });
      toast(count === null ? '출석부 자동 집계로 복원했습니다.' : `회차를 ${count}회로 설정했습니다.`, 'success');
      setEditId(null);
      load();
    } catch {
      toast('회차 저장에 실패했습니다.', 'error');
    }
  }

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
            수강료 수입과 강사료(회당 단가 × 회차)를 집계합니다. 회차는 기본적으로 계획 차시 전부 실시 기준입니다.
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
                  <td className="td text-center">
                    {editId === r.id ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          autoFocus
                          className="input w-16 px-2 py-1 text-center text-xs"
                          value={editVal}
                          onChange={(e) => setEditVal(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveSessions(r.id, Number(editVal))}
                        />
                        <button className="btn-primary btn-sm" onClick={() => saveSessions(r.id, Number(editVal))}>저장</button>
                        {r.session_source === 'manual' && (
                          <button className="btn-ghost btn-sm" title="계획 차시/출석부 기준으로 복원" onClick={() => saveSessions(r.id, null)}>복원</button>
                        )}
                        <button className="btn-ghost btn-sm" onClick={() => setEditId(null)}>✕</button>
                      </span>
                    ) : (
                      <button
                        className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 hover:bg-slate-100"
                        title="클릭하여 회차 직접 입력"
                        onClick={() => {
                          setEditId(r.id);
                          setEditVal(String(r.session_count));
                        }}
                      >
                        <span className="font-medium">{r.session_count}</span>
                        <span className={`badge ${SOURCE_STYLE[r.session_source]}`}>
                          {SOURCE_LABEL[r.session_source]}
                        </span>
                      </button>
                    )}
                  </td>
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
        💡 회차는 기본적으로 <b>계획 차시를 모두 실시한 것으로 계산</b>합니다 (계획 뱃지).
        보강·결강 등으로 실제 회차가 다르면 숫자를 <b>클릭해서 직접 입력</b>하세요 (수동이 항상 우선, 복원 가능).
        회당 강사료가 <b>미책정</b>인 강좌는 강좌 관리 → 수정에서 단가를 입력하세요.
      </div>
    </div>
  );
}
