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
