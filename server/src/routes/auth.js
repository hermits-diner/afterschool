import { Router } from 'express';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { get, run } from '../db.js';
import { verifyPassword, signToken, hashPassword, authRequired, ah } from '../auth.js';
import { publicUser } from '../logic.js';

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
// 학교 워크스페이스 도메인 제한 (예: 'school.hs.kr'). 비우면 모든 구글 계정 허용.
const GOOGLE_DOMAIN = process.env.ALLOWED_GOOGLE_DOMAIN || '';
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

function issueSession(res, user) {
  const token = signToken(user);
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ token, user: publicUser(user) });
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  role: z.enum(['admin', 'teacher', 'student']).optional(),
});

router.post('/login', ah(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });
  const { username, password, role } = parsed.data;

  const user = await get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }
  if (!user.active) return res.status(403).json({ error: '비활성화된 계정입니다. 관리자에게 문의하세요.' });
  if (role && user.role !== role) {
    const label = { admin: '관리자', teacher: '강사', student: '학생' }[role];
    return res.status(403).json({ error: `${label} 계정이 아닙니다.` });
  }

  issueSession(res, user);
}));

// Google Sign-In availability + client id for the frontend button.
router.get('/google/config', (req, res) => {
  res.json({ enabled: !!GOOGLE_CLIENT_ID, client_id: GOOGLE_CLIENT_ID || null, domain: GOOGLE_DOMAIN || null });
});

// Google Workspace login: verify the GIS ID token, match the user by email.
router.post('/google', ah(async (req, res) => {
  if (!googleClient) {
    return res.status(400).json({ error: 'Google 로그인이 설정되지 않았습니다.' });
  }
  const schema = z.object({
    credential: z.string().min(1),
    role: z.enum(['admin', 'teacher', 'student']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Google 인증 정보가 없습니다.' });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: parsed.data.credential,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Google 인증에 실패했습니다. 다시 시도해 주세요.' });
  }
  if (!payload?.email || payload.email_verified === false) {
    return res.status(403).json({ error: '이메일이 확인되지 않은 Google 계정입니다.' });
  }
  if (GOOGLE_DOMAIN && payload.hd !== GOOGLE_DOMAIN && !payload.email.endsWith(`@${GOOGLE_DOMAIN}`)) {
    return res.status(403).json({ error: `학교 계정(@${GOOGLE_DOMAIN})으로만 로그인할 수 있습니다.` });
  }

  const user = await get('SELECT * FROM users WHERE email = ?', [payload.email]);
  if (!user) {
    return res.status(403).json({
      error: `등록되지 않은 계정입니다 (${payload.email}). 담당 선생님께 계정 등록을 요청하세요.`,
    });
  }
  if (!user.active) return res.status(403).json({ error: '비활성화된 계정입니다. 관리자에게 문의하세요.' });
  if (parsed.data.role && user.role !== parsed.data.role) {
    const label = { admin: '관리자', teacher: '강사', student: '학생' }[parsed.data.role];
    return res.status(403).json({ error: `${label} 계정이 아닙니다.` });
  }
  // Google 로그인 사용자는 임시비밀번호 변경 강제를 적용하지 않음
  if (user.must_change_password) {
    await run('UPDATE users SET must_change_password = 0 WHERE id = ?', [user.id]);
    user.must_change_password = 0;
  }
  issueSession(res, user);
}));

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', authRequired, ah(async (req, res) => {
  const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  res.json({ user: publicUser(user) });
}));

// Change own password
const pwSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(4),
});
router.post('/change-password', authRequired, ah(async (req, res) => {
  const parsed = pwSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '새 비밀번호는 4자 이상이어야 합니다.' });
  const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!verifyPassword(parsed.data.current, user.password_hash)) {
    return res.status(400).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
  }
  await run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [
    hashPassword(parsed.data.next),
    user.id,
  ]);
  res.json({ ok: true });
}));

export default router;
