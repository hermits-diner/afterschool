import { DAYS, PERIODS, periodsFromTimes, periodLabel } from '../lib/format';

export interface Slot {
  day_of_week: string;
  start_time: string;
  end_time: string;
}

// 요일 × 1~9교시 시간표 그리드에서 수업 블록을 선택한다.
// 클릭: 단일 교시 선택 · 같은 요일에서 다시 클릭: 연속 교시 범위로 확장.
export default function PeriodPicker({ value, onChange }: { value: Slot; onChange: (v: Slot) => void }) {
  const range = periodsFromTimes(value.start_time, value.end_time);
  const [from, to] = range || [0, -1];

  function pick(day: string, no: number) {
    if (day === value.day_of_week && range) {
      if (no >= from && no <= to && from !== to) {
        // 범위 내부 클릭: 그 교시 단일 선택으로 축소
        const p = PERIODS[no - 1];
        onChange({ day_of_week: day, start_time: p.start, end_time: p.end });
        return;
      }
      if (no === from && no === to) return; // 이미 단일 선택된 블록
      // 같은 요일 바깥쪽 클릭: 클릭한 교시까지 연속 범위로 확장
      const f = Math.min(from, no);
      const t = Math.max(to, no);
      onChange({
        day_of_week: day,
        start_time: PERIODS[f - 1].start,
        end_time: PERIODS[t - 1].end,
      });
    } else {
      // 다른 요일이거나 첫 선택: 단일 교시
      const p = PERIODS[no - 1];
      onChange({ day_of_week: day, start_time: p.start, end_time: p.end });
    }
  }

  const selected = (day: string, no: number) =>
    day === value.day_of_week && range !== null && no >= from && no <= to;

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-center text-xs">
          <thead>
            <tr className="bg-slate-50">
              <th className="w-20 border-b border-r border-slate-200 px-1 py-1.5 font-medium text-slate-500">교시</th>
              {DAYS.map((d) => (
                <th key={d} className="border-b border-slate-200 px-1 py-1.5 font-semibold text-slate-700">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((p) => (
              <tr key={p.no}>
                <td className="border-r border-t border-slate-100 px-1 py-0.5 text-slate-400">
                  <b className="text-slate-600">{p.no}</b> <span className="hidden sm:inline">{p.start}</span>
                </td>
                {DAYS.map((d) => (
                  <td key={d} className="border-t border-slate-100 p-0.5">
                    <button
                      type="button"
                      onClick={() => pick(d, p.no)}
                      className={`h-7 w-full rounded-md transition ${
                        selected(d, p.no)
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'bg-slate-50 text-transparent hover:bg-brand-100'
                      }`}
                    >
                      ●
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-sm">
        {range ? (
          <span className="font-medium text-brand-700">
            {value.day_of_week}요일 {periodLabel(from, to)} ({value.start_time} ~ {value.end_time})
          </span>
        ) : (
          <span className="text-slate-400">
            시간표에서 수업 블록을 선택하세요 · 같은 요일을 한 번 더 클릭하면 연속 교시로 확장됩니다
            {value.start_time && ` (현재: ${value.day_of_week} ${value.start_time}~${value.end_time})`}
          </span>
        )}
      </p>
    </div>
  );
}
