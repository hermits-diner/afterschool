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

// 세션 코드 → 이름 미리보기: '2026-1' → '2026학년도 1학기', '2026-여름' → '2026학년도 여름방학', '2026-특강2' → '2026학년도 특강2'
function sessionNamePreview(code: string) {
  const m = String(code).match(/^(\d{4})-(\d|여름|겨울|특강\d?)$/);
  if (!m) return '';
  const part = /^\d$/.test(m[2]) ? `${m[2]}학기` : m[2].startsWith('특강') ? m[2] : `${m[2]}방학`;
  return `${m[1]}학년도 ${part}`;
}

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
  const [notice, setNotice] = useState('');
  const [noticeSaving, setNoticeSaving] = useState(false);

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
    // 현재 랜딩 공지 불러오기 (공개 엔드포인트)
    api.get<{ notice: string }>('/landing').then((r) => setNotice(r.notice)).catch(() => {});
  }, []);

  // 랜딩(로그인) 화면 공지 저장 — 관리자·부관리자 공통
  async function saveNotice() {
    setNoticeSaving(true);
    try {
      await api.put('/admin/landing-notice', { text: notice });
      toast('로그인 화면 공지가 저장되었습니다.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '저장에 실패했습니다.', 'error');
    } finally {
      setNoticeSaving(false);
    }
  }

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

  // 원클릭 접수 마감/재개 — 마감하면 학생은 신청·취소 모두 불가 (임의 수정 차단)
  async function toggleRegistration(s: Semester) {
    const opening = s.registration_open !== 'true';
    const msg = opening
      ? `'${s.name}' 수강신청 접수를 다시 열까요?`
      : `'${s.name}' 수강신청을 마감하시겠습니까?\n\n마감하면 학생은 수강신청과 취소를 할 수 없습니다. (확정 명단 잠금)`;
    if (!confirm(msg)) return;
    try {
      await api.put(`/admin/semesters/${s.code}`, { registration_open: opening });
      toast(
        opening ? '접수가 재개되었습니다.' : '수강신청이 마감되었습니다. 학생은 더 이상 신청·취소할 수 없습니다.',
        'success'
      );
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '변경에 실패했습니다.', 'error');
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
                  {s.is_active && (
                    s.registration_open === 'true' ? (
                      <button className="btn-sm rounded-lg bg-rose-600 px-3 font-medium text-white hover:bg-rose-700" onClick={() => toggleRegistration(s)}>
                        신청 마감
                      </button>
                    ) : (
                      <button className="btn-sm rounded-lg bg-emerald-600 px-3 font-medium text-white hover:bg-emerald-700" onClick={() => toggleRegistration(s)}>
                        접수 재개
                      </button>
                    )
                  )}
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
            <span className="badge bg-brand-100 text-brand-700">활성 세션 전용</span>
          </div>
          <p className="text-sm text-slate-500">
            교과군은 강좌들이 공유하는 <b>교시 블록</b>입니다. 강사는 강좌 개설 시 교과군만 선택하면
            수업 시간표가 자동으로 배정되고, 여기서 교과군의 교시를 바꾸면 소속 강좌 시간도 함께 바뀝니다.
            <br />
            교과군은 <b>세션(학기)별로 관리</b>됩니다 — 지금 보이는 것은 활성 세션의 교과군이며,
            새 세션을 활성화하면 그 세션의 교과군을 새로 만들어 주세요.
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
                placeholder="예: A유형"
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

      {/* ---------- 로그인 화면 공지 — 수강신청 기간 안내 등 ---------- */}
      <div className="mt-10 border-t border-slate-200 pt-8">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900">로그인 화면 공지</h2>
          <p className="text-sm text-slate-500">
            로그인(랜딩) 화면에 표시되는 공지입니다. 활성 세션의 <b>수강신청 기간과 접수 상태는 자동으로 표시</b>되며,
            여기에는 추가 안내(추가신청 일정, 유의사항 등)를 적습니다. 비워두면 기간 안내만 표시됩니다.
          </p>
        </div>
        <div className="card space-y-3 p-5">
          <textarea
            className="input min-h-[100px]"
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
            maxLength={2000}
            placeholder={'예: 추가 수강신청은 7월 20일(월) 09:00 ~ 7월 22일(수) 17:00입니다.\n문의: 교무실 방과후학교 담당 (☎ 000-0000)'}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{notice.length}/2000자 · 저장 즉시 로그인 화면에 반영됩니다.</span>
            <button className="btn-primary" onClick={saveNotice} disabled={noticeSaving}>
              {noticeSaving ? '저장 중...' : '공지 저장'}
            </button>
          </div>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `세션 설정 · ${editing.name}` : '새 세션 만들기'}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">세션 코드 * — 연도-학기 또는 연도-방학</label>
              <input
                className="input"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="예: 2026-2 · 2026-여름 · 2026-특강"
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
                placeholder={sessionNamePreview(form.code) || '비우면 자동 생성'}
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
