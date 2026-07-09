import { useEffect, useState } from 'react';
import { api, Course, CourseGroup, User, ApiError, fileToBase64, downloadCourseFile } from '../../lib/api';
import { Modal, CategoryBadge, StatusBadge, EnrollBadge, Spinner, EmptyState, ProgressBar } from '../../components/ui';
import { Icons } from '../../components/icons';
import PeriodPicker from '../../components/PeriodPicker';
import { CATEGORIES, targetGradesLabel, formatFee, studentLabel, Slot, scheduleLabel } from '../../lib/format';
import GradePicker from '../../components/GradePicker';
import { useToast } from '../../context/ToastContext';

const MAX_FILE = 5 * 1024 * 1024;

type Form = {
  title: string;
  category: string;
  description: string;
  teacher_id: number | null;
  capacity: number;
  group_id: number | null; // null = 직접 지정
  schedule: Slot[];
  room: string;
  target_grades: number[];
  fee: number;
  pay_rate: number;
  planned_sessions: number;
};

const emptyForm: Form = {
  title: '',
  category: '국어',
  description: '',
  teacher_id: null,
  capacity: 20,
  group_id: null,
  schedule: [],
  room: '',
  target_grades: [],
  fee: 0,
  pay_rate: 0,
  planned_sessions: 16,
};

