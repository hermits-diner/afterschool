import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';

export default function AdminSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ settings: any }>('/admin/settings').then((r) => setSettings(r.settings));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/admin/settings', {
        semester: settings.semester,
        registration_open: settings.registration_open === 'true' || settings.registration_open === true,
        registration_start: settings.registration_start,
        registration_end: settings.registration_end,
        max_courses_per_student: Number(settings.max_courses_per_student),
      });
      toast('운영 설정이 저장되었습니다.', 'success');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <Spinner />;
  const open = settings.registration_open === 'true' || settings.registration_open === true;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">운영 설정</h1>
      <p className="mb-6 text-sm text-slate-500">수강신청 기간과 정책을 설정합니다.</p>

      <form onSubmit={save} className="card max-w-2xl space-y-6 p-6">
        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4">
          <div>
            <div className="font-semibold text-slate-800">수강신청 접수</div>
            <div className="text-sm text-slate-500">전체 학생의 수강신청/취소 가능 여부입니다.</div>
          </div>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, registration_open: open ? 'false' : 'true' })}
            className={`relative h-7 w-12 rounded-full transition ${open ? 'bg-emerald-500' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${open ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">학기</label>
            <input className="input" value={settings.semester} onChange={(e) => setSettings({ ...settings, semester: e.target.value })} placeholder="2026-1" />
          </div>
          <div>
            <label className="label">1인당 최대 신청 강좌 수</label>
            <input type="number" min={1} className="input" value={settings.max_courses_per_student} onChange={(e) => setSettings({ ...settings, max_courses_per_student: e.target.value })} />
          </div>
          <div>
            <label className="label">신청 시작일</label>
            <input type="date" className="input" value={settings.registration_start} onChange={(e) => setSettings({ ...settings, registration_start: e.target.value })} />
          </div>
          <div>
            <label className="label">신청 종료일</label>
            <input type="date" className="input" value={settings.registration_end} onChange={(e) => setSettings({ ...settings, registration_end: e.target.value })} />
          </div>
        </div>

        <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
          현재 상태: {open ? '수강신청 접수 중' : '수강신청 마감'} · 기간 {settings.registration_start} ~ {settings.registration_end}
        </div>

        <div className="flex justify-end">
          <button className="btn-primary" disabled={saving}>{saving ? '저장 중...' : '설정 저장'}</button>
        </div>
      </form>
    </div>
  );
}
