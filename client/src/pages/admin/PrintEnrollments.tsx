import { useEffect, useState } from 'react';
import { api, Course } from '../../lib/api';
import { PrintShell, PrintMeta, PrintLoading, Th, Td } from '../../components/print';
import { courseDisplayTitle, targetGradesLabel, enrollStatusLabel, courseStatusLabel, studentLabel } from '../../lib/format';
import { rowTitle } from './Enrollments';
import type { EnrollmentRow } from './Enrollments';

// Printable admin report: per-course summary + full enrollment list.
export default function PrintEnrollments() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [rows, setRows] = useState<EnrollmentRow[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<{ courses: Course[] }>('/courses'),
      api.get<{ enrollments: EnrollmentRow[] }>('/admin/enrollments'),
    ]).then(([c, e]) => {
      setCourses(c.courses);
      setRows(e.enrollments);
    });
  }, []);

  if (!courses) return <PrintLoading />;

  const totalEnrolled = rows.filter((r) => r.status === 'enrolled').length;

  return (
    <PrintShell title="수강신청 현황" hint="수강신청 현황 미리보기 · 인쇄(Ctrl/⌘+P)" width="lg">
      <PrintMeta>
        개설 강좌 {courses.length}개 · 수강확정 {totalEnrolled}건
      </PrintMeta>

      {/* 강좌별 요약 */}
      <table className="print-table mb-8 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100">
            <Th w="6%">No.</Th>
            <Th>강좌명</Th>
            <Th w="9%">교과</Th>
            <Th w="12%">강사</Th>
            <Th w="16%">교시</Th>
            <Th w="9%">대상</Th>
            <Th w="8%">정원</Th>
            <Th w="8%">신청</Th>
            <Th w="9%">상태</Th>
          </tr>
        </thead>
        <tbody>
          {courses.map((c, i) => (
            <tr key={c.id}>
              <Td center>{i + 1}</Td>
              <Td>{courseDisplayTitle(c)}</Td>
              <Td center>{c.category}</Td>
              <Td center>{c.teacher_name}</Td>
              <Td center>{c.schedule_label}</Td>
              <Td center>{targetGradesLabel(c.target_grades)}</Td>
              <Td center>{c.capacity}</Td>
              <Td center>{c.enrolled_count}</Td>
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
              <Td center>{studentLabel(r.grade, r.class_no, r.student_no)}</Td>
              <Td>{rowTitle(r)}</Td>
              <Td center>{enrollStatusLabel(r.status)}</Td>
              <Td center>{r.created_at}</Td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><Td center colSpan={6}>신청 내역이 없습니다.</Td></tr>
          )}
        </tbody>
      </table>
    </PrintShell>
  );
}
