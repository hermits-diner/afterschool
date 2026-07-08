import { useEffect, useState } from 'react';
import { api, User, Role, ApiError } from '../../lib/api';
import { Modal, Spinner, EmptyState } from '../../components/ui';
import { Icons } from '../../components/icons';
import { roleLabel } from '../../lib/format';
import { useToast } from '../../context/ToastContext';

const TABS: { key: Role; label: string }[] = [
  { key: 'student', label: '학생' },
  { key: 'teacher', label: '강사' },
  { key: 'admin', label: '관리자' },
];

export default function AdminUsers() {
  const toast = useToast();
  const [tab, setTab] = useState<Role>('student');
  const [users, setUsers] = useState<User[] | null>(null);
  const [q, setQ] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    setUsers(null);
    const r = await api.get<{ users: User[] }>(`/admin/users?role=${tab}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
    setUsers(r.users);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">회원 관리</h1>
          <p className="text-sm text-slate-500">학생·강사·관리자 계정을 등록하고 관리합니다.</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Icons.plus size={16} /> {roleLabel(tab)} 등록
        </button>
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
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex gap-2">
          <input className="input w-48" placeholder="이름/아이디 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-secondary">검색</button>
        </form>
      </div>

      {!users ? (
        <Spinner />
      ) : users.length === 0 ? (
        <EmptyState message="등록된 회원이 없습니다." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
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
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="td font-medium">{u.name}</td>
                    <td className="td text-slate-500">{u.username}</td>
                    {tab === 'student' && <td className="td">{u.grade}학년 {u.class_no}반 {u.student_no}번</td>}
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