export default function AdminCourses() {
  const toast = useToast();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [groups, setGroups] = useState<CourseGroup[]>([]);
  const [groupModal, setGroupModal] = useState(false);
  const [groupForm, setGroupForm] = useState<{ id: number | null; name: string; schedule: Slot[] }>({ id: null, name: '', schedule: [] });
  const [groupSaving, setGroupSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [rosterCourse, setRosterCourse] = useState<Course | null>(null);
  const [roster, setRoster] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await api.get<{ courses: Course[] }>('/courses');
    setCourses(r.courses);
  }
  async function loadGroups() {
    const r = await api.get<{ groups: CourseGroup[] }>('/groups');
    setGroups(r.groups);
  }
  useEffect(() => {
    load();
    loadGroups();
    api.get<{ users: User[] }>('/admin/users?role=teacher').then((r) => setTeachers(r.users));
  }, []);

  /* ---------- 교과군 관리 ---------- */
  async function saveGroup(e: React.FormEvent) {
    e.preventDefault();
    if (groupForm.schedule.length === 0) return toast('교시를 하나 이상 선택하세요.', 'error');
    setGroupSaving(true);
    try {
      if (groupForm.id) {
        await api.put(`/admin/groups/${groupForm.id}`, { name: groupForm.name, schedule: groupForm.schedule });
        toast('교과군이 수정되었습니다. 소속 강좌 시간도 함께 갱신됩니다.', 'success');
      } else {
        await api.post('/admin/groups', { name: groupForm.name, schedule: groupForm.schedule });
        toast('교과군이 생성되었습니다.', 'success');
      }
      setGroupForm({ id: null, name: '', schedule: [] });
      loadGroups();
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '저장 실패', 'error');
    } finally {
      setGroupSaving(false);
    }
  }

  async function removeGroup(g: CourseGroup) {
    if (!confirm(`'${g.name}' 교과군을 삭제하시겠습니까?\n소속 강좌는 현재 시간표를 유지한 채 교과군만 해제됩니다.`)) return;
    await api.del(`/admin/groups/${g.id}`);
    toast('교과군이 삭제되었습니다.', 'success');
    loadGroups();
    load();
  }

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
      teacher_id: c.teacher_id,
      capacity: c.capacity,
      group_id: c.group_id ?? null,
      schedule: c.schedule || [],
      room: c.room || '',
      target_grades: c.target_grades || [],
      fee: c.fee,
      pay_rate: c.pay_rate || 0,
      planned_sessions: c.planned_sessions || 0,
    });
    setSyllabusFile(null);
    setModalOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.group_id && form.schedule.length === 0) {
      return toast('교과군을 선택하거나 시간표에서 교시를 지정하세요.', 'error');
    }
    if (syllabusFile && syllabusFile.size > MAX_FILE) {
      return toast('강의계획서는 5MB 이하 파일만 첨부할 수 있습니다.', 'error');
    }
    setSaving(true);
    try {
      const { group_id, schedule, ...rest } = form;
      const payload: any = group_id ? { ...rest, group_id } : { ...rest, schedule };
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
    await api.patch(`/courses/${c.id}/status`, { status });
    toast(status === 'cancelled' ? '강좌를 폐강했습니다.' : '상태가 변경되었습니다.', 'success');
    load();
  }

  async function remove(c: Course) {
    if (!confirm(`'${c.title}' 강좌를 삭제하시겠습니까? 수강신청 내역도 함께 삭제됩니다.`)) return;
    await api.del(`/courses/${c.id}`);
    toast('강좌가 삭제되었습니다.', 'success');
    load();
  }

  async function openRoster(c: Course) {
    setRosterCourse(c);
    const r = await api.get<{ roster: any[] }>(`/admin/courses/${c.id}/roster`);
    setRoster(r.roster);
  }

  async function removeFromRoster(enrollmentId: number) {
    await api.del(`/admin/enrollments/${enrollmentId}`);
    if (rosterCourse) openRoster(rosterCourse);
    load();
  }

  if (!courses) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">강좌 관리</h1>
          <p className="text-sm text-slate-500">강좌는 기본적으로 강사가 개설합니다. 여기서는 미개설 강좌 추가, 정원 조정, 마감/폐강/삭제를 관리합니다.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => { setGroupForm({ id: null, name: '', schedule: [] }); setGroupModal(true); }}>
            <Icons.calendar size={16} /> 교과군 관리
          </button>
          <button className="btn-primary" onClick={openCreate}>
            <Icons.plus size={16} /> 강좌 개설
          </button>
        </div>
      </div>

      {courses.length === 0 ? (
        <EmptyState message="개설된 강좌가 없습니다." sub="강좌 개설 버튼으로 첫 강좌를 만들어 보세요." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th">강좌명</th>
                  <th className="th">강사</th>
                  <th className="th">시간</th>
                  <th className="th">대상</th>
                  <th className="th">정원</th>
                  <th className="th">수강료</th>
                  <th className="th">상태</th>
                  <th className="th text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {courses.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <CategoryBadge category={c.category} />
                        <span className="font-semibold text-slate-800">{c.title}</span>
                      </div>
                    </td>
                    <td className="td">{c.teacher_name}</td>
                    <td className="td whitespace-nowrap">
                      {c.schedule_label}
                      {c.room && <span className="text-slate-400"> · {c.room}</span>}
                    </td>
                    <td className="td whitespace-nowrap">{targetGradesLabel(c.target_grades)}</td>
                    <td className="td">
                      <button onClick={() => openRoster(c)} className="group w-24">
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="font-medium text-slate-600 group-hover:text-brand-600">
                            {c.enrolled_count}/{c.capacity}
                          </span>
                          {c.waitlisted_count > 0 && (
                            <span className="text-amber-600">+{c.waitlisted_count}</span>
                          )}
                        </div>
                        <ProgressBar value={c.enrolled_count} max={c.capacity} />
                      </button>
                    </td>
                    <td className="td whitespace-nowrap">{formatFee(c.fee)}</td>
                    <td className="td"><StatusBadge status={c.status} /></td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost btn-sm" onClick={() => openEdit(c)}>수정</button>
                        {c.status === 'open' ? (
                          <button className="btn-ghost btn-sm text-amber-600" onClick={() => changeStatus(c, 'closed')}>마감</button>
                        ) : c.status === 'closed' ? (
                          <button className="btn-ghost btn-sm text-emerald-600" onClick={() => changeStatus(c, 'open')}>재개</button>
                        ) : null}
                        {c.status !== 'cancelled' && (
                          <button className="btn-ghost btn-sm text-rose-600" onClick={() => changeStatus(c, 'cancelled')}>폐강</button>
                        )}
                        <button className="btn-ghost btn-sm text-rose-600" onClick={() => remove(c)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? '강좌 수정' : '강좌 개설'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="label">강좌명 *</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">교과</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">담당 강사</label>
              <select
                className="input"
                value={form.teacher_id ?? ''}
                onChange={(e) => setForm({ ...form, teacher_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">미배정</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.subject_area})</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">수업 교시 * — 교과군 선택 또는 직접 지정</label>
            <select
              className="input mb-2"
              value={form.group_id ?? ''}
              onChange={(e) => setForm({ ...form, group_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">직접 지정 (아래 시간표에서 선택)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name} — {scheduleLabel(g.schedule)}</option>
              ))}
            </select>
            {form.group_id ? (
              <p className="text-sm font-medium text-brand-700">
                {scheduleLabel(groups.find((g) => g.id === form.group_id)?.schedule)}
              </p>
            ) : (
              <PeriodPicker value={form.schedule} onChange={(v) => setForm({ ...form, schedule: v })} />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="label">정원</label>
              <input type="number" min={1} className="input" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">대상 학년 — 복수 선택 가능</label>
              <GradePicker value={form.target_grades} onChange={(v) => setForm({ ...form, target_grades: v })} />
            </div>
            <div>
              <label className="label">강의실</label>
              <input className="input" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="예: 201호" />
            </div>
            <div>
              <label className="label">수강료(원)</label>
              <input type="number" min={0} step={1000} className="input" value={form.fee} onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">계획 차시(총 수업 횟수)</label>
              <input type="number" min={0} className="input" value={form.planned_sessions} onChange={(e) => setForm({ ...form, planned_sessions: Number(e.target.value) })} placeholder="예: 16" />
            </div>
            <div>
              <label className="label">회당 강사료(원) — 정산 계산용</label>
              <input type="number" min={0} step={1000} className="input" value={form.pay_rate} onChange={(e) => setForm({ ...form, pay_rate: Number(e.target.value) })} placeholder="예: 40000" />
            </div>
          </div>
          <div>
            <label className="label">강좌 소개</label>
            <textarea className="input min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>취소</button>
            <button className="btn-primary" disabled={saving}>{saving ? '저장 중...' : editing ? '수정' : '개설'}</button>
          </div>
        </form>
      </Modal>

      {/* Roster modal */}
      <Modal open={!!rosterCourse} onClose={() => setRosterCourse(null)} title={`수강생 명단 · ${rosterCourse?.title || ''}`} size="lg">
        {roster.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">신청한 학생이 없습니다.</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200">
                  <th className="th">번호</th>
                  <th className="th">이름</th>
                  <th className="th">학년/반</th>
                  <th className="th">상태</th>
                  <th className="th text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roster.map((r, i) => (
                  <tr key={r.enrollment_id}>
                    <td className="td">{i + 1}</td>
                    <td className="td font-medium">{r.name}</td>
                    <td className="td">{studentLabel(r.grade, r.class_no, r.student_no)}</td>
                    <td className="td"><EnrollBadge status={r.status} /></td>
                    <td className="td text-right">
                      <button className="btn-ghost btn-sm text-rose-600" onClick={() => removeFromRoster(r.enrollment_id)}>제외</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
