import { useEffect, useMemo, useState } from 'react';
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

type TrashItem = {
  id: number;
  title: string;
  semester: string;
  category: string;
  teacher_name: string;
  enrollment_count: number;
  deleted_at: string;
};

// 일괄 등록 한 줄 → 강좌 객체. 강좌명에 공백이 있으므로 탭/쉼표로 구분한다.
type BulkCourseRow = {
  title: string;
  teacher?: string;
  category?: string;
  group?: string;
  capacity?: number;
  target_grades?: number[];
  fee?: number;
  pay_rate?: number;
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
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [rosterCourse, setRosterCourse] = useState<Course | null>(null);
  const [roster, setRoster] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkResult, setBulkResult] = useState<{ created: any[]; skipped: any[] } | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [delOpen, setDelOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trash, setTrash] = useState<TrashItem[] | null>(null);

  async function load() {
    const r = await api.get<{ courses: Course[] }>('/courses');
    setCourses(r.courses);
    setSelected(new Set());
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

  /* ---------- 강좌 일괄 등록 ---------- */
  const bulkRows = useMemo<{ rows: BulkCourseRow[]; errors: string[] }>(() => {
    const rows: BulkCourseRow[] = [];
    const errors: string[] = [];
    bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line, idx) => {
        // 탭(엑셀 붙여넣기) 우선, 없으면 쉼표 구분. '-' 또는 빈칸 = 생략.
        const parts = (line.includes('\t') ? line.split('\t') : line.split(','))
          .map((p) => p.trim())
          .map((p) => (p === '-' ? '' : p));
        const [title, teacher, category, group, capacity, grades, fee, payRate] = parts;
        const err = (msg: string) => errors.push(`${idx + 1}행: ${msg}`);
        if (!title) return err('강좌명이 없습니다.');
        if (!group) return err(`'${title}' — 교과군이 없습니다.`);
        if (category && !CATEGORIES.includes(category)) return err(`'${title}' — 교과는 ${CATEGORIES.join('/')} 중 하나여야 합니다.`);
        const num = (v: string | undefined, label: string) => {
          if (!v) return undefined;
          const n = Number(v.replace(/[,원]/g, ''));
          if (!Number.isInteger(n) || n < 0) { err(`'${title}' — ${label}이(가) 숫자가 아닙니다.`); return undefined; }
          return n;
        };
        // 대상학년: '12'·'1·2'·'1/2' 등에서 1~3 숫자 추출, '전학년'/빈칸 = 전체
        const target_grades = grades && !grades.includes('전')
          ? [...new Set(grades.match(/[1-3]/g)?.map(Number) || [])]
          : [];
        rows.push({
          title,
          teacher: teacher || undefined,
          category: category || undefined,
          group,
          capacity: num(capacity, '정원'),
          target_grades,
          fee: num(fee, '수강료'),
          pay_rate: num(payRate, '회당 강사료'),
        });
      });
    return { rows, errors };
  }, [bulkText]);

  async function submitBulk() {
    if (bulkRows.rows.length === 0) return toast('등록할 강좌가 없습니다.', 'error');
    if (bulkRows.errors.length > 0) return toast('형식 오류를 먼저 해결하세요.', 'error');
    setBulkSaving(true);
    try {
      const r = await api.post<{ created: any[]; skipped: any[] }>('/admin/courses/bulk', { courses: bulkRows.rows });
      setBulkResult(r);
      setBulkText('');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '일괄 등록에 실패했습니다.', 'error');
    } finally {
      setBulkSaving(false);
    }
  }

  /* ---------- 선택/전체 삭제 (휴지통 이동) + 복원 ---------- */
  const allSelected = !!courses && courses.length > 0 && courses.every((c) => selected.has(c.id));
  function toggleAll() {
    if (!courses) return;
    setSelected(allSelected ? new Set() : new Set(courses.map((c) => c.id)));
  }
  function toggleOne(id: number) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  const selectedCourses = (courses || []).filter((c) => selected.has(c.id));
  const selectedEnrollments = selectedCourses.reduce((sum, c) => sum + c.enrolled_count, 0);

  async function bulkDelete() {
    if (delConfirm !== '삭제') return;
    setDeleting(true);
    try {
      const r = await api.post<{ deleted: number }>('/admin/courses/bulk-delete', { ids: [...selected] });
      toast(`${r.deleted}개 강좌를 휴지통으로 이동했습니다. 휴지통에서 복원할 수 있습니다.`, 'success');
      setDelOpen(false);
      setDelConfirm('');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '삭제에 실패했습니다.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function loadTrash() {
    const r = await api.get<{ trash: TrashItem[] }>('/admin/courses/trash');
    setTrash(r.trash);
  }
  function openTrash() {
    setTrash(null);
    setTrashOpen(true);
    loadTrash();
  }
  async function restoreCourse(t: TrashItem) {
    await api.post(`/admin/courses/trash/${t.id}/restore`);
    toast(`'${t.title}' 강좌가 복원되었습니다. 신청 내역도 그대로 돌아왔습니다.`, 'success');
    loadTrash();
    load();
  }
  async function purgeCourse(t: TrashItem) {
    if (!confirm(`'${t.title}' 강좌를 영구 삭제하시겠습니까?\n신청 ${t.enrollment_count}건과 출석·공지 기록이 완전히 삭제되며 복구할 수 없습니다.`)) return;
    await api.del(`/admin/courses/trash/${t.id}`);
    toast('영구 삭제되었습니다.', 'success');
    loadTrash();
  }
  async function purgeAll() {
    if (!trash || trash.length === 0) return;
    if (!confirm(`휴지통을 비우시겠습니까?\n강좌 ${trash.length}개와 연결된 신청·출석 기록이 완전히 삭제되며 복구할 수 없습니다.`)) return;
    await api.del('/admin/courses/trash');
    toast('휴지통을 비웠습니다.', 'success');
    loadTrash();
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
    if (!confirm(`'${c.title}' 강좌를 삭제(휴지통 이동)하시겠습니까?\n잘못 삭제한 경우 휴지통에서 신청 내역까지 그대로 복원할 수 있습니다.`)) return;
    await api.del(`/courses/${c.id}`);
    toast('강좌를 휴지통으로 이동했습니다.', 'success');
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
        <div className="flex flex-wrap gap-2">
          {selected.size > 0 && (
            <button className="btn-danger" onClick={() => { setDelConfirm(''); setDelOpen(true); }}>
              선택 삭제 ({selected.size})
            </button>
          )}
          <button className="btn-secondary" onClick={openTrash}>
            휴지통
          </button>
          <button className="btn-secondary" onClick={() => { setBulkResult(null); setBulkOpen(true); }}>
            <Icons.users size={16} /> 일괄 등록
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
                  <th className="th w-10">
                    <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={allSelected} onChange={toggleAll} />
                  </th>
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
                  <tr key={c.id} className={`hover:bg-slate-50 ${selected.has(c.id) ? 'bg-brand-50/50' : ''}`}>
                    <td className="td">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-600"
                        checked={selected.has(c.id)}
                        onChange={() => toggleOne(c.id)}
                      />
                    </td>
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

      {/* 선택 삭제 확인 모달 — 이중 예방: 위험 안내 + '삭제' 입력 */}
      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="강좌 선택 삭제">
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            ⚠️ 선택한 <b>{selected.size}개 강좌</b>를 삭제합니다.
            {selectedEnrollments > 0 && (
              <> 이 강좌들에는 <b>수강신청 {selectedEnrollments}건</b>이 연결되어 있습니다.</>
            )}
            <br />
            삭제된 강좌는 <b>휴지통으로 이동</b>하며, 잘못 삭제한 경우 신청 내역까지 그대로 복원할 수 있습니다.
            단, 휴지통을 비우면 완전히 삭제되어 복구할 수 없습니다.
          </div>
          <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600">
            {selectedCourses.map((c) => (
              <div key={c.id} className="py-0.5">
                {c.title} <span className="text-slate-400">— {c.teacher_name} · 신청 {c.enrolled_count}건</span>
              </div>
            ))}
          </div>
          <div>
            <label className="label">
              계속하려면 아래에 <b className="text-rose-600">삭제</b>를 입력하세요.
            </label>
            <input
              className="input"
              value={delConfirm}
              onChange={(e) => setDelConfirm(e.target.value)}
              placeholder="삭제"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setDelOpen(false)}>취소</button>
            <button className="btn-danger" onClick={bulkDelete} disabled={deleting || delConfirm !== '삭제'}>
              {deleting ? '삭제 중...' : `${selected.size}개 강좌 삭제`}
            </button>
          </div>
        </div>
      </Modal>

      {/* 휴지통 모달 — 복원/영구 삭제 */}
      <Modal open={trashOpen} onClose={() => setTrashOpen(false)} title="강좌 휴지통" size="lg">
        {!trash ? (
          <Spinner />
        ) : trash.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">휴지통이 비어 있습니다.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              삭제된 강좌입니다. <b>복원</b>하면 수강신청·출석 기록까지 삭제 전 상태로 되돌아갑니다.
            </p>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
              {trash.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800">
                      {t.title}
                      <span className="ml-2 text-xs font-normal text-slate-400">{t.semester}</span>
                    </div>
                    <div className="text-sm text-slate-500">
                      {t.category} · {t.teacher_name} · 신청 {t.enrollment_count}건 · 삭제 {t.deleted_at.slice(0, 16).replace('T', ' ')}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button className="btn-secondary btn-sm" onClick={() => restoreCourse(t)}>복원</button>
                    <button className="btn-ghost btn-sm text-rose-600" onClick={() => purgeCourse(t)}>영구 삭제</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <button className="btn-ghost btn-sm text-rose-600" onClick={purgeAll}>휴지통 비우기</button>
              <button className="btn-secondary" onClick={() => setTrashOpen(false)}>닫기</button>
            </div>
          </div>
        )}
      </Modal>

      {/* 강좌 일괄 등록 모달 */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="강좌 일괄 등록" size="lg">
        {bulkResult ? (
          <div>
            <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              ✅ <b>{bulkResult.created.length}개</b> 강좌 등록 완료
              {bulkResult.skipped.length > 0 && <> · <b>{bulkResult.skipped.length}개</b> 건너뜀</>}
            </div>
            {bulkResult.skipped.length > 0 && (
              <div className="mb-4 max-h-40 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {bulkResult.skipped.map((s: any, i: number) => (
                  <div key={i}>{s.title} — {s.reason}</div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setBulkResult(null)}>더 등록하기</button>
              <button className="btn-primary" onClick={() => setBulkOpen(false)}>닫기</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              한 줄에 한 강좌씩 <b>강좌명, 강사, 교과, 교과군, 정원, [대상학년], [수강료], [회당강사료]</b> 순서로 입력하세요.
              쉼표 또는 탭(엑셀 붙여넣기) 구분이며, 생략할 항목은 <b>-</b>로 채웁니다.
              <br />강사는 <b>아이디 또는 이름</b>, 교과군은 교과군 관리에 등록된 <b>이름 그대로</b> 적습니다.
              대상학년은 <b>12</b>(1·2학년)처럼 붙여 쓰고 비우면 전학년입니다. 계획 차시는 세션 기본값이 자동 적용됩니다.
              <div className="mt-1 font-mono text-xs text-slate-500">
                문학의 밤, 김국어, 국어, A유형, 20, 12, 30000, 40000<br />
                방송댄스, -, 기타, B유형, 25 <span className="text-slate-400">← 강사 미배정 · 전학년 · 무료</span>
              </div>
            </div>
            <textarea
              className="input min-h-[160px] font-mono text-sm"
              placeholder={'문학의 밤, 김국어, 국어, A유형, 20, 12, 30000, 40000\n방송댄스, -, 기타, B유형, 25'}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            {bulkRows.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {bulkRows.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">
                등록 대상 <b className="text-slate-800">{bulkRows.rows.length}개</b>
                {bulkRows.errors.length > 0 && <span className="text-rose-600"> · 오류 {bulkRows.errors.length}건</span>}
              </span>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setBulkOpen(false)}>취소</button>
                <button className="btn-primary" onClick={submitBulk} disabled={bulkSaving || bulkRows.rows.length === 0 || bulkRows.errors.length > 0}>
                  {bulkSaving ? '등록 중...' : `${bulkRows.rows.length}개 등록`}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

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
              <PeriodPicker value={groups.find((g) => g.id === form.group_id)?.schedule || []} readOnly />
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
