import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Course, ApiError } from '../../lib/api';
import { Spinner, EmptyState, CategoryBadge, EnrollBadge } from '../../components/ui';
import { formatFee } from '../../lib/format';
import { useToast } from '../../context/ToastContext';

export default function StudentMyCourses() {
  const toast = useToast();
  const [mine, setMine] = useState<Course[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  async function load() {
    const r = await api.get<{ courses: Course[] }>('/enrollments/mine');
    setMine(r.courses);
  }
  useEffect(() => {
    load();
  }, []);

  async function cancel(c: Course) {
    if (!confirm(`'${c.title}' 수강신청을 취소하시겠습니까?`)) return;
    setBusy(c.id);
    try {
      await api.del(`/enrollments/${c.id}`);
      toast('수강신청이 취소되었습니다.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '취소에 실패했습니다.', 'error');
    } finally {
      setBusy(null);
    }
  }

  if (!mine) return <Spinner />;
  const totalFee = mine.filter((c) => c.enrollment_status === 'enrolled').reduce((s, c) => s + c.fee, 0);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">내 수강신청</h1>
      <p className="mb-6 text-sm text-slate-500">신청한 강좌를 확인하고 취소할 수 있습니다.</p>

      {mine.length === 0 ? (
        <EmptyState message="신청한 강좌가 없습니다." sub="강좌 신청 메뉴에서 방과후 강좌를 신청해 보세요." />
      ) : (
        <>
          <div className="card mb-4 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="th">강좌</th>
                    <th className="th">강사</th>
                    <th className="th">시간</th>
                    <th className="th">수강료</th>
                    <th className="th">상태</th>
                    <th className="th text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mine.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <CategoryBadge category={c.category} />
                          <span className="font-semibold text-slate-800">{c.title}</span>
                        </div>
                      </td>
                      <td className="td">{c.teacher_name}</td>
                      <td className="td whitespace-nowrap">{c.schedule_label}</td>
                      <td className="td">{formatFee(c.fee)}</td>
                      <td className="td"><EnrollBadge status={c.enrollment_status} /></td>
                      <td className="td text-right">
                        <button className="btn-ghost btn-sm text-rose-600" onClick={() => cancel(c)} disabled={busy === c.id}>취소</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3 text-sm">
            <span className="text-brand-700">총 {mine.length}개 강좌 신청 · 수강료 합계 <b>{formatFee(totalFee)}</b></span>
            <Link to="/student/timetable" className="font-medium text-brand-600 hover:underline">시간표 보기 →</Link>
          </div>
        </>
      )}
    </div>
  );
}
