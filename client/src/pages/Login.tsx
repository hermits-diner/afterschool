import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, Role } from '../lib/api';
import { ApiError } from '../lib/api';
import { Check, GraduationCap } from 'lucide-react';

const ROLES: { key: Role; label: string; desc: string; emoji: string }[] = [
  { key: 'student', label: '학생', desc: '강좌 조회 및 수강신청', emoji: '🎒' },
  { key: 'teacher', label: '강사', desc: '수강생·출석 관리', emoji: '👩‍🏫' },
  { key: 'admin', label: '관리자', desc: '강좌·회원·운영 관리', emoji: '🛠️' },
];

const DEMO: Record<Role, { id: string; pw: string }> = {
  student: { id: 'student', pw: 'student123' },
  teacher: { id: 'teacher1', pw: 'teacher123' },
  admin: { id: 'admin', pw: 'admin123' },
};

interface GoogleCfg {
  enabled: boolean;
  client_id: string | null;
  domain: string | null;
}

export default function Login() {
  const { login, googleLogin } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>('student');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleCfg, setGoogleCfg] = useState<GoogleCfg | null>(null);
  const roleRef = useRef<Role>('student');
  roleRef.current = role;

  useEffect(() => {
    api.get<GoogleCfg>('/auth/google/config').then(setGoogleCfg).catch(() => {});
  }, []);

  // Google Identity Services 버튼 (설정된 경우에만)
  useEffect(() => {
    if (!googleCfg?.enabled || !googleCfg.client_id) return;
    function init() {
      const g = (window as any).google;
      if (!g?.accounts?.id) return;
      g.accounts.id.initialize({
        client_id: googleCfg!.client_id,
        callback: async (resp: any) => {
          setError('');
          try {
            const user = await googleLogin(resp.credential, roleRef.current);
            navigate(`/${user.role}`, { replace: true });
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Google 로그인에 실패했습니다.');
          }
        },
      });
      const el = document.getElementById('google-signin');
      if (el) g.accounts.id.renderButton(el, { theme: 'outline', size: 'large', width: 320, text: 'signin_with', locale: 'ko' });
    }
    if ((window as any).google?.accounts?.id) {
      init();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = init;
    document.head.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleCfg]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(username.trim(), password, role);
      navigate(`/${user.role}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  function fillDemo() {
    setUsername(DEMO[role].id);
    setPassword(DEMO[role].pw);
    setError('');
  }

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* Brand panel */}
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-12 text-white lg:flex">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-white/5" />
        <div className="relative max-w-md">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
            <GraduationCap size={30} />
          </div>
          <h1 className="text-3xl font-bold leading-tight">방과후학교 온라인 수강신청 시스템</h1>
          <p className="mt-4 text-brand-100">
            선착순 수강신청, 실시간 정원 확인, 시간표 관리, 출석 체크까지.
            한 곳에서 방과후학교를 편리하게 운영하세요.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-brand-50">
            <li className="flex items-center gap-2"><Dot /> 학생 · 강사 · 관리자 통합 포털</li>
            <li className="flex items-center gap-2"><Dot /> 실시간 정원 및 대기자 관리</li>
            <li className="flex items-center gap-2"><Dot /> 시간표 충돌 자동 검사</li>
            <li className="flex items-center gap-2"><Dot /> 강좌별 출석·통계 리포트</li>
          </ul>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center lg:hidden">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white">
              <GraduationCap size={26} />
            </div>
            <h1 className="mt-2 text-xl font-bold text-slate-900">방과후학교 수강신청</h1>
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-bold text-slate-900">로그인</h2>
            <p className="mt-1 text-sm text-slate-500">이용 유형을 선택하고 로그인하세요.</p>

            {/* Role selector */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => {
                    setRole(r.key);
                    setError('');
                  }}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 px-2 py-3 text-center transition ${
                    role === r.key
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className="text-xl">{r.emoji}</span>
                  <span className="text-sm font-semibold text-slate-800">{r.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-slate-400">
              {ROLES.find((r) => r.key === role)?.desc}
            </p>

            <form onSubmit={submit} className="mt-4 space-y-3">
              <div>
                <label className="label">아이디</label>
                <input
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="아이디를 입력하세요"
                  autoComplete="username"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">비밀번호</label>
                <input
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? '로그인 중...' : '로그인'}
              </button>
            </form>

            {googleCfg?.enabled && (
              <div className="mt-4">
                <div className="mb-3 flex items-center gap-3 text-xs text-slate-400">
                  <div className="h-px flex-1 bg-slate-200" />
                  또는 학교 구글 계정으로
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <div id="google-signin" className="flex justify-center" />
                {googleCfg.domain && (
                  <p className="mt-2 text-center text-xs text-slate-400">@{googleCfg.domain} 계정만 로그인할 수 있습니다.</p>
                )}
              </div>
            )}

            <button
              onClick={fillDemo}
              className="mt-3 w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500 hover:bg-slate-100"
            >
              데모 계정 자동 입력 · {DEMO[role].id} / {DEMO[role].pw}
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-slate-400">
            © 2026 방과후학교 수강신청 시스템 · 데모
          </p>
        </div>
      </div>
    </div>
  );
}

function Dot() {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
      <Check size={12} />
    </span>
  );
}
