export const CATEGORIES = ['국어', '영어', '수학', '사회', '과학', '기타'];
export const DAYS = ['월', '화', '수', '목', '금'];
export const SEMESTER_LABEL = '2026학년도 1학기 방과후학교';

// '1학년 2반 3번' — full student number label
export function studentLabel(grade?: number | null, classNo?: number | null, studentNo?: number | null) {
  return `${grade}학년 ${classNo}반 ${studentNo}번`;
}

// '1-2-3' — compact student number
export function studentShort(grade?: number | null, classNo?: number | null, studentNo?: number | null) {
  return `${grade}-${classNo}-${studentNo}`;
}

export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export const CATEGORY_COLORS: Record<string, string> = {
  국어: 'bg-rose-100 text-rose-700',
  영어: 'bg-sky-100 text-sky-700',
  수학: 'bg-violet-100 text-violet-700',
  사회: 'bg-amber-100 text-amber-700',
  과학: 'bg-emerald-100 text-emerald-700',
  기타: 'bg-slate-100 text-slate-700',
};

export function categoryColor(cat: string) {
  return CATEGORY_COLORS[cat] || CATEGORY_COLORS['기타'];
}

export function targetGradeLabel(g: number) {
  return g === 0 ? '전학년' : `${g}학년`;
}

export function formatFee(fee: number) {
  return fee === 0 ? '무료' : `${fee.toLocaleString()}원`;
}

export function roleLabel(role: string) {
  return { admin: '관리자', teacher: '강사', student: '학생' }[role] || role;
}

export function enrollStatusLabel(s?: string) {
  return { enrolled: '수강확정', waitlisted: '대기', cancelled: '취소' }[s || ''] || s || '';
}

export function courseStatusLabel(s: string) {
  return { open: '모집중', closed: '마감', cancelled: '폐강' }[s] || s;
}
