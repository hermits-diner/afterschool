import { all, get, run, batch, getSetting, semesterName } from './db.js';

// Active semester row — settings.semester points at the current session code.
// Registration window / limits are per-semester settings.
export async function getActiveSemester() {
  const code = await getSetting('semester');
  const row = code ? await get('SELECT * FROM semesters WHERE code = ?', [code]) : undefined;
  if (row) return row;
  // legacy fallback: flat settings (pre-semesters DB)
  return {
    code,
    name: semesterName(code || ''),
    registration_open: (await getSetting('registration_open')) || 'true',
    registration_start: await getSetting('registration_start'),
    registration_end: await getSetting('registration_end'),
    max_courses_per_student: Number((await getSetting('max_courses_per_student')) || 3),
    default_sessions: 16,
  };
}

// 1~9교시 시간표 (클라이언트 PERIODS와 동일해야 함)
export const PERIOD_TIMES = {
  1: ['09:00', '09:50'],
  2: ['10:00', '10:50'],
  3: ['11:00', '11:50'],
  4: ['12:00', '12:50'],
  5: ['13:30', '14:20'],
  6: ['14:30', '15:20'],
  7: ['15:30', '16:20'],
  8: ['16:30', '17:20'],
  9: ['17:30', '18:20'],
};

// 강좌의 수업 슬롯 배열 [{day, from, to}] — schedule JSON 우선, 없으면 null(레거시).
export function parseSlots(course) {
  if (course.schedule) {
    try {
      const s = typeof course.schedule === 'string' ? JSON.parse(course.schedule) : course.schedule;
      if (Array.isArray(s) && s.length) return s;
    } catch {
      /* legacy */
    }
  }
  return null;
}

// 강좌를 시간 블록 [{day, start, end}]으로 정규화 (슬롯 또는 레거시 단일 시간).
export function courseBlocks(course) {
  const slots = parseSlots(course);
  if (slots) {
    return slots.map((s) => ({
      day: s.day,
      start: PERIOD_TIMES[s.from][0],
      end: PERIOD_TIMES[s.to][1],
    }));
  }
  return [{ day: course.day_of_week, start: course.start_time, end: course.end_time }];
}

// 대상 학년 배열 (빈 배열 = 전학년). target_grades('1,2') 우선, 레거시 target_grade 폴백.
export function parseTargetGrades(course) {
  if (course.target_grades !== null && course.target_grades !== undefined) {
    const arr = String(course.target_grades).split(',').filter(Boolean).map(Number).sort();
    return arr.length >= 3 ? [] : arr;
  }
  return course.target_grade > 0 ? [course.target_grade] : [];
}

// 축약 표기: '월7', '월7~9' — 여러 슬롯은 쉼표로 (예: '월7, 화7, 수7')
export function scheduleLabel(course) {
  const slots = parseSlots(course);
  if (!slots) return `${course.day_of_week} ${course.start_time}~${course.end_time}`;
  return slots
    .map((s) => (s.from === s.to ? `${s.day}${s.from}` : `${s.day}${s.from}~${s.to}`))
    .join(', ');
}

// Count active (enrolled) students for a course.
export async function enrolledCount(courseId) {
  const row = await get(
    "SELECT COUNT(*) AS c FROM enrollments WHERE course_id = ? AND status = 'enrolled'",
    [courseId]
  );
  return row.c;
}

// Parse 'HH:MM' -> minutes for overlap checks.
function toMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function timeOverlap(aStart, aEnd, bStart, bEnd) {
  return toMin(aStart) < toMin(bEnd) && toMin(bStart) < toMin(aEnd);
}

// 두 강좌의 수업 블록이 하나라도 겹치는가 (다중 슬롯 지원).
export function coursesOverlap(a, b) {
  const ba = courseBlocks(a);
  const bb = courseBlocks(b);
  return ba.some((x) => bb.some((y) => x.day === y.day && timeOverlap(x.start, x.end, y.start, y.end)));
}

// Return the course that conflicts with `course` in the student's schedule, or null.
// 같은 세션 안에서만 검사한다 — 세션(학기·특강)이 다르면 운영 기간이 달라 겹치지 않는다.
export async function findScheduleConflict(studentId, course) {
  const rows = await all(
    `SELECT c.* FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.student_id = ? AND e.status = 'enrolled' AND c.id != ? AND c.status != 'cancelled'
       AND c.semester = ?`,
    [studentId, course.id, course.semester]
  );
  for (const other of rows) {
    if (coursesOverlap(course, other)) return other;
  }
  return null;
}

// 세션 행 기준 접수 판정 — registration_open + 기간 내 (분 단위, 한국 시간 KST).
// 값이 날짜만이면 시작일은 00:00부터, 종료일은 23:59까지로 해석.
export function isSemesterAccepting(s) {
  if (!s || s.registration_open !== 'true') return false;
  const now = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16); // 'YYYY-MM-DDTHH:MM' KST
  const start = s.registration_start
    ? s.registration_start.includes('T')
      ? s.registration_start
      : `${s.registration_start}T00:00`
    : null;
  const end = s.registration_end
    ? s.registration_end.includes('T')
      ? s.registration_end
      : `${s.registration_end}T23:59`
    : null;
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

