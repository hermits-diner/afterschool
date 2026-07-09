import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { PrintShell, PrintMeta, PrintLoading, Th, Td } from '../../components/print';
import type { FinanceData } from './Finance';

const won = (n: number) => n.toLocaleString();

// Printable settlement report: per-course + per-teacher tables.
export default function PrintFinance() {
  const [data, setData] = useState<FinanceData | null>(null);

  useEffect(() => {
    api.get<FinanceData>('/admin/finance').then(setData);
  }, []);

  if (!data) return <PrintLoading />;
  const { courses, byTeacher, totals } = data;

  return (
    <PrintShell title="방과후학교 정산 보고서" hint="정산 보고서 미리보기 · 인쇄(Ctrl/⌘+P)" width="lg">
      <PrintMeta>
        총 수강료 수입 {won(totals.revenue)}원 · 총 강사료 {won(totals.teacher_pay)}원 · 수지 {won(totals.net)}원
      </PrintMeta>

      <h2 className="mb-2 text-base font-bold text-slate-800">강좌별 정산 내역 (단위: 원)</h2>
      <table className="print-table mb-8 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100">
            <Th w="5%">No.</Th>
            <Th>강좌명</Th>
            <Th w="10%">강사</Th>
            <Th w="7%">인원</Th>
            <Th w="11%">수강료 단가</Th>
            <Th w="12%">수강료 수입</Th>
            <Th w="11%">회당 강사료</Th>
            <Th w="8%">회차</Th>
            <Th w="12%">강사료</Th>
          </tr>
        </thead>
        <tbody>
          {courses.map((r, i) => (
            <tr key={r.id}>
              <Td center>{i + 1}</Td>
              <Td>{r.title}</Td>
              <Td center>{r.teacher_name}</Td>
              <Td center>{r.enrolled_count}</Td>
              <Td className="text-right">{won(r.fee)}</Td>
              <Td className="text-right">{won(r.revenue)}</Td>
              <Td className="text-right">{won(r.pay_rate)}</Td>
              <Td center>{r.session_count}</Td>
              <Td className="text-right">{won(r.teacher_pay)}</Td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-bold">
            <Td center colSpan={5}>합계</Td>
            <Td className="text-right">{won(totals.revenue)}</Td>
            <Td colSpan={2}></Td>
            <Td className="text-right">{won(totals.teacher_pay)}</Td>
          </tr>
        </tbody>
      </table>

      <h2 className="mb-2 text-base font-bold text-slate-800">강사별 강사료 집계 (지급용, 단위: 원)</h2>
      <table className="print-table w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100">
            <Th w="6%">No.</Th>
            <Th w="16%">강사</Th>
            <Th w="12%">담당 강좌</Th>
            <Th w="12%">총 회차</Th>
            <Th w="18%">강사료 합계</Th>
            <Th>서명</Th>
          </tr>
        </thead>
        <tbody>
          {byTeacher.map((t, i) => (
            <tr key={t.teacher_id ?? 'none'}>
              <Td center>{i + 1}</Td>
              <Td center>{t.teacher_name}</Td>
              <Td center>{t.course_count}개</Td>
              <Td center>{t.session_count}회</Td>
              <Td className="text-right font-semibold">{won(t.teacher_pay)}</Td>
              <Td style={{ height: 34 }}></Td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-bold">
            <Td center colSpan={4}>합계</Td>
            <Td className="text-right">{won(totals.teacher_pay)}</Td>
            <Td></Td>
          </tr>
        </tbody>
      </table>
    </PrintShell>
  );
}
