import { useEffect, useState } from 'react';
import { api, Course } from '../../lib/api';
import { Icons } from '../../components/icons';
import { formatFee } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import Timetable from '../../components/Timetable';

// Printable weekly timetable for the logged-in student.
export default function PrintTimetable() {
  const { user } = useAuth();
  const [mine, setMine] = useState<Course[] | null>(null);

  useEffect(() => {
    api.get<{ courses: Course[] }>('/enrollments/mine').then((r) => setMine(r.courses));
  }, []);

  if (!mine) return <div className="p-10 text-center text-slate-400">불러오는 중...</div>;

  const enrolled = mine.filter((c) => c.enrollment_status === 'enrolled');
  const today = new Date().toISOString().slice(0, 10);
  const totalFee = enrolled.reduce((s, c) => s + c.fee, 0);

  return (
    <div className="min-h-full bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-4xl items-center justify-between px-4">
        <button className="btn-secondary" onClick={() => window.close()}>← 닫기</button>
        <div className="text-sm text-slate-500">시간표 미리보기 · 인쇄(Ctrl/⌘+P)</div>
        <button className="btn-primary" onClick={() => window.print()}>
          <Icons.printer size={16} /> 인쇄하기
        </button>
      </div>

      <div className="print-sheet mx-auto max-w-4xl rounded-xl bg-white p-10 shadow-card print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-1 text-center text-sm text-slate-500">2026학년도 1학기 방과후학교</div>
        <h1 className="mb-6 text-center text-2xl font-bold text-slate-900">방과후 수강 시간표</h1>

        <div className="mb-4 flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700">
            {user?.grade}학년 {user?.class_no}반 {user?.student_no}번 {user?.name} · 수강 {enrolled.length}과목
          </span>
          <span className="text-slate-500">출력일: {today}</span>
        </div>

        <div className="mb-8">
          <Timetable courses={enrolled} />
        </div>

        <h2 className="mb-2 text-base font-bold text-slate-800">수강 강좌 목록</h2>
        <table className="print-table w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              <Th w="7%">No.</Th>
              <Th>강좌명</Th>
              <Th w="10%">교과</Th>
              <Th w="13%">강사</Th>
              <Th w="18%">시간</Th>
              <Th w="13%">강의실</Th>
              <Th w="12%">수강료</Th>
            </tr>
          </thead>
          <tbody>
            {enrolled.map((c, i) => (
              <tr key={c.id}>
                <Td center>{i + 1}</Td>
                <Td>{c.title}</Td>
                <Td center>{c.category}</Td>
                <Td center>{c.teacher_name}</Td>
                <Td center>{c.day_of_week} {c.start_time}~{c.end_time}</Td>
                <Td center>{c.room || '-'}</Td>
                <Td center>{formatFee(c.fee)}</Td>
              </tr>
            ))}
            {enrolled.length === 0 ? (
              <tr><Td center colSpan={7}>수강 확정된 강좌가 없습니다.</Td></tr>
            ) : (
              <tr className="bg-slate-50 font-semibold">
                <Td center colSpan={6}>수강료 합계</Td>
                <Td center>{formatFee(totalFee)}</Td>
              </tr>
            )}
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
function Td({ children, center, colSpan }: { children?: React.ReactNode; center?: boolean; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`border border-slate-300 px-2 py-1.5 ${center ? 'text-center' : ''}`}>
      {children}
    </td>
  );
}
