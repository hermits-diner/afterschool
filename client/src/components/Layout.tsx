import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../lib/format';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

export default function Layout({ nav, children }: { nav: NavItem[]; children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const roleTheme: Record<string, string> = {
    admin: 'from-slate-800 to-slate-900',
    teacher: 'from-emerald-700 to-emerald-900',
    student: 'from-brand-600 to-brand-800',
  };

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const sidebar = (
    <div className={`flex h-full flex-col bg-gradient-to-b ${roleTheme[user?.role || 'student']} text-white`}>
      <div className="flex items-center gap-2 px-6 py-5">
        <span className="text-2xl">🎓</span>
        <div>
          <div className="text-base font-bold leading-tight">방과후학교</div>
          <div className="text-xs text-white/60">수강신청 시스템</div>
        </div>
      </div>
      <div className="mx-4 mb-4 rounded-lg bg-white/10 px-4 py-3">
        <div className="text-sm font-semibold">{user?.name}</div>
        <div className="text-xs text-white/70">
          {roleLabel(user?.role || '')}
          {user?.role === 'student' && user?.grade
            ? ` · ${user.grade}학년 ${user.class_no}반`
            : user?.subject_area
            ? ` · ${user.subject_area}`
            : ''}
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-white/20 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          로그아웃
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">{sidebar}</aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64">{sidebar}</aside>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:px-8">
          <button className="btn-ghost lg:hidden" onClick={() => setMobileOpen(true)} aria-label="메뉴">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
            </svg>
          </button>
          <div className="hidden text-sm text-slate-500 lg:block">
            2026학년도 1학기 방과후학교
          </div>
          <div className="flex items-center gap-3">
            <NavLink to="settings/password" className="text-sm text-slate-500 hover:text-slate-800">
              비밀번호 변경
            </NavLink>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
              {user?.name?.[0]}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-slate-50 p-4 lg:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
