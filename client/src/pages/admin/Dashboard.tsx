import { useEffect, useState } from 'react';
import { api, Course } from '../../lib/api';
import { Stat, Spinner, ProgressBar, CategoryBadge } from '../../components/ui';
import { Icons } from '../../components/icons';
import { targetGradeLabel } from '../../lib/format';

interface Stats {
  counts: {
    students: number;
    teachers: number;
    courses: number;
    open_courses: number;
    enrollments: number;
    waitlisted: number;
  };
  byCategory: { category: string; count: number }[];
  popularCourses: Course[];
}

export default function AdminDashboard() {
  const [data, setData] = useState<Stats | null>(null);

  useEffect(() => {
    api.get<Stats>('/admin/stats').then(setData);
  }, []);

  if (!data) return <Spinner />;
  const { counts, byCategory, popularCourses } = data;
  const maxCat = Math.max(1, ...byCategory.map((c) => c.count));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">관리자 대시보드</h1>
      <p className="mb-6 text-sm text-slate-500">2026학년도 1학기 방과후학교 운영 현황입니다.</p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="수강 학생" value={`${counts.students}명`} icon={<Icons.users size={22} />} />
        <Stat label="강사" value={`${counts.teachers}명`} accent="bg-emerald-50 text-emerald-600" icon={<Icons.users size={22} />} />
        <Stat label="개설 강좌" value={`${counts.open_courses} / ${counts.courses}`} accent="bg-violet-50 text-violet-600" icon={<Icons.book size={22} />} />
        <Stat label="총 수강신청" value={`${counts.enrollments}건`} accent="bg-amber-50 text-amber-600" icon={<Icons.clipboard size={22} />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Category distribution */}
        <div className="card p-6">
          <h2 className="mb-4 text-base font-bold text-slate-900">교과별 수강 인원</h2>
          <div className="space-y-3">
            {byCategory.map((c) => (
              <div key={c.category}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <CategoryBadge category={c.category} />
                  <span className="font-semibold text-slate-700">{c.count}명</span>
                </div>
                <ProgressBar value={c.count} max={maxCat} />
              </div>
            ))}
            {byCategory.length === 0 && <p className="text-sm text-slate-400">데이터가 없습니다.</p>}
          </div>
          {counts.waitlisted > 0 && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              현재 대기 인원 {counts.waitlisted}명 · 정원 초과 강좌가 있습니다.
            </p>
          )}
        </div>

        {/* Popular courses */}
        <div className="card p-6">
          <h2 className="mb-4 text-base font-bold text-slate-900">인기 강좌 (신청률 순)</h2>
          <div className="space-y-4">
            {popularCourses.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm font-semibold text-slate-800">{c.title}</p>
                    <span className="ml-2 shrink-0 text-xs text-slate-500">
                      {c.enrolled_count}/{c.capacity}
                    </span>
                  </div>
                  <div className="mt-1">
                    <ProgressBar value={c.enrolled_count} max={c.capacity} />
                  </div>
                </div>
                <span className="w-16 shrink-0 text-right text-xs text-slate-400">
                  {targetGradeLabel(c.target_grade)}
                </span>
              </div>
            ))}
            {popularCourses.length === 0 && <p className="text-sm text-slate-400">개설된 강좌가 없습니다.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
