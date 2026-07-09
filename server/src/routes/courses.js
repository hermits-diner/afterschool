import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, getSetting } from '../db.js';
import { authRequired, requireRole, ah } from '../auth.js';
import { decorateCourse, decorateCourses, getActiveSemester, trashCourses, PERIOD_TIMES } from '../logic.js';

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
    clauses.push("(target_grades IS NULL OR target_grades = '' OR ',' || target_grades || ',' LIKE '%,' || ? || ',%')");
    params.push(String(Number(grade)));
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
const DAY_ORDER = { 월: 0, 화: 1, 수: 2, 목: 3, 금: 4 };

const slotSchema = z
  .object({
    day: z.enum(DAYS),
    from: z.number().int().min(1).max(9),
    to: z.number().int().min(1).max(9),
  })
  .refine((s) => s.from <= s.to, { message: '교시 범위가 올바르지 않습니다.' });

const courseSchema = z.object({
  title: z.string().min(1, '강좌명을 입력하세요.'),
  category: z.string().min(1),
  description: z.string().optional().default(''),
  teacher_id: z.number().int().nullable().optional(),
  capacity: z.number().int().min(1).max(200),
  schedule: z.array(slotSchema).max(20).optional(), // 다중 슬롯 직접 지정 (관리자)
  group_id: z.number().int().nullable().optional(), // 교과군 선택
  room: z.string().optional().default(''),
  textbook: z.string().max(100).optional().default(''), // 부교재명 (빈값 = 자체제작)
  target_grade: z.number().int().min(0).max(3).optional(), // 레거시
  target_grades: z.array(z.number().int().min(1).max(3)).max(3).optional(), // [] 또는 3개 전부 = 전학년
  fee: z.number().int().min(0).default(0),
  pay_rate: z.number().int().min(0).default(0), // 강사료 회당 단가(원) — 관리자만 설정
  planned_sessions: z.number().int().min(0).max(999).default(0), // 계획 차시(총 수업 횟수)
  semester: z.string().optional(),
  status: z.enum(['open', 'closed', 'cancelled']).optional(),
});

function sortSlots(slots) {
  return [...slots].sort((a, b) => DAY_ORDER[a.day] - DAY_ORDER[b.day] || a.from - b.from);
}

// group_id/schedule 입력을 슬롯 배열로 해석. 반환: {slots, group_id} 또는 null(변경 없음).
// 교과군은 세션별 — 활성 세션의 교과군만 선택할 수 있다.
async function resolveSchedule(d) {
  if (d.group_id) {
    const g = await get('SELECT * FROM course_groups WHERE id = ?', [d.group_id]);
    if (!g) return { error: '선택한 교과군을 찾을 수 없습니다.' };
    if (g.semester !== (await getSetting('semester'))) {
      return { error: '다른 세션의 교과군입니다. 현재 세션의 교과군을 선택하세요.' };
    }
    return { slots: sortSlots(JSON.parse(g.schedule)), group_id: g.id };
  }
  if (d.schedule && d.schedule.length) {
    return { slots: sortSlots(d.schedule), group_id: null };
  }
  return null;
}

// 대상 학년 입력 → 저장 필드. 빈/3개 전부 = 전학년('').
function gradeFields(list) {
  const arr = [...new Set(list || [])].sort();
  const all = arr.length === 0 || arr.length >= 3;
  return {
    target_grades: all ? '' : arr.join(','),
    target_grade: !all && arr.length === 1 ? arr[0] : 0,
  };
}

// 슬롯 배열 → 레거시 표시/정렬용 필드 (첫 슬롯 기준)
function legacyFields(slots) {
  const first = slots[0];
  return {
    day_of_week: first.day,
    start_time: PERIOD_TIMES[first.from][0],
    end_time: PERIOD_TIMES[first.to][1],
  };
}

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
    d.textbook ?? '',
    d.target_grade ?? 0,
    d.target_grades ?? '',
    d.fee,
    d.pay_rate ?? 0,
    d.planned_sessions ?? 0,
    d.schedule_json ?? null,
    d.group_id ?? null,
    d.status,
  ];
}

