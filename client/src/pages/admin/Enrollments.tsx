import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { Spinner, EmptyState, CategoryBadge } from '../../components/ui';
import { Icons } from '../../components/icons';
import { enrollStatusLabel } from '../../lib/format';
import { useToast } from '../../context/ToastContext';

interface Row {
  id: number;
  status: string;
  created_at: string;
  student_name: string;
  grade: number;
  class_no: number;
  student_no: number;
  course_title: string;
  category: string;
  course_id: number;
}

export default function AdminEnrollments() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  async function load() {
    const r = await api.get<{ enrollments: Row[] }>('/admin/enrollments');
    setRows(r.enrollments);
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (q) {
        const s = q.toLowerCase();
        return (
          r.student_name.toLowerCase().includes(s) ||
          r.course_title.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [rows, q, status]);

  async function cancel(r: Row) {
    if (!confirm(`${r.student_name} 학생의 '${r.course_title}' 신청을 취소하시겠습니까?`)) return;
    await api.del(`/admin/enrollments/${r.id}`);
    toast('신청이 취소되었습니다.', 'success');
    load();
  }

  function exportCsv() {
    const header = ['학생', '학년', '반', '번호', '강좌', '교과', '상태', '신청일시'];
    const lines = filtered.map((r) =>
      [r.student_name, r.grade, r.class_no, r.student_no, r.course_title, r.category, enrollStatusLabel(r.status), r.created_at].join(',')
    );
    const csv = '﻿' + [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `수강신청현황_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!rows) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">수강신청 현황</h1>
          <p className="text-sm text-slate-500">전체 수강신청 내역을 조회하고 관리합니다.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => window.open('/admin/print/enrollments', '_blank')}>
            <Icons.printer size={16} /> 인쇄
          </button>
          <button className="btn-secondary" onClick={exportCsv}>
            <Icons.download size={16} /> 엑셀(CSV)
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input w-56" placeholder="학생/강좌 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">전체 상태</option>
          <option value="enrolled">수강확정</option>
          <option value="waitlisted">대기</option>
        </select>
        <div className="ml-auto flex items-center text-sm text-slate-500">총 {filtered.length}건</div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="수강신청 내역이 없습니다." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th">학생</th>
                  <th className="th">학년/반/번호</th>
                  <th className="th">강좌</th>
                  <th className="th">상태</th>
                  <th className="th">신청일시</th>
                  <th className="th text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="td font-medium">{r.student_name}</td>
                    <td className="td">{r.grade}학년 {r.class_no}반 {r.student_no}번</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <CategoryBadge category={r.category} />
                        {r.course_title}
                      </div>
                    </td>
                    <td className="td">
                      <span className={`badge ${r.status === 'enrolled' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {enrollStatusLabel(r.status)}
                      </span>
                    </td>
                    <td className="td text-slate-500">{r.created_at}</td>
                    <td className="td text-right">
                      <button className="btn-ghost btn-sm text-rose-600" onClick={() => cancel(r)}>취소</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
