import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Course } from '../../lib/api';
import { EmptyState, ProgressBar, CategoryBadge, PageHeader, StatBand, CardGridSkeleton } from '../../components/ui';
import { Icons } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<{ courseCount: number; totalStudents: number; courses: Course[] } | null>(null);

  useEffect(() => {
    api.get<any>('/teacher/summary').then(setSummary);
  }, []);

  if (!summary) {
    return (
      <div>
        <div className="skeleton mb-2 h-8 w-64" />
        <div className="skeleton mb-6 h-4 w-80" />
        <CardGridSkeleton count={3} />
      </div>
    );
  }

  const totalCapacity = summary.courses.reduce((s, c) => s + c.capacity, 0);
  const totalFilled = summary.courses.reduce((s, c) => s + c.enrolled_count, 0);
  const fillRate = totalCapacity === 0 ? 0 : Math.round((totalFilled / totalCapacity) * 100);

  return (
    <div>
      <PageHeader
        title={`${user?.name} 강사님, 환영합니다 👋`}
        sub="담당 강좌와 수강생 현황을 확인하세요."
      />

      <StatBand
        className="anim-fade-up anim-delay-1"
        items={[
          {
            label: '담당 강좌',
            value: summary.courseCount,
            unit: '개',
            sub: user?.subject_area ? `${user.subject_area} 담당` : '이번 학기 개설',
            icon: <Icons.book size={18} />,
          },
          {
            label: '총 수강생',
            value: summary.totalStudents,
            unit: '명',
            sub: `좌석 충원률 ${fillRate}% (${totalFilled}/${totalCapacity}석)`,
            icon: <Icons.users size={18} />,
          },
        ]}
      />

      <div className="anim-fade-up anim-delay-2 mb-3 mt-8 flex items-baseline justify-between">
        <h2 className="text-base font-bold text-slate-900">담당 강좌</h2>
        <Link to="/teacher/courses" className="text-sm font-medium text-brand-600 hover:underline">
          내 강좌 관리 →
        </Link>
      </div>
      {summary.courses.length === 0 ? (
        <EmptyState message="담당 강좌가 없습니다." sub="'내 강좌' 메뉴에서 강좌를 직접 개설할 수 있습니다." />
      ) : (
        <div className="anim-fade-up anim-delay-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summary.courses.map((c) => {
            const full = c.capacity > 0 && c.enrolled_count >= c.capacity;
            return (
              <Link
                key={c.id}
                to="/teacher/roster"
                state={{ courseId: c.id }}
                className="card group p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft"
              >
                <div className="mb-2 flex items-center justify-between">
                  <CategoryBadge category={c.category} />
                  <span className="text-xs text-slate-400">
                    {c.day_of_week} {c.start_time}
                  </span>
                </div>
                <h3 className="mb-3 font-bold text-slate-900 transition-colors group-hover:text-brand-700">{c.title}</h3>
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>수강 인원</span>
                  <span className="font-semibold text-slate-700 [font-variant-numeric:tabular-nums]">
                    {full ? '마감 · ' : ''}
                    {c.enrolled_count}/{c.capacity}명
                  </span>
                </div>
                <ProgressBar value={c.enrolled_count} max={c.capacity} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
