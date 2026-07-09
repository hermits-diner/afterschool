// 대상 학년 선택 칩: 전학년 / 1·2·3학년 조합 (복수 선택 가능, 전부 선택 = 전학년)
export default function GradePicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const isAll = value.length === 0;

  function toggle(g: number) {
    const next = value.includes(g) ? value.filter((x) => x !== g) : [...value, g].sort();
    onChange(next.length >= 3 ? [] : next);
  }

  const chip = (on: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
      on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
    }`;

  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={chip(isAll)} onClick={() => onChange([])}>전학년</button>
      {[1, 2, 3].map((g) => (
        <button type="button" key={g} className={chip(value.includes(g))} onClick={() => toggle(g)}>
          {g}학년
        </button>
      ))}
    </div>
  );
}