// Create course — 강사는 자기 강좌를 직접 개설, 관리자는 누구에게든 배정 가능.
// 수업 시간은 교과군(group_id) 선택 또는 관리자의 직접 슬롯 지정(schedule)으로 결정.
router.post('/', authRequired, requireRole('admin', 'teacher'), ah(async (req, res) => {
  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const d = parsed.data;
  if (req.user.role === 'teacher') {
    d.teacher_id = req.user.id; // 강사는 본인 강좌만
    d.pay_rate = 0; // 강사료 단가는 관리자가 책정
    d.fee = 0; // 수강료는 관리자가 책정
    d.planned_sessions = (await getActiveSemester()).default_sessions ?? 16; // 세션 기본 계획 차시 자동 적용
    // 교과군이 정의되어 있으면 강사는 교과군으로만 시간 지정
    const groupCount = (await get('SELECT COUNT(*) c FROM course_groups WHERE semester = ?', [await getSetting('semester')])).c;
    if (groupCount > 0) {
      if (!d.group_id) return res.status(400).json({ error: '교과군을 선택하세요.' });
      delete d.schedule;
    }
  }
  const resolved = await resolveSchedule(d);
  if (resolved?.error) return res.status(400).json({ error: resolved.error });
  if (!resolved) return res.status(400).json({ error: '수업 시간(교과군 또는 교시)을 선택하세요.' });

  const info = await run(
    `INSERT INTO courses
     (title, category, description, teacher_id, capacity, day_of_week, start_time, end_time, room, textbook, target_grade, target_grades, fee, pay_rate, planned_sessions, schedule, group_id, status, semester)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ...courseValues({
        ...d,
        ...legacyFields(resolved.slots),
        ...gradeFields(d.target_grades ?? (d.target_grade ? [d.target_grade] : [])),
        schedule_json: JSON.stringify(resolved.slots),
        group_id: resolved.group_id,
        status: d.status || 'open',
      }),
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
  const d = parsed.data;
  if (req.user.role === 'teacher') {
    // 교과군이 정의되어 있으면 강사의 직접 슬롯 지정은 무시
    const groupCount = (await get('SELECT COUNT(*) c FROM course_groups WHERE semester = ?', [await getSetting('semester')])).c;
    if (groupCount > 0) delete d.schedule;
  }
  const resolved = await resolveSchedule(d);
  if (resolved?.error) return res.status(400).json({ error: resolved.error });

  const merged = { ...existing, ...d };
  if (d.target_grades !== undefined) {
    Object.assign(merged, gradeFields(d.target_grades));
  } else if (d.target_grade !== undefined) {
    Object.assign(merged, gradeFields(d.target_grade ? [d.target_grade] : []));
  }
  if (resolved) {
    Object.assign(merged, legacyFields(resolved.slots));
    merged.schedule_json = JSON.stringify(resolved.slots);
    merged.group_id = resolved.group_id;
  } else {
    merged.schedule_json = existing.schedule;
    merged.group_id = existing.group_id;
  }
  if (req.user.role === 'teacher') {
    merged.teacher_id = existing.teacher_id; // 담당 강사 변경은 관리자만
    merged.pay_rate = existing.pay_rate; // 강사료 단가 변경도 관리자만
    merged.fee = existing.fee; // 수강료 변경도 관리자만
    merged.planned_sessions = existing.planned_sessions; // 계획 차시 조정도 관리자만
  }
  await run(
    `UPDATE courses SET title=?, category=?, description=?, teacher_id=?, capacity=?,
     day_of_week=?, start_time=?, end_time=?, room=?, textbook=?, target_grade=?, target_grades=?, fee=?, pay_rate=?, planned_sessions=?, schedule=?, group_id=?, status=?
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

// Delete course (admin) — 휴지통으로 이동(soft delete). 신청·출석 등 하위 데이터는
// 보존되어 관리자 휴지통에서 복원하면 그대로 돌아온다.
router.delete('/:id', authRequired, requireRole('admin'), ah(async (req, res) => {
  const course = await get('SELECT * FROM courses WHERE id = ?', [req.params.id]);
  if (!course) return res.status(404).json({ error: '강좌를 찾을 수 없습니다.' });
  await trashCourses([course.id], req.user.id);
  res.json({ ok: true });
}));

/* ---------------- 강의계획서 첨부 ---------------- */
const MAX_SYLLABUS_BYTES = 5 * 1024 * 1024; // 5MB

async function canManageCourse(req, courseId) {
  const course = await get('SELECT * FROM courses WHERE id = ?', [courseId]);
  if (!course) return { error: 404 };
  if (req.user.role !== 'admin' && course.teacher_id !== req.user.id) return { error: 403 };
  return { course };
}

// Upload/replace syllabus (owner teacher or admin). Body: {filename, mime, data(base64)}
router.post('/:id/syllabus', authRequired, requireRole('admin', 'teacher'), ah(async (req, res) => {
  const { error } = await canManageCourse(req, req.params.id);
  if (error === 404) return res.status(404).json({ error: '강좌를 찾을 수 없습니다.' });
  if (error === 403) return res.status(403).json({ error: '담당 강좌만 첨부할 수 있습니다.' });

  const schema = z.object({
    filename: z.string().min(1).max(200),
    mime: z.string().max(100).optional(),
    data: z.string().min(1), // base64
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '첨부파일 데이터가 올바르지 않습니다.' });
  const size = Math.floor((parsed.data.data.length * 3) / 4);
  if (size > MAX_SYLLABUS_BYTES) {
    return res.status(400).json({ error: '강의계획서는 5MB 이하 파일만 첨부할 수 있습니다.' });
  }
  await run(
    `INSERT INTO course_files (course_id, filename, mime, size, data, uploaded_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(course_id) DO UPDATE SET
       filename = excluded.filename, mime = excluded.mime, size = excluded.size,
       data = excluded.data, uploaded_at = excluded.uploaded_at`,
    [req.params.id, parsed.data.filename, parsed.data.mime || 'application/octet-stream', size, parsed.data.data]
  );
  res.status(201).json({ ok: true, filename: parsed.data.filename });
}));

// Download syllabus (any authenticated user — 학생도 열람 가능)
router.get('/:id/syllabus', authRequired, ah(async (req, res) => {
  const file = await get('SELECT * FROM course_files WHERE course_id = ?', [req.params.id]);
  if (!file) return res.status(404).json({ error: '첨부된 강의계획서가 없습니다.' });
  res.setHeader('Content-Type', file.mime || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`
  );
  res.send(Buffer.from(file.data, 'base64'));
}));

// Remove syllabus (owner teacher or admin)
router.delete('/:id/syllabus', authRequired, requireRole('admin', 'teacher'), ah(async (req, res) => {
  const { error } = await canManageCourse(req, req.params.id);
  if (error === 404) return res.status(404).json({ error: '강좌를 찾을 수 없습니다.' });
  if (error === 403) return res.status(403).json({ error: '담당 강좌만 삭제할 수 있습니다.' });
  await run('DELETE FROM course_files WHERE course_id = ?', [req.params.id]);
  res.json({ ok: true });
}));

export default router;
