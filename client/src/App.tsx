import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Role } from './lib/api';
import { Spinner } from './components/ui';
import Layout, { NavItem } from './components/Layout';
import { Icons } from './components/icons';

import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';

import AdminDashboard from './pages/admin/Dashboard';
import AdminCourses from './pages/admin/Courses';
import AdminUsers from './pages/admin/Users';
import AdminEnrollments from './pages/admin/Enrollments';
import AdminSettings from './pages/admin/Settings';
import AdminFinance from './pages/admin/Finance';
import AdminClassStatus from './pages/admin/ClassStatus';
import AdminCancelled from './pages/admin/Cancelled';
import AdminPrintClassStatus from './pages/admin/PrintClassStatus';
import AdminPrintCancelled from './pages/admin/PrintCancelled';
import AdminPrintEnrollments from './pages/admin/PrintEnrollments';
import AdminPrintCourseCatalog from './pages/admin/PrintCourseCatalog';
import AdminPrintFinance from './pages/admin/PrintFinance';

import TeacherDashboard from './pages/teacher/Dashboard';
import TeacherCourses from './pages/teacher/Courses';
import TeacherRoster from './pages/teacher/Roster';
import TeacherAttendance from './pages/teacher/Attendance';
import PrintRoster from './pages/teacher/PrintRoster';
import PrintAttendance from './pages/teacher/PrintAttendance';

import StudentDashboard from './pages/student/Dashboard';
import StudentCatalog from './pages/student/Catalog';
import StudentMyCourses from './pages/student/MyCourses';
import StudentTimetable from './pages/student/Timetable';
import StudentPrintTimetable from './pages/student/PrintTimetable';

function RequireRole({ role }: { role: Role }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />;
  // 임시 비밀번호 사용자는 변경 완료 전까지 다른 페이지 접근 차단
  if (user.must_change_password && !location.pathname.endsWith('/settings/password')) {
    return <Navigate to={`/${user.role}/settings/password`} replace />;
  }
  return <Outlet />;
}

const adminNav: NavItem[] = [
  { to: '/admin', label: '대시보드', icon: <Icons.dashboard /> },
  // 준비: 학기 설정 → 회원 등록 → 강좌 개설
  { to: '/admin/settings', label: '세션(학기) 관리', icon: <Icons.settings />, section: '준비' },
  { to: '/admin/users', label: '회원 관리', icon: <Icons.users /> },
  { to: '/admin/courses', label: '강좌 관리', icon: <Icons.book /> },
  // 운영: 신청 현황 모니터링
  { to: '/admin/enrollments', label: '수강신청 현황', icon: <Icons.clipboard />, section: '운영' },
  { to: '/admin/classes', label: '반별 현황', icon: <Icons.users /> },
  { to: '/admin/cancelled', label: '폐강 재신청', icon: <Icons.clipboard /> },
  // 마감: 방과후행정 (강사료·총수강료 계산)
  { to: '/admin/finance', label: '방과후행정', icon: <Icons.wallet />, section: '마감' },
];
const teacherNav: NavItem[] = [
  { to: '/teacher', label: '대시보드', icon: <Icons.dashboard /> },
  { to: '/teacher/courses', label: '내 강좌', icon: <Icons.book /> },
  { to: '/teacher/roster', label: '수강생 명단', icon: <Icons.users /> },
  { to: '/teacher/attendance', label: '출석 관리', icon: <Icons.check /> },
];
const studentNav: NavItem[] = [
  { to: '/student', label: '대시보드', icon: <Icons.dashboard /> },
  { to: '/student/catalog', label: '강좌 신청', icon: <Icons.book /> },
  { to: '/student/my', label: '내 수강신청', icon: <Icons.clipboard /> },
  { to: '/student/timetable', label: '내 시간표', icon: <Icons.calendar /> },
];

function RoleLayout({ nav }: { nav: NavItem[] }) {
  return (
    <Layout nav={nav}>
      <Outlet />
    </Layout>
  );
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={`/${user.role}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<HomeRedirect />} />

      {/* Admin */}
      <Route element={<RequireRole role="admin" />}>
        {/* Standalone print views (no sidebar) */}
        <Route path="/admin/print/enrollments" element={<AdminPrintEnrollments />} />
        <Route path="/admin/print/catalog" element={<AdminPrintCourseCatalog />} />
        <Route path="/admin/print/finance" element={<AdminPrintFinance />} />
        <Route path="/admin/print/class/:grade/:classNo" element={<AdminPrintClassStatus />} />
        <Route path="/admin/print/cancelled/:grade/:classNo" element={<AdminPrintCancelled />} />
        <Route element={<RoleLayout nav={adminNav} />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/courses" element={<AdminCourses />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/enrollments" element={<AdminEnrollments />} />
          <Route path="/admin/classes" element={<AdminClassStatus />} />
          <Route path="/admin/cancelled" element={<AdminCancelled />} />
          <Route path="/admin/finance" element={<AdminFinance />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/settings/password" element={<ChangePassword />} />
        </Route>
      </Route>

      {/* Teacher */}
      <Route element={<RequireRole role="teacher" />}>
        {/* Standalone print views (no sidebar) */}
        <Route path="/teacher/print/roster/:id" element={<PrintRoster />} />
        <Route path="/teacher/print/attendance/:id" element={<PrintAttendance />} />
        <Route element={<RoleLayout nav={teacherNav} />}>
          <Route path="/teacher" element={<TeacherDashboard />} />
          <Route path="/teacher/courses" element={<TeacherCourses />} />
          <Route path="/teacher/roster" element={<TeacherRoster />} />
          <Route path="/teacher/attendance" element={<TeacherAttendance />} />
          <Route path="/teacher/settings/password" element={<ChangePassword />} />
        </Route>
      </Route>

      {/* Student */}
      <Route element={<RequireRole role="student" />}>
        {/* Standalone print view (no sidebar) */}
        <Route path="/student/print/timetable" element={<StudentPrintTimetable />} />
        <Route element={<RoleLayout nav={studentNav} />}>
          <Route path="/student" element={<StudentDashboard />} />
          <Route path="/student/catalog" element={<StudentCatalog />} />
          <Route path="/student/my" element={<StudentMyCourses />} />
          <Route path="/student/timetable" element={<StudentTimetable />} />
          <Route path="/student/settings/password" element={<ChangePassword />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
