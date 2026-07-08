import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Course } from '../../lib/api';
import { Stat, Spinner, EmptyState, CategoryBadge } from '../../components/ui';
import { Icons } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { formatFee } from '../../lib/format';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [mine, setMine] = useState<Course[] | null>(null);

  useEffect(() => {
    api.get<{ courses: Course[] }>('/enrollments/mine').then((r) => setMine(r.courses));
  }, []);

  if (!mine) return <Spinner />;
  const enrolled = mine.filter((c) => c.enrollment_status === 'enrolled');
  const waitlisted = mine.filter((c) => c.enrollment_status === 'waitlisted');
  const totalFee = enrolled.reduce((sum, c) => sum + c.fee, 0);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">
        {user?.name} 학생, 안녕하세요 👋
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        {user?.grade}학년 {user?.class_no}반 · 나의 방과후 수강 현황입니다.
      </p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="수강 확정" value={`${enrolled.length}과목`} accent="bg-brand-50 text-brand-600" icon={<Icons.book size={22} />} />
        <Stat label="대기 중" value={`${waitlisted.length}과목`} accent="bg-amber-50 text-amber-600" icon={<Icons.clipboard size={22} />} />
        <Stat label="수강료 합계" value={formatFee(totalFee)} accent="bg-emerald-50 text-emerald-600" icon={<Icons.chart size={22} />} />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">신청한 강좌</h2>
        <Link to="/student/catalog" className="text-sm font-medium text-brand-600 hover:underline">강좌 더 신청하기 →</Link>
      </div>

      <div className="mt-3">
        {mine.length === 0 ? (
          <EmptyState message="아직 신청한 강좌가 없습니다." sub="강좌 신청 메뉴에서 원하는 방과후 강좌를 신청해 보세요." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {mine.map((c) => (
              <div key={c.id} className="card flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <CategoryBadge category={c.category} />
                    <span className={`badge ${c.enrollment_status === 'enrolled' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {c.enrollment_status === 'enrolled' ? '수강확정' : '대기'}
                    </span>
                  </div>
                  <h3 className="truncate font-semibold text-slate-900">{c.title}</h3>
                  <p className="text-sm text-slate-500">
                    {c.day_of_week} {c.start_time}~{c.end_time} · {c.room} · {c.teacher_name}
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
