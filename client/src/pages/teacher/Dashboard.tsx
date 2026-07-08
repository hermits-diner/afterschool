import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Course } from '../../lib/api';
import { Stat, Spinner, EmptyState, ProgressBar, CategoryBadge } from '../../components/ui';
import { Icons } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<{ courseCount: number; totalStudents: number; courses: Course[] } | null>(null);

  useEffect(() => {
    api.get<any>('/teacher/summary').then(setSummary);
  }, []);

  if (!summary) return <Spinner />;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">{user?.name} 강사님, 환영합니다 👋</h1>
      <p className="mb-6 text-sm text-slate-500">담당 강좌와 수강생 현황을 확인하세요.</p>

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <Stat label="담당 강좌" value={`${summary.courseCount}개`} accent="bg-emerald-50 text-emerald-600" icon={<Icons.book size={22} />} />
        <Stat label="총 수강생" value={`${summary.totalStudents}명`} accent="bg-brand-50 text-brand-600" icon={<Icons.users size={22} />} />
      </div>

      <h2 className="mb-3 mt-8 text-base font-bold text-slate-900">담당 강좌</h2>
      {summary.courses.length === 0 ? (
        <EmptyState message="담당 강좌가 없습니다." sub="'내 강좌' 메뉴에서 강좌를 직접 개설할 수 있습니다." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summary.courses.map((c) => (
            <Link key={c.id} to="/teacher/roster" state={{ courseId: c.id }} className="card p-5 transition hover:shadow-soft">
              <div className="mb-2 flex items-center justify-between">
                <CategoryBadge category={c.category} />
                <span className="text-xs text-slate-400">{c.day_of_week} {c.start_time}</span>
              </div>
              <h3 className="mb-3 font-bold text-slate-900">{c.title}</h3>
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>수강 인원</span>
                <span className="font-semibold text-slate-700">{c.enrolled_count}/{c.capacity}명</span>
              </div>
              <ProgressBar value={c.enrolled_count} max={c.capacity} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
