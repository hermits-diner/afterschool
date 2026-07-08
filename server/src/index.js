import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

import { initSchema } from './db.js';
import { ensureSeed } from './seed.js';
import authRoutes from './routes/auth.js';
import courseRoutes from './routes/courses.js';
import enrollmentRoutes from './routes/enrollments.js';
import adminRoutes from './routes/admin.js';
import teacherRoutes from './routes/teacher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

initSchema();
ensureSeed(); // create demo accounts/data on first run

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teacher', teacherRoutes);

// Serve built client in production
const clientDist = join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n  🎓  방과후학교 수강신청 서버 실행 중: http://localhost:${PORT}\n`);
});
