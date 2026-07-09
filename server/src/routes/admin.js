import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, batch, getSettings, setSetting, semesterName } from '../db.js';
import { authRequired, requireRole, hashPassword, ah } from '../auth.js';
import { publicUser, decorateCourses, promoteWaitlist, getCourseRoster, getActiveSemester } from '../logic.js';

const router = Router();
router.use(authRequired, requireRole('admin'));

/* ---------------- Dashboard statistics ---------------- */
router.get('/stats', ah(async (req, res) => {
  const semester = (await getSettings()).semester;
  const count = async (sql, args) => (await get(sql, args)).c;
  const counts = {
    students: await count("SELECT COUNT(*) c FROM users WHERE role='student' AND active=1"),
    teachers: await count("SELECT COUNT(*) c FROM users WHERE role='teacher' AND active=1"),
    courses: await count('SELECT COUNT(*) c FROM courses WHERE semester=?', [semester]),
    open_courses: await count("SELECT COUNT(*) c FROM courses WHERE semester=? AND status='open'", [semester]),
    enrollments: await count(
      "SELECT COUNT(*) c FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.status='enrolled' AND c.semester=?",
      [semester]
    ),
    waitlisted: await count(
      "SELECT COUNT(*) c FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.status='waitlisted' AND c.semester=?",
      [semester]
    ),
  };

  // enrollment by category
  const byCategory = await all(
    `SELECT c.category, COUNT(e.id) AS count
     FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id AND e.status='enrolled'
     WHERE c.semester=? GROUP BY c.category ORDER BY count DESC`,
    [semester]
  );

  // top courses by fill rate
  const openCourses = await all("SELECT * FROM courses WHERE semester=? AND status='open'", [semester]);
  const courses = (await decorateCourses(openCourses))
    .sort((a, b) => b.enrolled_count / b.capacity - a.enrolled_count / a.capacity)
    .slice(0, 5);

  res.json({ counts, byCategory, popularCourses: courses });
}));

/* ---------------- Finance (정산) ---------------- */
// 수강료 수입 = 수강확정 인원 × 수강료 단가
// 강사료 = 회당 단가(pay_rate) × 실시 회차(출석부에 기록된 날짜 수)
router.get('/finance', ah(async (req, res) => {
  const semester = (await getSettings()).semester;
  const courses = await all(
    "SELECT * FROM courses WHERE semester = ? AND status != 'cancelled' ORDER BY teacher_id, day_of_week, start_time",
    [semester]
  );
  const decorated = await decorateCourses(courses);

  // 강좌별 실시 회차: 출석 체크된 고유 날짜 수
  const sessions = await all(
    `SELECT a.course_id, COUNT(DISTINCT a.date) AS s
     FROM attendance a JOIN courses c ON c.id = a.course_id
     WHERE c.semester = ? GROUP BY a.course_id`,
    [semester]
  );
  const sessionMap = Object.fromEntries(sessions.map((r) => [r.course_id, r.s]));

  const rows = decorated.map((c) => {
    // 회차 우선순위: 수동 입력 > 계획 차시(기본: 전부 실시 간주) > 출석부 자동 집계
    const autoCount = sessionMap[c.id] || 0;
    const sessionCount = c.session_override ?? (c.planned_sessions || autoCount);
    const revenue = c.enrolled_count * c.fee;
    const teacherPay = c.pay_rate * sessionCount;
    return {
      id: c.id,
      title: c.title,
      category: c.category,
      status: c.status,
      teacher_id: c.teacher_id,
      teacher_name: c.teacher_name,
      enrolled_count: c.enrolled_count,
      fee: c.fee,
      revenue,
      pay_rate: c.pay_rate,
      session_count: sessionCount,
      session_auto: autoCount,
      planned_sessions: c.planned_sessions,
      session_source:
        c.session_override != null ? 'manual' : c.planned_sessions ? 'planned' : 'attendance',
      teacher_pay: teacherPay,
    };
  });

  // 강사별 집계
  const byTeacherMap = new Map();
  for (const r of rows) {
    const key = r.teacher_id ?? 0;
    const t = byTeacherMap.get(key) || {
      teacher_id: r.teacher_id,
      teacher_name: r.teacher_name,
      course_count: 0,
      session_count: 0,
      teacher_pay: 0,
      revenue: 0,
    };
    t.course_count += 1;
    t.session_count += r.session_count;
    t.teacher_pay += r.teacher_pay;
    t.revenue += r.revenue;
    byTeacherMap.set(key, t);
  }
  const byTeacher = [...byTeacherMap.values()].sort((a, b) => b.teacher_pay - a.teacher_pay);

  const totals = {
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
    teacher_pay: rows.reduce((s, r) => s + r.teacher_pay, 0),
  };
  totals.net = totals.revenue - totals.teacher_pay;

  res.json({ semester, courses: rows, byTeacher, totals });
}));

