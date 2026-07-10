import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { TableSkeleton, EmptyState } from '../../components/ui';
import { Icons } from '../../components/icons';
import { courseTeacherLabel, studentLabel } from '../../lib/format';

export interface CancelledStudent {
  student_id: number;
  name: string;
  grade: number;
  class_no: number;
  student_no: number;
  courses: {
    title: string;
    category: string;
    teacher_name: string;
    group_name: string | null;
  }[];
}

// 폐강 강좌를 신청했던 학생 — 추가 신청 안내 대상. 전체/반별 목록 + 인쇄.
export default function AdminCancelled() {
  const [students, setStudents] = useState<CancelledStudent[] | null>(null);
  const [view, setView] = useState<string>('all'); // 'all' | '1-1' ...

  useEffect(() => {
    api.get<{ students: CancelledStudent[] }>('/admin/cancelled-enrollments').then((r) => setStudents(r.students));
  }, []);

  if (!students) return <TableSkeleton />;

  // 반 목록 (학생이 있는 반만)
  const classKeys = [...new Set(students.map((s) => `${s.grade}-${s.class_no}`))].sort();
  const shown = view === 'all' ? students : students.filter((s) => `${s.grade}-${s.class_no}` === view);
  const printPath = view === 'all' ? '/admin/print/cancelled/all/all' : `/admin/print/cancelled/${view.split('-')[0]}/${view.split('-')[1]}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">폐강 재신청 대상</h1>
          <p className="text-sm text-slate-500">
            폐강된 강좌를 신청했던 학생 목록입니다. 폐강 신청분은 신청 한도에서 제외되어 바로 추가 신청할 수 있습니다.
          </p>
        </div>
        <button className="btn-primary" onClick={() => window.open(printPath, '_blank')}>
          <Icons.printer size={16} /> {view === 'all' ? '전체 인쇄' : `${view.split('-')[0]}학년 ${view.split('-')[1]}반 인쇄`}
        </button>
      </div>

      {students.length === 0 ? (
        <EmptyState message="폐강 강좌를 신청한 학생이 없습니다." sub="강좌가 폐강되면 해당 신청 학생이 여기에 표시됩니다." />
      ) : (
        <>
          {/* 전체/반별 선택 */}
          <div className="mb-5 flex flex-wrap gap-2">
            <button
              onClick={() => setView('all')}
              className={`rounded-lg border-2 px-3 py-1.5 text-sm font-semibold transition ${
                view === 'all' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              전체 ({students.length}명)
            </button>
            {classKeys.map((key) => {
              const [g, c] = key.split('-');
              const count = students.filter((s) => `${s.grade}-${s.class_no}` === key).length;
              return (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className={`rounded-lg border-2 px-3 py-1.5 text-sm font-semibold transition ${
                    view === key ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {g}학년 {c}반 ({count})
                </button>
              );
            })}
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="th w-28">학번</th>
                    <th className="th w-32">이름</th>
                    <th className="th">폐강된 신청 강좌</th>
                    <th className="th w-24 text-center">건수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((s) => (
                    <tr key={s.student_id} className="hover:bg-slate-50">
                      <td className="td">{studentLabel(s.grade, s.class_no, s.student_no)}</td>
                      <td className="td font-medium">{s.name}</td>
                      <td className="td">
                        <div className="flex flex-wrap gap-1">
                          {s.courses.map((c, i) => (
                            <span key={i} className="badge bg-rose-100 text-rose-700">
                              {courseTeacherLabel(c)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="td text-center font-semibold">{s.courses.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
