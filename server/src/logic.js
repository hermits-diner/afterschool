import db, { getSetting } from './db.js';

// Count active (enrolled) students for a course.
export function enrolledCount(courseId) {
  return db
    .prepare(
      "SELECT COUNT(*) AS c FROM enrollments WHERE course_id = ? AND status = 'enrolled'"
    )
    .get(courseId).c;
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
export function findScheduleConflict(studentId, course) {
  const rows = db
    .prepare(
      `SELECT c.* FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.student_id = ? AND e.status = 'enrolled' AND c.id != ?`
    )
    .all(studentId, course.id);
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

export function isRegistrationOpen() {
  if (getSetting('registration_open') !== 'true') return false;
  const start = getSetting('registration_start');
  const end = getSetting('registration_end');
  const today = new Date().toISOString().slice(0, 10);
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

// When a seat frees up, promote the earliest waitlisted student to enrolled.
export function promoteWaitlist(courseId) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) return;
  while (enrolledCount(courseId) < course.capacity) {
    const next = db
      .prepare(
        "SELECT * FROM enrollments WHERE course_id = ? AND status = 'waitlisted' ORDER BY created_at ASC, id ASC LIMIT 1"
      )
      .get(courseId);
    if (!next) break;
    db.prepare("UPDATE enrollments SET status = 'enrolled' WHERE id = ?").run(next.id);
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
  };
}

// Active roster (enrolled first, then waitlisted) for a course.
// orderBy 'student': 학년/반/번호 순 — class lists. 'created': 신청순 — 대기 순번 확인용.
export function getCourseRoster(courseId, orderBy = 'student') {
  const order =
    orderBy === 'created' ? 'e.created_at, e.id' : 'u.grade, u.class_no, u.student_no';
  return db
    .prepare(
      `SELECT e.id AS enrollment_id, e.status, e.created_at,
              u.id AS student_id, u.name, u.grade, u.class_no, u.student_no, u.phone
       FROM enrollments e JOIN users u ON u.id = e.student_id
       WHERE e.course_id = ? AND e.status != 'cancelled'
       ORDER BY CASE e.status WHEN 'enrolled' THEN 0 ELSE 1 END, ${order}`
    )
    .all(courseId);
}

// Shape a course row for API responses, adding computed fields.
export function decorateCourse(course) {
  if (!course) return course;
  const teacher = course.teacher_id
    ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(course.teacher_id)
    : null;
  const enrolled = enrolledCount(course.id);
  const waitlisted = db
    .prepare(
      "SELECT COUNT(*) AS c FROM enrollments WHERE course_id = ? AND status = 'waitlisted'"
    )
    .get(course.id).c;
  return {
    ...course,
    teacher_name: teacher ? teacher.name : '미배정',
    enrolled_count: enrolled,
    waitlisted_count: waitlisted,
    seats_left: Math.max(0, course.capacity - enrolled),
    is_full: enrolled >= course.capacity,
  };
}
