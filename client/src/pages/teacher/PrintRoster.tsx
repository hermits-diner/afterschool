import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, Course } from '../../lib/api';
import { PrintShell, PrintMeta, PrintLoading, Th, Td, InfoCell } from '../../components/print';
import { courseDisplayTitle, targetGradesLabel, studentShort } from '../../lib/format';

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

  if (!course) return <PrintLoading />;
  const blankRows = Math.max(0, 20 - roster.length);

  return (
    <PrintShell title="수강생 명렬표" hint="명렬표 미리보기 · 인쇄(Ctrl/⌘+P)">
      <table className="mb-6 w-full text-sm">
        <tbody>
          <tr>
            <InfoCell head>강좌명</InfoCell>
            <InfoCell colSpan={3}>{courseDisplayTitle(course)}</InfoCell>
            <InfoCell head>담당강사</InfoCell>
            <InfoCell>{course.teacher_name}</InfoCell>
          </tr>
          <tr>
            <InfoCell head>수업교시</InfoCell>
            <InfoCell>{course.schedule_label}</InfoCell>
            <InfoCell head>강의실</InfoCell>
            <InfoCell>{course.room || '-'}</InfoCell>
            <InfoCell head>대상</InfoCell>
            <InfoCell>{targetGradesLabel(course.target_grades)}</InfoCell>
          </tr>
        </tbody>
      </table>

      <PrintMeta>총 수강인원: {roster.length}명</PrintMeta>

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
              <Td center style={{ height: 34 }}>{i + 1}</Td>
              <Td center>{studentShort(r.grade, r.class_no, r.student_no)}</Td>
              <Td center>{r.name}</Td>
              <Td center>{r.phone || ''}</Td>
              <Td></Td>
            </tr>
          ))}
          {Array.from({ length: blankRows }).map((_, i) => (
            <tr key={`b${i}`}>
              <Td center className="text-slate-300" style={{ height: 34 }}>{roster.length + i + 1}</Td>
              <Td></Td>
              <Td></Td>
              <Td></Td>
              <Td></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintShell>
  );
}
