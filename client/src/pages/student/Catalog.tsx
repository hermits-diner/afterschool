import { useEffect, useMemo, useState } from 'react';
import { api, Course, ApiError, downloadCourseFile } from '../../lib/api';
import { Modal, Spinner, EmptyState, CategoryBadge, ProgressBar } from '../../components/ui';
import { CATEGORIES, DAYS, targetGradesLabel, formatFee, courseStatusLabel } from '../../lib/format';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useRegistrationOpen } from '../../lib/useSemester';
import { Icons } from '../../components/icons';

export default function StudentCatalog() {
  const toast = useToast();
  const { user } = useAuth();
  const regOpen = useRegistrationOpen();
  const locked = regOpen === false; // 접수 마감 — 신청·취소 잠금
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [mineIds, setMineIds] = useState<Set<number>>(new Set());
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [day, setDay] = useState('');
  const [detail, setDetail] = useState<Course | null>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  async function load() {
    // 내 학년이 신청할 수 있는 강좌만 조회 (전학년 강좌 포함)
    const gradeParam = user?.grade ? `?grade=${user.grade}` : '';
    const [c, mine] = await Promise.all([
      api.get<{ courses: Course[] }>(`/courses${gradeParam}`),
      api.get<{ courses: Course[] }>('/enrollments/mine'),
    ]);
    setCourses(c.courses);
    setMineIds(new Set(mine.courses.map((x) => x.id)));
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

  // 교과군별 그룹핑 — 교과군 이름순 정렬, 교과군 미지정 강좌는 마지막에
  const grouped = useMemo(() => {
    const map = new Map<string, Course[]>();
    for (const c of filtered) {
      const key = c.group_name || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (!a) return 1; // 미지정은 뒤로
      if (!b) return -1;
      return a.localeCompare(b, 'ko');
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

  if (!courses) return <Spinner />;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">강좌 신청</h1>
      <p className="mb-6 text-sm text-slate-500">
        원하는 방과후학교 강좌를 선착순으로 신청하세요. 정원이 차면 신청이 마감됩니다.
        {user?.grade ? ` (${user.grade}학년 신청 가능 강좌만 표시)` : ''}
      </p>

      {locked && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          🔒 수강신청이 마감되었습니다. 신청·취소 등 변경이 불가능합니다. 변경이 필요하면 방과후학교 담당 선생님께 문의하세요.
        </div>
      )}

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-2">
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
        <div className="space-y-8">
          {grouped.map(([groupName, groupCourses]) => (
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
            return (
              <div key={c.id} className="card flex flex-col p-5">
                <div className="mb-2 flex items-center justify-between">
                  <CategoryBadge category={c.category} />
                  <span className="text-xs text-slate-400">{targetGradesLabel(c.target_grades)}</span>
                </div>
                <h3 className="mb-1 font-bold text-slate-900">{c.title}</h3>
                <p className="mb-3 line-clamp-2 flex-1 text-sm text-slate-500">{c.description || '강좌 소개가 없습니다.'}</p>
                <div className="mb-3 space-y-1.5 text-sm text-slate-600">
                  <div className="flex items-center gap-2"><Icons.clock size={15} className="text-slate-400" /> {c.schedule_label}</div>
                  <div className="flex items-center gap-2"><Icons.pin size={15} className="text-slate-400" /> {c.room || '미정'} · {c.teacher_name}</div>
                  <div className="flex items-center gap-2"><Icons.wallet size={15} className="text-slate-400" /> {formatFee(c.fee)}</div>
                </div>
                <div className="mb-3">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-slate-500">정원 {c.enrolled_count}/{c.capacity}</span>
                    {c.is_full ? (
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
                    <button className="btn-danger btn-sm flex-1" onClick={() => cancel(c)} disabled={busy === c.id || locked}>
                      {locked ? '마감' : '취소'}
                    </button>
                  ) : (
                    <button className="btn-primary btn-sm flex-1" onClick={() => enroll(c)} disabled={busy === c.id || closed || c.is_full || locked}>
                      {locked ? '마감' : closed ? courseStatusLabel(c.status) : c.is_full ? '정원 마감' : '신청'}
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
      )}

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title || ''}>
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
              <Row label="수강료" value={formatFee(detail.fee)} />
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
                <button className="btn-danger" onClick={() => cancel(detail)} disabled={busy === detail.id || locked}>
                  {locked ? '마감 (변경 불가)' : '수강 취소'}
                </button>
              ) : (
                <button className="btn-primary" onClick={() => enroll(detail)} disabled={busy === detail.id || detail.status !== 'open' || detail.is_full || locked}>
                  {locked ? '마감 (변경 불가)' : detail.is_full ? '정원 마감' : '수강 신청'}
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
