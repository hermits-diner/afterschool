# 🎓 방과후학교 온라인 수강신청 시스템

고등학교 방과후학교(After-School) 강좌를 온라인으로 개설·신청·관리하는 웹 애플리케이션입니다.
**관리자 · 강사 · 학생** 세 가지 역할별 포털을 제공하며, 선착순 수강신청 · 실시간 정원/대기자 관리 ·
시간표 충돌 검사 · 출석 관리까지 실제 서비스 수준으로 구현되어 있습니다.

## ✨ 주요 기능

### 🛠️ 관리자 (Admin)
- **대시보드** – 수강생/강사/강좌/신청 통계, 교과별 수강 인원, 인기 강좌 순위
- **강좌 관리** – 강좌 개설/수정/마감/폐강/삭제, 담당 강사 배정, 정원·시간·수강료 설정
- **회원 관리** – 학생/강사/관리자 계정 등록·수정·활성화·삭제
- **수강신청 현황** – 전체 신청 내역 조회·검색·취소, **엑셀(CSV) 다운로드**
- **운영 설정** – 수강신청 기간(시작/종료), 접수 on/off, 1인당 최대 신청 강좌 수, 학기

### 👩‍🏫 강사 (Teacher)
- **대시보드** – 담당 강좌·수강생 요약
- **내 강좌** – 담당 강좌 상세, **강좌별 공지 등록/삭제**
- **수강생 명단** – 강좌별 명단·연락처, 대기자 목록, **명렬표 인쇄**
- **출석 관리** – 날짜별 출석 체크(출석/지각/결석/공결), 일괄 처리, **출결 통계·출석률**
- **📄 인쇄** – 수강생 **명렬표**(세로) 및 **출석부**(가로, 주차별 출석 그리드) 인쇄 지원

### 🎒 학생 (Student)
- **대시보드** – 나의 수강 현황, 수강료 합계
- **강좌 신청** – 교과/요일/검색 필터, 강좌 상세·공지 확인, **선착순 신청 / 대기 신청**
- **내 수강신청** – 신청 강좌 목록·취소
- **내 시간표** – 주간 시간표 그리드

### 🔒 핵심 도메인 로직
- **선착순 배정** – 정원 초과 시 자동으로 대기자(waitlist) 등록
- **대기자 자동 승격** – 수강 취소 시 대기 순번대로 자동 확정
- **시간표 충돌 검사** – 같은 요일·시간대 중복 신청 차단
- **대상 학년 제한** – 강좌별 대상 학년 이외 신청 차단
- **신청 기간/최대 신청 수 제한** – 관리자 설정에 따라 접수 통제
- **역할 기반 접근 제어(RBAC)** – JWT 인증 + 역할별 라우트 보호

## 🧱 기술 스택

| 구분 | 사용 기술 |
|------|-----------|
| 프론트엔드 | React 18, TypeScript, Vite, React Router, Tailwind CSS, Lucide 아이콘 |
| 백엔드 | Node.js, Express, better-sqlite3 (SQLite) |
| 인증 | JWT (jsonwebtoken), bcryptjs 비밀번호 해시 |
| 검증 | Zod |

## 🚀 실행 방법

### 1. 의존성 설치
```bash
npm run install:all
```

### 2. 개발 모드 실행 (백엔드 + 프론트엔드 동시)
```bash
npm run dev
```
- 프론트엔드: http://localhost:5173
- 백엔드 API: http://localhost:4000
- 최초 실행 시 데모 데이터(계정·강좌·수강신청)가 자동 생성됩니다.

### 3. 프로덕션 빌드 & 실행
```bash
npm run build   # 프론트엔드 빌드 (client/dist)
npm start       # 백엔드가 빌드된 프론트엔드까지 제공 → http://localhost:4000
```

## 👤 데모 계정

| 역할 | 아이디 | 비밀번호 |
|------|--------|----------|
| 관리자 | `admin` | `admin123` |
| 강사 | `teacher1` ~ `teacher5` | `teacher123` |
| 학생 | `student`, `student02` ~ `student30` | `student123` |

> 로그인 화면의 **"데모 계정 자동 입력"** 버튼으로 선택한 역할의 계정을 바로 채울 수 있습니다.

## 📁 프로젝트 구조

```
afterschool/
├── package.json          # 루트 스크립트 (dev/build/start)
├── server/               # Express + SQLite 백엔드
│   └── src/
│       ├── index.js      # 서버 진입점 (API + 정적 파일 제공)
│       ├── db.js         # DB 스키마 & 설정
│       ├── auth.js       # JWT/비밀번호/RBAC 미들웨어
│       ├── logic.js      # 정원·대기·시간표 충돌 등 도메인 로직
│       ├── seed.js       # 데모 데이터 생성
│       └── routes/       # auth, courses, enrollments, admin, teacher
└── client/               # React + Vite 프론트엔드
    └── src/
        ├── pages/        # admin/ teacher/ student/ 및 Login
        ├── components/   # Layout, Timetable, UI 컴포넌트
        ├── context/      # Auth, Toast
        └── lib/          # API 클라이언트, 포맷 유틸
```

## 🔧 API 개요

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/auth/login` | 로그인 (역할 검증) |
| GET | `/api/courses` | 강좌 목록(필터: 교과/요일/학년/검색) |
| POST | `/api/enrollments` | 수강신청 (선착순/대기/충돌 검사) |
| DELETE | `/api/enrollments/:courseId` | 수강 취소 (대기자 자동 승격) |
| GET | `/api/admin/stats` | 관리자 통계 |
| GET/POST/PUT | `/api/admin/users` | 회원 관리 |
| GET/POST | `/api/teacher/courses/:id/attendance` | 출석 조회/저장 |

---

© 2026 방과후학교 수강신청 시스템 — 데모 프로젝트
