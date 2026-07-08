import { useEffect, useState } from 'react';
import { api, Course } from '../../lib/api';
import { Spinner, EmptyState } from '../../components/ui';
import { Icons } from '../../components/icons';
import { useToast } from '../../context/ToastContext';

type Status = 'present' | 'absent' | 'late' | 'excused';
const STATUSES: { key: Status; label: string; color: string }[] = [
  { key: 'present', label: '출석', color: 'bg-emerald-500' },
  { key: 'late', label: '지각', color: 'bg-amber-500' },
  { key: 'absent', label: '결석', color: 'bg-rose-500' },
  { key: 'excused', label: '공결', color: 'bg-slate-400' },
];

export default function TeacherAttendance() {
  const toast = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState<any[] | null>(null);
  const [tab, setTab] = useState<'mark' | 'summary'>('mark');
  const [summary, setSummary] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ courses: Course[] }>('/teacher/courses').then((r) => {
      setCourses(r.courses);
      if (r.courses.length) setSelected(r.courses[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, date]);

  async function loadAttendance() {
    setStudents(null);
    const r = await api.get<{ students: any[] }>(`/teacher/courses/${selected}/attendance?date=${date}`);
    setStudents(r.students);
  }

  async function loadSummary() {
    const r = await api.get<{ summary: any[] }>(`/teacher/courses/${selected}/attendance-summary`);
    setSummary(r.summary);
  }

  function mark(studentId: number, status: Status) {
    setStudents((prev) => prev!.map((s) => (s.student_id === studentId ? { ...s, status } : s)));
  }

  function markAll(status: Status) {
    setStudents((prev) => prev!.map((s) => ({ ...s, status })));
  }

  async function save() {
    if (!students) return;
    const records = students.filter((s) => s.status).map((s) => ({ student_id: s.student_id, status: s.status }));
    if (records.length === 0) return toast('출석 상태를 선택하세요.', 'error');
    setSaving(true);
    try {
      await api.post(`/teacher/courses/${selected}/attendance`, { date, records });
      toast(`${date} 출석이 저장되었습니다.`, 'success');
    } finally {
      setSaving(false);
    }
  }

  if (courses.length === 0 && students === null) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-slate-900">출석 관리</h1>
        <EmptyState message="배정된 강좌가 없습니다." />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">출석 관리</h1>
      <p className="mb-6 text-sm text-slate-500">강좌별 출석을 체크하고 출결 통계를 확인합니다.</p>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select className="input w-56" value={selected ?? ''} onChange={(e) => setSelected(Number(e.target.value))}>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.title} ({c.day_of_week})</option>
          ))}
        </select>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          <button onClick={() => setTab('mark')} className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === 'mark' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>출석 체크</button>
          <button onClick={() => { setTab('summary'); loadSummary(); }} className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === 'summary' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>출결 통계</button>
        </div>
        {tab === 'mark' && <input type="date" className="input w-40" value={date} onChange={(e) => setDate(e.target.value)} />}
        {selected && (
          <button
            className="btn-secondary ml-auto"
            onClick={() => window.open(`/teacher/print/attendance/${selected}`, '_blank')}
          >
            <Icons.printer size={16} /> 출석부 인쇄
          </button>
        )}
      </div>

      {tab === 'mark' ? (
        !students ? (
          <Spinner />
        ) : students.length === 0 ? (
          <EmptyState message="수강 확정된 학생이 없습니다." />
        ) : (
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <span className="text-sm text-slate-500">전체 일괄 처리</span>
              <div className="flex gap-1">
                {STATUSES.map((s) => (
                  <button key={s.key} onClick={() => markAll(s.key)} className="btn-secondary btn-sm">모두 {s.label}</button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {students.map((s, i) => (
                <div key={s.student_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <span className="w-6 text-sm text-slate-400">{i + 1}</span>
                  <span className="w-24 font-medium text-slate-800">{s.name}</span>
                  <span className="text-sm text-slate-400">{s.grade}-{s.class_no}-{s.student_no}</span>
                  <div className="ml-auto flex gap-1">
                    {STATUSES.map((st) => (
                      <button
                        key={st.key}
                        onClick={() => mark(s.student_id, st.key)}
                        className={`h-8 w-12 rounded-md text-xs font-semibold transition ${
                          s.status === st.key ? `${st.color} text-white` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
              <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중...' : '출석 저장'}</button>
            </div>
          </div>
        )
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th">이름</th>
                  <th className="th">학년/반/번호</th>
                  <th className="th text-center">출석</th>
                  <th className="th text-center">지각</th>
                  <th className="th text-center">결석</th>
                  <th className="th text-center">공결</th>
                  <th className="th text-center">출석률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.map((s) => {
                  const rate = s.total > 0 ? Math.round(((s.present + s.late) / s.total) * 100) : 0;
                  return (
                    <tr key={s.student_id} className="hover:bg-slate-50">
                      <td className="td font-medium">{s.name}</td>
                      <td className="td">{s.grade}-{s.class_no}-{s.student_no}</td>
                      <td className="td text-center text-emerald-600">{s.present}</td>
                      <td className="td text-center text-amber-600">{s.late}</td>
                      <td className="td text-center text-rose-600">{s.absent}</td>
                      <td className="td text-center text-slate-500">{s.excused}</td>
                      <td className="td text-center font-semibold">{s.total > 0 ? `${rate}%` : '-'}</td>
                    </tr>
                  );
                })}
                {summary.length === 0 && (
                  <tr><td colSpan={7} className="td py-8 text-center text-slate-400">출결 데이터가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
