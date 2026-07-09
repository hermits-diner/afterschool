import { get, run, batch, initSchema, getSetting } from './db.js';
import { hashPassword } from './auth.js';

const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍'];
const GIVEN = ['민준', '서연', '도윤', '지우', '예준', '서윤', '주원', '하윤', '지호', '지유', '준우', '수아', '건우', '지아', '현우', '하은', '우진', '유나', '민재', '채원', '지훈', '다은', '선우', '수빈', '연우'];

function pick(arr, i) {
  return arr[i % arr.length];
}

async function insertUser(u) {
  const info = await run(
    `INSERT INTO users (username, password_hash, role, name, email, phone, grade, class_no, student_no, subject_area)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [u.username, u.hash, u.role, u.name, u.email ?? null, u.phone ?? null, u.grade ?? null, u.class_no ?? null, u.student_no ?? null, u.subject_area ?? null]
  );
  return info.lastInsertRowid;
}

export async function ensureSeed() {
  await initSchema();
  const existing = (await get('SELECT COUNT(*) c FROM users')).c;
  if (existing > 0) return; // already seeded

  // 시드 모드: SEED_DEMO=true → 데모 데이터, SEED_DEMO=false → 관리자만.
  // 미설정 시 로컬 개발은 데모, 서버리스(운영)는 관리자만 생성.
  const demo = process.env.SEED_DEMO ? process.env.SEED_DEMO === 'true' : !process.env.VERCEL;
  if (!demo) {
    console.log('  🔐  초기 관리자 계정 생성 (admin / admin123 — 첫 로그인 시 비밀번호 변경 필요)');
    await run(
      `INSERT INTO users (username, password_hash, role, name, must_change_password, is_super)
       VALUES ('admin', ?, 'admin', '방과후 담당자', 1, 1)`,
      [hashPassword('admin123')]
    );
    return;
  }

  console.log('  🌱  데모 데이터를 생성합니다...');
  const semester = await getSetting('semester');

  // Admin (시스템 관리자)
  await insertUser({
    username: 'admin', hash: hashPassword('admin123'), role: 'admin', name: '방과후 담당자',
    email: 'admin@school.hs.kr', phone: '02-000-0000',
  });
  await run("UPDATE users SET is_super = 1 WHERE username = 'admin'");

  // Teachers
  const teacherDefs = [
    { username: 'teacher1', name: '김국어', subject_area: '국어' },
    { username: 'teacher2', name: '이영어', subject_area: '영어' },
    { username: 'teacher3', name: '박수학', subject_area: '수학' },
    { username: 'teacher4', name: '최과학', subject_area: '과학' },
    { username: 'teacher5', name: '한사회', subject_area: '사회' },
    { username: 'teacher6', name: '정체육', subject_area: '체육' },
  ];
  const teacherIds = {};
  for (const t of teacherDefs) {
    teacherIds[t.username] = await insertUser({
      username: t.username, hash: hashPassword('teacher123'), role: 'teacher', name: t.name,
      email: `${t.username}@school.hs.kr`, phone: '010-0000-0000', subject_area: t.subject_area,
    });
  }

  // Students: 30 students across grades 1-3
  const studentIds = [];
  for (let i = 0; i < 30; i++) {
    const num = String(i + 1).padStart(2, '0');
    studentIds.push(
      await insertUser({
        username: `student${num}`, hash: hashPassword('student123'), role: 'student',
        name: pick(SURNAMES, i) + pick(GIVEN, i), phone: `010-1234-${num.padStart(4, '0')}`,
        grade: (i % 3) + 1, class_no: (i % 4) + 1, student_no: (i % 25) + 1,
      })
    );
  }
  // Give the first student a friendly demo id
  await run("UPDATE users SET username='student', name='홍길동' WHERE id=?", [studentIds[0]]);

  // Courses
  const courseDefs = [
    { title: '수능 국어 독서 완성', category: '국어', teacher: 'teacher1', capacity: 20, day_of_week: '월', start_time: '16:30', end_time: '18:20', room: '201호', target_grade: 3, fee: 0, description: '비문학 지문 분석과 독해력 향상을 위한 심화 과정입니다.' },
    { title: '문학 감상과 서술형 대비', category: '국어', teacher: 'teacher1', capacity: 15, day_of_week: '수', start_time: '16:30', end_time: '18:20', room: '201호', target_grade: 0, target_grades: '2,3', fee: 0, description: '현대·고전 문학 작품을 감상하고 서술형 평가를 대비합니다.' },
    { title: '실전 영어 독해 (수능 대비)', category: '영어', teacher: 'teacher2', capacity: 20, day_of_week: '화', start_time: '16:30', end_time: '18:20', room: '202호', target_grade: 3, fee: 0, description: '고난도 영어 지문 독해 전략과 어법을 다룹니다.' },
    { title: '영어 회화 & 발표', category: '영어', teacher: 'teacher2', capacity: 12, day_of_week: '목', start_time: '16:30', end_time: '17:20', room: '어학실', target_grade: 0, fee: 0, description: '원어민 스타일 회화 연습과 영어 발표 훈련.' },
    { title: '미적분 심화 문제풀이', category: '수학', teacher: 'teacher3', capacity: 20, day_of_week: '월', start_time: '16:30', end_time: '18:20', room: '203호', target_grade: 2, fee: 0, description: '미적분 핵심 개념과 킬러 문항 풀이 전략.' },
    { title: '수학 기초 개념 다지기', category: '수학', teacher: 'teacher3', capacity: 25, day_of_week: '금', start_time: '16:30', end_time: '18:20', room: '203호', target_grade: 1, fee: 0, description: '고1 수학 기초 개념을 탄탄하게 다지는 강좌.' },
    { title: '물리 실험 탐구', category: '과학', teacher: 'teacher4', capacity: 16, day_of_week: '화', start_time: '16:30', end_time: '18:20', room: '물리실', target_grade: 0, fee: 5000, description: '직접 실험하며 배우는 물리 개념. 재료비 포함.' },
    { title: '화학 II 심화', category: '과학', teacher: 'teacher4', capacity: 18, day_of_week: '목', start_time: '16:30', end_time: '18:20', room: '화학실', target_grade: 3, fee: 3000, description: '화학 반응과 평형을 심화 학습합니다.' },
    { title: '한국사 능력시험 대비', category: '사회', teacher: 'teacher5', capacity: 20, day_of_week: '월', start_time: '16:30', end_time: '18:20', room: '204호', target_grade: 0, fee: 0, description: '한국사능력검정시험 심화 대비반. 기출 중심으로 정리합니다.' },
    { title: '생활과 윤리 논술', category: '사회', teacher: 'teacher5', capacity: 15, day_of_week: '수', start_time: '16:30', end_time: '18:20', room: '204호', target_grade: 2, fee: 0, description: '윤리 쟁점을 논술형으로 훈련합니다.' },
    { title: '농구 교실', category: '기타', teacher: 'teacher6', capacity: 20, day_of_week: '수', start_time: '16:30', end_time: '18:20', room: '체육관', target_grade: 0, fee: 0, description: '기초 드리블부터 팀 경기까지. 운동복 지참.' },
    { title: '방송 댄스', category: '기타', teacher: 'teacher6', capacity: 15, day_of_week: '금', start_time: '16:30', end_time: '18:20', room: '무용실', target_grade: 0, fee: 0, description: '최신 안무를 배우고 함께 무대를 준비합니다.' },
  ];

  const courseIds = [];
  for (const c of courseDefs) {
    // 시간 → 교시 슬롯 (16:30 시작 = 8교시, 17:20 종료 = 8교시 / 18:20 종료 = 9교시)
    const slot = { day: c.day_of_week, from: 8, to: c.end_time === '17:20' ? 8 : 9 };
    const info = await run(
      `INSERT INTO courses (title, category, description, teacher_id, capacity, day_of_week, start_time, end_time, room, target_grade, target_grades, fee, planned_sessions, schedule, semester, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 16, ?, ?, 'open')`,
      [c.title, c.category, c.description, teacherIds[c.teacher], c.capacity, c.day_of_week, c.start_time, c.end_time, c.room, c.target_grade, c.target_grades ?? (c.target_grade ? String(c.target_grade) : ''), c.fee, JSON.stringify([slot]), semester]
    );
    courseIds.push(info.lastInsertRowid);
  }

  // 데모 교과군 — 관리자가 정의하고 강사는 개설 시 선택
  await batch([
    { sql: 'INSERT OR IGNORE INTO course_groups (name, schedule) VALUES (?, ?)', args: ['A유형', JSON.stringify([{ day: '월', from: 8, to: 9 }, { day: '수', from: 8, to: 9 }])] },
    { sql: 'INSERT OR IGNORE INTO course_groups (name, schedule) VALUES (?, ?)', args: ['B유형', JSON.stringify([{ day: '화', from: 8, to: 9 }, { day: '목', from: 8, to: 9 }])] },
    { sql: 'INSERT OR IGNORE INTO course_groups (name, schedule) VALUES (?, ?)', args: ['C유형', JSON.stringify([{ day: '금', from: 8, to: 9 }])] },
  ]);

  // Some enrollments in 전학년 courses (single transaction)
  const generalCourses = courseIds.filter((_, idx) => [3, 6, 8, 10].includes(idx));
  const enrollStmts = [];
  for (let i = 0; i < studentIds.length; i++) {
    enrollStmts.push({
      sql: "INSERT OR IGNORE INTO enrollments (student_id, course_id, status) VALUES (?, ?, 'enrolled')",
      args: [studentIds[i], pick(generalCourses, i)],
    });
    if (i % 2 === 0) {
      enrollStmts.push({
        sql: "INSERT OR IGNORE INTO enrollments (student_id, course_id, status) VALUES (?, ?, 'enrolled')",
        args: [studentIds[i], pick(generalCourses, i + 1)],
      });
    }
  }
  await batch(enrollStmts);

  // A few announcements
  await batch([
    {
      sql: 'INSERT INTO announcements (course_id, author_id, title, content) VALUES (?, ?, ?, ?)',
      args: [courseIds[0], teacherIds['teacher1'], '첫 수업 안내', '첫 수업은 오리엔테이션으로 진행됩니다. 필기도구를 지참해 주세요.'],
    },
    {
      sql: 'INSERT INTO announcements (course_id, author_id, title, content) VALUES (?, ?, ?, ?)',
      args: [courseIds[10], teacherIds['teacher6'], '준비물 안내', '실내용 운동화와 운동복을 반드시 준비해 주세요.'],
    },
  ]);

  console.log('  ✅  데모 데이터 생성 완료 (관리자 admin/admin123)');
}

// Allow running directly: `npm run seed`
if (import.meta.url === `file://${process.argv[1]}`) {
  await ensureSeed();
  console.log('완료');
}
