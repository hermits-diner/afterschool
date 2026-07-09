import { useEffect, useState } from 'react';
import { api, Course } from '../../lib/api';
import { PrintShell, PrintMeta, PrintLoading, Th, Td } from '../../components/print';
import { formatFee, studentLabel } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import Timetable from '../../components/Timetable';

// Printable weekly timetable for the logged-in student.
export default function PrintTimetable() {
  const { user } = useAuth();
  const [mine, setMine] = useState<Course[] | null>(null);

  useEffect(() => {
    api.get<{ courses: Course[] }>('/enrollments/mine').then((r) => setMine(r.courses));
  }, []);

  if (!mine) return <PrintLoading />;

  const enrolled = mine.filter((c) => c.enrollment_status === 'enrolled');
  const totalFee = enrolled.reduce((s, c) => s + c.fee, 0);

  return (
    <PrintShell title="방과후 수강 시간표" hint="시간표 미리보기 · 인쇄(Ctrl/⌘+P)" width="lg">
      <PrintMeta>
        {studentLabel(user?.grade, user?.class_no, user?.student_no)} {user?.name} · 수강 {enrolled.length}과목
      </PrintMeta>

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
            <Th w="18%">교시</Th>
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
              <Td center>{c.schedule_label}</Td>
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
    </PrintShell>
  );
}
