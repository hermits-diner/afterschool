import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, Course } from '../../lib/api';
import { Spinner, EmptyState, CategoryBadge } from '../../components/ui';
import { Icons } from '../../components/icons';
import { studentLabel } from '../../lib/format';

export default function TeacherRoster() {
  const location = useLocation() as any;
  const [courses, setCourses] = useState<Course[]>([]);
  const [selected, setSelected] = useState<number | null>(location.state?.courseId ?? null);
  const [roster, setRoster] = useState<any[] | null>(null);
  const [course, setCourse] = useState<Course | null>(null);

  useEffect(() => {
    api.get<{ courses: Course[] }>('/teacher/courses').then((r) => {
      setCourses(r.courses);
      if (!selected && r.courses.length) setSelected(r.courses[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    setRoster(null);
    api.get<{ course: Course; roster: any[] }>(`/teacher/courses/${selected}/roster`).then((r) => {
      setRoster(r.roster);
      setCourse(r.course);
    });
  }, [selected]);

  const enrolled = roster?.filter((r) => r.status === 'enrolled') || [];
  const waitlisted = roster?.filter((r) => r.status === 'waitlisted') || [];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">수강생 명단</h1>
      <p className="mb-6 text-sm text-slate-500">강좌별 수강생 명단과 연락처를 확인합니다.</p>

      {courses.length === 0 ? (
        <EmptyState message="배정된 강좌가 없습니다." />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {courses.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  selected === c.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {c.title}
              </button>
            ))}
          </div>

          {!roster ? (
            <Spinner />
          ) : (
            <div className="space-y-6">
              {course && (
                <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
                  <div className="flex items-center gap-2">
                    <CategoryBadge category={course.category} />
                    <span className="font-bold text-slate-800">{course.title}</span>
                  </div>
                  <span className="text-slate-500">{course.day_of_week} {course.start_time}~{course.end_time}</span>
                  <span className="text-slate-500">{course.room}</span>
                  <span className="font-semibold text-slate-700">수강 {enrolled.length}명 · 대기 {waitlisted.length}명</span>
                  <button
                    className="btn-secondary btn-sm ml-auto"
                    onClick={() => window.open(`/teacher/print/roster/${course.id}`, '_blank')}
                  >
                    <Icons.printer size={14} /> 명렬표 인쇄
                  </button>
                </div>
              )}

              <RosterTable title="수강 확정" rows={enrolled} showContact />
              {waitlisted.length > 0 && <RosterTable title="대기자" rows={waitlisted} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RosterTable({ title, rows, showContact }: { title: string; rows: any[]; showContact?: boolean }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700">
        {title} ({rows.length}명)
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">해당 학생이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th w-16">No.</th>
                <th className="th">이름</th>
                <th className="th">학년/반/번호</th>
                {showContact && <th className="th">연락처</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={r.student_id} className="hover:bg-slate-50">
                  <td className="td text-slate-400">{i + 1}</td>
                  <td className="td font-medium">{r.name}</td>
                  <td className="td">{studentLabel(r.grade, r.class_no, r.student_no)}</td>
                  {showContact && <td className="td text-slate-500">{r.phone || '-'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
