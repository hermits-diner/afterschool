// 동시접속 부하 테스트 — 로컬 dev 서버(http://localhost:4000) 대상, 학생 200명 규모
// 흐름: 임시 학생 200명 생성 → ① 200명 동시 로그인 ② 200명 동시 강좌 조회
//       ③ 정원 15명 강좌에 200명 동시 신청(선착순 레이스) → 테스트 계정·강좌 전부 정리
// 임시 학생은 1~3학년 8·9반(실데이터 미사용 반)으로 만들어 기존 데이터와 충돌하지 않는다.
const BASE = 'http://localhost:4000/api';
const N = 200;
const TEST_NAME = '부하테스트';
const TEST_PW = 'test1234';

const post = (path, body, token) =>
  fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
const getJ = async (path, token) =>
  (await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}` } })).json();

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const stats = (arr) =>
  `p50=${pct(arr, 50)}ms p95=${pct(arr, 95)}ms max=${Math.max(...arr)}ms avg=${Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)}ms`;
const timed = async (fn) => {
  const t0 = Date.now();
  const r = await fn();
  return { ms: Date.now() - t0, r };
};

// ---------- 준비: 관리자 로그인 ----------
const admin = (await (await post('/auth/login', { username: 'admin', password: 'admin123', role: 'admin' })).json()).token;
if (!admin) { console.error('관리자 로그인 실패 — 서버가 켜져 있는지 확인하세요.'); process.exit(1); }

// ---------- 준비: 임시 학생 200명 생성 (학년 1~3 × 8·9반) ----------
console.log(`임시 학생 ${N}명 생성 중... (비밀번호 해시 때문에 10~20초 걸립니다)`);
const students = Array.from({ length: N }, (_, i) => {
  const grade = (i % 3) + 1;
  const idx = Math.floor(i / 3);
  return {
    grade,
    class_no: 8 + Math.floor(idx / 34),
    student_no: (idx % 34) + 1,
    name: `${TEST_NAME}${i + 1}`,
    password: TEST_PW,
  };
});
const bulk = await (await post('/admin/users/bulk', { students }, admin)).json();
const usernames = [
  ...(bulk.created || []).map((c) => c.username),
  ...(bulk.skipped || []).map((c) => c.username), // 재실행 시 기존 계정 재사용
];
console.log(`생성 ${bulk.created?.length ?? 0}명 · 기존 재사용 ${bulk.skipped?.length ?? 0}명 → 총 ${usernames.length}명\n`);
if (usernames.length < N) { console.error('계정 준비 실패:', bulk.error || bulk); process.exit(1); }

// ---------- 준비: 테스트 강좌 (정원 15, 월 1~2교시 — 시드 강좌와 충돌 없음) ----------
const courseJson = await (await post(
  '/courses',
  { title: '동시성테스트', category: '기타', capacity: 15, schedule: [{ day: '월', from: 1, to: 2 }], description: 't', fee: 0 },
  admin
)).json();
const courseId = courseJson.course?.id;
if (!courseId) { console.error('강좌 생성 실패:', courseJson); process.exit(1); }
console.log(`테스트 강좌 생성: id=${courseId} 정원=15\n`);

let tokens = [];
try {
  // ---------- ① 200명 동시 로그인 ----------
  {
    const results = await Promise.all(
      usernames.map((u) =>
        timed(async () => {
          const r = await post('/auth/login', { username: u, password: TEST_PW, role: 'student' });
          return { ok: r.ok, token: (await r.json()).token };
        })
      )
    );
    const lat = results.map((x) => x.ms);
    const okCount = results.filter((x) => x.r.ok).length;
    console.log(`① 동시 로그인 ${N}건: 성공 ${okCount}/${N} · ${stats(lat)}`);
    tokens = results.filter((x) => x.r.token).map((x) => x.r.token);
  }

  // ---------- ② 200명 동시 강좌 목록 조회 ----------
  {
    const results = await Promise.all(
      tokens.map((t) => timed(async () => (await fetch(`${BASE}/courses`, { headers: { Authorization: `Bearer ${t}` } })).ok))
    );
    const lat = results.map((x) => x.ms);
    const okCount = results.filter((x) => x.r).length;
    console.log(`② 강좌 목록 ${tokens.length}건 동시 조회: 성공 ${okCount}/${tokens.length} · ${stats(lat)}`);
  }

  // ---------- ③ 정원 15명 강좌에 200명 동시 신청 (선착순 레이스) ----------
  {
    const results = await Promise.all(
      tokens.map((t) =>
        timed(async () => {
          const r = await post('/enrollments', { course_id: courseId }, t);
          const j = await r.json();
          return { status: r.status, msg: j.message || j.error };
        })
      )
    );
    const lat = results.map((x) => x.ms);
    const success = results.filter((x) => x.r.status === 201).length;
    const full = results.filter((x) => String(x.r.msg).includes('정원')).length;
    const other = results.filter((x) => x.r.status !== 201 && !String(x.r.msg).includes('정원'));
    console.log(`③ ${tokens.length}명 동시 신청(정원 15): 성공 ${success} · 정원초과 거부 ${full} · 기타 ${other.length} · ${stats(lat)}`);
    if (other.length) console.log('   기타 사유:', [...new Set(other.map((x) => x.r.msg))].join(' / '));

    const roster = await getJ(`/admin/courses/${courseId}/roster`, admin);
    const enrolled = (roster.roster || []).filter((r) => r.status === 'enrolled').length;
    console.log(`   DB 확정 인원: ${enrolled}명 → ${enrolled === 15 ? '✅ 정확히 정원만 확정 (오버부킹 없음)' : enrolled < 15 ? '✅ 정원 이하' : '❌ 오버부킹 발생!'}`);
  }
} finally {
  // ---------- 정리: 강좌 삭제 + 휴지통 비우기 + 임시 학생 전원 삭제 ----------
  await fetch(`${BASE}/courses/${courseId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${admin}` } });
  const trash = await getJ('/admin/courses/trash', admin);
  for (const t of trash.trash || []) {
    if (t.title === '동시성테스트') {
      await fetch(`${BASE}/admin/courses/trash/${t.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${admin}` } });
    }
  }
  const allStudents = await getJ('/admin/users?role=student', admin);
  const testIds = (allStudents.users || []).filter((u) => u.name.startsWith(TEST_NAME)).map((u) => u.id);
  if (testIds.length) await post('/admin/users/bulk-delete', { ids: testIds }, admin);
  console.log(`\n정리 완료: 테스트 강좌 삭제 · 임시 학생 ${testIds.length}명 삭제`);
}
