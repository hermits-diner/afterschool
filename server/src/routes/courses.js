import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, batch, getSetting } from '../db.js';
import { authRequired, requireRole, ah } from '../auth.js';
import { decorateCourse, decorateCourses } from '../logic.js';

const router = Router();

// List courses (any authenticated user). Supports filters used by the student catalog.
router.get('/', authRequired, ah(async (req, res) => {
  const { category, day, grade, q, semester, status } = req.query;
  const clauses = ['semester = ?'];
  const params = [semester || (await getSetting('semester'))];
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  if (category) {
    clauses.push('category = ?');
    params.push(category);
  }
  if (day) {
    clauses.push('day_of_week = ?');
    params.push(day);
  }
  if (grade) {
    clauses.push('(target_grade = 0 OR target_grade = ?)');
    params.push(Number(grade));
  }
  if (q) {
    clauses.push('(title LIKE ? OR description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const rows = await all(
    `SELECT * FROM courses WHERE ${clauses.join(' AND ')} ORDER BY day_of_week, start_time`,
    params
  );
  res.json({ courses: await decorateCourses(rows) });
}));

router.get('/:id', authRequired, ah(async (req, res) => {
  const course = await get('SELECT * FROM courses WHERE id = ?', [req.params.id]);
  if (!course) return res.status(404).json({ error: '강좌를 찾을 수 없습니다.' });
  const announcements = await all(
    'SELECT * FROM announcements WHERE course_id = ? ORDER BY created_at DESC',
    [course.id]
  );
  res.json({ course: await decorateCourse(course), announcements });
}));

const DAYS = ['월', '화', '수', '목', '금'];
const courseSchema = z.object({
  title: z.string().min(1, '강좌명을 입력하세요.'),
  category: z.string().min(1),
  description: z.string().optional().default(''),
  teacher_id: z.number().int().nullable().optional(),
  capacity: z.number().int().min(1).max(200),
  day_of_week: z.enum(DAYS),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  room: z.string().optional().default(''),
  target_grade: z.number().int().min(0).max(3).default(0),
  fee: z.number().int().min(0).default(0),
  semester: z.string().optional(),
  status: z.enum(['open', 'closed', 'cancelled']).optional(),
});

// Positional column values shared by INSERT and UPDATE (order matters).
function courseValues(d) {
  return [
    d.title,
    d.category,
    d.description ?? '',
    d.teacher_id ?? null,
    d.capacity,
    d.day_of_week,
    d.start_time,
    d.end_time,
    d.room ?? '',
    d.target_grade,
    d.fee,
    d.status,
  ];
}

// Create course — 강사는 자기 강좌를 직접 개설, 관리자는 누구에게든 배정 가능.
router.post('/', authRequired, requireRole('admin', 'teacher'), ah(async (req, res) => {
  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const d = parsed.data;
  if (req.user.role === 'teacher') d.teacher_id = req.user.id; // 강사는 본인 강좌만
  if (d.start_time >= d.end_time) {
    return res.status(400).json({ error: '종료 시간은 시작 시간보다 늦어야 합니다.' });
  }
  const info = await run(
    `INSERT INTO courses
     (title, category, description, teacher_id, capacity, day_of_week, start_time, end_time, room, target_grade, fee, status, semester)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ...courseValues({ ...d, status: d.status || 'open' }),
      d.semester || (await getSetting('semester')),
    ]
  );
  const course = await get('SELECT * FROM courses WHERE id = ?', [info.lastInsertRowid]);
  res.status(201).json({ course: await decorateCourse(course) });
}));

// Update course — 관리자 전체, 강사는 본인 담당 강좌만 (정원 조정 등 포함).
router.put('/:id', authRequired, requireRole('admin', 'teacher'), ah(async (req, res) => {
  const existing = await get('SELECT * FROM courses WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '강좌를 찾을 수 없습니다.' });
  if (req.user.role === 'teacher' && existing.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '담당 강좌만 수정할 수 있습니다.' });
  }
  const parsed = courseSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const merged = { ...existing, ...parsed.data };
  if (req.user.role === 'teacher') merged.teacher_id = existing.teacher_id; // 담당 강사 변경은 관리자만
  if (merged.start_time >= merged.end_time) {
    return res.status(400).json({ error: '종료 시간은 시작 시간보다 늦어야 합니다.' });
  }
  await run(
    `UPDATE courses SET title=?, category=?, description=?, teacher_id=?, capacity=?,
     day_of_week=?, start_time=?, end_time=?, room=?, target_grade=?, fee=?, status=?
     WHERE id=?`,
    [...courseValues(merged), existing.id]
  );
  const course = await get('SELECT * FROM courses WHERE id = ?', [existing.id]);
  res.json({ course: await decorateCourse(course) });
}));

// Cancel/close a course — 관리자 전체, 강사는 본인 강좌만. soft, keeps enrollments for record
router.patch('/:id/status', authRequired, requireRole('admin', 'teacher'), ah(async (req, res) => {
  const schema = z.object({ status: z.enum(['open', 'closed', 'cancelled']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '잘못된 상태값입니다.' });
  const course = await get('SELECT * FROM courses WHERE id = ?', [req.params.id]);
  if (!course) return res.status(404).json({ error: '강좌를 찾을 수 없습니다.' });
  if (req.user.role === 'teacher' && course.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '담당 강좌만 변경할 수 있습니다.' });
  }
  await run('UPDATE courses SET status = ? WHERE id = ?', [parsed.data.status, course.id]);
  res.json({ ok: true });
}));

// Delete course (admin) — children removed explicitly so behavior doesn't
// depend on the remote DB's foreign_keys pragma.
router.delete('/:id', authRequired, requireRole('admin'), ah(async (req, res) => {
  const course = await get('SELECT * FROM courses WHERE id = ?', [req.params.id]);
  if (!course) return res.status(404).json({ error: '강좌를 찾을 수 없습니다.' });
  await batch([
    { sql: 'DELETE FROM attendance WHERE course_id = ?', args: [course.id] },
    { sql: 'DELETE FROM announcements WHERE course_id = ?', args: [course.id] },
    { sql: 'DELETE FROM enrollments WHERE course_id = ?', args: [course.id] },
    { sql: 'DELETE FROM courses WHERE id = ?', args: [course.id] },
  ]);
  res.json({ ok: true });
}));

export default router;
