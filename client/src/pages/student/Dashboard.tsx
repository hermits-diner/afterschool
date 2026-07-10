import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Course } from '../../lib/api';
import { EmptyState, CategoryBadge, EnrollBadge, PageHeader, StatBand, CardGridSkeleton } from '../../components/ui';
import { Icons } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { courseDisplayTitle } from '../../lib/format';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [mine, setMine] = useState<Course[] | null>(null);

  useEffect(() => {
    api.get<{ courses: Course[] }>('/enrollments/mine').then((r) => setMine(r.courses));
  }, []);

  if (!mine) {
    return (
      <div>
        <div className="skeleton mb-2 h-8 w-64" />
        <div className="skeleton mb-6 h-4 w-80" />
        <CardGridSkeleton count={4} />
      </div>
    );
  }

  const enrolled = mine.filter((c) => c.enrollment_status === 'enrolled');
  const weeklySlots = enrolled.reduce((sum, c) => sum + (c.schedule?.length || 0), 0);

  return (
    <div>
      <PageHeader
        title={`${user?.name} 학생, 안녕하세요 👋`}
        sub={`${user?.grade}학년 ${user?.class_no}반 · 나의 방과후학교 수강 현황입니다.`}
      />

      <StatBand
        className="anim-fade-up anim-delay-1"
        items={[
          {
            label: '수강 확정',
            value: enrolled.length,
            unit: '과목',
            sub: enrolled.length === 0 ? '아직 확정된 강좌가 없습니다' : '이번 학기 신청 기준',
            icon: <Icons.book size={18} />,
          },
          {
            label: '주간 수업',
            value: weeklySlots,
            unit: '회',
            sub: '수강 확정 강좌 기준',
            icon: <Icons.chart size={18} />,
          },
        ]}
      />

      <div className="anim-fade-up anim-delay-2 mt-8 flex items-baseline justify-between">
        <h2 className="text-base font-bold text-slate-900">신청한 강좌</h2>
        <Link to="/student/catalog" className="text-sm font-medium text-brand-600 hover:underline">
          강좌 더 신청하기 →
        </Link>
      </div>

      <div className="anim-fade-up anim-delay-2 mt-3">
        {mine.length === 0 ? (
          <EmptyState message="아직 신청한 강좌가 없습니다." sub="강좌 신청 메뉴에서 원하는 방과후학교 강좌를 신청해 보세요." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {mine.map((c) => (
              <div key={c.id} className="card flex items-center gap-4 p-4 transition-colors hover:bg-slate-50/60">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <CategoryBadge category={c.category} />
                    <EnrollBadge status={c.enrollment_status} />
                  </div>
                  <h3 className="truncate font-semibold text-slate-900">{courseDisplayTitle(c)}</h3>
                  <p className="text-sm text-slate-500">
                    {c.schedule_label} · {c.room} · {c.teacher_name}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
