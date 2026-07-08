import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
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

function RequireRole({ role }: { role: Role }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />;
  return <Outlet />;
}

const adminNav: NavItem[] = [
  { to: '/admin', label: '대시보드', icon: <Icons.dashboard /> },
  { to: '/admin/courses', label: '강좌 관리', icon: <Icons.book /> },
  { to: '/admin/users', label: '회원 관리', icon: <Icons.users /> },
  { to: '/admin/enrollments', label: '수강신청 현황', icon: <Icons.clipboard /> },
  { to: '/admin/settings', label: '운영 설정', icon: <Icons.settings /> },
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
        <Route element={<RoleLayout nav={adminNav} />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/courses" element={<AdminCourses />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/enrollments" element={<AdminEnrollments />} />
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
