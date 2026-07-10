import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Course, ApiError, downloadCourseFile } from '../../lib/api';
import { Modal, EmptyState, CategoryBadge, ProgressBar, CardGridSkeleton } from '../../components/ui';
import { CATEGORIES, DAYS, targetGradesLabel, courseStatusLabel, courseDisplayTitle, sessionLabel } from '../../lib/format';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/icons';

export default function StudentCatalog() {
  const toast = useToast();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // 접수 여부는 강좌 소속 세션 기준(c.accepting) — 두 세션(학기·특강) 동시 접수 지원.
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [mineIds, setMineIds] = useState<Set<number>>(new Set());
  const [wishIds, setWishIds] = useState<Set<number>>(new Set());
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [day, setDay] = useState('');
  const [detail, setDetail] = useState<Course | null>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  async function load() {
    // 내 학년이 신청할 수 있는 강좌만 조회 (전학년 강좌 포함)
    const gradeParam = user?.grade ? `?grade=${user.grade}` : '';
    const [c, mine, wishes] = await Promise.all([
      api.get<{ courses: Course[] }>(`/courses${gradeParam}`),
      api.get<{ courses: Course[] }>('/enrollments/mine'),
      api.get<{ course_ids: number[] }>('/enrollments/wishes/mine'),
    ]);
    setCourses(c.courses);
    setMineIds(new Set(mine.courses.map((x) => x.id)));
    setWishIds(new Set(wishes.course_ids));
  }

  /* ---------- 빈자리 희망 — 정원 마감 강좌에 희망을 남기고, 여석이 생기면 표시 ---------- */
  async function wish(c: Course) {
    setBusy(c.id);
    try {
      const r = await api.post<{ message: string }>('/enrollments/wishes', { course_id: c.id });
      toast(r.message, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '희망 등록에 실패했습니다.', 'error');
    } finally {
      setBusy(null);
    }
  }
  async function unwish(c: Course) {
    setBusy(c.id);
    try {
      await api.del(`/enrollments/wishes/${c.id}`);
      toast('빈자리 희망을 취소했습니다.', 'success');
      load();
    } finally {
      setBusy(null);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!courses) return [];
    return courses.filter((c) => {
      if (category && c.category !== category) return false;
      if (day && c.day_of_week !== day) return false;
      if (q && !`${c.title}${c.description}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [courses, category, day, q]);

  // 세션 → 교과군 2단 그룹핑. 두 세션(학기·특강)이 동시에 접수 중이면 세션별 섹션으로 나눠 보여준다.
  const sessionGroups = useMemo(() => {
    const bySession = new Map<string, Course[]>();
    for (const c of filtered) {
      if (!bySession.has(c.semester)) bySession.set(c.semester, []);
      bySession.get(c.semester)!.push(c);
    }
    return [...bySession.entries()].map(([code, list]) => {
      const map = new Map<string, Course[]>();
      for (const c of list) {
        const key = c.group_name || '';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(c);
      }
      const groups = [...map.entries()].sort(([a], [b]) => {
        if (!a) return 1; // 미지정은 뒤로
        if (!b) return -1;
        return a.localeCompare(b, 'ko');
      });
      return { code, accepting: list.some((c) => c.accepting), groups };
    });
  }, [filtered]);

  async function enroll(c: Course) {
    setBusy(c.id);
    try {
      const r = await api.post<{ message: string; status: string }>('/enrollments', { course_id: c.id });
      toast(r.message, 'success');
      setDetail(null);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '신청에 실패했습니다.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function cancel(c: Course) {
    setBusy(c.id);
    try {
      await api.del(`/enrollments/${c.id}`);
      toast('수강신청이 취소되었습니다.', 'success');
      setDetail(null);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '취소에 실패했습니다.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function openDetail(c: Course) {
    setDetail(c);
    const r = await api.get<{ announcements: any[] }>(`/courses/${c.id}`);
    setAnnouncements(r.announcements);
  }

  if (!courses) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-bold text-slate-900">강좌 신청</h1>
        <p className="mb-6 text-sm text-slate-500">강좌 목록을 불러오는 중입니다...</p>
        <CardGridSkeleton />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">강좌 신청</h1>
      <p className="mb-6 text-sm text-slate-500">
        원하는 방과후학교 강좌를 선착순으로 신청하세요. 정원이 차면 신청이 마감됩니다.
        {user?.grade ? ` (${user.grade}학년 신청 가능 강좌만 표시)` : ''}
      </p>

      {courses.length > 0 && courses.every((c) => !c.accepting) && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          🔒 수강신청이 마감되었습니다. 신청·취소 등 변경이 불가능합니다. 변경이 필요하면 방과후학교 담당 선생님께 문의하세요.
        </div>
      )}

      {/* 희망 강좌 빈자리 알림 — 최우선 표시 */}
      {courses.some((c) => wishIds.has(c.id) && !c.is_full && c.status === 'open' && c.accepting) && (
        <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          🔔 <b>빈자리 희망을 등록한 강좌에 자리가 생겼습니다!</b> 아래에서 노란 테두리 강좌를 바로 신청하세요. (선착순)
        </div>
      )}

      {/* 신청 완료 후 로그아웃 유도 — 공용 PC에서 다음 학생을 위해 */}
      {mineIds.size > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>
            ✅ 현재 <b>{mineIds.size}과목</b> 신청 완료 — 신청을 모두 마쳤다면 <b>로그아웃</b>해 주세요. (공용 컴퓨터 보안)
          </span>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white transition hover:bg-emerald-700"
          >
            로그아웃
          </button>
        </div>
      )}

      {/* Filters — sticky: 긴 목록을 내려간 상태에서도 검색·필터 변경 가능 */}
      <div className="sticky top-0 z-10 -mx-4 mb-5 flex flex-wrap gap-2 bg-slate-50/90 px-4 py-3 backdrop-blur-sm lg:-mx-8 lg:px-8">
        <input className="input w-full sm:w-56" placeholder="강좌명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-32" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">전체 교과</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="input w-28" value={day} onChange={(e) => setDay(e.target.value)}>
          <option value="">전체 요일</option>
          {DAYS.map((d) => <option key={d} value={d}>{d}요일</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="조건에 맞는 강좌가 없습니다." />
      ) : (
        <div className="space-y-10">
          {sessionGroups.map((sg) => (
            <div key={sg.code}>
              {/* 두 세션 이상 동시 표시 중일 때만 세션 헤더 표시 */}
              {sessionGroups.length > 1 && (
                <div className="mb-4 flex items-center gap-2 border-b-2 border-slate-300 pb-2">
                  <h2 className="text-lg font-bold text-slate-900">{sessionLabel(sg.code)}</h2>
                  <span className={`badge ${sg.accepting ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                    {sg.accepting ? '접수중' : '접수마감'}
                  </span>
                </div>
              )}
              <div className="space-y-8">
          {sg.groups.map(([groupName, groupCourses]) => (
            <section key={groupName || '__none__'}>
              <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-800">
                <span className="inline-block h-4 w-1 rounded-full bg-brand-500" />
                {groupName || '교과군 미지정'}
                <span className="text-xs font-medium text-slate-400">{groupCourses.length}개 강좌</span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {groupCourses.map((c) => {
            const isMine = mineIds.has(c.id);
            const closed = c.status !== 'open';
            const cLocked = !c.accepting; // 강좌 소속 세션의 접수 여부
            const wished = wishIds.has(c.id);
            const seatOpened = wished && !c.is_full && !closed && !cLocked; // 희망 강좌에 빈자리 발생
            return (
              <div key={c.id} className={`card flex flex-col p-5 ${seatOpened ? 'ring-2 ring-amber-400' : ''}`}>
                <div className="mb-2 flex items-center justify-between">
                  <CategoryBadge category={c.category} />
                  <span className="text-xs text-slate-400">{targetGradesLabel(c.target_grades)}</span>
                </div>
                <h3 className="mb-1 font-bold text-slate-900">{courseDisplayTitle(c)}</h3>
                <p className="mb-3 line-clamp-2 flex-1 text-sm text-slate-500">{c.description || '강좌 소개가 없습니다.'}</p>
                <div className="mb-3 space-y-1.5 text-sm text-slate-600">
                  <div className="flex items-center gap-2"><Icons.clock size={15} className="text-slate-400" /> {c.schedule_label}</div>
                  <div className="flex items-center gap-2"><Icons.pin size={15} className="text-slate-400" /> {c.room || '미정'} · {c.teacher_name}</div>
                </div>
                <div className="mb-3">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-slate-500">정원 {c.enrolled_count}/{c.capacity}</span>
                    {seatOpened ? (
                      <span className="font-bold text-amber-600">🔔 빈자리 생김! 지금 신청하세요</span>
                    ) : c.is_full ? (
                      <span className="font-medium text-rose-600">정원 마감</span>
                    ) : (
                      <span className="font-medium text-emerald-600">{c.seats_left}자리 남음</span>
                    )}
                  </div>
                  <ProgressBar value={c.enrolled_count} max={c.capacity} />
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary btn-sm flex-1" onClick={() => openDetail(c)}>상세보기</button>
                  {isMine ? (
                    <button className="btn-danger btn-sm flex-1" onClick={() => cancel(c)} disabled={busy === c.id || cLocked}>
                      {cLocked ? '마감' : '취소'}
                    </button>
                  ) : c.is_full && !closed && !cLocked ? (
                    // 정원 마감 → 빈자리 희망 등록/취소 (자동 배정 없음, 여석 발생 시 이 화면에 표시)
                    wished ? (
                      <button
                        className="btn-sm flex-1 rounded-lg border border-amber-300 bg-amber-50 font-medium text-amber-700 hover:bg-amber-100"
                        onClick={() => unwish(c)}
                        disabled={busy === c.id}
                      >
                        희망 등록됨 · 취소
                      </button>
                    ) : (
                      <button
                        className="btn-sm flex-1 rounded-lg bg-amber-500 font-medium text-white hover:bg-amber-600"
                        onClick={() => wish(c)}
                        disabled={busy === c.id}
                      >
                        빈자리 희망
                      </button>
                    )
                  ) : (
                    <button className="btn-primary btn-sm flex-1" onClick={() => enroll(c)} disabled={busy === c.id || closed || cLocked}>
                      {cLocked ? '마감' : closed ? courseStatusLabel(c.status) : '신청'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
              </div>
            </section>
          ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? courseDisplayTitle(detail) : ''}>
        {detail && (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <CategoryBadge category={detail.category} />
              <span className="text-sm text-slate-500">{targetGradesLabel(detail.target_grades)} 대상</span>
            </div>
            <p className="mb-4 whitespace-pre-wrap text-sm text-slate-600">{detail.description || '강좌 소개가 없습니다.'}</p>
            <dl className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
              <Row label="담당 강사" value={detail.teacher_name} />
              <Row label="교시" value={detail.schedule_label || ''} />
              <Row label="강의실" value={detail.room || '미정'} />
              <Row label="부교재" value={detail.textbook || '자체제작'} />
              <Row label="정원" value={`${detail.enrolled_count} / ${detail.capacity}명`} />
              <Row label="잔여 좌석" value={detail.is_full ? '정원 마감' : `${detail.seats_left}자리`} />
            </dl>

            {detail.syllabus_filename && (
              <button
                className="btn-secondary btn-sm mb-4"
                onClick={() => downloadCourseFile(detail.id, detail.syllabus_filename!)}
              >
                <Icons.download size={14} /> 강의계획서 다운로드
              </button>
            )}

            {announcements.length > 0 && (
              <div className="mb-4">
                <h4 className="mb-2 text-sm font-bold text-slate-700">강좌 공지</h4>
                <div className="space-y-2">
                  {announcements.map((a) => (
                    <div key={a.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="text-sm font-semibold text-slate-800">{a.title}</div>
                      <div className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              {mineIds.has(detail.id) ? (
                <button className="btn-danger" onClick={() => cancel(detail)} disabled={busy === detail.id || !detail.accepting}>
                  {!detail.accepting ? '마감 (변경 불가)' : '수강 취소'}
                </button>
              ) : (
                <button className="btn-primary" onClick={() => enroll(detail)} disabled={busy === detail.id || detail.status !== 'open' || detail.is_full || !detail.accepting}>
                  {!detail.accepting ? '마감 (변경 불가)' : detail.is_full ? '정원 마감' : '수강 신청'}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-700">{value}</dd>
    </div>
  );
}
