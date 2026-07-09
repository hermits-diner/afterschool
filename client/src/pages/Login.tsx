import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, Role, ApiError } from '../lib/api';
import { GraduationCap, Backpack, Presentation, ShieldCheck } from 'lucide-react';

// 랜딩 공지 — 비로그인 공개 정보 (신청기간·접수상태·관리자 공지문)
interface Landing {
  semester: { code: string; name: string };
  registration_open: boolean;
  registration_start: string | null;
  registration_end: string | null;
  notice: string;
}

const fmtDT = (s: string | null) => (s ? s.replace('T', ' ') : '');

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
  const [landing, setLanding] = useState<Landing | null>(null);

  useEffect(() => {
    api.get<Landing>('/landing').then(setLanding).catch(() => {});
  }, []);

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
      {/* Brand panel — 배경 이미지 + 동기부여 문구 + 활동 사진 콜라주 */}
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-brand-900 p-12 text-white lg:flex">
        {/* 배경 이미지 (Unsplash) — 켄번즈 느린 줌. 로딩 전·실패 시에는 brand-900 배경 유지 */}
        <img
          src="https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1800&q=80"
          alt=""
          className="animate-kenburns absolute inset-0 h-full w-full object-cover"
        />
        {/* 가독성 오버레이 */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-950/90 via-brand-900/70 to-brand-950/85" />

        <div className="relative max-w-xl pb-16">
          <div className="anim-fade-up mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
            <GraduationCap size={34} />
          </div>
          <h1 className="anim-fade-up anim-delay-1 text-4xl font-bold leading-snug">
            배움은 스스로를
            <br />
            만들어 가는 일입니다
          </h1>
          <p className="anim-fade-up anim-delay-2 mt-6 text-lg leading-relaxed text-white/80">
            방과후의 한 시간이 모여 내일의 내가 됩니다.
            <br />
            좋아하는 것을, 지금 시작하세요.
          </p>

          {/* 교과 학습 사진 콜라주 — 폴라로이드풍, 서로 다른 기울기·타이밍으로 부유 */}
          <div className="anim-fade-up anim-delay-3 mt-12 flex items-end gap-4">
            <img
              src="https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=400&q=75"
              alt="국어·독서"
              className="animate-float h-40 w-32 -rotate-6 rounded-2xl object-cover shadow-2xl ring-1 ring-white/30"
            />
            <img
              src="https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=400&q=75"
              alt="수학"
              className="animate-float h-48 w-36 rotate-2 rounded-2xl object-cover shadow-2xl ring-1 ring-white/30"
              style={{ animationDelay: '-1.2s' }}
            />
            <img
              src="https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=400&q=75"
              alt="영어·학습"
              className="animate-float h-40 w-32 rotate-6 rounded-2xl object-cover shadow-2xl ring-1 ring-white/30"
              style={{ animationDelay: '-2.4s' }}
            />
            <img
              src="https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=400&q=75"
              alt="과학 실험"
              className="animate-float h-48 w-36 -rotate-3 rounded-2xl object-cover shadow-2xl ring-1 ring-white/30"
              style={{ animationDelay: '-3.6s' }}
            />
          </div>
        </div>

        {/* 강좌 키워드 무한 스크롤 띠 */}
        <div className="absolute bottom-0 left-0 right-0 overflow-hidden border-t border-white/10 bg-black/20 py-3 backdrop-blur-sm">
          <div className="animate-marquee flex w-max gap-10 whitespace-nowrap text-sm font-medium text-white/60">
            {[0, 1].map((dup) => (
              <span key={dup} className="flex gap-10">
                <span>📖 수능 국어</span><span>✍️ 영어 독해</span><span>📐 수학 심화</span>
                <span>🌏 사회탐구</span><span>🧪 과학탐구</span><span>📚 문학·독서</span>
                <span>🗣️ 영어 회화</span><span>📝 논술</span><span>🧮 미적분</span>
                <span>🔬 물리·화학 실험</span><span>🏛️ 한국사</span>
                <span>💻 프로그래밍</span><span>🎨 미술</span><span>🎹 음악</span>
                <span>⚽ 축구</span><span>🏀 농구</span><span>💃 댄스</span>
              </span>
            ))}
          </div>
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

          {/* 공지 — 수강신청 기간·접수 상태 + 관리자 안내문 */}
          {landing && (landing.registration_start || landing.registration_end || landing.notice) && (
            <div className="card anim-fade-up mb-4 p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-800">📢 {landing.semester.name} 수강신청 안내</h3>
                <span className={`badge shrink-0 ${landing.registration_open ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                  {landing.registration_open ? '접수중' : '접수마감'}
                </span>
              </div>
              {(landing.registration_start || landing.registration_end) && (
                <p className="mt-2 text-sm text-slate-600">
                  신청 기간: <b className="text-slate-800">{fmtDT(landing.registration_start) || '-'} ~ {fmtDT(landing.registration_end) || '-'}</b>
                </p>
              )}
              {landing.notice && (
                <p className="mt-2 whitespace-pre-wrap border-t border-slate-100 pt-2 text-sm text-slate-600">{landing.notice}</p>
              )}
            </div>
          )}

          <div className="card anim-fade-up anim-delay-1 p-8">
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
            방과후학교 온라인 수강신청 시스템
          </p>
        </div>
      </div>
    </div>
  );
}
