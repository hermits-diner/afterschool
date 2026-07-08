import { useEffect, useState } from 'react';
import { api, Course, User, ApiError } from '../../lib/api';
import { Modal, CategoryBadge, StatusBadge, Spinner, EmptyState, ProgressBar } from '../../components/ui';
import { Icons } from '../../components/icons';
import { CATEGORIES, DAYS, targetGradeLabel, formatFee } from '../../lib/format';
import { useToast } from '../../context/ToastContext';

type Form = {
  title: string;
  category: string;
  description: string;
  teacher_id: number | null;
  capacity: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room: string;
  target_grade: number;
  fee: number;
};

const emptyForm: Form = {
  title: '',
  category: '국어',
  description: '',
  teacher_id: null,
  capacity: 20,
  day_of_week: '월',
  start_time: '16:00',
  end_time: '17:30',
  room: '',
  target_grade: 0,
  fee: 0,
};

export default function AdminCourses() {
  const toast = useToast();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [rosterCourse, setRosterCourse] = useState<Course | null>(null);
  const [roster, setRoster] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await api.get<{ courses: Course[] }>('/courses');
    setCourses(r.courses);
  }
  useEffect(() => {
    load();
    api.get<{ users: User[] }>('/admin/users?role=teacher').then((r) => setTeachers(r.users));
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
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
      day_of_week: c.day_of_week,
      start_time: c.start_time,
      end_time: c.end_time,
      room: c.room || '',
      target_grade: c.target_grade,
      fee: c.fee,
    });
    setModalOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/courses/${editing.id}`, form);
        toast('강좌가 수정되었습니다.', 'success');
      } else {
        await api.post('/courses', form);
        toast('강좌가 개설되었습니다.', 'success');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
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
          <p className="text-sm text-slate-500">방과후 강좌를 개설하고 정원·시간을 관리합니다.</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Icons.plus size={16} /> 강좌 개설
        </button>
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
                      {c.day_of_week} {c.start_time}~{c.end_time}
                      {c.room && <span className="text-slate-400"> · {c.room}</span>}
                    </td>
                    <td className="td whitespace-nowrap">{targetGradeLabel(c.target_grade)}</td>
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
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">요일</label>
              <select className="input" value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}>
                {DAYS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="label">시작</label>
              <input type="time" className="input" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div>
              <label className="label">종료</label>
              <input type="time" className="input" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="label">정원</label>
              <input type="number" min={1} className="input" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">대상 학년</label>
              <select className="input" value={form.target_grade} onChange={(e) => setForm({ ...form, target_grade: Number(e.target.value) })}>
                <option value={0}>전학년</option>
                <option value={1}>1학년</option>
                <option value={2}>2학년</option>
                <option value={3}>3학년</option>
              </select>
            </div>
            <div>
              <label className="label">수강료(원)</label>
              <input type="number" min={0} step={1000} className="input" value={form.fee} onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">강의실</label>
              <input className="input" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="예: 201호" />
            </div>
          </div>
          <div>
            <label className="label">강좌 소개</label>
            <textarea className="input min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
                    <td className="td">{r.grade}학년 {r.class_no}반 {r.student_no}번</td>
                    <td className="td">
                      <span className={`badge ${r.status === 'enrolled' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.status === 'enrolled' ? '수강확정' : '대기'}
                      </span>
                    </td>
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