// 실시 회차 수동 입력/해제 — count: 숫자면 수동값 저장, null이면 출석부 자동 집계로 복원.
router.patch('/courses/:id/sessions', ah(async (req, res) => {
  const schema = z.object({ count: z.number().int().min(0).max(999).nullable() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '회차는 0 이상의 숫자여야 합니다.' });
  const course = await get('SELECT id FROM courses WHERE id = ?', [req.params.id]);
  if (!course) return res.status(404).json({ error: '강좌를 찾을 수 없습니다.' });
  await run('UPDATE courses SET session_override = ? WHERE id = ?', [parsed.data.count, course.id]);
  res.json({ ok: true });
}));

/* ---------------- Semester (세션) management ---------------- */
const semesterSchema = z.object({
  code: z.string().regex(/^\d{4}-[12]$/, "세션 코드는 '2026-1' 형식이어야 합니다."),
  name: z.string().optional(),
  registration_open: z.union([z.boolean(), z.string()]).optional(),
  registration_start: z.string().optional().nullable(),
  registration_end: z.string().optional().nullable(),
  max_courses_per_student: z.union([z.number(), z.string()]).optional(),
  default_sessions: z.union([z.number(), z.string()]).optional(),
});

// List all semesters with per-semester course/enrollment counts.
router.get('/semesters', ah(async (req, res) => {
  const active = (await getSettings()).semester;
  const rows = await all('SELECT * FROM semesters ORDER BY code DESC');
  const courseCounts = await all('SELECT semester, COUNT(*) c FROM courses GROUP BY semester');
  const enrollCounts = await all(
    `SELECT c.semester, COUNT(*) c FROM enrollments e JOIN courses c ON c.id=e.course_id
     WHERE e.status != 'cancelled' GROUP BY c.semester`
  );
  const cMap = Object.fromEntries(courseCounts.map((r) => [r.semester, r.c]));
  const eMap = Object.fromEntries(enrollCounts.map((r) => [r.semester, r.c]));
  res.json({
    semesters: rows.map((r) => ({
      ...r,
      is_active: r.code === active,
      course_count: cMap[r.code] || 0,
      enrollment_count: eMap[r.code] || 0,
    })),
  });
}));

