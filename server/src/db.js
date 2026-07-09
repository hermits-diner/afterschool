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
    is_super      INTEGER NOT NULL DEFAULT 0,   -- 시스템 관리자(1) / 부관리자·일반(0)
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
    textbook      TEXT,                        -- 부교재명 (빈값 = 자체제작)
    target_grade  INTEGER,                     -- (레거시) 단일 학년
    target_grades TEXT,                        -- '1,2' 복수 학년, 빈값/NULL = 전학년
    fee           INTEGER NOT NULL DEFAULT 0,
    pay_rate      INTEGER NOT NULL DEFAULT 0,   -- 강사료 회당 단가(원)
    planned_sessions INTEGER NOT NULL DEFAULT 0, -- 계획 차시(총 수업 횟수) — 정산 기본값
    session_override INTEGER,                   -- 실시 회차 수동 입력값 (최우선)
    schedule      TEXT,                          -- JSON [{day,from,to}] 다중 슬롯 (비연속 교시 지원)
    group_id      INTEGER,                       -- 교과군 참조 (course_groups.id)
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
  `CREATE TABLE IF NOT EXISTS course_groups (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,                  -- 교과군 이름 (예: 'A유형')
    semester  TEXT NOT NULL,                  -- 세션별 분리 — 같은 이름도 세션이 다르면 허용
    schedule  TEXT NOT NULL,                  -- JSON [{day,from,to}] — 비연속 교시/복수 요일 허용
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (name, semester)
  )`,
  `CREATE TABLE IF NOT EXISTS course_files (
    course_id   INTEGER PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
    filename    TEXT NOT NULL,
    mime        TEXT,
    size        INTEGER NOT NULL,
    data        TEXT NOT NULL,              -- base64 (강의계획서, 최대 5MB)
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS courses_trash (
    id         INTEGER PRIMARY KEY,        -- 원래 course id (복원 시 그대로 재사용)
    data       TEXT NOT NULL,              -- 강좌 행 전체 JSON — 복원용 스냅샷
    title      TEXT NOT NULL,
    semester   TEXT NOT NULL,
    deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_by INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    username     TEXT PRIMARY KEY,
    fails        INTEGER NOT NULL DEFAULT 0,
    last_fail    TEXT,
    locked_until TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS semesters (
    code        TEXT PRIMARY KEY,          -- '2026-1'
    name        TEXT NOT NULL,             -- '2026학년도 1학기'
    registration_open  TEXT NOT NULL DEFAULT 'true',
    registration_start TEXT,
    registration_end   TEXT,
    max_courses_per_student INTEGER NOT NULL DEFAULT 3,
    default_sessions INTEGER NOT NULL DEFAULT 16,   -- 기본 계획 차시 (강사 개설 시 자동 적용)
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
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
  // Migrations for databases created before these columns existed.
  await client
    .execute('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0')
    .catch(() => {});
  // 시스템 관리자 구분 — 기존 DB에는 가장 먼저 만들어진 관리자를 시스템 관리자로 승격.
  await client
    .execute('ALTER TABLE users ADD COLUMN is_super INTEGER NOT NULL DEFAULT 0')
    .catch(() => {});
  await client
    .execute(
      `UPDATE users SET is_super = 1
       WHERE role = 'admin' AND id = (SELECT MIN(id) FROM users WHERE role = 'admin')
         AND NOT EXISTS (SELECT 1 FROM users WHERE is_super = 1)`
    )
    .catch(() => {});
  await client
    .execute('ALTER TABLE courses ADD COLUMN pay_rate INTEGER NOT NULL DEFAULT 0')
    .catch(() => {});
  await client
    .execute('ALTER TABLE courses ADD COLUMN session_override INTEGER')
    .catch(() => {});
  await client
    .execute('ALTER TABLE courses ADD COLUMN planned_sessions INTEGER NOT NULL DEFAULT 0')
    .catch(() => {});
  await client
    .execute('ALTER TABLE semesters ADD COLUMN default_sessions INTEGER NOT NULL DEFAULT 16')
    .catch(() => {});
  await client.execute('ALTER TABLE courses ADD COLUMN schedule TEXT').catch(() => {});
  await client.execute('ALTER TABLE courses ADD COLUMN group_id INTEGER').catch(() => {});
  await client.execute('ALTER TABLE courses ADD COLUMN textbook TEXT').catch(() => {});
  // 복수 학년 대상: '1,2' 형식, 빈 문자열/NULL = 전학년. 기존 단일 값 이관.
  await client.execute('ALTER TABLE courses ADD COLUMN target_grades TEXT').catch(() => {});
  await client
    .execute("UPDATE courses SET target_grades = CAST(target_grade AS TEXT) WHERE target_grades IS NULL AND target_grade > 0")
    .catch(() => {});
  await batch(
    Object.entries(DEFAULT_SETTINGS).map(([k, v]) => ({
      sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      args: [k, String(v)],
    }))
  );

  // course_groups 세션별 분리 마이그레이션 — 구버전(전역, name UNIQUE) 테이블을
  // (name, semester) 복합 UNIQUE 구조로 재구성하고 기존 교과군은 활성 세션에 귀속시킨다.
  const cgDef = await get("SELECT sql FROM sqlite_master WHERE type='table' AND name='course_groups'");
  if (cgDef && !/semester/.test(cgDef.sql)) {
    const activeCode = (await getSetting('semester')) || '';
    await batch([
      `CREATE TABLE course_groups_new (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        name      TEXT NOT NULL,
        semester  TEXT NOT NULL,
        schedule  TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (name, semester)
      )`,
      {
        sql: `INSERT INTO course_groups_new (id, name, semester, schedule, created_at)
              SELECT id, name, ?, schedule, created_at FROM course_groups`,
        args: [activeCode],
      },
      'DROP TABLE course_groups',
      'ALTER TABLE course_groups_new RENAME TO course_groups',
    ]);
  }

  // Migrate the active semester (+ legacy flat settings) into the semesters table.
  const active = await getSetting('semester');
  if (active) {
    await run(
      `INSERT OR IGNORE INTO semesters (code, name, registration_open, registration_start, registration_end, max_courses_per_student)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        active,
        semesterName(active),
        (await getSetting('registration_open')) || 'true',
        await getSetting('registration_start'),
        await getSetting('registration_end'),
        Number((await getSetting('max_courses_per_student')) || 3),
      ]
    );
  }
}

// '2026-1' → '2026학년도 1학기', '2026-여름' → '2026학년도 여름방학', '2026-특강2' → '2026학년도 특강2'
export function semesterName(code) {
  const m = String(code).match(/^(\d{4})-(\d|여름|겨울|특강\d?)$/);
  if (!m) return String(code);
  const part = /^\d$/.test(m[2]) ? `${m[2]}학기` : m[2].startsWith('특강') ? m[2] : `${m[2]}방학`;
  return `${m[1]}학년도 ${part}`;
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
