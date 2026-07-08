import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useToast } from '../context/ToastContext';

export default function ChangePassword() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) return toast('새 비밀번호가 일치하지 않습니다.', 'error');
    setLoading(true);
    try {
      await api.post('/auth/change-password', { current, next });
      toast('비밀번호가 변경되었습니다.', 'success');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '변경에 실패했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">비밀번호 변경</h1>
      <p className="mb-6 text-sm text-slate-500">계정 보안을 위해 주기적으로 비밀번호를 변경하세요.</p>
      <form onSubmit={submit} className="card max-w-md space-y-4 p-6">
        <div>
          <label className="label">현재 비밀번호</label>
          <input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label className="label">새 비밀번호</label>
          <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div>
          <label className="label">새 비밀번호 확인</label>
          <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? '변경 중...' : '변경하기'}
        </button>
      </form>
    </div>
  );
}
