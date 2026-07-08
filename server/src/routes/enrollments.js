import { Router } from 'express';
import { z } from 'zod';
import db, { getSetting } from '../db.js';
import { authRequired, requireRole } from '../auth.js';
import {
  enrolledCount,
  findScheduleConflict,
  isRegistrationOpen,
  promoteWaitlist,
  decorateCourse,
} from '../logic.js';

const router = Router();

// Student: my enrollments (with course info)
router.get('/mine', authRequired, requireRole('student'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT e.id AS enrollment_id, e.status AS enrollment_status, e.created_at AS enrolled_at, c.*
       FROM enrollments e JOIN courses c ON c.id = e.course_id
       WHERE e.student_id = ? AND e.status != 'cancelled'
       ORDER BY c.day_of_week, c.start_time`
    )
    .all(req.user.id);
  const courses = rows.map((r) => ({
    enrollment_id: r.enrollment_id,
    enrollment_status: r.enrollment_status,
    enrolled_at: r.enrolled_at,
    ...decorateCourse(r),
  }));
  res.json({ courses });
});

// Student: enroll in a course (선착순 + 대기순번)
router.post('/', authRequired, requireRole('student'), (req, res) => {
  const schema = z.object({ course_id: z.number().int() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '강좌를 선택하세요.' });

  if (!isRegistrationOpen()) {
    return res.status(403).json({ error: '현재 수강신청 기간이 아닙니다.' });
  }

  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(parsed.data.course_id);
  if (!course) return res.status(404).json({ error: '강좌를 찾을 수 없습니다.' });
  if (course.status !== 'open') {
    return res.status(400).json({ error: '신청할 수 없는 강좌입니다. (마감/폐강)' });
  }

  const student = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  // grade restriction
  if (course.target_grade !== 0 && course.target_grade !== student.grade) {
    return res.status(400).json({ error: `${course.target_grade}학년 대상 강좌입니다.` });
  }

  // already enrolled/waitlisted? (cancelled rows are revived below — UNIQUE constraint)
  const existing = db
    .prepare('SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?')
    .get(student.id, course.id);
  if (existing && existing.status !== 'cancelled') {
    return res.status(400).json({ error: '이미 신청한 강좌입니다.' });
  }

  // max courses limit
  const max = Number(getSetting('max_courses_per_student') || 3);
  const active = db
    .prepare(
      "SELECT COUNT(*) AS c FROM enrollments WHERE student_id = ? AND status IN ('enrolled','waitlisted')"
    )
    .get(student.id).c;
  if (active >= max) {
    return res.status(400).json({ error: `최대 ${max}개까지 신청할 수 있습니다.` });
  }

  // schedule conflict
  const conflict = findScheduleConflict(student.id, course);
  if (conflict) {
    return res
      .status(400)
      .json({ error: `시간표가 겹칩니다: ${conflict.title} (${conflict.day_of_week} ${conflict.start_time})` });
  }

  // seat or waitlist
  const full = enrolledCount(course.id) >= course.capacity;
  const status = full ? 'waitlisted' : 'enrolled';

  if (existing) {
    // revive the cancelled row with a fresh timestamp (선착순 순번 갱신)
    db.prepare("UPDATE enrollments SET status = ?, created_at = datetime('now') WHERE id = ?").run(
      status,
      existing.id
    );
  } else {
    db.prepare('INSERT INTO enrollments (student_id, course_id, status) VALUES (?, ?, ?)').run(
      student.id,
      course.id,
      status
    );
  }

  res.status(201).json({
    ok: true,
    status,
    message: full ? '정원이 초과되어 대기자로 등록되었습니다.' : '수강신청이 완료되었습니다.',
  });
});

// Student: cancel enrollment
router.delete('/:courseId', authRequired, requireRole('student'), (req, res) => {
  const enrollment = db
    .prepare("SELECT * FROM enrollments WHERE student_id = ? AND course_id = ? AND status != 'cancelled'")
    .get(req.user.id, req.params.courseId);
  if (!enrollment) return res.status(404).json({ error: '신청 내역이 없습니다.' });

  if (!isRegistrationOpen()) {
    return res.status(403).json({ error: '수강신청 기간이 아니어서 취소할 수 없습니다.' });
  }

  const wasEnrolled = enrollment.status === 'enrolled';
  db.prepare("UPDATE enrollments SET status = 'cancelled' WHERE id = ?").run(enrollment.id);
  if (wasEnrolled) promoteWaitlist(enrollment.course_id);
  res.json({ ok: true, message: '수강신청이 취소되었습니다.' });
});

export default router;