// 활성 세션의 접수 여부 (헤더·관리 화면용)
export async function isRegistrationOpen() {
  return isSemesterAccepting(await getActiveSemester());
}

// 지금 신청을 받는 모든 세션 — 활성 여부와 무관.
// 정규 학기와 특강처럼 두 세션이 동시에 접수할 수 있다.
export async function getAcceptingSemesters() {
  const rows = await all('SELECT * FROM semesters');
  return rows.filter(isSemesterAccepting);
}

// 학생 화면(카탈로그·내 신청)에 노출할 세션 코드 목록 — 활성 세션 + 접수중 세션.
export async function getStudentVisibleSemesters() {
  const active = await getActiveSemester();
  const codes = new Set([active.code, ...(await getAcceptingSemesters()).map((s) => s.code)]);
  return [...codes].filter(Boolean);
}

// Serialize a user row for API responses (drops password hash).
export function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    name: u.name,
    email: u.email,
    phone: u.phone,
    grade: u.grade,
    class_no: u.class_no,
    student_no: u.student_no,
    subject_area: u.subject_area,
    active: !!u.active,
    is_super: !!u.is_super,
    must_change_password: !!u.must_change_password,
  };
}

// Active roster (수강확정 학생) for a course.
// orderBy 'student': 학년/반/번호 순 — class lists. 'created': 신청순.
export async function getCourseRoster(courseId, orderBy = 'student') {
  const order =
    orderBy === 'created' ? 'e.created_at, e.id' : 'u.grade, u.class_no, u.student_no';
  return all(
    `SELECT e.id AS enrollment_id, e.status, e.created_at,
            u.id AS student_id, u.name, u.grade, u.class_no, u.student_no, u.phone
     FROM enrollments e JOIN users u ON u.id = e.student_id
     WHERE e.course_id = ? AND e.status = 'enrolled'
     ORDER BY ${order}`,
    [courseId]
  );
}

// 강좌를 휴지통으로 이동 (soft delete). 강좌 행과 하위 데이터(신청·출석·공지·강의계획서)를
// 통째로 스냅샷에 담아 두므로 복원하면 전부 원상복구된다.
// (FK cascade 활성 환경에서는 강좌 행 삭제 시 하위 행이 함께 지워지므로 스냅샷이 원본이다)
export async function trashCourses(ids, deletedBy = null) {
  if (!ids.length) return 0;
  const ph = ids.map(() => '?').join(',');
  const rows = await all(`SELECT * FROM courses WHERE id IN (${ph})`, ids);
  if (!rows.length) return 0;

  const inserts = [];
  for (const c of rows) {
    const bundle = {
      course: c,
      enrollments: await all('SELECT * FROM enrollments WHERE course_id = ?', [c.id]),
      attendance: await all('SELECT * FROM attendance WHERE course_id = ?', [c.id]),
      announcements: await all('SELECT * FROM announcements WHERE course_id = ?', [c.id]),
      files: await all('SELECT * FROM course_files WHERE course_id = ?', [c.id]),
    };
    inserts.push({
      sql: `INSERT OR REPLACE INTO courses_trash (id, data, title, semester, deleted_at, deleted_by)
            VALUES (?, ?, ?, ?, datetime('now'), ?)`,
      args: [c.id, JSON.stringify(bundle), c.title, c.semester, deletedBy],
    });
  }
  const found = rows.map((c) => c.id);
  const fph = found.map(() => '?').join(',');
  await batch([
    ...inserts,
    // 하위 데이터는 명시적으로 정리 (FK pragma와 무관하게 일관된 상태 보장)
    { sql: `DELETE FROM attendance WHERE course_id IN (${fph})`, args: found },
    { sql: `DELETE FROM announcements WHERE course_id IN (${fph})`, args: found },
    { sql: `DELETE FROM enrollments WHERE course_id IN (${fph})`, args: found },
    { sql: `DELETE FROM course_wishes WHERE course_id IN (${fph})`, args: found },
    { sql: `DELETE FROM course_files WHERE course_id IN (${fph})`, args: found },
    { sql: `DELETE FROM courses WHERE id IN (${fph})`, args: found },
  ]);
  return rows.length;
}

