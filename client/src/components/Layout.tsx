import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../lib/format';
import { Icons } from './icons';

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
    admin: 'from-slate-800 to-slate-950',
    teacher: 'from-emerald-700 to-emerald-950',
    student: 'from-brand-600 to-brand-900',
  };

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const sidebar = (
    <div className={`flex h-full flex-col bg-gradient-to-b ${roleTheme[user?.role || 'student']} text-white`}>
      <div className="flex items-center gap-2.5 px-6 py-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
          <Icons.cap size={20} />
        </span>
        <div>
          <div className="text-base font-bold leading-tight">방과후학교</div>
          <div className="text-[11px] text-white/60">수강신청 시스템</div>
        </div>
      </div>
      <div className="mx-4 mb-5 flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/10">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
          {user?.name?.[0]}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{user?.name}</div>
          <div className="truncate text-[11px] text-white/70">
            {roleLabel(user?.role || '')}
            {user?.role === 'student' && user?.grade
              ? ` · ${user.grade}학년 ${user.class_no}반`
              : user?.subject_area
              ? ` · ${user.subject_area}`
              : ''}
          </div>
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
              `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive ? 'bg-white/15 text-white shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-white" />}
                <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Icons.logout size={18} />
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
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur lg:px-8">
          <button className="btn-ghost lg:hidden" onClick={() => setMobileOpen(true)} aria-label="메뉴">
            <Icons.menu size={22} />
          </button>
          <div className="hidden items-center gap-2 text-sm text-slate-500 lg:flex">
            <Icons.calendar size={16} className="text-slate-400" />
            2026학년도 1학기 방과후학교
          </div>
          <div className="flex items-center gap-4">
            <NavLink to="settings/password" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <Icons.key size={15} /> 비밀번호 변경
            </NavLink>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 ring-2 ring-white">
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
