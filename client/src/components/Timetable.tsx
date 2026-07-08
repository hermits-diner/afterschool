import { Course } from '../lib/api';
import { categoryColor } from '../lib/format';

const DAYS = ['월', '화', '수', '목', '금'];

function toMin(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// A simple day-column timetable spanning the after-school window.
export default function Timetable({ courses }: { courses: Course[] }) {
  const START = 15 * 60; // 15:00
  const END = 19 * 60; // 19:00
  const totalMin = END - START;

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
          <div className="relative" style={{ height: 320 }}>
            {[15, 16, 17, 18, 19].map((h) => (
              <div
                key={h}
                className="absolute -translate-y-1/2 text-xs text-slate-400"
                style={{ top: ((h * 60 - START) / totalMin) * 320 }}
              >
                {h}:00
              </div>
            ))}
          </div>
          {DAYS.map((day) => (
            <div key={day} className="relative border-l border-slate-100" style={{ height: 320 }}>
              {[16, 17, 18].map((h) => (
                <div key={h} className="absolute w-full border-t border-dashed border-slate-100" style={{ top: ((h * 60 - START) / totalMin) * 320 }} />
              ))}
              {courses
                .filter((c) => c.day_of_week === day)
                .map((c) => {
                  const top = ((toMin(c.start_time) - START) / totalMin) * 320;
                  const height = ((toMin(c.end_time) - toMin(c.start_time)) / totalMin) * 320;
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
