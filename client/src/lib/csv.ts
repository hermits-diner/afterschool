// 쉼표·따옴표·줄바꿈이 든 값은 큰따옴표로 감싸고 내부 따옴표는 두 번 반복한다(RFC 4180).
// 강좌명·강의실에 쉼표가 있으면 이후 열이 전부 밀리던 문제를 막는다.
function cell(v: string | number) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// CSV 다운로드 — BOM 포함(한글 엑셀 호환). 행은 셀 배열로 받아 쉼표로 결합한다.
export function downloadCsv(filename: string, header: (string | number)[], rows: (string | number)[][]) {
  const csv = '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
