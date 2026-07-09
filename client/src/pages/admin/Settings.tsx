import { useEffect, useState } from 'react';
import { api, ApiError, CourseGroup } from '../../lib/api';
import { Modal, Spinner, EmptyState } from '../../components/ui';
import { Icons } from '../../components/icons';
import PeriodPicker from '../../components/PeriodPicker';
import { Slot, scheduleLabel } from '../../lib/format';
import { useToast } from '../../context/ToastContext';

interface Semester {
  code: string;
  name: string;
  registration_open: string;
  registration_start: string | null;
  registration_end: string | null;
  max_courses_per_student: number;
  default_sessions: number;
  is_active: boolean;
  course_count: number;
  enrollment_count: number;
}

const emptyForm = {
  code: '',
  name: '',
  registration_start: '',
  registration_end: '',
  max_courses_per_student: 3,
  default_sessions: 16,
  registration_open: true,
};

export default function AdminSettings() {
  const toast = useToast();
  const [semesters, setSemesters] = useState<Semester[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Semester | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<CourseGroup[]>([]);
  const [groupForm, setGroupForm] = useState<{ id: number | null; name: string; schedule: Slot[] }>({ id: null, name: '', schedule: [] });
  const [groupSaving, setGroupSaving] = useState(false);

  async function load() {
    const r = await api.get<{ semesters: Semester[] }>('/admin/semesters');
    setSemesters(r.semesters);
  }
  async function loadGroups() {
    const r = await api.get<{ groups: CourseGroup[] }>('/groups');
    setGroups(r.groups);
  }
  useEffect(() => {
    load();
    loadGroups();
  }, []);

  /* ---------- 교과군 관리 — 강좌 시간 블록 설정 ---------- */
  async function saveGroup(e: React.FormEvent) {
    e.preventDefault();
    if (groupForm.schedule.length === 0) return toast('시간표에서 교시를 하나 이상 선택하세요.', 'error');
    setGroupSaving(true);
    try {
      if (groupForm.id) {
        await api.put(`/admin/groups/${groupForm.id}`, { name: groupForm.name, schedule: groupForm.schedule });
        toast('교과군이 수정되었습니다. 소속 강좌의 수업 시간도 함께 갱신됩니다.', 'success');
      } else {
        await api.post('/admin/groups', { name: groupForm.name, schedule: groupForm.schedule });
        toast('교과군이 생성되었습니다.', 'success');
      }
      setGroupForm({ id: null, name: '', schedule: [] });
      loadGroups();
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
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }
  function openEdit(s: Semester) {
    setEditing(s);
    setForm({
      code: s.code,
      name: s.name,
      registration_start: s.registration_start
        ? s.registration_start.includes('T') ? s.registration_start : `${s.registration_start}T00:00`
        : '',
      registration_end: s.registration_end
        ? s.registration_end.includes('T') ? s.registration_end : `${s.registration_end}T23:59`
        : '',
      max_courses_per_student: s.max_courses_per_student,
      default_sessions: s.default_sessions ?? 16,
      registration_open: s.registration_open === 'true',
    });
    setModalOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        code: form.code,
        name: form.name || undefined,
        registration_start: form.registration_start || null,
        registration_end: form.registration_end || null,
        max_courses_per_student: Number(form.max_courses_per_student),
        default_sessions: Number(form.default_sessions),
        registration_open: form.registration_open,
      };
      if (editing) {
        await api.put(`/admin/semesters/${editing.code}`, payload);
        toast('세션 설정이 저장되었습니다.', 'success');
      } else {
        await api.post('/admin/semesters', payload);
        toast('새 세션이 생성되었습니다.', 'success');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function activate(s: Semester) {
    if (!confirm(`'${s.name}' 세션을 활성화하시겠습니까?\n강좌 개설·수강신청이 이 세션 기준으로 동작합니다.`)) return;
    await api.post(`/admin/semesters/${s.code}/activate`);
    toast(`${s.name} 세션이 활성화되었습니다.`, 'success');
    // 헤더 라벨 등 세션 표시 갱신
    window.location.reload();
  }

  async function remove(s: Semester) {
    const warn =
      `'${s.name}' 세션을 삭제하시겠습니까?\n\n` +
      `⚠️ 이 세션의 강좌 ${s.course_count}개, 수강신청 ${s.enrollment_count}건과 ` +
      `연동된 출석·공지 데이터가 모두 함께 삭제되며 복구할 수 없습니다.`;
    if (!confirm(warn)) return;
    try {
      await api.del(`/admin/semesters/${s.code}`);
      toast('세션과 연동 데이터가 모두 삭제되었습니다.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '삭제 실패', 'error');
    }
  }

  if (!semesters) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">세션(학기) 관리</h1>
          <p className="text-sm text-slate-500">
            학기별 세션을 만들고 신청 기간·정책을 설정합니다. 세션 삭제 시 연동된 강좌·신청·출석 데이터가 모두 삭제됩니다.
          </p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Icons.plus size={16} /> 새 세션
        </button>
      </div>

      {semesters.length === 0 ? (
        <EmptyState message="세션이 없습니다." sub="새 세션 버튼으로 학기를 만들어 주세요." />
      ) : (
        <div className="space-y-4">
          {semesters.map((s) => (
            <div key={s.code} className={`card p-5 ${s.is_active ? 'ring-2 ring-brand-400' : ''}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">{s.name}</h2>
                    <span className="badge bg-slate-100 text-slate-500">{s.code}</span>
                    {s.is_active ? (
                      <span className="badge bg-brand-100 text-brand-700">활성 세션</span>
                    ) : (
                      <span className="badge bg-slate-200 text-slate-500">보관</span>
                    )}
                    <span className={`badge ${s.registration_open === 'true' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                      {s.registration_open === 'true' ? '접수중' : '접수마감'}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
                    <span>신청기간 {(s.registration_start || '-').replace('T', ' ')} ~ {(s.registration_end || '-').replace('T', ' ')}</span>
                    <span>1인 최대 {s.max_courses_per_student}과목</span>
                    <span>기본 {s.default_sessions ?? 16}차시</span>
                    <span className="font-medium text-slate-700">강좌 {s.course_count}개 · 신청 {s.enrollment_count}건</span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {!s.is_active && (
                    <button className="btn-secondary btn-sm" onClick={() => activate(s)}>활성화</button>
                  )}
                  <button className="btn-ghost btn-sm" onClick={() => openEdit(s)}>설정</button>
                  {!s.is_active && (
                    <button className="btn-ghost btn-sm text-rose-600" onClick={() => remove(s)}>삭제</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-500">
        💡 학기가 끝나면: <b>새 세션 생성 → 활성화</b> 후, 지난 세션은 기록 보관용으로 두거나 <b>삭제</b>하면
        해당 학기의 강좌·수강신청·출석·공지 데이터가 한 번에 정리됩니다. (활성 세션은 삭제할 수 없습니다)
      </div>

      {/* ---------- 교과군 관리 — 시간표 양식으로 교시 블록 설정 ---------- */}
      <div className="mt-10 border-t border-slate-200 pt-8">
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">교과군 관리</h2>
            <span className="badge bg-slate-100 text-slate-500">전역 · 모든 학기 공유</span>
          </div>
          <p className="text-sm text-slate-500">
            교과군은 강좌들이 공유하는 <b>교시 블록</b>입니다. 강사는 강좌 개설 시 교과군만 선택하면
            수업 시간표가 자동으로 배정되고, 여기서 교과군의 교시를 바꾸면 소속 강좌 시간도 함께 바뀝니다.
            <br />
            <b>특정 학기에 속하지 않고 모든 세션이 함께 사용</b>하므로, 세션을 새로 만들 때마다 다시 설정할 필요는 없습니다.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-2">
            {groups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400">
                아직 교과군이 없습니다. 오른쪽 시간표에서 교시를 선택해 첫 교과군을 만들어 주세요.
              </div>
            ) : (
              groups.map((g) => (
                <div
                  key={g.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 bg-white px-4 py-2.5 ${
                    groupForm.id === g.id ? 'border-brand-400 bg-brand-50' : 'border-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <span className="font-bold text-slate-800">{g.name}</span>
                    <span className="ml-2 text-sm text-brand-700">{scheduleLabel(g.schedule)}</span>
                  </div>
                  <div className="flex gap-1">
                    <button className="btn-ghost btn-sm" onClick={() => setGroupForm({ id: g.id, name: g.name, schedule: g.schedule })}>
                      수정
                    </button>
                    <button className="btn-ghost btn-sm text-rose-600" onClick={() => removeGroup(g)}>삭제</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={saveGroup} className="card space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">{groupForm.id ? `교과군 수정 · ${groupForm.name}` : '새 교과군 만들기'}</h3>
              {groupForm.id && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => setGroupForm({ id: null, name: '', schedule: [] })}>
                  + 새로 만들기
                </button>
              )}
            </div>
            <div>
              <label className="label">교과군 이름 *</label>
              <input
                className="input"
                value={groupForm.name}
                onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                placeholder="예: A군 (월·수 8~9교시)"
                required
              />
            </div>
            <div>
              <label className="label">교시 블록 * — 시간표에서 클릭해 선택</label>
              <PeriodPicker value={groupForm.schedule} onChange={(v) => setGroupForm({ ...groupForm, schedule: v })} />
            </div>
            {groupForm.id && (
              <p className="text-xs text-amber-600">⚠️ 저장하면 이 교과군 소속 강좌들의 수업 시간이 새 교시로 일괄 변경됩니다.</p>
            )}
            <div className="flex justify-end">
              <button className="btn-primary" disabled={groupSaving}>
                {groupSaving ? '저장 중...' : groupForm.id ? '교과군 저장' : '교과군 생성'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `세션 설정 · ${editing.name}` : '새 세션 만들기'}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">세션 코드 *</label>
              <input
                className="input"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="예: 2026-2"
                disabled={!!editing}
                required
              />
            </div>
            <div>
              <label className="label">세션 이름</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={form.code ? `${form.code.split('-')[0]}학년도 ${form.code.split('-')[1] || ''}학기` : '비우면 자동 생성'}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">신청 시작 (날짜·시각)</label>
              <input type="datetime-local" className="input" value={form.registration_start} onChange={(e) => setForm({ ...form, registration_start: e.target.value })} />
            </div>
            <div>
              <label className="label">신청 종료 (날짜·시각)</label>
              <input type="datetime-local" className="input" value={form.registration_end} onChange={(e) => setForm({ ...form, registration_end: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">1인당 최대 신청 강좌 수</label>
              <input type="number" min={1} className="input" value={form.max_courses_per_student} onChange={(e) => setForm({ ...form, max_courses_per_student: e.target.value })} />
            </div>
            <div>
              <label className="label">기본 계획 차시</label>
              <input type="number" min={0} className="input" value={form.default_sessions} onChange={(e) => setForm({ ...form, default_sessions: e.target.value })} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-600"
                  checked={!!form.registration_open}
                  onChange={(e) => setForm({ ...form, registration_open: e.target.checked })}
                />
                수강신청 접수 열기
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>취소</button>
            <button className="btn-primary" disabled={saving}>{saving ? '저장 중...' : editing ? '저장' : '세션 생성'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
