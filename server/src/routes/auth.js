import { Router } from 'express';
import { z } from 'zod';
import { get, run } from '../db.js';
import { verifyPassword, signToken, hashPassword, authRequired, ah } from '../auth.js';
import { publicUser } from '../logic.js';

const router = Router();

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

  const token = signToken(user);
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ token, user: publicUser(user) });
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
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [
    hashPassword(parsed.data.next),
    user.id,
  ]);
  res.json({ ok: true });
}));

export default router;
