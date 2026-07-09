import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

import { ensureSeed } from './seed.js';
import { authRequired, ah } from './auth.js';
import { getActiveSemester, isRegistrationOpen } from './logic.js';
import { all, getSetting } from './db.js';
import authRoutes from './routes/auth.js';
import courseRoutes from './routes/courses.js';
import enrollmentRoutes from './routes/enrollments.js';
import adminRoutes from './routes/admin.js';
import teacherRoutes from './routes/teacher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Schema + demo seed on first run. A parallel cold-start instance may have
// seeded already — UNIQUE violations there are harmless, so don't crash on them.
try {
  await ensureSeed();
} catch (e) {
  console.error('seed skipped:', e.message);
}

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '8mb' })); // 강의계획서(base64, 최대 5MB) 업로드 허용
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// 랜딩(로그인) 페이지 공지 — 비로그인 공개. 신청기간·접수상태 + 관리자 공지문.
app.get('/api/landing', ah(async (req, res) => {
  const s = await getActiveSemester();
  res.json({
    semester: { code: s.code, name: s.name },
    registration_open: await isRegistrationOpen(),
    registration_start: s.registration_start || null,
    registration_end: s.registration_end || null,
    notice: (await getSetting('landing_notice')) || '',
  });
}));

// Active session info for header/print labels + 접수 상태 (학생 화면 마감 표시용).
app.get('/api/meta', authRequired, ah(async (req, res) => {
  const s = await getActiveSemester();
  res.json({
    semester: { code: s.code, name: s.name },
    registration_open: await isRegistrationOpen(),
  });
}));

// 교과군 목록 — 강좌 개설 폼(강사/관리자)에서 사용.
app.get('/api/groups', authRequired, ah(async (req, res) => {
  const rows = await all('SELECT * FROM course_groups ORDER BY name');
  res.json({
    groups: rows.map((g) => ({ id: g.id, name: g.name, schedule: JSON.parse(g.schedule) })),
  });
}));

app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teacher', teacherRoutes);

// Serve built client when present (local production mode).
// On Vercel the static SPA is served by the CDN instead.
const clientDist = join(__dirname, '..', '..', 'client', 'dist');
if (!process.env.VERCEL && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

export default app;
