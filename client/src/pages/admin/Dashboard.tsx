import { useEffect, useState } from 'react';
import { api, Course } from '../../lib/api';
import { CategoryBadge, PageHeader, StatBand } from '../../components/ui';
import { Icons } from '../../components/icons';
import { targetGradeLabel } from '../../lib/format';

interface Stats {
  counts: {
    students: number;
    teachers: number;
    courses: number;
    open_courses: number;
    enrollments: number;
  };
  byCategory: { category: string; count: number }[];
  popularCourses: Course[];
}

function DashboardSkeleton() {
  return (
    <div>
      <div className="skeleton mb-2 h-8 w-52" />
      <div className="skeleton mb-6 h-4 w-72" />
      <div className="card grid grid-cols-2 divide-slate-100 lg:grid-cols-4 lg:divide-x">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 p-6">
            <div className="skeleton h-4 w-16" />
            <div className="skeleton h-8 w-24" />
            <div className="skeleton h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="card space-y-4 p-6 lg:col-span-3">
          <div className="skeleton h-5 w-32" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton h-9 w-full" />
          ))}
        </div>
        <div className="card space-y-4 p-6 lg:col-span-2">
          <div className="skeleton h-5 w-40" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<Stats | null>(null);

  useEffect(() => {
    api.get<Stats>('/admin/stats').then(setData);
  }, []);

  if (!data) return <DashboardSkeleton />;
  const { counts, byCategory, popularCourses } = data;

  const totalByCategory = byCategory.reduce((s, c) => s + c.count, 0);
  const maxCat = Math.max(1, ...byCategory.map((c) => c.count));
  const totalCapacity = popularCourses.reduce((s, c) => s + c.capacity, 0);
  const totalFilled = popularCourses.reduce((s, c) => s + c.enrolled_count, 0);
  const fillRate = totalCapacity === 0 ? 0 : Math.round((totalFilled / totalCapacity) * 100);

  const stats = [
    {
      label: '수강 학생',
      value: counts.students,
      unit: '명',
      sub: `강사 ${counts.teachers}명 배정`,
      icon: <Icons.users size={18} />,
    },
    {
      label: '개설 강좌',
      value: counts.open_courses,
      unit: `/ ${counts.courses}개`,
      sub: counts.courses === counts.open_courses ? '전 강좌 모집 중' : `${counts.courses - counts.open_courses}개 마감·폐강`,
      icon: <Icons.book size={18} />,
    },
    {
      label: '총 수강신청',
      value: counts.enrollments,
      unit: '건',
      sub: `학생 1인당 평균 ${counts.students === 0 ? 0 : (counts.enrollments / counts.students).toFixed(1)}건`,
      icon: <Icons.clipboard size={18} />,
    },
    {
      label: '좌석 충원률',
      value: fillRate,
      unit: '%',
      sub: `${totalFilled} / ${totalCapacity}석 채움`,
      icon: <Icons.calendar size={18} />,
    },
  ];

  return (
    <div>
      <PageHeader title="관리자 대시보드" sub="2026학년도 1학기 방과후학교 운영 현황입니다." />

      <StatBand items={stats} className="anim-fade-up anim-delay-1" />

      {/* 비대칭 3:2 그리드 */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* 교과별 수강 인원 */}
        <div className="anim-fade-up anim-delay-2 card p-6 lg:col-span-3">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-base font-bold text-slate-900">교과별 수강 인원</h2>
            <span className="text-xs text-slate-400 [font-variant-numeric:tabular-nums]">총 {totalByCategory}명</span>
          </div>
          <div className="space-y-4">
            {byCategory.map((c) => {
              const share = totalByCategory === 0 ? 0 : Math.round((c.count / totalByCategory) * 100);
              const empty = c.count === 0;
              return (
                <div key={c.category} className={empty ? 'opacity-45' : ''}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <CategoryBadge category={c.category} />
                    <span className="text-slate-600 [font-variant-numeric:tabular-nums]">
                      <strong className="font-semibold text-slate-800">{c.count}명</strong>
                      <span className="ml-1.5 text-xs text-slate-400">{share}%</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-500"
                      style={{ width: `${(c.count / maxCat) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {byCategory.length === 0 && <p className="text-sm text-slate-400">데이터가 없습니다.</p>}
          </div>
        </div>

        {/* 인기 강좌 */}
        <div className="anim-fade-up anim-delay-3 card p-6 lg:col-span-2">
          <h2 className="mb-5 text-base font-bold text-slate-900">인기 강좌 (신청률 순)</h2>
          <ol className="space-y-1">
            {popularCourses.map((c, i) => {
              const pct = c.capacity === 0 ? 0 : Math.round((c.enrolled_count / c.capacity) * 100);
              const full = pct >= 100;
              return (
                <li
                  key={c.id}
                  className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-slate-50"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                      i === 0 ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-800">{c.title}</p>
                      <span className="shrink-0 text-xs text-slate-400">{targetGradeLabel(c.target_grade)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${full ? 'bg-rose-500' : 'bg-brand-500'}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs text-slate-500 [font-variant-numeric:tabular-nums]">
                        {full ? '마감' : `${c.enrolled_count}/${c.capacity}`}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {popularCourses.length === 0 && <p className="text-sm text-slate-400">개설된 강좌가 없습니다.</p>}
        </div>
      </div>
    </div>
  );
}
