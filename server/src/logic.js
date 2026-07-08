import { all, get, run, getSetting, semesterName } from './db.js';

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
  };
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

// Return the course that conflicts with `course` in the student's active schedule, or null.
export async function findScheduleConflict(studentId, course) {
  const rows = await all(
    `SELECT c.* FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.student_id = ? AND e.status = 'enrolled' AND c.id != ?`,
    [studentId, course.id]
  );
  for (const other of rows) {
    if (
      other.day_of_week === course.day_of_week &&
      timeOverlap(course.start_time, course.end_time, other.start_time, other.end_time)
    ) {
      return other;
    }
  }
  return null;
}

export async function isRegistrationOpen() {
  const s = await getActiveSemester();
  if (s.registration_open !== 'true') return false;
  const today = new Date().toISOString().slice(0, 10);
  if (s.registration_start && today < s.registration_start) return false;
  if (s.registration_end && today > s.registration_end) return false;
  return true;
}

// When a seat frees up, promote the earliest waitlisted student to enrolled.
// Each promotion is a single conditional UPDATE — capacity check and status
// change happen atomically, so concurrent cancels/promotes can't overshoot.
export async function promoteWaitlist(courseId) {
  const course = await get('SELECT capacity FROM courses WHERE id = ?', [courseId]);
  if (!course) return;
  let promoted = true;
  while (promoted) {
    const r = await run(
      `UPDATE enrollments SET status = 'enrolled'
       WHERE id = (
         SELECT id FROM enrollments
         WHERE course_id = ? AND status = 'waitlisted'
         ORDER BY created_at ASC, id ASC LIMIT 1
       )
       AND (SELECT COUNT(*) FROM enrollments WHERE course_id = ? AND status = 'enrolled') < ?`,
      [courseId, courseId, course.capacity]
    );
    promoted = r.changes > 0;
  }
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
    must_change_password: !!u.must_change_password,
  };
}

// Active roster (enrolled first, then waitlisted) for a course.
// orderBy 'student': 학년/반/번호 순 — class lists. 'created': 신청순 — 대기 순번 확인용.
export async function getCourseRoster(courseId, orderBy = 'student') {
  const order =
    orderBy === 'created' ? 'e.created_at, e.id' : 'u.grade, u.class_no, u.student_no';
  return all(
    `SELECT e.id AS enrollment_id, e.status, e.created_at,
            u.id AS student_id, u.name, u.grade, u.class_no, u.student_no, u.phone
     FROM enrollments e JOIN users u ON u.id = e.student_id
     WHERE e.course_id = ? AND e.status != 'cancelled'
     ORDER BY CASE e.status WHEN 'enrolled' THEN 0 ELSE 1 END, ${order}`,
    [courseId]
  );
}

// Shape course rows for API responses, adding computed fields.
// Batched: constant number of queries regardless of course count (important on remote DB).
export async function decorateCourses(courses) {
  if (!courses.length) return [];
  const ids = courses.map((c) => c.id);
  const ph = ids.map(() => '?').join(',');

  const counts = await all(
    `SELECT course_id, status, COUNT(*) AS c FROM enrollments
     WHERE course_id IN (${ph}) AND status IN ('enrolled','waitlisted')
     GROUP BY course_id, status`,
    ids
  );
  const enrolledMap = {};
  const waitlistedMap = {};
  for (const r of counts) {
    (r.status === 'enrolled' ? enrolledMap : waitlistedMap)[r.course_id] = r.c;
  }

  const teacherIds = [...new Set(courses.map((c) => c.teacher_id).filter(Boolean))];
  const teachers = teacherIds.length
    ? await all(
        `SELECT id, name FROM users WHERE id IN (${teacherIds.map(() => '?').join(',')})`,
        teacherIds
      )
    : [];
  const teacherMap = Object.fromEntries(teachers.map((t) => [t.id, t.name]));

  return courses.map((course) => {
    const enrolled = enrolledMap[course.id] || 0;
    return {
      ...course,
      teacher_name: (course.teacher_id && teacherMap[course.teacher_id]) || '미배정',
      enrolled_count: enrolled,
      waitlisted_count: waitlistedMap[course.id] || 0,
      seats_left: Math.max(0, course.capacity - enrolled),
      is_full: enrolled >= course.capacity,
    };
  });
}

export async function decorateCourse(course) {
  if (!course) return course;
  return (await decorateCourses([course]))[0];
}
