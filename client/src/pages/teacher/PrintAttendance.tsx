import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, Course } from '../../lib/api';
import { PrintShell, PrintLoading } from '../../components/print';
import { courseDisplayTitle } from '../../lib/format';

const LANDSCAPE = '@media print { @page { size: A4 landscape; margin: 10mm; } }';
// 날짜는 강사가 수기로 기입 — 빈 날짜 칸 24개 고정
const BLANK_COLS = 24;

// Printable attendance book (출석부) — students × blank date columns grid.
export default function PrintAttendance() {
  const { id } = useParams();
  const [data, setData] = useState<{
    course: Course;
    teacher_name: string;
    students: any[];
  } | null>(null);

  useEffect(() => {
    api.get<any>(`/teacher/courses/${id}/attendance-book?count=16`).then(setData);
  }, [id]);

  if (!data) return <PrintLoading />;
  const { course, teacher_name, students } = data;
  const blankRows = Math.max(0, 18 - students.length);
  const cols = Array.from({ length: BLANK_COLS });

  return (
    <PrintShell title="출석부" hint="출석부 미리보기 · 가로 방향 인쇄 권장" width="xl" pageStyle={LANDSCAPE}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span><b className="text-slate-500">강좌</b> {courseDisplayTitle(course)}</span>
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
            {cols.map((_, i) => (
              <th key={i} className="border border-slate-400 px-0.5" style={{ width: 26, height: 30 }}></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => (
            <tr key={s.student_id}>
              <td className="border border-slate-300 text-center">{i + 1}</td>
              <td className="border border-slate-300 text-center">{s.grade}{s.class_no}{String(s.student_no).padStart(2, '0')}</td>
              <td className="border border-slate-300 px-1 text-center">{s.name}</td>
              {cols.map((_, j) => (
                <td key={j} className="border border-slate-300" style={{ height: 26 }}></td>
              ))}
            </tr>
          ))}
          {Array.from({ length: blankRows }).map((_, i) => (
            <tr key={`b${i}`}>
              <td className="border border-slate-300 text-center text-slate-300">{students.length + i + 1}</td>
              <td className="border border-slate-300"></td>
              <td className="border border-slate-300"></td>
              {cols.map((_, j) => (
                <td key={j} className="border border-slate-300" style={{ height: 26 }}></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </PrintShell>
  );
}