// Create a new semester (session).
router.post('/semesters', ah(async (req, res) => {
  const parsed = semesterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const dupe = await get('SELECT code FROM semesters WHERE code = ?', [d.code]);
  if (dupe) return res.status(409).json({ error: '이미 존재하는 세션 코드입니다.' });
  await run(
    `INSERT INTO semesters (code, name, registration_open, registration_start, registration_end, max_courses_per_student, default_sessions)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      d.code,
      d.name || semesterName(d.code),
      String(d.registration_open ?? 'true') === 'true' ? 'true' : 'false',
      d.registration_start || null,
      d.registration_end || null,
      Number(d.max_courses_per_student || 3),
      Number(d.default_sessions || 16),
    ]
  );
  const row = await get('SELECT * FROM semesters WHERE code = ?', [d.code]);
  res.status(201).json({ semester: row });
}));

// Update a semester's settings.
router.put('/semesters/:code', ah(async (req, res) => {
  const existing = await get('SELECT * FROM semesters WHERE code = ?', [req.params.code]);
  if (!existing) return res.status(404).json({ error: '세션을 찾을 수 없습니다.' });
  const parsed = semesterSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const merged = {
    name: d.name ?? existing.name,
    registration_open:
      d.registration_open !== undefined
        ? String(d.registration_open) === 'true'
          ? 'true'
          : 'false'
        : existing.registration_open,
    registration_start: d.registration_start !== undefined ? d.registration_start || null : existing.registration_start,
    registration_end: d.registration_end !== undefined ? d.registration_end || null : existing.registration_end,
    max_courses_per_student:
      d.max_courses_per_student !== undefined
        ? Number(d.max_courses_per_student)
        : existing.max_courses_per_student,
    default_sessions:
      d.default_sessions !== undefined ? Number(d.default_sessions) : existing.default_sessions,
  };
  await run(
    `UPDATE semesters SET name=?, registration_open=?, registration_start=?, registration_end=?, max_courses_per_student=?, default_sessions=?
     WHERE code=?`,
    [merged.name, merged.registration_open, merged.registration_start, merged.registration_end, merged.max_courses_per_student, merged.default_sessions, existing.code]
  );
  res.json({ semester: await get('SELECT * FROM semesters WHERE code = ?', [existing.code]) });
}));

// Switch the active session — new courses/신청 화면이 이 세션 기준으로 동작.
router.post('/semesters/:code/activate', ah(async (req, res) => {
  const existing = await get('SELECT * FROM semesters WHERE code = ?', [req.params.code]);
  if (!existing) return res.status(404).json({ error: '세션을 찾을 수 없습니다.' });
  await setSetting('semester', existing.code);
  res.json({ ok: true, active: existing.code });
}));

// Delete a semester AND everything linked to it:
// 강좌 → 수강신청 → 출석 → 공지 모두 함께 삭제 (단일 트랜잭션).
router.delete('/semesters/:code', ah(async (req, res) => {
  const code = req.params.code;
  const existing = await get('SELECT * FROM semesters WHERE code = ?', [code]);
  if (!existing) return res.status(404).json({ error: '세션을 찾을 수 없습니다.' });
  const active = (await getSettings()).semester;
  if (code === active) {
    return res.status(400).json({ error: '활성 세션은 삭제할 수 없습니다. 먼저 다른 세션을 활성화하세요.' });
  }
  const inSemester = 'SELECT id FROM courses WHERE semester = ?';
  await batch([
    { sql: `DELETE FROM attendance WHERE course_id IN (${inSemester})`, args: [code] },
    { sql: `DELETE FROM announcements WHERE course_id IN (${inSemester})`, args: [code] },
    { sql: `DELETE FROM enrollments WHERE course_id IN (${inSemester})`, args: [code] },
    { sql: 'DELETE FROM courses WHERE semester = ?', args: [code] },
    { sql: 'DELETE FROM semesters WHERE code = ?', args: [code] },
  ]);
  res.json({ ok: true });
}));

/* ---------------- User management ---------------- */
router.get('/users', ah(async (req, res) => {
  const { role, q } = req.query;
  const clauses = [];
  const params = [];
  if (role) {
    clauses.push('role = ?');
    params.push(role);
  }
  if (q) {
    clauses.push('(name LIKE ? OR username LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await all(
    `SELECT * FROM users ${where} ORDER BY role, grade, class_no, student_no, name`,
    params
  );
  res.json({ users: rows.map(publicUser) });
}));

const userSchema = z.object({
  username: z.string().min(3, '아이디는 3자 이상이어야 합니다.'),
  password: z.string().min(4, '비밀번호는 4자 이상이어야 합니다.'),
  role: z.enum(['admin', 'teacher', 'student']),
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  grade: z.number().int().min(1).max(3).optional().nullable(),
  class_no: z.number().int().optional().nullable(),
  student_no: z.number().int().optional().nullable(),
  subject_area: z.string().optional(),
});

router.post('/users', ah(async (req, res) => {
  const parsed = userSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const dupe = await get('SELECT id FROM users WHERE username = ?', [d.username]);
  if (dupe) return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
  const info = await run(
    `INSERT INTO users (username, password_hash, role, name, email, phone, grade, class_no, student_no, subject_area)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.username,
      hashPassword(d.password),
      d.role,
      d.name,
      d.email || null,
      d.phone || null,
      d.grade ?? null,
      d.class_no ?? null,
      d.student_no ?? null,
      d.subject_area || null,
    ]
  );
  const user = await get('SELECT * FROM users WHERE id = ?', [info.lastInsertRowid]);
  res.status(201).json({ user: publicUser(user) });
}));

