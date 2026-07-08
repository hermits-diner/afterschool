import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, Course } from '../../lib/api';
import { Icons } from '../../components/icons';
import { targetGradeLabel } from '../../lib/format';

// Printable student name list (명렬표) for a course.
export default function PrintRoster() {
  const { id } = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [roster, setRoster] = useState<any[]>([]);

  useEffect(() => {
    api.get<{ course: Course; roster: any[] }>(`/teacher/courses/${id}/roster`).then((r) => {
      setCourse(r.course);
      setRoster(r.roster.filter((x) => x.status === 'enrolled'));
    });
  }, [id]);

  if (!course) return <div className="p-10 text-center text-slate-400">불러오는 중...</div>;

  const today = new Date().toISOString().slice(0, 10);
  const blankRows = Math.max(0, 20 - roster.length);

  return (
    <div className="min-h-full bg-slate-100 py-8 print:bg-white print:py-0">
      {/* Toolbar */}
      <div className="no-print mx-auto mb-4 flex max-w-3xl items-center justify-between px-4">
        <button className="btn-secondary" onClick={() => window.close()}>← 닫기</button>
        <div className="text-sm text-slate-500">명렬표 미리보기 · 인쇄(Ctrl/⌘+P)</div>
        <button className="btn-primary" onClick={() => window.print()}>
          <Icons.printer size={16} /> 인쇄하기
        </button>
      </div>

      <div className="print-sheet mx-auto max-w-3xl rounded-xl bg-white p-10 shadow-card print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-1 text-center text-sm text-slate-500">2026학년도 1학기 방과후학교</div>
        <h1 className="mb-6 text-center text-2xl font-bold text-slate-900">수강생 명렬표</h1>

        <table className="mb-6 w-full text-sm">
          <tbody>
            <tr>
              <Cell head>강좌명</Cell>
              <Cell colSpan={3}>{course.title}</Cell>
              <Cell head>담당강사</Cell>
              <Cell>{course.teacher_name}</Cell>
            </tr>
            <tr>
              <Cell head>수업시간</Cell>
              <Cell>{course.day_of_week} {course.start_time}~{course.end_time}</Cell>
              <Cell head>강의실</Cell>
              <Cell>{course.room || '-'}</Cell>
              <Cell head>대상</Cell>
              <Cell>{targetGradeLabel(course.target_grade)}</Cell>
            </tr>
          </tbody>
        </table>

        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700">총 수강인원: {roster.length}명</span>
          <span className="text-slate-500">출력일: {today}</span>
        </div>

        <table className="print-table w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              <Th w="8%">순번</Th>
              <Th w="14%">학년/반/번호</Th>
              <Th w="18%">성명</Th>
              <Th w="22%">연락처</Th>
              <Th>비고</Th>
            </tr>
          </thead>
          <tbody>
            {roster.map((r, i) => (
              <tr key={r.student_id}>
                <Td center>{i + 1}</Td>
                <Td center>{r.grade}-{r.class_no}-{r.student_no}</Td>
                <Td center>{r.name}</Td>
                <Td center>{r.phone || ''}</Td>
                <Td></Td>
              </tr>
            ))}
            {Array.from({ length: blankRows }).map((_, i) => (
              <tr key={`b${i}`}>
                <Td center className="text-slate-300">{roster.length + i + 1}</Td>
                <Td></Td>
                <Td></Td>
                <Td></Td>
                <Td></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, w }: { children?: React.ReactNode; w?: string }) {
  return (
    <th style={{ width: w }} className="border border-slate-400 px-2 py-2 text-center text-xs font-bold text-slate-700">
      {children}
    </th>
  );
}
function Td({ children, center, className = '' }: { children?: React.ReactNode; center?: boolean; className?: string }) {
  return (
    <td className={`border border-slate-300 px-2 py-2 ${center ? 'text-center' : ''} ${className}`} style={{ height: 34 }}>
      {children}
    </td>
  );
}
function Cell({ children, head, colSpan }: { children?: React.ReactNode; head?: boolean; colSpan?: number }) {
  return (
    <td
      colSpan={colSpan}
      className={`border border-slate-300 px-3 py-2 ${head ? 'bg-slate-100 text-center font-semibold text-slate-600' : 'text-slate-800'}`}
    >
      {children}
    </td>
  );
}
