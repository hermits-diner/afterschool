import { Router } from 'express';
import { z } from 'zod';
import { all, get, run } from '../db.js';
import { authRequired, requireRole, ah } from '../auth.js';
import {
  findScheduleConflict,
  isRegistrationOpen,
  decorateCourses,
  getActiveSemester,
  parseTargetGrades,
  scheduleLabel,
} from '../logic.js';

const router = Router();

// Student: my enrollments (with course info) — 활성 세션만.
// 지난 세션 기록은 보존되지만 학생 화면에는 보이지 않는다.
router.get('/mine', authRequired, requireRole('student'), ah(async (req, res) => {
  const semester = await getActiveSemester();
  const rows = await all(
    `SELECT e.id AS enrollment_id, e.status AS enrollment_status, e.created_at AS enrolled_at, c.*
     FROM enrollments e JOIN courses c ON c.id = e.course_id
     WHERE e.student_id = ? AND e.status != 'cancelled' AND c.semester = ?
     ORDER BY c.day_of_week, c.start_time`,
    [req.user.id, semester.code]
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

// Student: enroll in a course (선착순 — 정원 마감 시 신청 거부)
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

  // already enrolled? (cancelled rows are revived below — UNIQUE constraint)
  const existing = await get(
    'SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?',
    [student.id, course.id]
  );
  if (existing && existing.status !== 'cancelled') {
    return res.status(400).json({ error: '이미 신청한 강좌입니다.' });
  }

  // max courses limit (세션별 설정) — 폐강 강좌 신청분은 한도에서 제외해 재신청이 가능하게 한다.
  const semester = await getActiveSemester();
  const max = Number(semester.max_courses_per_student || 3);
  const activeRow = await get(
    `SELECT COUNT(*) AS c FROM enrollments e JOIN courses c ON c.id = e.course_id
     WHERE e.student_id = ? AND e.status = 'enrolled'
       AND c.status != 'cancelled' AND c.semester = ?`,
    [student.id, semester.code]
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
  // 대기자 기능 없음 — 정원이 차 있으면 신청을 거부한다.
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
  } else {
    claimed =
      (
        await run(
          `INSERT INTO enrollments (student_id, course_id, status)
           SELECT ?, ?, 'enrolled' WHERE ${seatGuard}`,
          [student.id, course.id, course.id, course.capacity]
        )
      ).changes > 0;
  }

  if (!claimed) {
    return res.status(400).json({ error: '정원이 초과되어 신청할 수 없습니다. 빈자리 희망을 등록해 두면 여석이 생겼을 때 놓치지 않고 확인할 수 있습니다.' });
  }

  // 신청에 성공했으면 이 강좌에 남긴 빈자리 희망은 자동 정리
  await run('DELETE FROM course_wishes WHERE course_id = ? AND student_id = ?', [course.id, student.id]);

  res.status(201).json({
    ok: true,
    status: 'enrolled',
    message: '수강신청이 완료되었습니다.',
  });
}));

/* ---------------- 빈자리 희망 (자동 배정 없음) ----------------
   정원 마감 강좌에 '빈자리가 나면 신청하고 싶다'는 희망을 남긴다.
   취소로 여석이 생겨도 자동 배정하지 않으며(선착순 원칙), 학생이 직접 재신청한다.
   관리자는 강좌별 희망 인원을 보고 증설·정원 조정을 판단한다. */

// 내 희망 목록 (활성 세션)
router.get('/wishes/mine', authRequired, requireRole('student'), ah(async (req, res) => {
  const semester = await getActiveSemester();
  const rows = await all(
    `SELECT w.course_id FROM course_wishes w JOIN courses c ON c.id = w.course_id
     WHERE w.student_id = ? AND c.semester = ?`,
    [req.user.id, semester.code]
  );
  res.json({ course_ids: rows.map((r) => r.course_id) });
}));

// 희망 등록 — 정원이 남아 있으면 바로 신청하라고 안내
router.post('/wishes', authRequired, requireRole('student'), ah(async (req, res) => {
  const schema = z.object({ course_id: z.number().int() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '강좌를 선택하세요.' });
  if (!(await isRegistrationOpen())) {
    return res.status(403).json({ error: '현재 수강신청 기간이 아닙니다.' });
  }
  const course = await get('SELECT * FROM courses WHERE id = ?', [parsed.data.course_id]);
  if (!course || course.status !== 'open') {
    return res.status(400).json({ error: '희망을 등록할 수 없는 강좌입니다.' });
  }
  const enrolled = await get(
    "SELECT id FROM enrollments WHERE student_id = ? AND course_id = ? AND status = 'enrolled'",
    [req.user.id, course.id]
  );
  if (enrolled) return res.status(400).json({ error: '이미 신청한 강좌입니다.' });
  const seats = await get(
    "SELECT COUNT(*) c FROM enrollments WHERE course_id = ? AND status = 'enrolled'",
    [course.id]
  );
  if (seats.c < course.capacity) {
    return res.status(400).json({ error: '빈자리가 있습니다. 바로 신청하세요!' });
  }
  await run('INSERT OR IGNORE INTO course_wishes (course_id, student_id) VALUES (?, ?)', [
    course.id,
    req.user.id,
  ]);
  res.status(201).json({ ok: true, message: '빈자리 희망이 등록되었습니다. 여석이 생기면 이 화면에 표시됩니다.' });
}));

// 희망 취소
router.delete('/wishes/:courseId', authRequired, requireRole('student'), ah(async (req, res) => {
  await run('DELETE FROM course_wishes WHERE course_id = ? AND student_id = ?', [
    req.params.courseId,
    req.user.id,
  ]);
  res.json({ ok: true });
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

  await run("UPDATE enrollments SET status = 'cancelled' WHERE id = ?", [enrollment.id]);
  res.json({ ok: true, message: '수강신청이 취소되었습니다.' });
}));

export default router;
