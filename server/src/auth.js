import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';

// 네이티브 bcrypt(C++, 워커 스레드 병렬)를 우선 사용하고,
// 바이너리 설치가 안 되는 환경에서는 순수 JS bcryptjs로 자동 폴백한다.
// 두 라이브러리의 해시는 완전 호환이라 기존 비밀번호는 그대로 검증된다.
let bcrypt = bcryptjs;
try {
  bcrypt = (await import('bcrypt')).default;
} catch {
  console.warn('⚠️  native bcrypt 미설치 — bcryptjs(순수 JS)로 동작합니다. 동시 로그인이 많으면 느려질 수 있습니다.');
}

const JWT_SECRET = process.env.JWT_SECRET || 'afterschool-dev-secret-change-in-prod';
const TOKEN_TTL = '7d';

// 운영(서버리스) 환경에서 시크릿 미설정은 토큰 위조 위험 — 큰 소리로 경고.
if (!process.env.JWT_SECRET && process.env.VERCEL) {
  console.warn(
    '⚠️  [보안] JWT_SECRET 환경변수가 설정되지 않아 기본 개발용 시크릿을 사용 중입니다. ' +
      'Vercel → Settings → Environment Variables 에 JWT_SECRET(64자 이상 무작위 문자열)을 반드시 추가하세요.'
  );
}

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

// 비동기 검증 — 네이티브 bcrypt에서는 워커 스레드 풀에서 병렬 처리되어
// 동시 로그인 폭주 시 이벤트 루프가 막히지 않는다. (양쪽 라이브러리 모두 Promise 지원)
export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, username: user.username },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

// Reads token from Authorization: Bearer <token> or the `token` cookie.
export function authRequired(req, res, next) {
  const header = req.headers.authorization;
  const bearer = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || (req.cookies && req.cookies.token);
  if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '세션이 만료되었거나 유효하지 않습니다.' });
  }
}

// Restrict a route to one or more roles.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
    next();
  };
}

// Async handler wrapper — routes rejections to the Express error middleware.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
