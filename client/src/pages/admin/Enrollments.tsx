import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { TableSkeleton, EmptyState, CategoryBadge, EnrollBadge } from '../../components/ui';
import { Icons } from '../../components/icons';
import { courseDisplayTitle, enrollStatusLabel, studentLabel } from '../../lib/format';
import { useToast } from '../../context/ToastContext';
import { downloadCsv } from '../../lib/csv';

export interface EnrollmentRow {
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
  group_name?: string | null;
}

// 교과군 포함 강좌 표시명 (예: [A유형] 문학의 밤)
export const rowTitle = (r: EnrollmentRow) => courseDisplayTitle({ title: r.course_title, group_name: r.group_name });

export default function AdminEnrollments() {
  const toast = useToast();
  const [rows, setRows] = useState<EnrollmentRow[] | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  async function load() {
    const r = await api.get<{ enrollments: EnrollmentRow[] }>('/admin/enrollments');
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
          rowTitle(r).toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [rows, q, status]);

  async function cancel(r: EnrollmentRow) {
    if (!confirm(`${r.student_name} 학생의 '${rowTitle(r)}' 신청을 취소하시겠습니까?`)) return;
    await api.del(`/admin/enrollments/${r.id}`);
    toast('신청이 취소되었습니다.', 'success');
    load();
  }

  function exportCsv() {
    downloadCsv(
      `수강신청현황_${new Date().toISOString().slice(0, 10)}.csv`,
      ['학생', '학년', '반', '번호', '강좌', '교과', '상태', '신청일시'],
      filtered.map((r) => [r.student_name, r.grade, r.class_no, r.student_no, rowTitle(r), r.category, enrollStatusLabel(r.status), r.created_at])
    );
  }

  if (!rows) return <TableSkeleton />;

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
                    <td className="td">{studentLabel(r.grade, r.class_no, r.student_no)}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <CategoryBadge category={r.category} />
                        {rowTitle(r)}
                      </div>
                    </td>
                    <td className="td"><EnrollBadge status={r.status} /></td>
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
