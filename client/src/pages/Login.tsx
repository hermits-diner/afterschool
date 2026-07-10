import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, Role, ApiError } from '../lib/api';
import { GraduationCap, Backpack, Presentation, ShieldCheck, Megaphone, AlertCircle } from 'lucide-react';

// 랜딩 공지 — 비로그인 공개 정보 (신청기간·접수상태·관리자 공지문)
interface Landing {
  semester: { code: string; name: string };
  registration_open: boolean;
  registration_start: string | null;
  registration_end: string | null;
  notice: string;
}

const fmtDT = (s: string | null) => (s ? s.replace('T', ' ') : '');

// 강좌 키워드 띠 — 데스크톱 하단·모바일 하단 마퀴 공용
const KEYWORDS = [
  '📖 수능 국어', '✍️ 영어 독해', '📐 수학 심화', '🌏 사회탐구', '🧪 과학탐구',
  '📚 문학·독서', '🗣️ 영어 회화', '📝 논술', '🧮 미적분', '🔬 물리·화학 실험',
  '🏛️ 한국사', '💻 프로그래밍', '🎨 미술', '🎹 음악', '⚽ 축구', '🏀 농구', '💃 댄스',
];

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

        <div className="relative max-w-2xl pb-16">
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
          {/* 유동 그리드 — 홀수(3장) 배치(rule of odds), 패널 폭에 맞춰 함께 줄어들어 잘리지 않음 */}
          <div className="anim-fade-up anim-delay-3 mt-12 grid grid-cols-3 items-end gap-5">
            <img
              src="https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=600&q=75"
              alt="국어·독서"
              className="animate-float aspect-[4/5] w-full -rotate-6 rounded-2xl object-cover shadow-2xl ring-1 ring-white/30"
            />
            <img
              src="https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=600&q=75"
              alt="수학 문제 풀이"
              className="animate-float aspect-[4/5] w-full rotate-2 rounded-2xl object-cover shadow-2xl ring-1 ring-white/30"
              style={{ animationDelay: '-1.6s', marginBottom: '1.5rem' }}
            />
            <img
              src="https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=600&q=75"
              alt="영어·학습"
              className="animate-float aspect-[4/5] w-full rotate-6 rounded-2xl object-cover shadow-2xl ring-1 ring-white/30"
              style={{ animationDelay: '-3.2s' }}
            />
          </div>
        </div>

        {/* 강좌 키워드 무한 스크롤 띠 */}
        <div className="absolute bottom-0 left-0 right-0 overflow-hidden border-t border-white/10 bg-black/20 py-3 backdrop-blur-sm">
          <div className="animate-marquee flex w-max gap-10 whitespace-nowrap text-sm font-medium text-white/60">
            {[0, 1].map((dup) => (
              <span key={dup} className="flex gap-10">
                {KEYWORDS.map((k) => (
                  <span key={k}>{k}</span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile hero — 데스크톱 브랜드 패널의 축소판 (폼이 첫 화면에 보이도록 높이 절제) */}
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 px-6 pb-14 pt-7 text-white lg:hidden">
        <div className="anim-fade-up flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
            <GraduationCap size={22} />
          </span>
          <div>
            <div className="text-sm font-bold leading-tight">방과후학교</div>
            <div className="text-[11px] text-white/60">온라인 수강신청 시스템</div>
          </div>
        </div>
        <div className="mt-5 flex items-end justify-between gap-4">
          <h1 className="anim-fade-up anim-delay-1 text-xl font-bold leading-snug">
            배움은 스스로를
            <br />
            만들어 가는 일입니다
          </h1>
          {/* 사진 스트립 — 콜라주 축소판, 홀수(3장) 배치(rule of odds) */}
          <div className="anim-fade-up anim-delay-2 flex shrink-0 items-end gap-2">
            <img
              src="https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=300&q=70"
              alt=""
              className="h-14 w-11 -rotate-6 rounded-lg object-cover shadow-lg ring-1 ring-white/30"
            />
            <img
              src="https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=300&q=70"
              alt=""
              className="h-[4.5rem] w-[3.25rem] rotate-2 rounded-lg object-cover shadow-lg ring-1 ring-white/30"
            />
            <img
              src="https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=300&q=70"
              alt=""
              className="h-14 w-11 rotate-6 rounded-lg object-cover shadow-lg ring-1 ring-white/30"
            />
          </div>
        </div>
      </div>

      {/* Form panel — 모바일에서는 히어로 위로 살짝 겹쳐 올라옴 */}
      <div className="relative -mt-6 flex flex-1 items-center justify-center rounded-t-3xl bg-slate-50 p-6 lg:mt-0 lg:rounded-none">
        <div className="w-full max-w-md">

          {/* 공지 — 수강신청 기간·접수 상태 + 관리자 안내문 */}
          {landing && (landing.registration_start || landing.registration_end || landing.notice) && (
            <div className="card anim-fade-up mb-4 p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                  <Megaphone size={15} className="text-brand-500" />
                  {landing.semester.name} 수강신청 안내
                </h3>
                <span className={`badge shrink-0 ${landing.registration_open ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                  {landing.registration_open ? '접수중' : '접수마감'}
                </span>
              </div>
              {(landing.registration_start || landing.registration_end) && (
                <p className="mt-2 text-sm text-slate-600 [font-variant-numeric:tabular-nums]">
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
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 px-2 py-4 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2 active:scale-[.98] ${
                    role === r.key
                      ? 'border-brand-500 bg-brand-50 shadow-lift'
                      : 'border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-card'
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
                <div role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-100">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary w-full py-3 text-base" disabled={loading}>
                {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
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

      {/* 모바일 하단 키워드 띠 — 데스크톱 마퀴의 라이트 버전 */}
      <div className="overflow-hidden border-t border-slate-200 bg-white py-2.5 lg:hidden">
        <div className="animate-marquee flex w-max gap-8 whitespace-nowrap text-[13px] font-medium text-slate-400">
          {[0, 1].map((dup) => (
            <span key={dup} className="flex gap-8">
              {KEYWORDS.map((k) => (
                <span key={k}>{k}</span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
