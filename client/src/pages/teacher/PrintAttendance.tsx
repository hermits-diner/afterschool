import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, Course } from '../../lib/api';
import { PrintShell, PrintLoading } from '../../components/print';

const SYMBOL: Record<string, string> = { present: '○', late: '△', absent: '×', excused: '공' };
const LANDSCAPE = '@media print { @page { size: A4 landscape; margin: 10mm; } }';

// Printable attendance book (출석부) — students × session dates grid.
export default function PrintAttendance() {
  const { id } = useParams();
  const [data, setData] = useState<{
    course: Course;
    teacher_name: string;
    dates: string[];
    students: any[];
    records: Record<string, Record<string, string>>;
  } | null>(null);

  useEffect(() => {
    api.get<any>(`/teacher/courses/${id}/attendance-book?count=16`).then(setData);
  }, [id]);

  if (!data) return <PrintLoading />;
  const { course, teacher_name, dates, students, records } = data;
  const blankRows = Math.max(0, 18 - students.length);
  const mmdd = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

  return (
    <PrintShell title="출석부" hint="출석부 미리보기 · 가로 방향 인쇄 권장" width="xl" pageStyle={LANDSCAPE}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span><b className="text-slate-500">강좌</b> {course.title}</span>
          <span><b className="text-slate-500">강사</b> {teacher_name}</span>
          <span><b className="text-slate-500">교시</b> {course.schedule_label}</span>
          <span><b className="text-slate-500">인원</b> {students.length}명</span>
        </div>
        <span className="text-slate-500">범례: ○출석 △지각 ×결석 공(공결)</span>
      </div>

      <table className="print-table w-full border-collapse" style={{ fontSize: 11 }}>
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-400 px-1 py-1.5 text-center font-bold" style={{ width: 28 }}>번</th>
            <th className="border border-slate-400 px-1 py-1.5 text-center font-bold" style={{ width: 48 }}>학번</th>
            <th className="border border-slate-400 px-1 py-1.5 text-center font-bold" style={{ width: 64 }}>성명</th>
            {dates.map((d) => (
              <th key={d} className="border border-slate-400 px-0.5 py-1.5 text-center font-semibold text-slate-600" style={{ width: 26 }}>
                {mmdd(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => (
            <tr key={s.student_id}>
              <td className="border border-slate-300 text-center">{i + 1}</td>
              <td className="border border-slate-300 text-center">{s.grade}{s.class_no}{String(s.student_no).padStart(2, '0')}</td>
              <td className="border border-slate-300 px-1 text-center">{s.name}</td>
              {dates.map((d) => (
                <td key={d} className="border border-slate-300 text-center" style={{ height: 26 }}>
                  {SYMBOL[records[s.student_id]?.[d]] || ''}
                </td>
              ))}
            </tr>
          ))}
          {Array.from({ length: blankRows }).map((_, i) => (
            <tr key={`b${i}`}>
              <td className="border border-slate-300 text-center text-slate-300">{students.length + i + 1}</td>
              <td className="border border-slate-300"></td>
              <td className="border border-slate-300"></td>
              {dates.map((d) => (
                <td key={d} className="border border-slate-300" style={{ height: 26 }}></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </PrintShell>
  );
}
