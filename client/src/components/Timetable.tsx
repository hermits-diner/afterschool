import { Course } from '../lib/api';
import { categoryColor, courseDisplayTitle, DAYS, Slot } from '../lib/format';

function slotsOf(c: Course): Slot[] {
  return c.schedule && c.schedule.length ? c.schedule : [];
}

// 요일 × 교시 그리드 시간표 (시간이 아닌 교시 기준).
// 사용 중인 교시 범위만 표시하되 최소 8~9교시는 항상 보여준다.
export default function Timetable({ courses }: { courses: Course[] }) {
  let min = 8;
  let max = 9;
  for (const c of courses) {
    for (const s of slotsOf(c)) {
      min = Math.min(min, s.from);
      max = Math.max(max, s.to);
    }
  }
  const periods = [];
  for (let p = min; p <= max; p++) periods.push(p);

  return (
    <div className="card overflow-x-auto p-4">
      {/* table-fixed: 강좌명 길이와 무관하게 요일 열 폭 균등 (긴 제목은 truncate) */}
      <table className="w-full min-w-[560px] table-fixed border-collapse">
        <thead>
          <tr>
            <th className="w-16 pb-2 text-center text-xs font-medium text-slate-400">교시</th>
            {DAYS.map((d) => (
              <th key={d} className="pb-2 text-center text-sm font-semibold text-slate-600">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p}>
              <td className="border-t border-slate-100 py-1 text-center text-sm font-bold text-slate-500">{p}</td>
              {DAYS.map((d) => {
                const cs = courses.filter((c) =>
                  slotsOf(c).some((s) => s.day === d && p >= s.from && p <= s.to)
                );
                return (
                  <td key={d} className="h-14 border-l border-t border-slate-100 p-1 align-top">
                    {cs.map((c) => (
                      <div
                        key={c.id}
                        className={`mb-0.5 overflow-hidden rounded-md px-1.5 py-1 text-xs ${categoryColor(c.category)}`}
                        title={`${courseDisplayTitle(c)}${c.room ? ` · ${c.room}` : ''}`}
                      >
                        <div className="truncate font-semibold">{courseDisplayTitle(c)}</div>
                        {c.room && <div className="truncate opacity-70">{c.room}</div>}
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
