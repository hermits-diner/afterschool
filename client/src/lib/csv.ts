// CSV 다운로드 — BOM 포함(한글 엑셀 호환). 행은 셀 배열로 받아 쉼표로 결합한다.
export function downloadCsv(filename: string, header: (string | number)[], rows: (string | number)[][]) {
  const csv = '﻿' + [header, ...rows].map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
