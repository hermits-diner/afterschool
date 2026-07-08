import { useEffect, useMemo, useState } from 'react';
import { api, User, Role, ApiError } from '../../lib/api';
import { Modal, Spinner, EmptyState } from '../../components/ui';
import { Icons } from '../../components/icons';
import { roleLabel, studentLabel } from '../../lib/format';
import { useToast } from '../../context/ToastContext';

const TABS: { key: Role; label: string }[] = [
  { key: 'student', label: '학생' },
  { key: 'teacher', label: '강사' },
  { key: 'admin', label: '관리자' },
];

interface BulkRow {
  grade: number;
  class_no: number;
  student_no: number;
  name: string;
  password: string;
}

// '10203' 또는 '1-2-3' 형식의 학번을 파싱한다.
function parseStudentId(token: string): { grade: number; class_no: number; student_no: number } | null {
  let m = token.match(/^([1-3])(\d{2})(\d{2})$/);
  if (m) return { grade: Number(m[1]), class_no: Number(m[2]), student_no: Number(m[3]) };
  m = token.match(/^([1-3])-(\d{1,2})-(\d{1,2})$/);
  if (m) return { grade: Number(m[1]), class_no: Number(m[2]), student_no: Number(m[3]) };
  return null;
}

export default function AdminUsers() {
  const toast = useToast();
  const [tab, setTab] = useState<Role>('student');
  const [users, setUsers] = useState<User[] | null>(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkPw, setBulkPw] = useState('');
  const [bulkResult, setBulkResult] = useState<{ created: any[]; skipped: any[] } | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  async function load() {
    setUsers(null);
    setSelected(new Set());
    const r = await api.get<{ users: User[] }>(`/admin/users?role=${tab}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
    setUsers(r.users);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /* ---------- 선택 ---------- */
  const allSelected = !!users && users.length > 0 && users.every((u) => selected.has(u.id));
  function toggleAll() {
    if (!users) return;
    setSelected(allSelected ? new Set() : new Set(users.map((u) => u.id)));
  }
  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}명을 삭제하시겠습니까?\n수강신청·출석 기록도 함께 삭제됩니다.`)) return;
    try {
      const r = await api.post<{ deleted: number }>('/admin/users/bulk-delete', { ids: [...selected] });
      toast(`${r.deleted}명이 삭제되었습니다.`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '삭제 실패', 'error');
    }
  }

  /* ---------- 일괄 등록 ---------- */
  const bulkRows = useMemo<{ rows: BulkRow[]; errors: string[] }>(() => {
    const rows: BulkRow[] = [];
    const errors: string[] = [];
    bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line, i) => {
        const parts = line.split(/[\s,\t]+/).filter(Boolean);
        if (parts.length < 2) {
          errors.push(`${i + 1}행: 형식 오류 — "${line}"`);
          return;
        }
        const sid = parseStudentId(parts[0]);
        if (!sid) {
          errors.push(`${i + 1}행: 학번 형식 오류 — "${parts[0]}" (예: 10203 또는 1-2-3)`);
          return;
        }
        const name = parts[1];
        const password = parts[2] || bulkPw;
        if (!password || password.length < 4) {
          errors.push(`${i + 1}행: 임시비밀번호 없음/4자 미만 (공통 임시비밀번호를 입력하세요)`);
          return;
        }
        rows.push({ ...sid, name, password });
      });
    return { rows, errors };
  }, [bulkText, bulkPw]);

  async function submitBulk() {
    if (bulkRows.rows.length === 0) return toast('등록할 학생이 없습니다.', 'error');
    if (bulkRows.errors.length > 0) return toast('형식 오류를 먼저 해결하세요.', 'error');
    setBulkSaving(true);
    try {
      const r = await api.post<{ created: any[]; skipped: any[] }>('/admin/users/bulk', {
        students: bulkRows.rows,
      });
      setBulkResult(r);
      toast(`${r.created.length}명 등록 완료${r.skipped.length ? ` · ${r.skipped.length}명 건너뜀` : ''}`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '일괄 등록 실패', 'error');
    } finally {
      setBulkSaving(false);
    }
  }

  function openBulk() {
    setBulkText('');
    setBulkPw('');
    setBulkResult(null);
    setBulkOpen(true);
  }

  /* ---------- 개별 등록/수정 ---------- */
  function openCreate() {
    setEditing(null);
    setForm({ role: tab, username: '', password: '', name: '', email: '', phone: '', grade: 1, class_no: 1, student_no: 1, subject_area: '' });
    setModalOpen(true);
  }
  function openEdit(u: User) {
    setEditing(u);
    setForm({ ...u, password: '' });
    setModalOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        name: form.name,
        email: form.email || '',
        phone: form.phone || '',
      };
      if (tab === 'student') {
        payload.grade = Number(form.grade);
        payload.class_no = Number(form.class_no);
        payload.student_no = Number(form.student_no);
      }
      if (tab === 'teacher') payload.subject_area = form.subject_area;
      if (form.password) payload.password = form.password;

      if (editing) {
        await api.put(`/admin/users/${editing.id}`, payload);
        toast('회원 정보가 수정되었습니다.', 'success');
      } else {
        await api.post('/admin/users', { ...payload, username: form.username, password: form.password, role: tab });
        toast('회원이 등록되었습니다.', 'success');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: User) {
    await api.put(`/admin/users/${u.id}`, { active: !u.active });
    toast(u.active ? '계정을 비활성화했습니다.' : '계정을 활성화했습니다.', 'success');
    load();
  }

  async function remove(u: User) {
    if (!confirm(`'${u.name}' 회원을 삭제하시겠습니까?`)) return;
    try {
      await api.del(`/admin/users/${u.id}`);
      toast('삭제되었습니다.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '삭제 실패', 'error');
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">회원 관리</h1>
          <p className="text-sm text-slate-500">학생·강사·관리자 계정을 등록하고 관리합니다.</p>
        </div>
        <div className="flex gap-2">
          {tab === 'student' && (
            <button className="btn-secondary" onClick={openBulk}>
              <Icons.users size={16} /> 일괄 등록
            </button>
          )}
          <button className="btn-primary" onClick={openCreate}>
            <Icons.plus size={16} /> {roleLabel(tab)} 등록
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button className="btn-danger btn-sm" onClick={bulkDelete}>
              선택 삭제 ({selected.size})
            </button>
          )}
          <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex gap-2">
            <input className="input w-48" placeholder="이름/아이디 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn-secondary">검색</button>
          </form>
        </div>
      </div>

      {!users ? (
        <Spinner />
      ) : users.length === 0 ? (
        <EmptyState message="등록된 회원이 없습니다." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th w-10">
                    <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={allSelected} onChange={toggleAll} />
                  </th>
                  <th className="th">이름</th>
                  <th className="th">아이디</th>
                  {tab === 'student' && <th className="th">학년/반/번호</th>}
                  {tab === 'teacher' && <th className="th">담당 분야</th>}
                  <th className="th">연락처</th>
                  <th className="th">상태</th>
                  <th className="th text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className={`hover:bg-slate-50 ${selected.has(u.id) ? 'bg-brand-50/50' : ''}`}>
                    <td className="td">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-600"
                        checked={selected.has(u.id)}
                        onChange={() => toggleOne(u.id)}
                      />
                    </td>
                    <td className="td font-medium">{u.name}</td>
                    <td className="td text-slate-500">
                      {u.username}
                      {u.must_change_password && (
                        <span className="badge ml-2 bg-amber-100 text-amber-700">임시PW</span>
                      )}
                    </td>
                    {tab === 'student' && <td className="td">{studentLabel(u.grade, u.class_no, u.student_no)}</td>}
                    {tab === 'teacher' && <td className="td">{u.subject_area || '-'}</td>}
                    <td className="td text-slate-500">{u.phone || '-'}</td>
                    <td className="td">
                      <span className={`badge ${u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                        {u.active ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost btn-sm" onClick={() => openEdit(u)}>수정</button>
                        <button className="btn-ghost btn-sm text-amber-600" onClick={() => toggleActive(u)}>
                          {u.active ? '비활성' : '활성'}
                        </button>
                        <button className="btn-ghost btn-sm text-rose-600" onClick={() => remove(u)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 일괄 등록 모달 */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="학생 일괄 등록" size="lg">
        {bulkResult ? (
          <div>
            <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              ✅ <b>{bulkResult.created.length}명</b> 등록 완료
              {bulkResult.skipped.length > 0 && <> · <b>{bulkResult.skipped.length}명</b> 건너뜀</>}
            </div>
            {bulkResult.skipped.length > 0 && (
              <div className="mb-4 max-h-40 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {bulkResult.skipped.map((s: any, i: number) => (
                  <div key={i}>{s.username} {s.name} — {s.reason}</div>
                ))}
              </div>
            )}
            <p className="mb-4 text-sm text-slate-500">
              등록된 학생은 <b>아이디 = 연도+학번</b>(예: 202610101), 입력한 임시비밀번호로 로그인하며,
              첫 로그인 시 비밀번호 변경이 필요합니다.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setBulkResult(null)}>더 등록하기</button>
              <button className="btn-primary" onClick={() => setBulkOpen(false)}>닫기</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              한 줄에 한 명씩 <b>학번 이름 [임시비밀번호]</b> 순서로 입력하세요. 공백/쉼표/탭 구분, 엑셀 붙여넣기 지원.
              <br />아이디는 <b>연도+학번</b>으로 자동 설정됩니다 (예: 1학년 1반 1번 → <b>202610101</b>).
              <div className="mt-1 font-mono text-xs text-slate-500">
                10101 김민준 pass1234<br />
                1-1-2 이서연 <span className="text-slate-400">← 비밀번호 생략 시 아래 공통 임시비밀번호 적용</span>
              </div>
            </div>
            <textarea
              className="input min-h-[160px] font-mono text-sm"
              placeholder={'10101 김민준 pass1234\n10102 이서연\n10103 박도윤'}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <div>
              <label className="label">공통 임시비밀번호 (행에 비밀번호가 없을 때 적용)</label>
              <input className="input" value={bulkPw} onChange={(e) => setBulkPw(e.target.value)} placeholder="예: school2026" />
            </div>
            {bulkRows.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {bulkRows.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">
                등록 대상 <b className="text-slate-800">{bulkRows.rows.length}명</b>
                {bulkRows.errors.length > 0 && <span className="text-rose-600"> · 오류 {bulkRows.errors.length}건</span>}
              </span>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setBulkOpen(false)}>취소</button>
                <button className="btn-primary" onClick={submitBulk} disabled={bulkSaving || bulkRows.rows.length === 0 || bulkRows.errors.length > 0}>
                  {bulkSaving ? '등록 중...' : `${bulkRows.rows.length}명 등록`}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 개별 등록/수정 모달 */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `${roleLabel(tab)} 수정` : `${roleLabel(tab)} 등록`}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">이름 *</label>
              <input className="input" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="label">아이디 *</label>
              <input className="input" value={form.username || ''} onChange={(e) => setForm({ ...form, username: e.target.value })} disabled={!!editing} required />
            </div>
          </div>
          <div>
            <label className="label">{editing ? '비밀번호 (변경 시 입력)' : '비밀번호 *'}</label>
            <input type="password" className="input" value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editing ? '변경하지 않으려면 비워두세요' : ''} required={!editing} />
          </div>
          {tab === 'student' && (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">학년</label>
                <select className="input" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
                  {[1, 2, 3].map((g) => <option key={g} value={g}>{g}학년</option>)}
                </select>
              </div>
              <div>
                <label className="label">반</label>
                <input type="number" min={1} className="input" value={form.class_no} onChange={(e) => setForm({ ...form, class_no: e.target.value })} />
              </div>
              <div>
                <label className="label">번호</label>
                <input type="number" min={1} className="input" value={form.student_no} onChange={(e) => setForm({ ...form, student_no: e.target.value })} />
              </div>
            </div>
          )}
          {tab === 'teacher' && (
            <div>
              <label className="label">담당 분야</label>
              <input className="input" value={form.subject_area || ''} onChange={(e) => setForm({ ...form, subject_area: e.target.value })} placeholder="예: 수학" />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">이메일</label>
              <input type="email" className="input" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">연락처</label>
              <input className="input" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>취소</button>
            <button className="btn-primary" disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
