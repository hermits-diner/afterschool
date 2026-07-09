import { useEffect, useState } from 'react';
import { api, Course, CourseGroup, ApiError, fileToBase64, downloadCourseFile } from '../../lib/api';
import { Modal, Spinner, EmptyState, CategoryBadge, StatusBadge, ProgressBar } from '../../components/ui';
import { Icons } from '../../components/icons';
import PeriodPicker from '../../components/PeriodPicker';
import { CATEGORIES, targetGradesLabel, Slot, scheduleLabel } from '../../lib/format';
import GradePicker from '../../components/GradePicker';
import { useToast } from '../../context/ToastContext';

type Form = {
  title: string;
  category: string;
  description: string;
  capacity: number;
  group_id: number | null;
  schedule: Slot[];
  room: string;
  target_grades: number[];
};

const emptyForm: Form = {
  title: '',
  category: '국어',
  description: '',
  capacity: 20,
  group_id: null,
  schedule: [],
  room: '',
  target_grades: [],
};

const MAX_FILE = 5 * 1024 * 1024;

export default function TeacherCourses() {
  const toast = useToast();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [groups, setGroups] = useState<CourseGroup[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [annCourse, setAnnCourse] = useState<Course | null>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  async function load() {
    const r = await api.get<{ courses: Course[] }>('/teacher/courses');
    setCourses(r.courses);
  }
  useEffect(() => {
    load();
    api.get<{ groups: CourseGroup[] }>('/groups').then((r) => setGroups(r.groups)).catch(() => {});
  }, []);

  /* ---------- 강좌 개설/수정 ---------- */
  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setSyllabusFile(null);
    setModalOpen(true);
  }
  function openEdit(c: Course) {
    setEditing(c);
    setForm({
      title: c.title,
      category: c.category,
      description: c.description || '',
      capacity: c.capacity,
      group_id: c.group_id ?? null,
      schedule: c.schedule || [],
      room: c.room || '',
      target_grades: c.target_grades || [],
    });
    setSyllabusFile(null);
    setModalOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (groups.length > 0 && !form.group_id && !editing) {
      return toast('교과군을 선택하세요.', 'error');
    }
    if (groups.length === 0 && form.schedule.length === 0) {
      return toast('시간표에서 수업 교시를 선택하세요.', 'error');
    }
    if (syllabusFile && syllabusFile.size > MAX_FILE) {
      return toast('강의계획서는 5MB 이하 파일만 첨부할 수 있습니다.', 'error');
    }
    setSaving(true);
    try {
      const payload: any = {
        title: form.title,
        category: form.category,
        description: form.description,
        capacity: form.capacity,
        room: form.room,
        target_grades: form.target_grades,
      };
      if (groups.length > 0) {
        if (form.group_id) payload.group_id = form.group_id;
      } else if (form.schedule.length) {
        payload.schedule = form.schedule;
      }
      const r = editing
        ? await api.put<{ course: Course }>(`/courses/${editing.id}`, payload)
        : await api.post<{ course: Course }>('/courses', payload);
      if (syllabusFile) {
        await api.post(`/courses/${r.course.id}/syllabus`, {
          filename: syllabusFile.name,
          mime: syllabusFile.type || 'application/octet-stream',
          data: await fileToBase64(syllabusFile),
        });
      }
      toast(editing ? '강좌가 수정되었습니다.' : '강좌가 개설되었습니다.', 'success');
      setModalOpen(false);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function removeSyllabus() {
    if (!editing) return;
    if (!confirm('첨부된 강의계획서를 삭제하시겠습니까?')) return;
    await api.del(`/courses/${editing.id}/syllabus`);
    toast('강의계획서가 삭제되었습니다.', 'success');
    setEditing({ ...editing, syllabus_filename: null });
    load();
  }

  async function changeStatus(c: Course, status: string) {
    try {
      await api.patch(`/courses/${c.id}/status`, { status });
      toast(status === 'open' ? '모집을 재개했습니다.' : status === 'closed' ? '모집을 마감했습니다.' : '강좌를 폐강했습니다.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '변경 실패', 'error');
    }
  }

  /* ---------- 공지 ---------- */
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">내 강좌</h1>
          <p className="text-sm text-slate-500">담당 강좌를 개설하고 정원·시간을 직접 관리합니다. 수강료·강사료·계획차시는 관리자가 책정합니다.</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Icons.plus size={16} /> 강좌 개설
        </button>
      </div>

      {courses.length === 0 ? (
        <EmptyState message="개설한 강좌가 없습니다." sub="강좌 개설 버튼으로 첫 강좌를 만들어 보세요." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {courses.map((c) => (
            <div key={c.id} className="card p-5">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CategoryBadge category={c.category} />
                  <h3 className="font-bold text-slate-900">{c.title}</h3>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <p className="mb-3 text-sm text-slate-500 line-clamp-2">{c.description || '강좌 소개가 없습니다.'}</p>
              <dl className="mb-3 grid grid-cols-2 gap-y-1 text-sm">
                <Info label="교시" value={c.schedule_label || `${c.day_of_week}`} />
                <Info label="강의실" value={c.room || '-'} />
                <Info label="대상" value={targetGradesLabel(c.target_grades)} />
                <Info label="계획 차시" value={`${c.planned_sessions || 0}회`} />
              </dl>
              {c.syllabus_filename && (
                <button
                  className="mb-3 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
                  onClick={() => downloadCourseFile(c.id, c.syllabus_filename!)}
                >
                  <Icons.download size={14} /> {c.syllabus_filename}
                </button>
              )}
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>수강 인원</span>
                <span className="font-semibold text-slate-700">{c.enrolled_count}/{c.capacity}명 {c.waitlisted_count > 0 && `(대기 ${c.waitlisted_count})`}</span>
              </div>
              <ProgressBar value={c.enrolled_count} max={c.capacity} />
              <div className="mt-4 flex flex-wrap justify-end gap-1.5">
                <button className="btn-secondary btn-sm" onClick={() => openEdit(c)}>수정</button>
                {c.status === 'open' ? (
                  <button className="btn-secondary btn-sm text-amber-600" onClick={() => changeStatus(c, 'closed')}>모집 마감</button>
                ) : c.status === 'closed' ? (
                  <button className="btn-secondary btn-sm text-emerald-600" onClick={() => changeStatus(c, 'open')}>모집 재개</button>
                ) : null}
                <button className="btn-secondary btn-sm" onClick={() => openAnn(c)}>
                  <Icons.megaphone size={14} /> 공지
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 강좌 개설/수정 모달 */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? '강좌 수정' : '강좌 개설'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="label">강좌명 *</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="label">교과</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">강의실</label>
              <input className="input" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="예: 201호" />
            </div>
            <div>
              <label className="label">정원</label>
              <input type="number" min={1} className="input" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="label">대상 학년 — 복수 선택 가능</label>
            <GradePicker value={form.target_grades} onChange={(v) => setForm({ ...form, target_grades: v })} />
          </div>
          {groups.length > 0 ? (
            <div>
              <label className="label">교과군 * — 수업 요일·교시는 교과군에 따라 자동 배정됩니다</label>
              <select
                className="input"
                value={form.group_id ?? ''}
                onChange={(e) => setForm({ ...form, group_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">교과군 선택</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name} — {scheduleLabel(g.schedule)}</option>
                ))}
              </select>
              {form.group_id ? (
                <p className="mt-1.5 text-sm font-medium text-brand-700">
                  {scheduleLabel(groups.find((g) => g.id === form.group_id)?.schedule)}
                </p>
              ) : editing && form.schedule.length > 0 ? (
                <p className="mt-1.5 text-sm text-slate-500">현재: {scheduleLabel(form.schedule)} (변경하려면 교과군 선택)</p>
              ) : null}
            </div>
          ) : (
            <div>
              <label className="label">수업 교시 * — 시간표에서 블록 선택</label>
              <PeriodPicker value={form.schedule} onChange={(v) => setForm({ ...form, schedule: v })} />
            </div>
          )}
          <div>
            <label className="label">강좌 소개</label>
            <textarea className="input min-h-[70px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="label">강의계획서 첨부 (PDF·HWP·DOCX 등, 최대 5MB)</label>
            {editing?.syllabus_filename && !syllabusFile && (
              <div className="mb-2 flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <button type="button" className="inline-flex items-center gap-1.5 text-brand-600 hover:underline" onClick={() => downloadCourseFile(editing.id, editing.syllabus_filename!)}>
                  <Icons.download size={14} /> {editing.syllabus_filename}
                </button>
                <button type="button" className="text-xs text-rose-500 hover:underline" onClick={removeSyllabus}>삭제</button>
              </div>
            )}
            <input
              type="file"
              className="input"
              accept=".pdf,.hwp,.hwpx,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
              onChange={(e) => setSyllabusFile(e.target.files?.[0] || null)}
            />
            {editing?.syllabus_filename && syllabusFile && (
              <p className="mt-1 text-xs text-amber-600">저장 시 기존 파일이 새 파일로 교체됩니다.</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>취소</button>
            <button className="btn-primary" disabled={saving}>{saving ? '저장 중...' : editing ? '수정' : '개설'}</button>
          </div>
        </form>
      </Modal>

      {/* 공지 모달 */}
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
