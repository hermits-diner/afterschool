import { Router } from 'express';
import { z } from 'zod';
import db, { getSetting } from '../db.js';
import { authRequired, requireRole } from '../auth.js';
import { decorateCourse } from '../logic.js';

const router = Router();

// List courses (any authenticated user). Supports filters used by the student catalog.
router.get('/', authRequired, (req, res) => {
  const { category, day, grade, q, semester, status } = req.query;
  const clauses = [];
  const params = [];
  clauses.push('semester = ?');
  params.push(semester || getSetting('semester'));
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
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM courses ${where} ORDER BY day_of_week, start_time`)
    .all(...params);
  res.json({ courses: rows.map(decorateCourse) });
});

router.get('/:id', authRequired, (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: '강좌를 찾을 수 없습니다.' });
  const announcements = db
    .prepare('SELECT * FROM announcements WHERE course_id = ? ORDER BY created_at DESC')
    .all(course.id);
  res.json({ course: decorateCourse(course), announcements });
});

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

// Bindable column values shared by INSERT and UPDATE.
function courseRow(d) {
  return {
    title: d.title,
    category: d.category,
    description: d.description ?? '',
    teacher_id: d.teacher_id ?? null,
    capacity: d.capacity,
    day_of_week: d.day_of_week,
    start_time: d.start_time,
    end_time: d.end_time,
    room: d.room ?? '',
    target_grade: d.target_grade,
    fee: d.fee,
    status: d.status,
  };
}

// Create course (admin)
router.post('/', authRequired, requireRole('admin'), (req, res) => {
  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const d = parsed.data;
  if (d.start_time >= d.end_time) {
    return res.status(400).json({ error: '종료 시간은 시작 시간보다 늦어야 합니다.' });
  }
  const info = db
    .prepare(
      `INSERT INTO courses
       (title, category, description, teacher_id, capacity, day_of_week, start_time, end_time, room, target_grade, fee, semester, status)
       VALUES (@title,@category,@description,@teacher_id,@capacity,@day_of_week,@start_time,@end_time,@room,@target_grade,@fee,@semester,@status)`
    )
    .run({
      ...courseRow({ ...d, status: d.status || 'open' }),
      semester: d.semester || getSetting('semester'),
    });
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ course: decorateCourse(course) });
});

// Update course (admin)
router.put('/:id', authRequired, requireRole('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '강좌를 찾을 수 없습니다.' });
  const parsed = courseSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const merged = { ...existing, ...parsed.data };
  if (merged.start_time >= merged.end_time) {
    return res.status(400).json({ error: '종료 시간은 시작 시간보다 늦어야 합니다.' });
  }
  db.prepare(
    `UPDATE courses SET title=@title, category=@category, description=@description,
     teacher_id=@teacher_id, capacity=@capacity, day_of_week=@day_of_week,
     start_time=@start_time, end_time=@end_time, room=@room, target_grade=@target_grade,
     fee=@fee, status=@status WHERE id=@id`
  ).run({ ...courseRow(merged), id: existing.id });
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(existing.id);
  res.json({ course: decorateCourse(course) });
});

// Cancel/close a course (admin) — soft, keeps enrollments for record
router.patch('/:id/status', authRequired, requireRole('admin'), (req, res) => {
  const schema = z.object({ status: z.enum(['open', 'closed', 'cancelled']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '잘못된 상태값입니다.' });
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: '강좌를 찾을 수 없습니다.' });
  db.prepare('UPDATE courses SET status = ? WHERE id = ?').run(parsed.data.status, course.id);
  res.json({ ok: true });
});

// Delete course (admin)
router.delete('/:id', authRequired, requireRole('admin'), (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: '강좌를 찾을 수 없습니다.' });
  db.prepare('DELETE FROM courses WHERE id = ?').run(course.id);
  res.json({ ok: true });
});

export default router;
