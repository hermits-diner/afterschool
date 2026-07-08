import { createClient } from '@libsql/client';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// DB resolution order:
//  1. TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) — persistent Turso database
//  2. DB_URL — any explicit libsql/file URL
//  3. local file — ./data.sqlite in dev, /tmp on serverless (ephemeral demo mode)
const localFile = process.env.VERCEL
  ? 'file:/tmp/data.sqlite'
  : `file:${join(__dirname, '..', 'data.sqlite')}`;
const url = process.env.TURSO_DATABASE_URL || process.env.DB_URL || localFile;
const isFile = url.startsWith('file:');

const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

/* ---- Query helpers (positional `?` params) ---- */

export async function all(sql, args = []) {
  const rs = await client.execute({ sql, args });
  return rs.rows;
}

export async function get(sql, args = []) {
  return (await all(sql, args))[0];
}

export async function run(sql, args = []) {
  const rs = await client.execute({ sql, args });
  return {
    changes: rs.rowsAffected,
    lastInsertRowid:
      rs.lastInsertRowid === undefined ? undefined : Number(rs.lastInsertRowid),
  };
}

// Multiple statements in a single transaction (one round trip on Turso).
export function batch(stmts) {
  return client.batch(
    stmts.map((s) => (typeof s === 'string' ? { sql: s, args: [] } : { sql: s.sql, args: s.args || [] })),
    'write'
  );
}

/* ---- Schema ---- */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin','teacher','student')),
    name          TEXT NOT NULL,
    email         TEXT,
    phone         TEXT,
    grade         INTEGER,
    class_no      INTEGER,
    student_no    INTEGER,
    subject_area  TEXT,
    active        INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS courses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,
    category      TEXT NOT NULL,
    description   TEXT,
    teacher_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    capacity      INTEGER NOT NULL DEFAULT 20,
    day_of_week   TEXT NOT NULL,
    start_time    TEXT NOT NULL,
    end_time      TEXT NOT NULL,
    room          TEXT,
    target_grade  INTEGER,
    fee           INTEGER NOT NULL DEFAULT 0,
    semester      TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS enrollments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'enrolled'
                    CHECK (status IN ('enrolled','waitlisted','cancelled')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (student_id, course_id)
  )`,
  `CREATE TABLE IF NOT EXISTS attendance (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date          TEXT NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('present','absent','late','excused')),
    UNIQUE (course_id, student_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS announcements (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    author_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title         TEXT NOT NULL,
    content       TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_courses_semester ON courses(semester)',
  'CREATE INDEX IF NOT EXISTS idx_enroll_student ON enrollments(student_id)',
  'CREATE INDEX IF NOT EXISTS idx_enroll_course ON enrollments(course_id)',
];

const DEFAULT_SETTINGS = {
  semester: '2026-1',
  registration_open: 'true',
  registration_start: '2026-07-01',
  registration_end: '2026-07-31',
  max_courses_per_student: '3',
};

export async function initSchema() {
  if (isFile) {
    // Local-file niceties; remote Turso manages these server-side.
    await client.execute('PRAGMA journal_mode = WAL').catch(() => {});
    await client.execute('PRAGMA foreign_keys = ON').catch(() => {});
  }
  await batch(SCHEMA);
  // Migration for databases created before the column existed.
  await client
    .execute('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0')
    .catch(() => {});
  await batch(
    Object.entries(DEFAULT_SETTINGS).map(([k, v]) => ({
      sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      args: [k, String(v)],
    }))
  );
}

/* ---- Settings ---- */

export async function getSetting(key) {
  const row = await get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
}

export async function setSetting(key, value) {
  await run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, String(value)]
  );
}

export async function getSettings() {
  const rows = await all('SELECT key, value FROM settings');
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}
