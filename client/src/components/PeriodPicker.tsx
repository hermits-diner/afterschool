import { DAYS, PERIOD_COUNT, Slot, scheduleLabel } from '../lib/format';

const PERIOD_NOS = Array.from({ length: PERIOD_COUNT }, (_, i) => i + 1);

// 요일 × 1~9교시 그리드에서 블록을 자유롭게 토글한다.
// 떨어져 있는 교시, 복수 요일 조합 모두 가능. 같은 요일의 연속 교시는 자동으로 범위로 묶인다.
// readOnly: 교과군 선택 시 배정된 블록을 시간표로 보여주기만 할 때 사용.
export default function PeriodPicker({
  value,
  onChange,
  readOnly = false,
}: {
  value: Slot[];
  onChange?: (v: Slot[]) => void;
  readOnly?: boolean;
}) {
  const isOn = (day: string, no: number) => value.some((s) => s.day === day && no >= s.from && no <= s.to);

  function toggle(day: string, no: number) {
    if (readOnly || !onChange) return;
    // 슬롯 → 셀 집합으로 풀고 토글 후 다시 연속 범위로 묶는다
    const cells = new Set<string>();
    for (const s of value) for (let p = s.from; p <= s.to; p++) cells.add(`${s.day}:${p}`);
    const key = `${day}:${no}`;
    cells.has(key) ? cells.delete(key) : cells.add(key);

    const slots: Slot[] = [];
    for (const d of DAYS) {
      const ps = [...cells]
        .filter((c) => c.startsWith(`${d}:`))
        .map((c) => Number(c.split(':')[1]))
        .sort((a, b) => a - b);
      let i = 0;
      while (i < ps.length) {
        let j = i;
        while (j + 1 < ps.length && ps[j + 1] === ps[j] + 1) j++;
        slots.push({ day: d, from: ps[i], to: ps[j] });
        i = j + 1;
      }
    }
    onChange(slots);
  }

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-center text-xs">
          <thead>
            <tr className="bg-slate-50">
              <th className="w-14 border-b border-r border-slate-200 px-1 py-1.5 font-medium text-slate-500">교시</th>
              {DAYS.map((d) => (
                <th key={d} className="border-b border-slate-200 px-1 py-1.5 font-semibold text-slate-700">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIOD_NOS.map((no) => (
              <tr key={no}>
                <td className="border-r border-t border-slate-100 px-1 py-0.5 font-semibold text-slate-600">{no}</td>
                {DAYS.map((d) => (
                  <td key={d} className="border-t border-slate-100 p-0.5">
                    <button
                      type="button"
                      onClick={() => toggle(d, no)}
                      disabled={readOnly}
                      className={`h-7 w-full rounded-md transition ${
                        isOn(d, no)
                          ? 'bg-brand-600 text-white shadow-sm'
                          : readOnly
                            ? 'bg-slate-50 text-transparent'
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
        {value.length ? (
          <span className="font-medium text-brand-700">{scheduleLabel(value)}</span>
        ) : (
          <span className="text-slate-400">
            {readOnly ? '배정된 교시가 없습니다.' : '교시 블록을 클릭해서 선택하세요 (여러 요일·떨어진 교시 선택 가능)'}
          </span>
        )}
      </p>
    </div>
  );
}
