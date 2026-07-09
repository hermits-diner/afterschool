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

export interface CalcInputs {
  total_sessions: number;   // 총차시
  course_count: number;     // 총강좌수
  pay_per_session: number;  // 차시당 책정강사료
  operating_cost: number;   // 수용비
  subsidy: number;          // 교육청지원금
}

// 교육청 지원액이 학년군별로 달라 1·2학년/3학년을 분리해 계산한다.
export type CalcGroupKey = 'g12' | 'g3';

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
  calc: Partial<Record<CalcGroupKey, CalcInputs | null>> | null;
  enrollTotals: Record<CalcGroupKey, number>; // 학년군별 학생 개별 수강수의 합 (수강확정 기준)
}

const won = (n: number) => `${n.toLocaleString()}원`;

// 총수강료 = 총차시 × 총강좌수 × 차시당 책정강사료 + 수용비
export const calcTotalFee = (c: CalcInputs) =>
  c.total_sessions * c.course_count * c.pay_per_session + c.operating_cost;
// 1과목 수강료 = (총수강료 − 교육청지원금) ÷ 학생 개별 수강수의 합
export const calcPerCourseFee = (c: CalcInputs, enrollTotal: number) =>
  enrollTotal > 0 ? Math.round((calcTotalFee(c) - c.subsidy) / enrollTotal) : 0;

const emptyCalc: CalcInputs = { total_sessions: 0, course_count: 0, pay_per_session: 0, operating_cost: 0, subsidy: 0 };
const CALC_GROUPS: { key: CalcGroupKey; label: string }[] = [
  { key: 'g12', label: '1·2학년' },
  { key: 'g3', label: '3학년' },
];

export default function AdminFinance() {
  const toast = useToast();
  const [data, setData] = useState<FinanceData | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [calc, setCalc] = useState<Record<CalcGroupKey, CalcInputs>>({ g12: emptyCalc, g3: emptyCalc });
  const [calcSaving, setCalcSaving] = useState(false);

  async function load() {
    const r = await api.get<FinanceData>('/admin/finance');
    setData(r);
    setCalc({ g12: r.calc?.g12 ?? emptyCalc, g3: r.calc?.g3 ?? emptyCalc });
  }
  useEffect(() => {
    load();
  }, []);

  async function saveCalc() {
    setCalcSaving(true);
    try {
      await api.put('/admin/finance/calc', calc);
      toast('총수강료 계산 입력값이 저장되었습니다.', 'success');
    } catch {
      toast('저장에 실패했습니다.', 'error');
    } finally {
      setCalcSaving(false);
    }
  }

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

      {/* ---------- 총수강료 · 1과목 수강료 계산 (학년군별) ---------- */}
      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">방과후학교 총수강료 계산 — 1·2학년 / 3학년 분리</h2>
          <p className="text-sm text-slate-500">
            <b>총수강료 = (총차시 × 총강좌수 × 차시당 책정강사료) + 수용비</b> ·{' '}
            <b>1과목 수강료 = (총수강료 − 교육청지원금) ÷ 학생 개별 수강수의 합</b>
            <br />교육청 지원액이 학년군별로 달라 따로 계산합니다. 입력값은 세션별로 저장되며,
            수강수의 합은 해당 학년 학생의 수강확정 건수에서 자동 집계됩니다.
          </p>
        </div>
        <button className="btn-primary" onClick={saveCalc} disabled={calcSaving}>
          {calcSaving ? '저장 중...' : '입력값 저장'}
        </button>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {CALC_GROUPS.map(({ key, label }) => {
          const c = calc[key];
          const enrollTotal = data.enrollTotals[key];
          const set = (patch: Partial<CalcInputs>) => setCalc({ ...calc, [key]: { ...c, ...patch } });
          return (
            <div key={key} className="card p-5">
              <h3 className="mb-3 font-bold text-slate-800">
                {label}
                <span className="ml-2 text-sm font-normal text-slate-500">
                  수강수의 합 <b className="text-slate-700">{enrollTotal}건</b>
                  <span className="ml-1 text-xs text-slate-400">(수강확정 자동 집계)</span>
                </span>
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div>
                  <label className="label">총차시</label>
                  <input
                    type="number" min={0} className="input" value={c.total_sessions}
                    onChange={(e) => set({ total_sessions: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label">총강좌수</label>
                  <input
                    type="number" min={0} className="input" value={c.course_count}
                    onChange={(e) => set({ course_count: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label">차시당 강사료(원)</label>
                  <input
                    type="number" min={0} step={1000} className="input" value={c.pay_per_session}
                    onChange={(e) => set({ pay_per_session: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label">수용비(원)</label>
                  <input
                    type="number" min={0} step={1000} className="input" value={c.operating_cost}
                    onChange={(e) => set({ operating_cost: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label">교육청지원금(원)</label>
                  <input
                    type="number" min={0} step={1000} className="input" value={c.subsidy}
                    onChange={(e) => set({ subsidy: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="mt-4 space-y-1 rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <div className="text-slate-500">
                  총수강료 <b className="ml-1 text-base text-slate-900">{won(calcTotalFee(c))}</b>
                  <span className="ml-1.5 text-xs text-slate-400">
                    = {c.total_sessions} × {c.course_count} × {won(c.pay_per_session)} + {won(c.operating_cost)}
                  </span>
                </div>
                <div className="text-slate-500">
                  1과목 수강료{' '}
                  {enrollTotal > 0 ? (
                    <b className="ml-1 text-base text-brand-700">{won(calcPerCourseFee(c, enrollTotal))}</b>
                  ) : (
                    <span className="ml-1 text-xs text-amber-600">수강확정 인원이 없어 계산할 수 없습니다</span>
                  )}
                  <span className="ml-1.5 text-xs text-slate-400">
                    = ({won(calcTotalFee(c))} − {won(c.subsidy)}) ÷ {enrollTotal}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
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
