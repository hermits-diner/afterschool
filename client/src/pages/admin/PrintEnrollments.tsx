import { useEffect, useState } from 'react';
import { api, Course } from '../../lib/api';
import { Icons } from '../../components/icons';
import { targetGradeLabel, enrollStatusLabel, courseStatusLabel } from '../../lib/format';

interface Row {
  id: number;
  status: string;
  created_at: string;
  student_name: string;
  grade: number;
  class_no: number;
  student_no: number;
  course_title: string;
  category: string;
}

// Printable admin report: per-course summary + full enrollment list.
export default function PrintEnrollments() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<{ courses: Course[] }>('/courses'),
      api.get<{ enrollments: Row[] }>('/admin/enrollments'),
    ]).then(([c, e]) => {
      setCourses(c.courses);
      setRows(e.enrollments);
    });
  }, []);

  if (!courses) return <div className="p-10 text-center text-slate-400">불러오는 중...</div>;

  const today = new Date().toISOString().slice(0, 10);
  const totalEnrolled = rows.filter((r) => r.status === 'enrolled').length;
  const totalWaitlisted = rows.filter((r) => r.status === 'waitlisted').length;

  return (
    <div className="min-h-full bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-4xl items-center justify-between px-4">
        <button className="btn-secondary" onClick={() => window.close()}>← 닫기</button>
        <div className="text-sm text-slate-500">수강신청 현황 미리보기 · 인쇄(Ctrl/⌘+P)</div>
        <button className="btn-primary" onClick={() => window.print()}>
          <Icons.printer size={16} /> 인쇄하기
        </button>
      </div>

      <div className="print-sheet mx-auto max-w-4xl rounded-xl bg-white p-10 shadow-card print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-1 text-center text-sm text-slate-500">2026학년도 1학기 방과후학교</div>
        <h1 className="mb-6 text-center text-2xl font-bold text-slate-900">수강신청 현황</h1>

        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700">
            개설 강좌 {courses.length}개 · 수강확정 {totalEnrolled}건 · 대기 {totalWaitlisted}건
          </span>
          <span className="text-slate-500">출력일: {today}</span>
        </div>

        {/* 강좌별 요약 */}
        <table className="print-table mb-8 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              <Th w="6%">No.</Th>
              <Th>강좌명</Th>
              <Th w="9%">교과</Th>
              <Th w="12%">강사</Th>
              <Th w="16%">시간</Th>
              <Th w="9%">대상</Th>
              <Th w="8%">정원</Th>
              <Th w="8%">신청</Th>
              <Th w="8%">대기</Th>
              <Th w="9%">상태</Th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c, i) => (
              <tr key={c.id}>
                <Td center>{i + 1}</Td>
                <Td>{c.title}</Td>
                <Td center>{c.category}</Td>
                <Td center>{c.teacher_name}</Td>
                <Td center>{c.day_of_week} {c.start_time}~{c.end_time}</Td>
                <Td center>{targetGradeLabel(c.target_grade)}</Td>
                <Td center>{c.capacity}</Td>
                <Td center>{c.enrolled_count}</Td>
                <Td center>{c.waitlisted_count}</Td>
                <Td center>{courseStatusLabel(c.status)}</Td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 전체 신청 내역 */}
        <h2 className="mb-2 text-base font-bold text-slate-800">전체 신청 내역 ({rows.length}건)</h2>
        <table className="print-table w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              <Th w="7%">No.</Th>
              <Th w="14%">학생</Th>
              <Th w="15%">학년/반/번호</Th>
              <Th>강좌</Th>
              <Th w="11%">상태</Th>
              <Th w="20%">신청일시</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <Td center>{i + 1}</Td>
                <Td center>{r.student_name}</Td>
                <Td center>{r.grade}학년 {r.class_no}반 {r.student_no}번</Td>
                <Td>{r.course_title}</Td>
                <Td center>{enrollStatusLabel(r.status)}</Td>
                <Td center>{r.created_at}</Td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><Td center colSpan={6}>신청 내역이 없습니다.</Td></tr>
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
