import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, batch, getSetting } from '../db.js';
import { authRequired, requireRole, ah } from '../auth.js';
import { decorateCourse, decorateCourses, getCourseRoster } from '../logic.js';

const router = Router();
router.use(authRequired, requireRole('teacher'));

const DAY_INDEX = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

// Generate `count` weekly session dates on `dayKor`, starting on/after `anchor` (YYYY-MM-DD).
function sessionDates(dayKor, anchor, count = 16) {
  const target = DAY_INDEX[dayKor] ?? 1;
  const base = anchor ? new Date(anchor + 'T00:00:00') : new Date();
  const d = new Date(base);
  while (d.getDay() !== target) d.setDate(d.getDate() + 1);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  return out;
}

// Ensure the course belongs to the requesting teacher.
const ownedCourse = ah(async (req, res, next) => {
  const course = await get('SELECT * FROM courses WHERE id = ?', [req.params.id]);
  if (!course) return res.status(404).json({ error: '강좌를 찾을 수 없습니다.' });
  if (course.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '담당 강좌가 아닙니다.' });
  }
  req.course = course;
  next();
});

// My assigned courses — 활성 세션만 (지난 세션 강좌는 기록 보존, 화면 미노출)
router.get('/courses', ah(async (req, res) => {
  const semester = await getSetting('semester');
  const rows = await all(
    'SELECT * FROM courses WHERE teacher_id = ? AND semester = ? ORDER BY day_of_week, start_time',
    [req.user.id, semester]
  );
  res.json({ courses: await decorateCourses(rows) });
}));

// Dashboard summary for the teacher — 활성 세션만
router.get('/summary', ah(async (req, res) => {
  const semester = await getSetting('semester');
  const courses = await all('SELECT * FROM courses WHERE teacher_id = ? AND semester = ?', [req.user.id, semester]);
  const courseIds = courses.map((c) => c.id);
  let totalStudents = 0;
  if (courseIds.length) {
    const row = await get(
      `SELECT COUNT(*) c FROM enrollments WHERE status='enrolled' AND course_id IN (${courseIds
        .map(() => '?')
        .join(',')})`,
      courseIds
    );
    totalStudents = row.c;
  }
  res.json({
    courseCount: courses.length,
    totalStudents,
    courses: await decorateCourses(courses),
  });
}));

// Roster for one of my courses (학년/반/번호순)
router.get('/courses/:id/roster', ownedCourse, ah(async (req, res) => {
  res.json({
    course: await decorateCourse(req.course),
    roster: await getCourseRoster(req.course.id),
  });
}));

/* ---------------- Attendance ---------------- */
router.get('/courses/:id/attendance', ownedCourse, ah(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const students = await all(
    `SELECT u.id AS student_id, u.name, u.grade, u.class_no, u.student_no
     FROM enrollments e JOIN users u ON u.id=e.student_id
     WHERE e.course_id = ? AND e.status='enrolled'
     ORDER BY u.grade, u.class_no, u.student_no`,
    [req.course.id]
  );
  const marks = await all(
    'SELECT student_id, status FROM attendance WHERE course_id = ? AND date = ?',
    [req.course.id, date]
  );
  const markMap = Object.fromEntries(marks.map((m) => [m.student_id, m.status]));
  res.json({
    date,
    course: await decorateCourse(req.course),
    students: students.map((s) => ({ ...s, status: markMap[s.student_id] || null })),
  });
}));

router.post('/courses/:id/attendance', ownedCourse, ah(async (req, res) => {
  const schema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    records: z.array(
      z.object({
        student_id: z.number().int(),
        status: z.enum(['present', 'absent', 'late', 'excused']),
      })
    ),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '출석 데이터가 올바르지 않습니다.' });
  await batch(
    parsed.data.records.map((r) => ({
      sql: `INSERT INTO attendance (course_id, student_id, date, status)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(course_id, student_id, date) DO UPDATE SET status = excluded.status`,
      args: [req.course.id, r.student_id, parsed.data.date, r.status],
    }))
  );
  res.json({ ok: true });
}));

// Attendance summary per student (rate) for a course
router.get('/courses/:id/attendance-summary', ownedCourse, ah(async (req, res) => {
  const rows = await all(
    `SELECT u.id AS student_id, u.name, u.grade, u.class_no, u.student_no,
            SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present,
            SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) AS late,
            SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) AS absent,
            SUM(CASE WHEN a.status='excused' THEN 1 ELSE 0 END) AS excused,
            COUNT(a.id) AS total
     FROM enrollments e JOIN users u ON u.id=e.student_id
     LEFT JOIN attendance a ON a.student_id=u.id AND a.course_id=e.course_id
     WHERE e.course_id = ? AND e.status='enrolled'
     GROUP BY u.id ORDER BY u.grade, u.class_no, u.student_no`,
    [req.course.id]
  );
  res.json({ course: await decorateCourse(req.course), summary: rows });
}));

// Printable attendance book: enrolled students × session dates matrix with recorded statuses.
router.get('/courses/:id/attendance-book', ownedCourse, ah(async (req, res) => {
  const count = Math.min(Math.max(Number(req.query.count) || 16, 1), 30);
  const anchor =
    req.query.start || (await getSetting('registration_end')) || (await getSetting('registration_start'));
  const dates = sessionDates(req.course.day_of_week, anchor, count);

  const students = await all(
    `SELECT u.id AS student_id, u.name, u.grade, u.class_no, u.student_no
     FROM enrollments e JOIN users u ON u.id=e.student_id
     WHERE e.course_id = ? AND e.status='enrolled'
     ORDER BY u.grade, u.class_no, u.student_no`,
    [req.course.id]
  );

  const marks = await all(
    `SELECT student_id, date, status FROM attendance WHERE course_id = ? AND date IN (${dates
      .map(() => '?')
      .join(',')})`,
    [req.course.id, ...dates]
  );

  const records = {};
  for (const m of marks) {
    (records[m.student_id] ||= {})[m.date] = m.status;
  }

  const teacher = await get('SELECT name FROM users WHERE id = ?', [req.user.id]);
  res.json({
    course: await decorateCourse(req.course),
    teacher_name: teacher?.name || '',
    dates,
    students,
    records,
  });
}));

/* ---------------- Announcements ---------------- */
router.post('/courses/:id/announcements', ownedCourse, ah(async (req, res) => {
  const schema = z.object({ title: z.string().min(1), content: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '제목과 내용을 입력하세요.' });
  await run(
    'INSERT INTO announcements (course_id, author_id, title, content) VALUES (?, ?, ?, ?)',
    [req.course.id, req.user.id, parsed.data.title, parsed.data.content]
  );
  res.status(201).json({ ok: true });
}));

router.delete('/announcements/:annId', ah(async (req, res) => {
  const ann = await get('SELECT * FROM announcements WHERE id = ?', [req.params.annId]);
  if (!ann) return res.status(404).json({ error: '공지를 찾을 수 없습니다.' });
  const course = await get('SELECT * FROM courses WHERE id = ?', [ann.course_id]);
  if (!course || course.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '권한이 없습니다.' });
  }
  await run('DELETE FROM announcements WHERE id = ?', [ann.id]);
  res.json({ ok: true });
}));

export default router;
