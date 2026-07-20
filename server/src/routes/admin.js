import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, batch, getSettings, setSetting, semesterName } from '../db.js';
import { authRequired, requireRole, hashPassword, ah } from '../auth.js';
import { publicUser, decorateCourses, getCourseRoster, getActiveSemester, trashCourses, restoreTrashedCourse, purgeTrashedCourses, findScheduleConflict, parseTargetGrades, scheduleLabel, PERIOD_TIMES } from '../logic.js';

const router = Router();
router.use(authRequired, requireRole('admin'));

// 요청자가 시스템 관리자인지 — 토큰이 아닌 DB 기준으로 판정 (권한 변경 즉시 반영)
async function isSuperAdmin(req) {
  const row = await get('SELECT is_super FROM users WHERE id = ?', [req.user.id]);
  return !!row?.is_super;
}

/* ---------------- Dashboard statistics ---------------- */
router.get('/stats', ah(async (req, res) => {
  const semester = (await getSettings()).semester;
  const count = async (sql, args) => (await get(sql, args)).c;
  const counts = {
    // 수강신청한 학생 수 — 활성 세션에서 취소되지 않은 신청을 가진 서로 다른 학생
    students: await count(
      `SELECT COUNT(DISTINCT e.student_id) c FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.status != 'cancelled' AND c.semester = ?`,
      [semester]
    ),
    teachers: await count("SELECT COUNT(*) c FROM users WHERE role='teacher' AND active=1"),
    courses: await count('SELECT COUNT(*) c FROM courses WHERE semester=?', [semester]),
    open_courses: await count("SELECT COUNT(*) c FROM courses WHERE semester=? AND status='open'", [semester]),
    enrollments: await count(
      "SELECT COUNT(*) c FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.status='enrolled' AND c.semester=?",
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

  // 개설(모집중) 강좌 — 충원률 기준 인기순 상위 5개 + 운영 신호(마감 임박·정원 미달)
  const openCourses = await all("SELECT * FROM courses WHERE semester=? AND status='open'", [semester]);
  const decorated = await decorateCourses(openCourses);
  const fill = (c) => (c.capacity > 0 ? c.enrolled_count / c.capacity : 0);
  const courses = [...decorated].sort((a, b) => fill(b) - fill(a)).slice(0, 5);

  // 마감 임박: 충원률 90% 이상 (증원 검토) — 임박한 순
  const nearFull = decorated
    .filter((c) => c.capacity > 0 && fill(c) >= 0.9)
    .sort((a, b) => fill(b) - fill(a));
  // 정원 미달: 충원률 30% 미만 (폐강·홍보 검토) — 저조한 순
  const underEnrolled = decorated
    .filter((c) => c.capacity > 0 && fill(c) < 0.3)
    .sort((a, b) => fill(a) - fill(b));

  res.json({ counts, byCategory, popularCourses: courses, alerts: { nearFull, underEnrolled } });
}));

/* ---------------- 반별 신청 현황 ---------------- */
// 학급(학년/반)별 학생 목록 + 각 학생의 신청 강좌 (활성 세션 기준).
router.get('/class-status', ah(async (req, res) => {
  const semester = (await getSettings()).semester;
  const students = await all(
    "SELECT id, name, grade, class_no, student_no FROM users WHERE role='student' AND active=1 ORDER BY grade, class_no, student_no"
  );
  const enrolls = await all(
    `SELECT e.student_id, e.status, c.title, t.name AS teacher_name, g.name AS group_name
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN users t ON t.id = c.teacher_id
     LEFT JOIN course_groups g ON g.id = c.group_id
     WHERE c.semester = ? AND e.status != 'cancelled' ORDER BY c.title`,
    [semester]
  );
  const byStudent = {};
  for (const e of enrolls) {
    (byStudent[e.student_id] ||= []).push({
      title: e.title,
      status: e.status,
      teacher_name: e.teacher_name || '미배정',
      group_name: e.group_name || null,
    });
  }
  const classMap = new Map();
  for (const s of students) {
    const key = `${s.grade}-${s.class_no}`;
    if (!classMap.has(key)) classMap.set(key, { grade: s.grade, class_no: s.class_no, students: [] });
    classMap.get(key).students.push({ ...s, enrollments: byStudent[s.id] || [] });
  }
  res.json({ semester, classes: [...classMap.values()] });
}));

/* ---------------- 폐강 재신청 대상 ---------------- */
// 폐강(cancelled) 강좌를 신청했던 학생 목록 — 추가 신청 안내 대상.
// 전체/반별 목록 및 인쇄에 사용한다. (폐강 신청분은 신청 한도에서 제외되어 재신청 가능)
router.get('/cancelled-enrollments', ah(async (req, res) => {
  const semester = (await getSettings()).semester;
  const rows = await all(
    `SELECT u.id AS student_id, u.name, u.grade, u.class_no, u.student_no,
            c.title, c.category, e.status, t.name AS teacher_name, g.name AS group_name
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     JOIN users u ON u.id = e.student_id
     LEFT JOIN users t ON t.id = c.teacher_id
     LEFT JOIN course_groups g ON g.id = c.group_id
     WHERE c.semester = ? AND c.status = 'cancelled' AND e.status != 'cancelled'
     ORDER BY u.grade, u.class_no, u.student_no, c.title`,
    [semester]
  );
  // 학생 단위로 묶는다 (한 학생이 폐강 강좌 여러 개를 신청했을 수 있음)
  const byStudent = new Map();
  for (const r of rows) {
    if (!byStudent.has(r.student_id)) {
      byStudent.set(r.student_id, {
        student_id: r.student_id,
        name: r.name,
        grade: r.grade,
        class_no: r.class_no,
        student_no: r.student_no,
        courses: [],
      });
    }
    byStudent.get(r.student_id).courses.push({
      title: r.title,
      category: r.category,
      teacher_name: r.teacher_name || '미배정',
      group_name: r.group_name || null,
    });
  }
  res.json({ semester, students: [...byStudent.values()] });
}));

/* ---------------- 교과군 (시간 블록 그룹) ---------------- */
const groupSlotSchema = z
  .object({
    day: z.enum(['월', '화', '수', '목', '금']),
    from: z.number().int().min(1).max(9),
    to: z.number().int().min(1).max(9),
  })
  .refine((s) => s.from <= s.to, { message: '교시 범위가 올바르지 않습니다.' });

const groupSchema = z.object({
  name: z.string().min(1, '교과군 이름을 입력하세요.').max(50),
  schedule: z.array(groupSlotSchema).min(1, '교시를 하나 이상 선택하세요.').max(20),
  default_sessions: z.number().int().min(0).max(999).optional(), // 교과군 기본 계획 차시 (0 = 세션 기본값)
});

// 교과군은 활성 세션에 귀속 — 세션이 바뀌면 그 세션의 교과군을 새로 관리한다.
router.post('/groups', ah(async (req, res) => {
  const parsed = groupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const semester = (await getSettings()).semester;
  const dupe = await get('SELECT id FROM course_groups WHERE name = ? AND semester = ?', [parsed.data.name, semester]);
  if (dupe) return res.status(409).json({ error: '이 세션에 이미 존재하는 교과군 이름입니다.' });
  const info = await run('INSERT INTO course_groups (name, semester, schedule, default_sessions) VALUES (?, ?, ?, ?)', [
    parsed.data.name,
    semester,
    JSON.stringify(parsed.data.schedule),
    parsed.data.default_sessions ?? 0,
  ]);
  res.status(201).json({ group: await get('SELECT * FROM course_groups WHERE id = ?', [info.lastInsertRowid]) });
}));

// 교과군 수정 — 시간 변경 시 소속 강좌들의 시간도 함께 갱신
router.put('/groups/:id', ah(async (req, res) => {
  const existing = await get('SELECT * FROM course_groups WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '교과군을 찾을 수 없습니다.' });
  const parsed = groupSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const name = parsed.data.name ?? existing.name;
  const schedule = parsed.data.schedule ?? JSON.parse(existing.schedule);
  const defaultSessions = parsed.data.default_sessions ?? existing.default_sessions ?? 0;
  await run('UPDATE course_groups SET name = ?, schedule = ?, default_sessions = ? WHERE id = ?', [
    name,
    JSON.stringify(schedule),
    defaultSessions,
    existing.id,
  ]);
  // 소속 강좌 시간 동기화
  const first = schedule[0];
  await run(
    'UPDATE courses SET schedule = ?, day_of_week = ?, start_time = ?, end_time = ? WHERE group_id = ?',
    [JSON.stringify(schedule), first.day, PERIOD_TIMES[first.from][0], PERIOD_TIMES[first.to][1], existing.id]
  );
  res.json({ group: await get('SELECT * FROM course_groups WHERE id = ?', [existing.id]) });
}));

// 교과군 삭제 — 소속 강좌는 시간표(schedule 사본)를 유지한 채 그룹 해제
router.delete('/groups/:id', ah(async (req, res) => {
  const existing = await get('SELECT * FROM course_groups WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '교과군을 찾을 수 없습니다.' });
  await batch([
    { sql: 'UPDATE courses SET group_id = NULL WHERE group_id = ?', args: [existing.id] },
    { sql: 'DELETE FROM course_groups WHERE id = ?', args: [existing.id] },
  ]);
  res.json({ ok: true });
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
      group_name: c.group_name,
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

  // 총수강료 계산기 — 학년군(1·2학년/3학년)별 입력값(세션별 저장) + 수강수의 합(수강확정 기준)
  // 교육청 지원액이 학년군에 따라 다르므로 두 군을 분리해 계산한다.
  const savedCalc = (await getSettings())[`finance_calc:${semester}`];
  let calc = savedCalc ? JSON.parse(savedCalc) : null;
  // 구버전(학년 구분 없는 단일 저장값)은 1·2학년 입력값으로 이관
  if (calc && calc.total_sessions !== undefined) calc = { g12: calc, g3: null };
  const enrollTotals = {};
  for (const [key, cond] of [['g12', 'u.grade IN (1, 2)'], ['g3', 'u.grade = 3']]) {
    enrollTotals[key] = (await get(
      `SELECT COUNT(*) c FROM enrollments e
       JOIN courses c2 ON c2.id = e.course_id
       JOIN users u ON u.id = e.student_id
       WHERE c2.semester = ? AND c2.status != 'cancelled' AND e.status = 'enrolled' AND ${cond}`,
      [semester]
    )).c;
  }

  res.json({ semester, courses: rows, byTeacher, totals, calc, enrollTotals });
}));

// 총수강료 계산기 입력값 저장 — 학년군별 입력을 세션별로 settings에 보관
router.put('/finance/calc', ah(async (req, res) => {
  const inputsSchema = z.object({
    total_sessions: z.number().int().min(0),   // 총차시
    course_count: z.number().int().min(0),     // 총강좌수
    pay_per_session: z.number().int().min(0),  // 차시당 책정강사료
    operating_cost: z.number().int().min(0),   // 수용비
    subsidy: z.number().int().min(0),          // 교육청지원금
    enroll_total: z.number().int().min(0),     // 학생 개별 수강수의 합 (직접 입력, 자동 집계값은 참고용)
  });
  const schema = z.object({ g12: inputsSchema, g3: inputsSchema });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '모든 항목은 0 이상의 숫자여야 합니다.' });
  const semester = (await getSettings()).semester;
  await setSetting(`finance_calc:${semester}`, JSON.stringify(parsed.data));
  res.json({ ok: true, calc: parsed.data });
}));

// 총수강료 계산 입력값 초기화 — 저장값을 지워 기본(모두 0 · 수강수의 합은 자동 집계)으로 되돌린다.
router.delete('/finance/calc', ah(async (req, res) => {
  const semester = (await getSettings()).semester;
  await run('DELETE FROM settings WHERE key = ?', [`finance_calc:${semester}`]);
  res.json({ ok: true });
}));

// 차시당(회당) 강사료 일괄 적용 — 활성 세션의 폐강 아닌 전 강좌에 같은 단가를 설정한다.
// (강사료 = 회당 강사료 × 실시 회차. 학교 대부분 단가가 동일해 한 번에 책정 가능)
router.put('/finance/pay-rate', ah(async (req, res) => {
  const parsed = z.object({ pay_rate: z.number().int().min(0).max(10_000_000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '회당 강사료는 0 이상의 숫자여야 합니다.' });
  const semester = (await getSettings()).semester;
  await run("UPDATE courses SET pay_rate = ? WHERE semester = ? AND status != 'cancelled'", [parsed.data.pay_rate, semester]);
  const updated = (await get("SELECT COUNT(*) c FROM courses WHERE semester = ? AND status != 'cancelled'", [semester])).c;
  res.json({ ok: true, updated });
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
  code: z.string().regex(/^\d{4}-([12]|여름|겨울|특강\d?)$/, "세션 코드는 '2026-1'(학기), '2026-여름'(방학), '2026-특강'(특강, 번호 가능) 형식이어야 합니다."),
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

// 세션 복사 — 원본 세션의 정책값에 더해 교과군(선택)과 강좌(선택, 신청 내역 제외)를
// 새 세션으로 복제한다. 코드·신청기간 등은 요청값을 사용한다.
router.post('/semesters/:code/clone', ah(async (req, res) => {
  const src = await get('SELECT * FROM semesters WHERE code = ?', [req.params.code]);
  if (!src) return res.status(404).json({ error: '원본 세션을 찾을 수 없습니다.' });
  const schema = semesterSchema.extend({
    copy_groups: z.boolean().optional().default(true),
    copy_courses: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body);
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
      Number(d.max_courses_per_student ?? src.max_courses_per_student ?? 3),
      Number(d.default_sessions ?? src.default_sessions ?? 16),
    ]
  );

  // 교과군 복사 — 새 세션 소속으로 복제하고 old→new id 매핑을 만든다 (강좌 연결용)
  const groupMap = {};
  let copiedGroups = 0;
  if (d.copy_groups || d.copy_courses) {
    const groups = await all('SELECT * FROM course_groups WHERE semester = ?', [src.code]);
    for (const g of groups) {
      const info = await run('INSERT INTO course_groups (name, semester, schedule, default_sessions) VALUES (?, ?, ?, ?)', [
        g.name,
        d.code,
        g.schedule,
        g.default_sessions ?? 0,
      ]);
      groupMap[g.id] = info.lastInsertRowid;
      copiedGroups++;
    }
  }

  // 강좌 복사 — 신청·출석 내역 없이 강좌 정보만. 상태는 '모집중', 수동 회차는 초기화.
  let copiedCourses = 0;
  if (d.copy_courses) {
    const courses = await all("SELECT * FROM courses WHERE semester = ? AND status != 'cancelled'", [src.code]);
    for (const c of courses) {
      await run(
        `INSERT INTO courses (title, category, description, teacher_id, capacity, day_of_week, start_time, end_time,
           room, textbook, target_grade, target_grades, fee, pay_rate, planned_sessions, schedule, group_id, semester, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
        [
          c.title, c.category, c.description ?? '', c.teacher_id ?? null, c.capacity,
          c.day_of_week, c.start_time, c.end_time, c.room ?? '', c.textbook ?? '',
          c.target_grade ?? 0, c.target_grades ?? '', c.fee ?? 0, c.pay_rate ?? 0,
          c.planned_sessions ?? 0, c.schedule ?? null,
          c.group_id ? groupMap[c.group_id] ?? null : null, d.code,
        ]
      );
      copiedCourses++;
    }
  }

  const row = await get('SELECT * FROM semesters WHERE code = ?', [d.code]);
  res.status(201).json({ semester: row, copied: { groups: copiedGroups, courses: copiedCourses } });
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

// 세션 코드 변경 — 코드는 강좌·교과군·정산 데이터를 잇는 연결 키이므로
// 참조하는 모든 데이터를 한 트랜잭션으로 함께 이관한다. (활성 세션 포인터 포함)
router.post('/semesters/:code/rename', ah(async (req, res) => {
  const src = await get('SELECT * FROM semesters WHERE code = ?', [req.params.code]);
  if (!src) return res.status(404).json({ error: '세션을 찾을 수 없습니다.' });
  const schema = z.object({
    code: z.string().regex(/^\d{4}-([12]|여름|겨울|특강\d?)$/, "세션 코드는 '2026-1'(학기), '2026-여름'(방학), '2026-특강'(특강, 번호 가능) 형식이어야 합니다."),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const newCode = parsed.data.code;
  if (newCode === src.code) return res.json({ ok: true, code: newCode });
  const dupe = await get('SELECT code FROM semesters WHERE code = ?', [newCode]);
  if (dupe) return res.status(409).json({ error: '이미 존재하는 세션 코드입니다.' });
  await batch([
    { sql: 'UPDATE semesters SET code = ? WHERE code = ?', args: [newCode, src.code] },
    { sql: 'UPDATE courses SET semester = ? WHERE semester = ?', args: [newCode, src.code] },
    { sql: 'UPDATE course_groups SET semester = ? WHERE semester = ?', args: [newCode, src.code] },
    // 휴지통 스냅샷: 컬럼과 JSON 내부의 세션 코드 모두 이관 (복원 시 새 코드로 붙도록)
    {
      sql: "UPDATE courses_trash SET data = json_set(data, '$.course.semester', ?), semester = ? WHERE semester = ?",
      args: [newCode, newCode, src.code],
    },
    // 활성 세션 포인터 갱신
    { sql: "UPDATE settings SET value = ? WHERE key = 'semester' AND value = ?", args: [newCode, src.code] },
    // 세션별 정산 계산기 입력값 키 이관
    { sql: 'DELETE FROM settings WHERE key = ?', args: [`finance_calc:${newCode}`] },
    { sql: 'UPDATE settings SET key = ? WHERE key = ?', args: [`finance_calc:${newCode}`, `finance_calc:${src.code}`] },
  ]);
  // 자동 생성 형식의 이름이었다면 새 코드 기준으로 함께 갱신
  if (src.name === semesterName(src.code)) {
    await run('UPDATE semesters SET name = ? WHERE code = ?', [semesterName(newCode), newCode]);
  }
  res.json({ ok: true, code: newCode });
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
  // 휴지통에 있는 이 세션 강좌의 하위 데이터까지 함께 정리한다.
  const inSemester =
    'SELECT id FROM courses WHERE semester = ? UNION SELECT id FROM courses_trash WHERE semester = ?';
  const args = [code, code];
  await batch([
    { sql: `DELETE FROM attendance WHERE course_id IN (${inSemester})`, args },
    { sql: `DELETE FROM announcements WHERE course_id IN (${inSemester})`, args },
    { sql: `DELETE FROM enrollments WHERE course_id IN (${inSemester})`, args },
    { sql: `DELETE FROM course_files WHERE course_id IN (${inSemester})`, args },
    { sql: 'DELETE FROM courses WHERE semester = ?', args: [code] },
    { sql: 'DELETE FROM courses_trash WHERE semester = ?', args: [code] },
    { sql: 'DELETE FROM course_groups WHERE semester = ?', args: [code] },
    { sql: 'DELETE FROM semesters WHERE code = ?', args: [code] },
  ]);
  res.json({ ok: true });
}));

/* ---------------- 랜딩(로그인) 공지 ---------------- */
// 관리자·부관리자 모두 수정 가능. 빈 문자열 = 공지 없음.
router.put('/landing-notice', ah(async (req, res) => {
  const schema = z.object({ text: z.string().max(2000, '공지는 2000자 이하로 입력하세요.') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  await setSetting('landing_notice', parsed.data.text.trim());
  res.json({ ok: true });
}));

/* ---------------- User management ---------------- */
router.get('/users', ah(async (req, res) => {
  const { role, q } = req.query;
  const clauses = [];
  const params = [];
  // 부관리자(방과후담당자)에게는 시스템 관리자 계정을 노출하지 않는다.
  if (!(await isSuperAdmin(req))) {
    clauses.push('is_super = 0');
  }
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
  // 로그인 잠금 상태 — locked_until이 현재보다 미래인 계정 (ISO 문자열 비교, 둘 다 UTC)
  const lockedRows = await all('SELECT username FROM login_attempts WHERE locked_until IS NOT NULL AND locked_until > ?', [
    new Date().toISOString(),
  ]);
  const lockedSet = new Set(lockedRows.map((r) => r.username));
  res.json({ users: rows.map((u) => ({ ...publicUser(u), locked: lockedSet.has(u.username) })) });
}));

// 로그인 잠금 해제 — 해당 계정의 실패 기록을 삭제해 즉시 다시 로그인할 수 있게 한다.
router.post('/users/:id/unlock', ah(async (req, res) => {
  const u = await get('SELECT username FROM users WHERE id = ?', [req.params.id]);
  if (!u) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  await run('DELETE FROM login_attempts WHERE username = ?', [u.username]);
  res.json({ ok: true });
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
  // 관리자(부관리자) 계정 등록은 시스템 관리자만 가능 (신규 관리자는 항상 부관리자로 생성)
  if (d.role === 'admin' && !(await isSuperAdmin(req))) {
    return res.status(403).json({ error: '관리자 계정 등록은 시스템 관리자만 할 수 있습니다.' });
  }
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
  let ids = [...new Set(parsed.data.ids)].filter((id) => id !== req.user.id);
  // 시스템 관리자 계정은 일괄 삭제 대상에서 제외
  if (ids.length) {
    const superRows = await all(
      `SELECT id FROM users WHERE is_super = 1 AND id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    const superIds = new Set(superRows.map((r) => r.id));
    ids = ids.filter((id) => !superIds.has(id));
  }
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
  // 부관리자는 시스템 관리자 계정을 볼 수도, 수정할 수도 없다 (존재도 숨김)
  if (existing.is_super && !(await isSuperAdmin(req))) {
    return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  }
  // 시스템 관리자 계정 비활성화 금지 — 시스템 잠금 사고 방지
  if (existing.is_super && req.body?.active === false) {
    return res.status(400).json({ error: '시스템 관리자 계정은 비활성화할 수 없습니다.' });
  }
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
  // 부관리자는 시스템 관리자 계정을 삭제할 수 없다 (존재도 숨김)
  if (user.is_super && !(await isSuperAdmin(req))) {
    return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  }
  if (user.is_super) return res.status(400).json({ error: '시스템 관리자 계정은 삭제할 수 없습니다.' });
  await batch([
    { sql: 'DELETE FROM attendance WHERE student_id = ?', args: [user.id] },
    { sql: 'DELETE FROM enrollments WHERE student_id = ?', args: [user.id] },
    { sql: 'UPDATE announcements SET author_id = NULL WHERE author_id = ?', args: [user.id] },
    { sql: 'UPDATE courses SET teacher_id = NULL WHERE teacher_id = ?', args: [user.id] },
    { sql: 'DELETE FROM users WHERE id = ?', args: [user.id] },
  ]);
  res.json({ ok: true });
}));

/* ---------------- Course bulk registration ---------------- */
const DAY_ORDER = { 월: 0, 화: 1, 수: 2, 목: 3, 금: 4 };

// Bulk-register courses (admin): 교과군 이름으로 시간 배정, 강사는 아이디 또는 이름으로 매칭.
router.post('/courses/bulk', ah(async (req, res) => {
  const schema = z.object({
    courses: z
      .array(
        z.object({
          title: z.string().min(1),
          teacher: z.string().optional(), // 아이디 또는 이름 — 빈값이면 미배정
          category: z.string().optional(),
          group: z.string().optional(), // 교과군 이름
          capacity: z.number().int().min(1).max(200).optional(),
          target_grades: z.array(z.number().int().min(1).max(3)).max(3).optional(),
          fee: z.number().int().min(0).optional(),
          pay_rate: z.number().int().min(0).optional(),
        })
      )
      .min(1)
      .max(200),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const semester = await getActiveSemester();
  const defaultSessions = semester.default_sessions ?? 16;
  const groups = await all('SELECT * FROM course_groups WHERE semester = ?', [semester.code]);
  const teachers = await all("SELECT id, username, name FROM users WHERE role='teacher'");
  if (groups.length === 0) {
    return res.status(400).json({ error: '교과군이 없습니다. 교과군 관리에서 먼저 교과군(교시 블록)을 만들어 주세요.' });
  }

  const created = [];
  const skipped = [];
  for (const c of parsed.data.courses) {
    const skip = (reason) => skipped.push({ title: c.title, reason });

    // 강사 매칭: 아이디 정확 일치 → 이름 일치(동명이인이면 오류)
    let teacherId = null;
    if (c.teacher) {
      const byUsername = teachers.filter((t) => t.username === c.teacher);
      const byName = teachers.filter((t) => t.name === c.teacher);
      const match = byUsername.length ? byUsername : byName;
      if (match.length === 0) { skip(`강사 '${c.teacher}'를 찾을 수 없음`); continue; }
      if (match.length > 1) { skip(`강사 '${c.teacher}' 동명이인 — 아이디로 입력하세요`); continue; }
      teacherId = match[0].id;
    }

    // 교과군 매칭 (이름 정확 일치)
    if (!c.group) { skip('교과군 미지정'); continue; }
    const group = groups.find((g) => g.name === c.group.trim());
    if (!group) { skip(`교과군 '${c.group}'을 찾을 수 없음`); continue; }

    // 같은 강좌명이라도 교과군(유형)이 다르면 별개 강좌로 허용 — 교과군까지 같을 때만 중복 처리.
    // 폐강(cancelled) 강좌는 제외 — courses에 남아도 재등록을 막지 않는다. (삭제분은 휴지통이라 애초에 안 걸림)
    const dupe = await get("SELECT id FROM courses WHERE title = ? AND semester = ? AND group_id = ? AND status != 'cancelled'", [c.title, semester.code, group.id]);
    if (dupe) { skip('같은 교과군에 같은 강좌명이 이미 개설되어 있음 (모집중·마감)'); continue; }

    const slots = JSON.parse(group.schedule).sort((a, b) => DAY_ORDER[a.day] - DAY_ORDER[b.day] || a.from - b.from);
    const first = slots[0];
    const gradeArr = [...new Set(c.target_grades || [])].sort();
    const allGrades = gradeArr.length === 0 || gradeArr.length >= 3;
    await run(
      `INSERT INTO courses
       (title, category, description, teacher_id, capacity, day_of_week, start_time, end_time, room, target_grade, target_grades, fee, pay_rate, planned_sessions, schedule, group_id, status, semester)
       VALUES (?, ?, '', ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      [
        c.title,
        c.category || '기타',
        teacherId,
        c.capacity ?? 20,
        first.day,
        PERIOD_TIMES[first.from][0],
        PERIOD_TIMES[first.to][1],
        !allGrades && gradeArr.length === 1 ? gradeArr[0] : 0,
        allGrades ? '' : gradeArr.join(','),
        c.fee ?? 0,
        c.pay_rate ?? 0,
        group.default_sessions > 0 ? group.default_sessions : defaultSessions, // 교과군 기본 차시 우선
        JSON.stringify(slots),
        group.id,
        semester.code,
      ]
    );
    created.push({ title: c.title, group: group.name });
  }
  res.status(201).json({ created, skipped });
}));

/* ---------------- Course bulk delete + 휴지통 ---------------- */
// Bulk-delete courses → 휴지통 이동 (복원 가능). 하위 데이터는 보존.
router.post('/courses/bulk-delete', ah(async (req, res) => {
  const schema = z.object({ ids: z.array(z.number().int()).min(1).max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '삭제할 강좌를 선택하세요.' });
  const deleted = await trashCourses([...new Set(parsed.data.ids)], req.user.id);
  if (!deleted) return res.status(404).json({ error: '삭제할 강좌를 찾을 수 없습니다.' });
  res.json({ ok: true, deleted });
}));

// 휴지통 목록 — 스냅샷에 보존된 신청 건수와 함께 (복원 시 그대로 돌아옴)
router.get('/courses/trash', ah(async (req, res) => {
  const rows = await all('SELECT * FROM courses_trash ORDER BY deleted_at DESC');
  const teachers = await all("SELECT id, name FROM users WHERE role = 'teacher'");
  const teacherMap = Object.fromEntries(teachers.map((t) => [t.id, t.name]));
  res.json({
    trash: rows.map((r) => {
      const bundle = JSON.parse(r.data);
      const course = bundle.course || bundle; // (구버전 스냅샷 호환)
      const enrollments = bundle.enrollments || [];
      return {
        id: r.id,
        title: r.title,
        semester: r.semester,
        category: course.category,
        teacher_name: teacherMap[course.teacher_id] || '미배정',
        enrollment_count: enrollments.filter((e) => e.status !== 'cancelled').length,
        deleted_at: r.deleted_at,
      };
    }),
  });
}));

// 휴지통에서 복원 — 강좌·신청·출석·공지·강의계획서를 삭제 전 상태로 되살린다.
router.post('/courses/trash/:id/restore', ah(async (req, res) => {
  const title = await restoreTrashedCourse(req.params.id);
  if (title === null) return res.status(404).json({ error: '휴지통에서 강좌를 찾을 수 없습니다.' });
  res.json({ ok: true, title });
}));

// 휴지통 영구 삭제 (개별) — 이때 비로소 신청·출석 등 하위 데이터도 삭제된다.
router.delete('/courses/trash/:id', ah(async (req, res) => {
  const row = await get('SELECT id FROM courses_trash WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: '휴지통에서 강좌를 찾을 수 없습니다.' });
  await purgeTrashedCourses([row.id]);
  res.json({ ok: true });
}));

// 휴지통 비우기 (전체 영구 삭제)
router.delete('/courses/trash', ah(async (req, res) => {
  const rows = await all('SELECT id FROM courses_trash');
  if (rows.length) await purgeTrashedCourses(rows.map((r) => r.id));
  res.json({ ok: true, purged: rows.length });
}));

/* ---------------- Enrollment management ---------------- */
// Roster for any course (신청순)
router.get('/courses/:id/roster', ah(async (req, res) => {
  res.json({ roster: await getCourseRoster(req.params.id, 'created') });
}));

// Force-remove a student from a course (admin)
router.delete('/enrollments/:id', ah(async (req, res) => {
  const enrollment = await get('SELECT * FROM enrollments WHERE id = ?', [req.params.id]);
  if (!enrollment) return res.status(404).json({ error: '신청 내역을 찾을 수 없습니다.' });
  await run("UPDATE enrollments SET status='cancelled' WHERE id = ?", [enrollment.id]);
  res.json({ ok: true });
}));

/* 관리자 대리 신청 — 학생을 강좌에 직접 추가한다.
   신청 기간은 무시하되(마감 후에도 추가 가능) 학년 제한·1인 최대 과목 수·시간표 중복은 그대로 검사한다.
   정원 초과는 막지 않고 409로 되돌려, 관리자가 확인(force)했을 때만 넣는다. */
router.post('/enrollments', ah(async (req, res) => {
  const schema = z.object({
    course_id: z.number().int(),
    student_id: z.number().int(),
    force: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '강좌와 학생을 선택하세요.' });
  const { course_id, student_id, force } = parsed.data;

  const course = await get('SELECT * FROM courses WHERE id = ?', [course_id]);
  if (!course) return res.status(404).json({ error: '강좌를 찾을 수 없습니다.' });
  if (course.status === 'cancelled') {
    return res.status(400).json({ error: '폐강된 강좌에는 추가할 수 없습니다.' });
  }

  const student = await get("SELECT * FROM users WHERE id = ? AND role = 'student'", [student_id]);
  if (!student) return res.status(404).json({ error: '학생을 찾을 수 없습니다.' });
  if (!student.active) return res.status(400).json({ error: '비활성 학생은 추가할 수 없습니다.' });

  // 취소된 행은 아래에서 되살린다 (UNIQUE 제약)
  const existing = await get(
    'SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?',
    [student.id, course.id]
  );
  if (existing && existing.status !== 'cancelled') {
    return res.status(400).json({ error: '이미 이 강좌를 신청한 학생입니다.' });
  }

  const targetGrades = parseTargetGrades(course);
  if (targetGrades.length && !targetGrades.includes(student.grade)) {
    return res.status(400).json({ error: `${targetGrades.join('·')}학년 대상 강좌입니다.` });
  }

  // 1인 최대 과목 수 — 강좌가 속한 세션 기준. 폐강 강좌 신청분은 제외.
  const semester = await get('SELECT * FROM semesters WHERE code = ?', [course.semester]);
  const max = Number(semester?.max_courses_per_student || 3);
  const activeRow = await get(
    `SELECT COUNT(*) AS c FROM enrollments e JOIN courses c ON c.id = e.course_id
     WHERE e.student_id = ? AND e.status = 'enrolled'
       AND c.status != 'cancelled' AND c.semester = ?`,
    [student.id, course.semester]
  );
  if (activeRow.c >= max) {
    return res.status(400).json({ error: `이 학생은 이미 최대 ${max}과목을 신청했습니다.` });
  }

  const conflict = await findScheduleConflict(student.id, course);
  if (conflict) {
    return res.status(400).json({ error: `시간표가 겹칩니다: ${conflict.title} (${scheduleLabel(conflict)})` });
  }

  const seats = await get(
    "SELECT COUNT(*) AS c FROM enrollments WHERE course_id = ? AND status = 'enrolled'",
    [course.id]
  );
  const overCapacity = seats.c >= course.capacity;
  if (overCapacity && !force) {
    // 409 = 정원 초과 확인 필요 (클라이언트가 이 상태코드로 재확인 후 force 재요청)
    return res.status(409).json({ error: `정원이 찼습니다 (${seats.c}/${course.capacity}).` });
  }

  if (existing) {
    await run("UPDATE enrollments SET status = 'enrolled', created_at = datetime('now') WHERE id = ?", [existing.id]);
  } else {
    await run("INSERT INTO enrollments (student_id, course_id, status) VALUES (?, ?, 'enrolled')", [
      student.id,
      course.id,
    ]);
  }

  res.status(201).json({
    ok: true,
    over_capacity: overCapacity,
    message: overCapacity
      ? `${student.name} 학생을 추가했습니다. 정원을 초과했습니다 (${seats.c + 1}/${course.capacity}).`
      : `${student.name} 학생을 추가했습니다.`,
  });
}));

// All enrollments overview (with student + course)
router.get('/enrollments', ah(async (req, res) => {
  const semester = (await getSettings()).semester;
  const rows = await all(
    `SELECT e.id, e.status, e.created_at, u.name AS student_name, u.grade, u.class_no, u.student_no,
            c.title AS course_title, c.category, c.id AS course_id, g.name AS group_name
     FROM enrollments e JOIN users u ON u.id=e.student_id JOIN courses c ON c.id=e.course_id
     LEFT JOIN course_groups g ON g.id = c.group_id
     WHERE c.semester = ? AND e.status != 'cancelled'
     ORDER BY e.created_at DESC`,
    [semester]
  );
  res.json({ enrollments: rows });
}));

/* 전체 데이터 백업 — 학교 데이터를 JSON 한 파일로 내려받는다.
   서버리스라 서버에 보관할 곳이 없으므로 관리자 PC로 다운로드시킨다.
   비밀번호 해시는 담지 않는다(복원 시 재발급). 첨부파일 본문(base64)은
   응답이 지나치게 커져 제외하고, 어떤 파일이 있었는지 목록만 남긴다. */
router.get('/backup', ah(async (req, res) => {
  if (!(await isSuperAdmin(req))) {
    return res.status(403).json({ error: '시스템 관리자만 백업할 수 있습니다.' });
  }

  const users = await all('SELECT * FROM users ORDER BY id');
  const tables = {
    users: users.map((u) => ({ ...publicUser(u), created_at: u.created_at })),
    semesters: await all('SELECT * FROM semesters ORDER BY code'),
    course_groups: await all('SELECT * FROM course_groups ORDER BY id'),
    courses: await all('SELECT * FROM courses ORDER BY id'),
    enrollments: await all('SELECT * FROM enrollments ORDER BY id'),
    attendance: await all('SELECT * FROM attendance ORDER BY id'),
    announcements: await all('SELECT * FROM announcements ORDER BY id'),
    settings: await all('SELECT * FROM settings ORDER BY key'),
    course_files_meta: await all(
      'SELECT course_id, filename, mime, size, uploaded_at FROM course_files ORDER BY course_id'
    ),
  };

  const payload = {
    meta: {
      app: 'afterschool',
      version: 1,
      exported_at: new Date().toISOString(),
      exported_by: req.user.username,
      active_semester: (await getSettings()).semester || null,
      counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
      note: '비밀번호 해시 미포함 — 복원 시 비밀번호는 재발급해야 합니다. 강의계획서 첨부 본문은 제외되어 목록만 담겨 있습니다.',
    },
    tables,
  };

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="afterschool-backup-${date}.json"`);
  res.send(JSON.stringify(payload, null, 2));
}));

export default router;