// 휴지통에서 복원 — 강좌와 하위 데이터를 스냅샷에서 되살린다.
// 삭제 사이에 사라진 학생/강사/교과군 참조 행은 건너뛴다(INSERT OR IGNORE).
export async function restoreTrashedCourse(id) {
  const row = await get('SELECT * FROM courses_trash WHERE id = ?', [id]);
  if (!row) return null;
  const bundle = JSON.parse(row.data);
  const d = bundle.course;
  if (d.teacher_id && !(await get('SELECT id FROM users WHERE id = ?', [d.teacher_id]))) d.teacher_id = null;
  if (d.group_id && !(await get('SELECT id FROM course_groups WHERE id = ?', [d.group_id]))) d.group_id = null;
  await batch([
    {
      sql: `INSERT INTO courses (id, title, category, description, teacher_id, capacity, day_of_week, start_time, end_time, room,
              target_grade, target_grades, fee, pay_rate, planned_sessions, session_override, schedule, group_id, semester, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        d.id, d.title, d.category, d.description ?? '', d.teacher_id ?? null, d.capacity,
        d.day_of_week, d.start_time, d.end_time, d.room ?? '', d.target_grade ?? 0, d.target_grades ?? '',
        d.fee ?? 0, d.pay_rate ?? 0, d.planned_sessions ?? 0, d.session_override ?? null,
        d.schedule ?? null, d.group_id ?? null, d.semester, d.status ?? 'open', d.created_at,
      ],
    },
    ...(bundle.enrollments || []).map((e) => ({
      sql: 'INSERT OR IGNORE INTO enrollments (id, student_id, course_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [e.id, e.student_id, e.course_id, e.status, e.created_at],
    })),
    ...(bundle.attendance || []).map((a) => ({
      sql: 'INSERT OR IGNORE INTO attendance (id, course_id, student_id, date, status) VALUES (?, ?, ?, ?, ?)',
      args: [a.id, a.course_id, a.student_id, a.date, a.status],
    })),
    ...(bundle.announcements || []).map((a) => ({
      sql: 'INSERT OR IGNORE INTO announcements (id, course_id, author_id, title, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [a.id, a.course_id, a.author_id, a.title, a.content, a.created_at],
    })),
    ...(bundle.files || []).map((f) => ({
      sql: 'INSERT OR IGNORE INTO course_files (course_id, filename, mime, size, data, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [f.course_id, f.filename, f.mime, f.size, f.data, f.uploaded_at],
    })),
    { sql: 'DELETE FROM courses_trash WHERE id = ?', args: [id] },
  ]);
  return row.title;
}

// 휴지통 완전 비우기 — 하위 데이터는 휴지통 이동 시 이미 정리되었으므로 스냅샷만 버린다.
export async function purgeTrashedCourses(ids) {
  if (!ids.length) return 0;
  const ph = ids.map(() => '?').join(',');
  await run(`DELETE FROM courses_trash WHERE id IN (${ph})`, ids);
  return ids.length;
}

// Shape course rows for API responses, adding computed fields.
// Batched: constant number of queries regardless of course count (important on remote DB).
export async function decorateCourses(courses) {
  if (!courses.length) return [];
  const ids = courses.map((c) => c.id);
  const ph = ids.map(() => '?').join(',');

  const counts = await all(
    `SELECT course_id, COUNT(*) AS c FROM enrollments
     WHERE course_id IN (${ph}) AND status = 'enrolled'
     GROUP BY course_id`,
    ids
  );
  const enrolledMap = {};
  for (const r of counts) enrolledMap[r.course_id] = r.c;

  const teacherIds = [...new Set(courses.map((c) => c.teacher_id).filter(Boolean))];
  const teachers = teacherIds.length
    ? await all(
        `SELECT id, name FROM users WHERE id IN (${teacherIds.map(() => '?').join(',')})`,
        teacherIds
      )
    : [];
  const teacherMap = Object.fromEntries(teachers.map((t) => [t.id, t.name]));

  const files = await all(
    `SELECT course_id, filename FROM course_files WHERE course_id IN (${ph})`,
    ids
  );
  const fileMap = Object.fromEntries(files.map((f) => [f.course_id, f.filename]));

  // 빈자리 희망 인원 — 관리자·강사가 증설/정원 조정 판단에 사용
  const wishes = await all(
    `SELECT course_id, COUNT(*) AS c FROM course_wishes WHERE course_id IN (${ph}) GROUP BY course_id`,
    ids
  );
  const wishMap = Object.fromEntries(wishes.map((w) => [w.course_id, w.c]));

  // 교과군 이름 (강좌 목록을 교과군별로 묶어 보여줄 때 사용)
  const groupIds = [...new Set(courses.map((c) => c.group_id).filter(Boolean))];
  const groups = groupIds.length
    ? await all(
        `SELECT id, name FROM course_groups WHERE id IN (${groupIds.map(() => '?').join(',')})`,
        groupIds
      )
    : [];
  const groupMap = Object.fromEntries(groups.map((g) => [g.id, g.name]));

  return courses.map((course) => {
    const enrolled = enrolledMap[course.id] || 0;
    return {
      ...course,
      schedule: parseSlots(course),
      schedule_label: scheduleLabel(course),
      target_grades: parseTargetGrades(course),
      teacher_name: (course.teacher_id && teacherMap[course.teacher_id]) || '미배정',
      group_name: (course.group_id && groupMap[course.group_id]) || null,
      enrolled_count: enrolled,
      seats_left: Math.max(0, course.capacity - enrolled),
      is_full: enrolled >= course.capacity,
      wish_count: wishMap[course.id] || 0,
      syllabus_filename: fileMap[course.id] || null,
    };
  });
}

export async function decorateCourse(course) {
  if (!course) return course;
  return (await decorateCourses([course]))[0];
}
