import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { PrintShell, PrintMeta, PrintLoading, Th, Td } from '../../components/print';
import { studentLabel } from '../../lib/format';
import { cancelledCourseLabel } from './Cancelled';
import type { CancelledStudent } from './Cancelled';

// 폐강 재신청 대상 인쇄 — grade/classNo가 'all'이면 전체를 반 순서로 한 번에 출력.
export default function PrintCancelled() {
  const { grade, classNo } = useParams();
  const [students, setStudents] = useState<CancelledStudent[] | null>(null);

  useEffect(() => {
    api.get<{ students: CancelledStudent[] }>('/admin/cancelled-enrollments').then((r) => setStudents(r.students));
  }, []);

  if (!students) return <PrintLoading />;

  const targets =
    grade === 'all'
      ? students
      : students.filter((s) => s.grade === Number(grade) && s.class_no === Number(classNo));
  const scope = grade === 'all' ? '전체' : `${grade}학년 ${classNo}반`;

  return (
    <PrintShell title="폐강 강좌 재신청 대상자 명단" hint="재신청 안내용 · 인쇄(Ctrl/⌘+P)" width="lg">
      <PrintMeta>
        {scope} · 대상 {targets.length}명 · 폐강 신청분은 신청 한도에서 제외되어 즉시 추가 신청 가능
      </PrintMeta>
      {targets.length === 0 ? (
        <p className="py-10 text-center text-slate-400">해당하는 학생이 없습니다.</p>
      ) : (
        <table className="print-table w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              <Th w="6%">번호</Th>
              <Th w="14%">학번</Th>
              <Th w="12%">이름</Th>
              <Th>폐강된 신청 강좌 (강좌명 · 교과군 · 강사)</Th>
              <Th w="16%">재신청 확인</Th>
            </tr>
          </thead>
          <tbody>
            {targets.map((s, i) => (
              <tr key={s.student_id}>
                <Td center>{i + 1}</Td>
                <Td center>{studentLabel(s.grade, s.class_no, s.student_no)}</Td>
                <Td center>{s.name}</Td>
                <Td>
                  {s.courses.map((c) => cancelledCourseLabel(c)).join(', ')}
                </Td>
                <Td> </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PrintShell>
  );
}
