import { useEffect, useState } from 'react';
import { api, Course, ApiError } from '../../lib/api';
import { Modal, Spinner, EmptyState, CategoryBadge, ProgressBar } from '../../components/ui';
import { Icons } from '../../components/icons';
import { targetGradeLabel, formatFee } from '../../lib/format';
import { useToast } from '../../context/ToastContext';

export default function TeacherCourses() {
  const toast = useToast();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [annCourse, setAnnCourse] = useState<Course | null>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    api.get<{ courses: Course[] }>('/teacher/courses').then((r) => setCourses(r.courses));
  }, []);

  async function openAnn(c: Course) {
    setAnnCourse(c);
    const r = await api.get<{ announcements: any[] }>(`/courses/${c.id}`);
    setAnnouncements(r.announcements);
  }

  async function postAnn(e: React.FormEvent) {
    e.preventDefault();
    if (!annCourse) return;
    try {
      await api.post(`/teacher/courses/${annCourse.id}/announcements`, { title, content });
      toast('공지가 등록되었습니다.', 'success');
      setTitle('');
      setContent('');
      openAnn(annCourse);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '등록 실패', 'error');
    }
  }

  async function delAnn(id: number) {
    await api.del(`/teacher/announcements/${id}`);
    if (annCourse) openAnn(annCourse);
  }

  if (!courses) return <Spinner />;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">내 강좌</h1>
      <p className="mb-6 text-sm text-slate-500">담당하고 있는 방과후 강좌 목록입니다.</p>

      {courses.length === 0 ? (
        <EmptyState message="배정된 강좌가 없습니다." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {courses.map((c) => (
            <div key={c.id} className="card p-5">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CategoryBadge category={c.category} />
                  <h3 className="font-bold text-slate-900">{c.title}</h3>
                </div>
              </div>
              <p className="mb-3 text-sm text-slate-500 line-clamp-2">{c.description || '강좌 소개가 없습니다.'}</p>
              <dl className="mb-3 grid grid-cols-2 gap-y-1 text-sm">
                <Info label="시간" value={`${c.day_of_week} ${c.start_time}~${c.end_time}`} />
                <Info label="강의실" value={c.room || '-'} />
                <Info label="대상" value={targetGradeLabel(c.target_grade)} />
                <Info label="수강료" value={formatFee(c.fee)} />
              </dl>
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>수강 인원</span>
                <span className="font-semibold text-slate-700">{c.enrolled_count}/{c.capacity}명 {c.waitlisted_count > 0 && `(대기 ${c.waitlisted_count})`}</span>
              </div>
              <ProgressBar value={c.enrolled_count} max={c.capacity} />
              <div className="mt-4 flex justify-end">
                <button className="btn-secondary btn-sm" onClick={() => openAnn(c)}>
                  <Icons.megaphone size={14} /> 공지 관리
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!annCourse} onClose={() => setAnnCourse(null)} title={`공지 관리 · ${annCourse?.title || ''}`}>
        <form onSubmit={postAnn} className="mb-5 space-y-3 rounded-lg bg-slate-50 p-4">
          <input className="input" placeholder="공지 제목" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <textarea className="input min-h-[70px]" placeholder="공지 내용" value={content} onChange={(e) => setContent(e.target.value)} required />
          <div className="flex justify-end">
            <button className="btn-primary btn-sm">공지 등록</button>
          </div>
        </form>
        <div className="space-y-3">
          {announcements.length === 0 && <p className="text-center text-sm text-slate-400">등록된 공지가 없습니다.</p>}
          {announcements.map((a) => (
            <div key={a.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between">
                <h4 className="font-semibold text-slate-800">{a.title}</h4>
                <button className="text-xs text-rose-500 hover:underline" onClick={() => delAnn(a.id)}>삭제</button>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.content}</p>
              <p className="mt-2 text-xs text-slate-400">{a.created_at}</p>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-700">{value}</dd>
    </div>
  );
}
