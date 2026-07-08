import { useEffect, useMemo, useState } from 'react';
import { api, Course, ApiError } from '../../lib/api';
import { Modal, Spinner, EmptyState, CategoryBadge, ProgressBar } from '../../components/ui';
import { CATEGORIES, DAYS, targetGradeLabel, formatFee, courseStatusLabel } from '../../lib/format';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/icons';

export default function StudentCatalog() {
  const toast = useToast();
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [mineIds, setMineIds] = useState<Set<number>>(new Set());
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [day, setDay] = useState('');
  const [detail, setDetail] = useState<Course | null>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  async function load() {
    const [c, mine] = await Promise.all([
      api.get<{ courses: Course[] }>('/courses'),
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

  async function enroll(c: Course) {
    setBusy(c.id);
    try {
      const r = await api.post<{ message: string; status: string }>('/enrollments', { course_id: c.id });
      toast(r.message, r.status === 'waitlisted' ? 'info' : 'success');
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
        원하는 방과후 강좌를 선착순으로 신청하세요. 정원 초과 시 대기자로 등록됩니다.
      </p>

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const isMine = mineIds.has(c.id);
            const closed = c.status !== 'open';
            return (
              <div key={c.id} className="card flex flex-col p-5">
                <div className="mb-2 flex items-center justify-between">
                  <CategoryBadge category={c.category} />
                  <span className="text-xs text-slate-400">{targetGradeLabel(c.target_grade)}</span>
                </div>
                <h3 className="mb-1 font-bold text-slate-900">{c.title}</h3>
                <p className="mb-3 line-clamp-2 flex-1 text-sm text-slate-500">{c.description || '강좌 소개가 없습니다.'}</p>
                <div className="mb-3 space-y-1.5 text-sm text-slate-600">
                  <div className="flex items-center gap-2"><Icons.clock size={15} className="text-slate-400" /> {c.day_of_week} {c.start_time}~{c.end_time}</div>
                  <div className="flex items-center gap-2"><Icons.pin size={15} className="text-slate-400" /> {c.room || '미정'} · {c.teacher_name}</div>
                  <div className="flex items-center gap-2"><Icons.wallet size={15} className="text-slate-400" /> {formatFee(c.fee)}</div>
                </div>
                <div className="mb-3">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-slate-500">정원 {c.enrolled_count}/{c.capacity}</span>
                    {c.is_full ? (
                      <span className="font-medium text-rose-600">마감 (대기 {c.waitlisted_count})</span>
                    ) : (
                      <span className="font-medium text-emerald-600">{c.seats_left}자리 남음</span>
                    )}
                  </div>
                  <ProgressBar value={c.enrolled_count} max={c.capacity} />
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary btn-sm flex-1" onClick={() => openDetail(c)}>상세보기</button>
                  {isMine ? (
                    <button className="btn-danger btn-sm flex-1" onClick={() => cancel(c)} disabled={busy === c.id}>취소</button>
                  ) : (
                    <button className="btn-primary btn-sm flex-1" onClick={() => enroll(c)} disabled={busy === c.id || closed}>
                      {closed ? courseStatusLabel(c.status) : c.is_full ? '대기신청' : '신청'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title || ''}>
        {detail && (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <CategoryBadge category={detail.category} />
              <span className="text-sm text-slate-500">{targetGradeLabel(detail.target_grade)} 대상</span>
            </div>
            <p className="mb-4 whitespace-pre-wrap text-sm text-slate-600">{detail.description || '강좌 소개가 없습니다.'}</p>
            <dl className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
              <Row label="담당 강사" value={detail.teacher_name} />
              <Row label="시간" value={`${detail.day_of_week} ${detail.start_time}~${detail.end_time}`} />
              <Row label="강의실" value={detail.room || '미정'} />
              <Row label="수강료" value={formatFee(detail.fee)} />
              <Row label="정원" value={`${detail.enrolled_count} / ${detail.capacity}명`} />
              <Row label="대기 인원" value={`${detail.waitlisted_count}명`} />
            </dl>

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
                <button className="btn-danger" onClick={() => cancel(detail)} disabled={busy === detail.id}>수강 취소</button>
              ) : (
                <button className="btn-primary" onClick={() => enroll(detail)} disabled={busy === detail.id || detail.status !== 'open'}>
                  {detail.is_full ? '대기자 신청' : '수강 신청'}
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
