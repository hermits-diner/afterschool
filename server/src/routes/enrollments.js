import { Router } from 'express';
import { z } from 'zod';
import { all, get, run } from '../db.js';
import { authRequired, requireRole, ah } from '../auth.js';
import {
  findScheduleConflict,
  isRegistrationOpen,
  promoteWaitlist,
  decorateCourses,
  getActiveSemester,
  parseTargetGrades,
  scheduleLabel,
} from '../logic.js';

const router = Router();

// Student: my enrollments (with course info)
router.get('/mine', authRequired, requireRole('student'), ah(async (req, res) => {
  const rows = await all(
    `SELECT e.id AS enrollment_id, e.status AS enrollment_status, e.created_at AS enrolled_at, c.*
     FROM enrollments e JOIN courses c ON c.id = e.course_id
     WHERE e.student_id = ? AND e.status != 'cancelled'
     ORDER BY c.day_of_week, c.start_time`,
    [req.user.id]
  );
  const decorated = await decorateCourses(rows);
  const courses = decorated.map((r, i) => ({
    enrollment_id: rows[i].enrollment_id,
    enrollment_status: rows[i].enrollment_status,
    enrolled_at: rows[i].enrolled_at,
    ...r,
  }));
  res.json({ courses });
}));

// Student: enroll in a course (선착순 + 대기순번)
router.post('/', authRequired, requireRole('student'), ah(async (req, res) => {
  const schema = z.object({ course_id: z.number().int() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '강좌를 선택하세요.' });

  if (!(await isRegistrationOpen())) {
    return res.status(403).json({ error: '현재 수강신청 기간이 아닙니다.' });
  }

  const course = await get('SELECT * FROM courses WHERE id = ?', [parsed.data.course_id]);
  if (!course) return res.status(404).json({ error: '강좌를 찾을 수 없습니다.' });
  if (course.status !== 'open') {
    return res.status(400).json({ error: '신청할 수 없는 강좌입니다. (마감/폐강)' });
  }

  const student = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);

  // grade restriction (복수 학년 지원 — 빈 배열이면 전학년)
  const targetGrades = parseTargetGrades(course);
  if (targetGrades.length && !targetGrades.includes(student.grade)) {
    return res.status(400).json({ error: `${targetGrades.join('·')}학년 대상 강좌입니다.` });
  }

  // already enrolled/waitlisted? (cancelled rows are revived below — UNIQUE constraint)
  const existing = await get(
    'SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?',
    [student.id, course.id]
  );
  if (existing && existing.status !== 'cancelled') {
    return res.status(400).json({ error: '이미 신청한 강좌입니다.' });
  }

  // max courses limit (세션별 설정)
  const max = Number((await getActiveSemester()).max_courses_per_student || 3);
  const activeRow = await get(
    "SELECT COUNT(*) AS c FROM enrollments WHERE student_id = ? AND status IN ('enrolled','waitlisted')",
    [student.id]
  );
  if (activeRow.c >= max) {
    return res.status(400).json({ error: `최대 ${max}개까지 신청할 수 있습니다.` });
  }

  // schedule conflict
  const conflict = await findScheduleConflict(student.id, course);
  if (conflict) {
    return res
      .status(400)
      .json({ error: `시간표가 겹칩니다: ${conflict.title} (${scheduleLabel(conflict)})` });
  }

  // Seat claim is atomic: the capacity check lives INSIDE the write statement,
  // so concurrent requests can never overshoot the capacity (선착순 동시성 보장).
  const seatGuard = `(SELECT COUNT(*) FROM enrollments WHERE course_id = ? AND status = 'enrolled') < ?`;
  let claimed;
  if (existing) {
    // revive the cancelled row with a fresh timestamp (선착순 순번 갱신)
    claimed =
      (
        await run(
          `UPDATE enrollments SET status = 'enrolled', created_at = datetime('now')
           WHERE id = ? AND ${seatGuard}`,
          [existing.id, course.id, course.capacity]
        )
      ).changes > 0;
    if (!claimed) {
      await run("UPDATE enrollments SET status = 'waitlisted', created_at = datetime('now') WHERE id = ?", [
        existing.id,
      ]);
    }
  } else {
    claimed =
      (
        await run(
          `INSERT INTO enrollments (student_id, course_id, status)
           SELECT ?, ?, 'enrolled' WHERE ${seatGuard}`,
          [student.id, course.id, course.id, course.capacity]
        )
      ).changes > 0;
    if (!claimed) {
      await run("INSERT INTO enrollments (student_id, course_id, status) VALUES (?, ?, 'waitlisted')", [
        student.id,
        course.id,
      ]);
    }
  }

  res.status(201).json({
    ok: true,
    status: claimed ? 'enrolled' : 'waitlisted',
    message: claimed ? '수강신청이 완료되었습니다.' : '정원이 초과되어 대기자로 등록되었습니다.',
  });
}));

// Student: cancel enrollment
router.delete('/:courseId', authRequired, requireRole('student'), ah(async (req, res) => {
  const enrollment = await get(
    "SELECT * FROM enrollments WHERE student_id = ? AND course_id = ? AND status != 'cancelled'",
    [req.user.id, req.params.courseId]
  );
  if (!enrollment) return res.status(404).json({ error: '신청 내역이 없습니다.' });

  if (!(await isRegistrationOpen())) {
    return res.status(403).json({ error: '수강신청 기간이 아니어서 취소할 수 없습니다.' });
  }

  const wasEnrolled = enrollment.status === 'enrolled';
  await run("UPDATE enrollments SET status = 'cancelled' WHERE id = ?", [enrollment.id]);
  if (wasEnrolled) await promoteWaitlist(enrollment.course_id);
  res.json({ ok: true, message: '수강신청이 취소되었습니다.' });
}));

export default router;
