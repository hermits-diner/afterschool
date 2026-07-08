import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data.sqlite');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('admin','teacher','student')),
      name          TEXT NOT NULL,
      email         TEXT,
      phone         TEXT,
      -- student fields
      grade         INTEGER,          -- 학년 (1~3)
      class_no      INTEGER,          -- 반
      student_no    INTEGER,          -- 번호
      -- teacher fields
      subject_area  TEXT,             -- 담당 교과/분야
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT NOT NULL,
      category      TEXT NOT NULL,        -- 국어/영어/수학/과학/예체능/기타
      description   TEXT,
      teacher_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      capacity      INTEGER NOT NULL DEFAULT 20,
      day_of_week   TEXT NOT NULL,        -- 월/화/수/목/금
      start_time    TEXT NOT NULL,        -- 'HH:MM'
      end_time      TEXT NOT NULL,        -- 'HH:MM'
      room          TEXT,
      target_grade  INTEGER,              -- 0 = 전학년, 1~3 특정 학년
      fee           INTEGER NOT NULL DEFAULT 0,
      semester      TEXT NOT NULL,        -- '2026-1'
      status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      status        TEXT NOT NULL DEFAULT 'enrolled'
                      CHECK (status IN ('enrolled','waitlisted','cancelled')),
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (student_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      student_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date          TEXT NOT NULL,        -- 'YYYY-MM-DD'
      status        TEXT NOT NULL CHECK (status IN ('present','absent','late','excused')),
      UNIQUE (course_id, student_id, date)
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      author_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title         TEXT NOT NULL,
      content       TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_courses_semester ON courses(semester);
    CREATE INDEX IF NOT EXISTS idx_enroll_student ON enrollments(student_id);
    CREATE INDEX IF NOT EXISTS idx_enroll_course ON enrollments(course_id);
  `);

  // default settings
  const defaults = {
    semester: '2026-1',
    registration_open: 'true',
    registration_start: '2026-07-01',
    registration_end: '2026-07-31',
    max_courses_per_student: '3',
  };
  const insert = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [k, v] of Object.entries(defaults)) insert.run(k, v);
}

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export default db;
