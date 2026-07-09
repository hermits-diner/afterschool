import { Course } from '../lib/api';
import { categoryColor, DAYS } from '../lib/format';

function toMin(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

const HEIGHT = 320;

// A simple day-column timetable. The visible window adapts to the courses:
// 학기중(오후)만 있으면 15~19시, 방학중 오전 강좌가 있으면 그 시간대까지 확장.
export default function Timetable({ courses }: { courses: Course[] }) {
  let start = 15 * 60;
  let end = 19 * 60;
  for (const c of courses) {
    start = Math.min(start, Math.floor(toMin(c.start_time) / 60) * 60);
    end = Math.max(end, Math.ceil(toMin(c.end_time) / 60) * 60);
  }
  const totalMin = end - start;
  const hours = [];
  for (let h = start / 60; h <= end / 60; h++) hours.push(h);

  return (
    <div className="card overflow-x-auto p-4">
      <div className="min-w-[640px]">
        <div className="grid" style={{ gridTemplateColumns: `48px repeat(5, 1fr)` }}>
          <div />
          {DAYS.map((d) => (
            <div key={d} className="pb-2 text-center text-sm font-semibold text-slate-600">{d}</div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: `48px repeat(5, 1fr)` }}>
          {/* Hour rail */}
          <div className="relative" style={{ height: HEIGHT }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute -translate-y-1/2 text-xs text-slate-400"
                style={{ top: ((h * 60 - start) / totalMin) * HEIGHT }}
              >
                {h}:00
              </div>
            ))}
          </div>
          {DAYS.map((day) => (
            <div key={day} className="relative border-l border-slate-100" style={{ height: HEIGHT }}>
              {hours.slice(1, -1).map((h) => (
                <div key={h} className="absolute w-full border-t border-dashed border-slate-100" style={{ top: ((h * 60 - start) / totalMin) * HEIGHT }} />
              ))}
              {courses
                .filter((c) => c.day_of_week === day)
                .map((c) => {
                  const top = ((toMin(c.start_time) - start) / totalMin) * HEIGHT;
                  const height = ((toMin(c.end_time) - toMin(c.start_time)) / totalMin) * HEIGHT;
                  return (
                    <div
                      key={c.id}
                      className={`absolute left-1 right-1 overflow-hidden rounded-md border px-1.5 py-1 text-xs ${categoryColor(c.category)} border-white/50`}
                      style={{ top, height: Math.max(height, 28) }}
                      title={`${c.title} (${c.start_time}~${c.end_time}) ${c.room}`}
                    >
                      <div className="truncate font-semibold">{c.title}</div>
                      <div className="truncate opacity-70">{c.room}</div>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
