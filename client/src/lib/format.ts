export const CATEGORIES = ['국어', '영어', '수학', '사회', '과학', '기타'];
export const DAYS = ['월', '화', '수', '목', '금'];

// 수업 슬롯: 요일 + 교시 범위 (시간은 표시하지 않고 교시만 사용)
export interface Slot {
  day: string;
  from: number;
  to: number;
}

export const PERIOD_COUNT = 9; // 1~9교시 (학기중 방과후: 8~9교시, 방학중: 1~4교시)

export function periodLabel(from: number, to: number) {
  return from === to ? `${from}교시` : `${from}~${to}교시`;
}

// 축약 표기: 월 7교시 → '월7', 월 7~9교시 → '월7~9'
export function slotLabel(s: Slot) {
  return s.from === s.to ? `${s.day}${s.from}` : `${s.day}${s.from}~${s.to}`;
}

export function scheduleLabel(slots?: Slot[] | null) {
  return slots && slots.length ? slots.map(slotLabel).join(', ') : '';
}
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

// 복수 학년 라벨: [] 또는 3개 전부 = 전학년, [1,2] = '1·2학년'
export function targetGradesLabel(grades?: number[] | null) {
  if (!grades || grades.length === 0 || grades.length >= 3) return '전학년';
  return `${[...grades].sort().join('·')}학년`;
}

export function formatFee(fee: number) {
  return fee === 0 ? '무료' : `${fee.toLocaleString()}원`;
}

// 강좌 소개 필수 내용 안내 예시문 (강좌 개설 폼 placeholder — 관리자·강사 공용)
export const DESCRIPTION_HINT =
  '무엇을 배우는지·수업 방식·준비물을 간략히 적어 주세요.\n예) 수능 비문학 지문을 유형별로 분석하고 매주 실전 문제를 풀이합니다. 준비물: 필기구';

export function roleLabel(role: string) {
  return { admin: '관리자', teacher: '강사', student: '학생' }[role] || role;
}

export function enrollStatusLabel(s?: string) {
  return { enrolled: '수강확정', cancelled: '취소' }[s || ''] || s || '';
}

export function courseStatusLabel(s: string) {
  return { open: '모집중', closed: '마감', cancelled: '폐강' }[s] || s;
}
