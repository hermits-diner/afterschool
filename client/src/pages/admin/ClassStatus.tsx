import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { TableSkeleton, EmptyState } from '../../components/ui';
import { Icons } from '../../components/icons';

export interface ClassStudent {
  id: number;
  name: string;
  grade: number;
  class_no: number;
  student_no: number;
  enrollments: {
    title: string;
    status: 'enrolled';
    teacher_name?: string;
    group_name?: string | null;
  }[];
}

// '강좌명 · 교과군 · 강사' 표기
export function enrollmentLabel(e: ClassStudent['enrollments'][number]) {
  return [e.title, e.group_name, e.teacher_name].filter(Boolean).join(' · ');
}

export interface ClassInfo {
  grade: number;
  class_no: number;
  students: ClassStudent[];
}

export default function AdminClassStatus() {
  const [classes, setClasses] = useState<ClassInfo[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ classes: ClassInfo[] }>('/admin/class-status').then((r) => {
      setClasses(r.classes);
      if (r.classes.length) setSelected(`${r.classes[0].grade}-${r.classes[0].class_no}`);
    });
  }, []);

  if (!classes) return <TableSkeleton />;

  const current = classes.find((c) => `${c.grade}-${c.class_no}` === selected);
  const applied = (s: ClassStudent) => s.enrollments.length > 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">반별 신청 현황</h1>
          <p className="text-sm text-slate-500">학급별로 학생들의 수강신청 상황과 미신청자를 확인합니다.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => window.open('/admin/print/class/all/all', '_blank')}>
            <Icons.printer size={16} /> 전체 반 인쇄
          </button>
          {current && (
            <button
              className="btn-primary"
              onClick={() => window.open(`/admin/print/class/${current.grade}/${current.class_no}`, '_blank')}
            >
              <Icons.printer size={16} /> {current.grade}학년 {current.class_no}반 인쇄
            </button>
          )}
        </div>
      </div>

      {classes.length === 0 ? (
        <EmptyState message="등록된 학생이 없습니다." />
      ) : (
        <>
          {/* 반 선택 카드 */}
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {classes.map((c) => {
              const key = `${c.grade}-${c.class_no}`;
              const done = c.students.filter(applied).length;
              const active = key === selected;
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`rounded-xl border-2 p-3 text-left transition ${
                    active ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className={`text-sm font-bold ${active ? 'text-brand-700' : 'text-slate-800'}`}>
                    {c.grade}학년 {c.class_no}반
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    신청 {done}/{c.students.length}명
                    {done < c.students.length && (
                      <span className="ml-1 font-semibold text-rose-600">미신청 {c.students.length - done}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 선택한 반 상세 */}
          {current && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm">
                <span className="font-semibold text-slate-700">
                  {current.grade}학년 {current.class_no}반 · 재적 {current.students.length}명
                </span>
                <span className="text-slate-500">
                  신청 완료 <b className="text-emerald-600">{current.students.filter(applied).length}명</b> · 미신청{' '}
                  <b className="text-rose-600">{current.students.filter((s) => !applied(s)).length}명</b>
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="th w-16">번호</th>
                      <th className="th w-32">이름</th>
                      <th className="th">신청 강좌</th>
                      <th className="th w-24 text-center">신청 수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {current.students.map((s) => (
                      <tr key={s.id} className={applied(s) ? 'hover:bg-slate-50' : 'bg-rose-50/60 hover:bg-rose-50'}>
                        <td className="td">{s.student_no}</td>
                        <td className="td font-medium">{s.name}</td>
                        <td className="td">
                          {s.enrollments.length === 0 ? (
                            <span className="badge bg-rose-100 text-rose-600">미신청</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {s.enrollments.map((e, i) => (
                                <span key={i} className="badge bg-emerald-100 text-emerald-700">
                                  {enrollmentLabel(e)}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="td text-center font-semibold">{s.enrollments.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
