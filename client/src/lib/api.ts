export type Role = 'admin' | 'teacher' | 'student';

export interface User {
  id: number;
  username: string;
  role: Role;
  name: string;
  email?: string | null;
  phone?: string | null;
  grade?: number | null;
  class_no?: number | null;
  student_no?: number | null;
  subject_area?: string | null;
  active?: boolean;
  is_super?: boolean; // 시스템 관리자 (부관리자 관리 권한)
  must_change_password?: boolean;
  locked?: boolean; // 로그인 실패 누적으로 잠긴 상태
}

export interface Course {
  id: number;
  title: string;
  category: string;
  description: string;
  teacher_id: number | null;
  teacher_name: string;
  capacity: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room: string;
  textbook?: string | null; // 부교재명 (빈값 = 자체제작)
  target_grade: number;
  fee: number;
  pay_rate: number;
  planned_sessions: number;
  semester: string;
  status: 'open' | 'closed' | 'cancelled';
  enrolled_count: number;
  seats_left: number;
  is_full: boolean;
  accepting?: boolean; // 강좌 소속 세션이 현재 접수 중인지 (동시 접수 지원)
  syllabus_filename?: string | null;
  schedule?: { day: string; from: number; to: number }[] | null;
  schedule_label?: string;
  group_id?: number | null;
  group_name?: string | null;
  target_grades?: number[];
  // present on student "mine" responses
  enrollment_id?: number;
  enrollment_status?: 'enrolled' | 'cancelled';
}

export interface CourseGroup {
  id: number;
  name: string;
  schedule: { day: string; from: number; to: number }[];
  default_sessions?: number; // 교과군 기본 계획 차시 (0/미설정 = 세션 기본값 따름)
}

const TOKEN_KEY = 'afterschool_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    credentials: 'include',
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new ApiError(body?.error || '요청을 처리하지 못했습니다.', res.status);
  }
  return body as T;
}

// File → base64 payload (data URL prefix 제거)
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Authenticated file download → browser save
export async function downloadCourseFile(courseId: number, filename: string) {
  const token = getToken();
  const res = await fetch(`/api/courses/${courseId}/syllabus`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) throw new ApiError('다운로드에 실패했습니다.', res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 전체 데이터 백업 JSON → 브라우저(관리자 PC)로 저장.
// 서버리스라 서버에 보관할 곳이 없어 내려받는 방식으로 처리한다.
export async function downloadBackup() {
  const token = getToken();
  const res = await fetch('/api/admin/backup', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) {
    let message = '백업에 실패했습니다.';
    try {
      message = (await res.json())?.error || message;
    } catch {
      /* 본문이 JSON이 아니면 기본 메시지 사용 */
    }
    throw new ApiError(message, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `afterschool-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data ?? {}) }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
