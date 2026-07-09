import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Role } from '../lib/api';
import { ApiError } from '../lib/api';
import { Check, GraduationCap, Backpack, Presentation, ShieldCheck } from 'lucide-react';

const ROLES: { key: Role; label: string; desc: string; icon: typeof Backpack }[] = [
  { key: 'student', label: '학생', desc: '강좌 조회 및 수강신청', icon: Backpack },
  { key: 'teacher', label: '강사', desc: '강좌 개설·수강생 관리', icon: Presentation },
  { key: 'admin', label: '관리자', desc: '강좌·회원·운영 관리', icon: ShieldCheck },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>('student');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* Brand panel — 학생 대상 안내 */}
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-12 text-white lg:flex">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-white/5" />
        <div className="relative max-w-lg">
          <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
            <GraduationCap size={34} />
          </div>
          <h1 className="text-4xl font-bold leading-snug">
            우리 학교 방과후학교,
            <br />
            온라인으로 신청하세요
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-brand-100">
            교실에서 줄 서지 않아도 됩니다.
            <br />
            원하는 강좌를 골라 클릭 한 번으로 신청 완료.
          </p>
          <ul className="mt-10 space-y-4 text-base text-brand-50">
            <li className="flex items-center gap-3"><Dot /> 선착순 신청 · 남은 자리 실시간 확인</li>
            <li className="flex items-center gap-3"><Dot /> 시간표 충돌·대상 학년 자동 검사로 안전한 신청</li>
            <li className="flex items-center gap-3"><Dot /> 내 수강신청과 교시별 시간표를 한눈에</li>
            <li className="flex items-center gap-3"><Dot /> 강좌 소개와 강의계획서 미리 보기</li>
          </ul>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center lg:hidden">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white">
              <GraduationCap size={30} />
            </div>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">방과후학교 온라인 수강신청</h1>
          </div>

          <div className="card p-8">
            <h2 className="text-2xl font-bold text-slate-900">로그인</h2>
            <p className="mt-1.5 text-base text-slate-500">이용 유형을 선택하고 로그인하세요.</p>

            {/* Role selector */}
            <div className="mt-6 grid grid-cols-3 gap-2.5">
              {ROLES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => {
                    setRole(r.key);
                    setError('');
                  }}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 px-2 py-4 text-center transition ${
                    role === r.key
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <r.icon size={26} strokeWidth={1.75} className={role === r.key ? 'text-brand-600' : 'text-slate-400'} />
                  <span className={`text-base font-semibold ${role === r.key ? 'text-brand-700' : 'text-slate-700'}`}>{r.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-center text-sm text-slate-400">
              {ROLES.find((r) => r.key === role)?.desc}
            </p>

            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <label className="label">아이디</label>
                <input
                  className="input py-2.5 text-base"
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
                  className="input py-2.5 text-base"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div>
              )}

              <button type="submit" className="btn-primary w-full py-3 text-base" disabled={loading}>
                {loading ? '로그인 중...' : '로그인'}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-400">
              학생 아이디는 <b className="text-slate-500">연도+학번</b>입니다 (예: 20261101)
            </p>
          </div>

          <p className="mt-5 text-center text-sm text-slate-400">
            © 2026 방과후학교 온라인 수강신청 시스템
          </p>
        </div>
      </div>
    </div>
  );
}

function Dot() {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20">
      <Check size={14} />
    </span>
  );
}