// Bulk-register students: 학번 4자리(학년1+반1+번호2) + 이름 + 임시비밀번호.
// username = 활성 세션 연도 + 학번 (예: 2026년 1학년 1반 1번 → '20261101').
// 첫 로그인 시 비밀번호 변경 강제.
router.post('/users/bulk', ah(async (req, res) => {
  const schema = z.object({
    students: z
      .array(
        z.object({
          grade: z.number().int().min(1).max(3),
          class_no: z.number().int().min(1).max(9),
          student_no: z.number().int().min(1).max(99),
          name: z.string().min(1),
          password: z.string().min(4, '임시비밀번호는 4자 이상이어야 합니다.'),
        })
      )
      .min(1)
      .max(500),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const semester = await getActiveSemester();
  const yearMatch = String(semester.code || '').match(/^(\d{4})/);
  const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());

  const pad2 = (n) => String(n).padStart(2, '0');
  const created = [];
  const skipped = [];
  for (const s of parsed.data.students) {
    // 학번 4자리: 학년(1) + 반(1) + 번호(2)
    const username = `${year}${s.grade}${s.class_no}${pad2(s.student_no)}`;
    const dupe = await get('SELECT id FROM users WHERE username = ?', [username]);
    if (dupe) {
      skipped.push({ username, name: s.name, reason: '이미 존재하는 아이디' });
      continue;
    }
    await run(
      `INSERT INTO users (username, password_hash, role, name, grade, class_no, student_no, must_change_password)
       VALUES (?, ?, 'student', ?, ?, ?, ?, 1)`,
      [username, hashPassword(s.password), s.name, s.grade, s.class_no, s.student_no]
    );
    created.push({ username, name: s.name });
  }
  res.status(201).json({ created, skipped });
}));

// Bulk-register teachers: 아이디 + 이름 + 담당분야 + 임시비밀번호.
// 첫 로그인 시 비밀번호 변경 강제 (학생 일괄등록과 동일한 흐름).
router.post('/users/bulk-teachers', ah(async (req, res) => {
  const schema = z.object({
    teachers: z
      .array(
        z.object({
          username: z.string().min(3, '아이디는 3자 이상이어야 합니다.'),
          name: z.string().min(1),
          subject_area: z.string().optional(),
          password: z.string().min(4, '임시비밀번호는 4자 이상이어야 합니다.'),
        })
      )
      .min(1)
      .max(200),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const created = [];
  const skipped = [];
  for (const t of parsed.data.teachers) {
    const dupe = await get('SELECT id FROM users WHERE username = ?', [t.username]);
    if (dupe) {
      skipped.push({ username: t.username, name: t.name, reason: '이미 존재하는 아이디' });
      continue;
    }
    await run(
      `INSERT INTO users (username, password_hash, role, name, subject_area, must_change_password)
       VALUES (?, ?, 'teacher', ?, ?, 1)`,
      [t.username, hashPassword(t.password), t.name, t.subject_area || null]
    );
    created.push({ username: t.username, name: t.name });
  }
  res.status(201).json({ created, skipped });
}));

// Bulk-delete users by id (본인 계정은 자동 제외).
router.post('/users/bulk-delete', ah(async (req, res) => {
  const schema = z.object({ ids: z.array(z.number().int()).min(1).max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '삭제할 회원을 선택하세요.' });
  const ids = [...new Set(parsed.data.ids)].filter((id) => id !== req.user.id);
  if (!ids.length) return res.status(400).json({ error: '삭제할 수 있는 회원이 없습니다.' });
  const ph = ids.map(() => '?').join(',');
  await batch([
    { sql: `DELETE FROM attendance WHERE student_id IN (${ph})`, args: ids },
    { sql: `DELETE FROM enrollments WHERE student_id IN (${ph})`, args: ids },
    { sql: `UPDATE announcements SET author_id = NULL WHERE author_id IN (${ph})`, args: ids },
    { sql: `UPDATE courses SET teacher_id = NULL WHERE teacher_id IN (${ph})`, args: ids },
    { sql: `DELETE FROM users WHERE id IN (${ph})`, args: ids },
  ]);
  res.json({ ok: true, deleted: ids.length });
}));

router.put('/users/:id', ah(async (req, res) => {
  const existing = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  const schema = userSchema.partial().extend({ active: z.boolean().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const merged = {
    ...existing,
    ...d,
    email: d.email !== undefined ? d.email || null : existing.email,
    active: d.active !== undefined ? (d.active ? 1 : 0) : existing.active,
    password_hash: d.password ? hashPassword(d.password) : existing.password_hash,
  };
  await run(
    `UPDATE users SET password_hash=?, name=?, email=?, phone=?,
     grade=?, class_no=?, student_no=?, subject_area=?, active=?
     WHERE id=?`,
    [
      merged.password_hash,
      merged.name,
      merged.email,
      merged.phone,
      merged.grade ?? null,
      merged.class_no ?? null,
      merged.student_no ?? null,
      merged.subject_area || null,
      merged.active,
      existing.id,
    ]
  );
  const user = await get('SELECT * FROM users WHERE id = ?', [existing.id]);
  res.json({ user: publicUser(user) });
}));

// Delete user — children removed explicitly so behavior doesn't depend on
// the remote DB's foreign_keys pragma.
router.delete('/users/:id', ah(async (req, res) => {
  const user = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  if (user.id === req.user.id) return res.status(400).json({ error: '본인 계정은 삭제할 수 없습니다.' });
  await batch([
    { sql: 'DELETE FROM attendance WHERE student_id = ?', args: [user.id] },
    { sql: 'DELETE FROM enrollments WHERE student_id = ?', args: [user.id] },
    { sql: 'UPDATE announcements SET author_id = NULL WHERE author_id = ?', args: [user.id] },
    { sql: 'UPDATE courses SET teacher_id = NULL WHERE teacher_id = ?', args: [user.id] },
    { sql: 'DELETE FROM users WHERE id = ?', args: [user.id] },
  ]);
  res.json({ ok: true });
}));

/* ---------------- Enrollment management ---------------- */
// Roster for any course (신청순 — 대기 순번 확인용)
router.get('/courses/:id/roster', ah(async (req, res) => {
  res.json({ roster: await getCourseRoster(req.params.id, 'created') });
}));

// Force-remove a student from a course (admin)
router.delete('/enrollments/:id', ah(async (req, res) => {
  const enrollment = await get('SELECT * FROM enrollments WHERE id = ?', [req.params.id]);
  if (!enrollment) return res.status(404).json({ error: '신청 내역을 찾을 수 없습니다.' });
  const wasEnrolled = enrollment.status === 'enrolled';
  await run("UPDATE enrollments SET status='cancelled' WHERE id = ?", [enrollment.id]);
  if (wasEnrolled) await promoteWaitlist(enrollment.course_id);
  res.json({ ok: true });
}));

// All enrollments overview (with student + course)
router.get('/enrollments', ah(async (req, res) => {
  const semester = (await getSettings()).semester;
  const rows = await all(
    `SELECT e.id, e.status, e.created_at, u.name AS student_name, u.grade, u.class_no, u.student_no,
            c.title AS course_title, c.category, c.id AS course_id
     FROM enrollments e JOIN users u ON u.id=e.student_id JOIN courses c ON c.id=e.course_id
     WHERE c.semester = ? AND e.status != 'cancelled'
     ORDER BY e.created_at DESC`,
    [semester]
  );
  res.json({ enrollments: rows });
}));

export default router;
