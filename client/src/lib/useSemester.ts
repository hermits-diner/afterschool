import { useEffect, useState } from 'react';
import { api } from './api';
import { SEMESTER_LABEL } from './format';

// Module-level cache: one /meta fetch per page load.
let cached: string | null = null;

// '2026학년도 1학기 방과후학교' — active session label for header/print documents.
export function useSemesterLabel() {
  const [label, setLabel] = useState(cached || SEMESTER_LABEL);
  useEffect(() => {
    if (cached) return;
    api
      .get<{ semester: { code: string; name: string } }>('/meta')
      .then((r) => {
        cached = `${r.semester.name} 방과후학교`;
        setLabel(cached);
      })
      .catch(() => {});
  }, []);
  return label;
}

// 수강신청 접수 여부 — 마감 시 학생 화면의 신청·취소 버튼을 잠근다.
// null = 로딩 중 (버튼을 미리 잠그지 않도록 구분)
export function useRegistrationOpen() {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    api
      .get<{ registration_open: boolean }>('/meta')
      .then((r) => setOpen(r.registration_open))
      .catch(() => setOpen(true)); // 조회 실패 시 서버 검증에 맡김
  }, []);
  return open;
}
