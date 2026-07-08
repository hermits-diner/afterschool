import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, batch, getSettings, setSetting } from '../db.js';
import { authRequired, requireRole, hashPassword, ah } from '../auth.js';
import { publicUser, decorateCourses, promoteWaitlist, getCourseRoster } from '../logic.js';

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

/* ---------------- Settings ---------------- */
router.get('/settings', ah(async (req, res) => res.json({ settings: await getSettings() })));

router.put('/settings', ah(async (req, res) => {
  const schema = z.object({
    semester: z.string().optional(),
    registration_open: z.union([z.boolean(), z.string()]).optional(),
    registration_start: z.string().optional(),
    registration_end: z.string().optional(),
    max_courses_per_student: z.union([z.number(), z.string()]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '설정값이 올바르지 않습니다.' });
  for (const [k, v] of Object.entries(parsed.data)) await setSetting(k, v);
  res.json({ settings: await getSettings() });
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
