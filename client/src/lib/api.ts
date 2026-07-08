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
  target_grade: number;
  fee: number;
  semester: string;
  status: 'open' | 'closed' | 'cancelled';
  enrolled_count: number;
  waitlisted_count: number;
  seats_left: number;
  is_full: boolean;
  // present on student "mine" responses
  enrollment_id?: number;
  enrollment_status?: 'enrolled' | 'waitlisted' | 'cancelled';
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
