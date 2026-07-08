import { Router } from 'express';
import { z } from 'zod';
import db, { getSettings, setSetting } from '../db.js';
import { authRequired, requireRole, hashPassword } from '../auth.js';
import { publicUser, decorateCourse, promoteWaitlist, getCourseRoster } from '../logic.js';

const router = Router();
router.use(authRequired, requireRole('admin'));

/* ---------------- Dashboard statistics ---------------- */
router.get('/stats', (req, res) => {
  const semester = getSettings().semester;
  const counts = {
    students: db.prepare("SELECT COUNT(*) c FROM users WHERE role='student' AND active=1").get().c,
    teachers: db.prepare("SELECT COUNT(*) c FROM users WHERE role='teacher' AND active=1").get().c,
    courses: db.prepare('SELECT COUNT(*) c FROM courses WHERE semester=?').get(semester).c,
    open_courses: db.prepare("SELECT COUNT(*) c FROM courses WHERE semester=? AND status='open'").get(semester).c,
    enrollments: db
      .prepare(
        "SELECT COUNT(*) c FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.status='enrolled' AND c.semester=?"
      )
      .get(semester).c,
    waitlisted: db
      .prepare(
        "SELECT COUNT(*) c FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.status='waitlisted' AND c.semester=?"
      )
      .get(semester).c,
  };

  // enrollment by category
  const byCategory = db
    .prepare(
      `SELECT c.category, COUNT(e.id) AS count
       FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id AND e.status='enrolled'
       WHERE c.semester=? GROUP BY c.category ORDER BY count DESC`
    )
    .all(semester);

  // top courses by fill rate
  const courses = db
    .prepare("SELECT * FROM courses WHERE semester=? AND status='open'")
    .all(semester)
    .map(decorateCourse)
    .sort((a, b) => b.enrolled_count / b.capacity - a.enrolled_count / a.capacity)
    .slice(0, 5);

  res.json({ counts, byCategory, popularCourses: courses });
});

/* ---------------- Settings ---------------- */
router.get('/settings', (req, res) => res.json({ settings: getSettings() }));

router.put('/settings', (req, res) => {
  const schema = z.object({
    semester: z.string().optional(),
    registration_open: z.union([z.boolean(), z.string()]).optional(),
    registration_start: z.string().optional(),
    registration_end: z.string().optional(),
    max_courses_per_student: z.union([z.number(), z.string()]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '설정값이 올바르지 않습니다.' });
  for (const [k, v] of Object.entries(parsed.data)) setSetting(k, v);
  res.json({ settings: getSettings() });
});

/* ---------------- User management ---------------- */
router.get('/users', (req, res) => {
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
  const rows = db.prepare(`SELECT * FROM users ${where} ORDER BY role, grade, class_no, student_no, name`).all(...params);
  res.json({ users: rows.map(publicUser) });
});

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

router.post('/users', (req, res) => {
  const parsed = userSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const dupe = db.prepare('SELECT id FROM users WHERE username = ?').get(d.username);
  if (dupe) return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, role, name, email, phone, grade, class_no, student_no, subject_area)
       VALUES (@username,@hash,@role,@name,@email,@phone,@grade,@class_no,@student_no,@subject_area)`
    )
    .run({
      username: d.username,
      hash: hashPassword(d.password),
      role: d.role,
      name: d.name,
      email: d.email || null,
      phone: d.phone || null,
      grade: d.grade ?? null,
      class_no: d.class_no ?? null,
      student_no: d.student_no ?? null,
      subject_area: d.subject_area || null,
    });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ user: publicUser(user) });
});

router.put('/users/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
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
  db.prepare(
    `UPDATE users SET password_hash=@password_hash, name=@name, email=@email, phone=@phone,
     grade=@grade, class_no=@class_no, student_no=@student_no, subject_area=@subject_area, active=@active
     WHERE id=@id`
  ).run({
    id: existing.id,
    password_hash: merged.password_hash,
    name: merged.name,
    email: merged.email,
    phone: merged.phone,
    grade: merged.grade ?? null,
    class_no: merged.class_no ?? null,
    student_no: merged.student_no ?? null,
    subject_area: merged.subject_area || null,
    active: merged.active,
  });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
  res.json({ user: publicUser(user) });
});

router.delete('/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  if (user.id === req.user.id) return res.status(400).json({ error: '본인 계정은 삭제할 수 없습니다.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.json({ ok: true });
});

/* ---------------- Enrollment management ---------------- */
// Roster for any course (신청순 — 대기 순번 확인용)
router.get('/courses/:id/roster', (req, res) => {
  res.json({ roster: getCourseRoster(req.params.id, 'created') });
});

// Force-remove a student from a course (admin)
router.delete('/enrollments/:id', (req, res) => {
  const enrollment = db.prepare('SELECT * FROM enrollments WHERE id = ?').get(req.params.id);
  if (!enrollment) return res.status(404).json({ error: '신청 내역을 찾을 수 없습니다.' });
  const wasEnrolled = enrollment.status === 'enrolled';
  db.prepare("UPDATE enrollments SET status='cancelled' WHERE id = ?").run(enrollment.id);
  if (wasEnrolled) promoteWaitlist(enrollment.course_id);
  res.json({ ok: true });
});

// All enrollments overview (with student + course)
router.get('/enrollments', (req, res) => {
  const semester = getSettings().semester;
  const rows = db
    .prepare(
      `SELECT e.id, e.status, e.created_at, u.name AS student_name, u.grade, u.class_no, u.student_no,
              c.title AS course_title, c.category, c.id AS course_id
       FROM enrollments e JOIN users u ON u.id=e.student_id JOIN courses c ON c.id=e.course_id
       WHERE c.semester = ? AND e.status != 'cancelled'
       ORDER BY e.created_at DESC`
    )
    .all(semester);
  res.json({ enrollments: rows });
});

export default router;
