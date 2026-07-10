import { useEffect, useState } from 'react';
import { api, Course } from '../../lib/api';
import { TableSkeleton, EmptyState, CategoryBadge } from '../../components/ui';
import { Icons } from '../../components/icons';
import Timetable from '../../components/Timetable';
import { courseDisplayTitle, DAYS } from '../../lib/format';

export default function StudentTimetable() {
  const [mine, setMine] = useState<Course[] | null>(null);

  useEffect(() => {
    api.get<{ courses: Course[] }>('/enrollments/mine').then((r) => setMine(r.courses));
  }, []);

  if (!mine) return <TableSkeleton rows={6} />;
  const enrolled = mine.filter((c) => c.enrollment_status === 'enrolled');

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-slate-900">내 시간표</h1>
          <p className="text-sm text-slate-500">수강 확정된 강좌의 주간 시간표입니다.</p>
        </div>
        {enrolled.length > 0 && (
          <button className="btn-secondary" onClick={() => window.open('/student/print/timetable', '_blank')}>
            <Icons.printer size={16} /> 시간표 인쇄
          </button>
        )}
      </div>

      {enrolled.length === 0 ? (
        <EmptyState message="수강 확정된 강좌가 없습니다." sub="강좌 신청 메뉴에서 방과후학교 강좌를 신청해 보세요." />
      ) : (
        <>
          <Timetable courses={enrolled} />
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DAYS.map((day) => {
              const dayCourses = enrolled
                .map((c) => ({ c, slot: (c.schedule || []).find((s) => s.day === day) }))
                .filter((x) => x.slot)
                .sort((a, b) => a.slot!.from - b.slot!.from);
              if (dayCourses.length === 0) return null;
              return (
                <div key={day} className="card p-4">
                  <h3 className="mb-2 font-bold text-slate-700">{day}요일</h3>
                  <div className="space-y-2">
                    {dayCourses.map(({ c, slot }) => (
                      <div key={c.id} className="flex items-center gap-2 text-sm">
                        <CategoryBadge category={c.category} />
                        <span className="font-medium text-slate-800">{courseDisplayTitle(c)}</span>
                        <span className="ml-auto text-xs text-slate-400">{slot!.from === slot!.to ? `${slot!.from}교시` : `${slot!.from}~${slot!.to}교시`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
