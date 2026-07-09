import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { PrintShell, PrintMeta, PrintLoading, Th, Td } from '../../components/print';
import { enrollmentLabel } from './ClassStatus';
import type { ClassInfo, ClassStudent } from './ClassStatus';

// 반별 수강신청 현황 인쇄 — grade/classNo가 'all'이면 전체 반을 페이지 나눠 출력.
export default function PrintClassStatus() {
  const { grade, classNo } = useParams();
  const [classes, setClasses] = useState<ClassInfo[] | null>(null);

  useEffect(() => {
    api.get<{ classes: ClassInfo[] }>('/admin/class-status').then((r) => setClasses(r.classes));
  }, []);

  if (!classes) return <PrintLoading />;

  const targets =
    grade === 'all'
      ? classes
      : classes.filter((c) => c.grade === Number(grade) && c.class_no === Number(classNo));

  const applied = (s: ClassStudent) => s.enrollments.length > 0;

  return (
    <PrintShell
      title="반별 수강신청 현황"
      hint={grade === 'all' ? '전체 반 인쇄 · 반마다 페이지가 나뉩니다' : '반별 현황 미리보기 · 인쇄(Ctrl/⌘+P)'}
      width="lg"
    >
      {targets.length === 0 ? (
        <p className="py-10 text-center text-slate-400">해당 학급이 없습니다.</p>
      ) : (
        targets.map((c, idx) => (
          <div key={`${c.grade}-${c.class_no}`} className={idx < targets.length - 1 ? 'page-break' : undefined}>
            <h2 className="mb-1 mt-2 text-lg font-bold text-slate-900">
              {c.grade}학년 {c.class_no}반
            </h2>
            <PrintMeta>
              재적 {c.students.length}명 · 신청 완료 {c.students.filter(applied).length}명 · 미신청{' '}
              {c.students.filter((s) => !applied(s)).length}명
            </PrintMeta>
            <table className="print-table mb-8 w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <Th w="8%">번호</Th>
                  <Th w="14%">이름</Th>
                  <Th>신청 강좌</Th>
                  <Th w="9%">신청 수</Th>
                  <Th w="14%">확인(서명)</Th>
                </tr>
              </thead>
              <tbody>
                {c.students.map((s) => {
                  const courses = s.enrollments.map(enrollmentLabel);
                  return (
                    <tr key={s.id}>
                      <Td center>{s.student_no}</Td>
                      <Td center>{s.name}</Td>
                      <Td>{courses.length ? courses.join(', ') : <b>미신청</b>}</Td>
                      <Td center>{s.enrollments.length}</Td>
                      {/* 학생 서명 공란 */}
                      <Td center>{' '}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </PrintShell>
  );
}
