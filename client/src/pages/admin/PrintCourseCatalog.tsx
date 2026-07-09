import { useEffect, useMemo, useState } from 'react';
import { api, Course } from '../../lib/api';
import { PrintShell, PrintMeta, PrintLoading, Th, Td } from '../../components/print';
import { targetGradesLabel } from '../../lib/format';

const GRADES = [1, 2, 3];

// 여러 학년에 걸친 강좌 여부 (전학년 포함) — 일람표에서 색·라벨로 구분해
// 수강료 수기 교차체크 시 학년 표 간 중복 강좌를 바로 알아볼 수 있게 한다.
function isMultiGrade(c: Course) {
  return !c.target_grades || c.target_grades.length === 0 || c.target_grades.length > 1;
}

// 학년별 · 교과군별 강좌 일람표 — 학년마다 표 하나씩, 교과군을 가로로 펼친 형식 (가로 인쇄).
// 전학년 강좌는 세 학년 표에 모두 나타난다. 폐강 강좌는 제외.
export default function AdminPrintCourseCatalog() {
  const [courses, setCourses] = useState<Course[] | null>(null);

  useEffect(() => {
    api.get<{ courses: Course[] }>('/courses').then((r) => {
      setCourses(r.courses.filter((c) => c.status !== 'cancelled'));
    });
  }, []);

  // 교과군별 그룹핑 — 이름순, 교과군 미지정은 마지막
  const groups = useMemo(() => {
    if (!courses) return [];
    const map = new Map<string, Course[]>();
    for (const c of courses) {
      const key = c.group_name || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b, 'ko');
    });
  }, [courses]);

  if (!courses) return <PrintLoading />;

  // 해당 학년이 신청할 수 있는 강좌 (target_grades 빈 배열 = 전학년)
  const forGrade = (list: Course[], grade: number) =>
    list.filter((c) => !c.target_grades || c.target_grades.length === 0 || c.target_grades.includes(grade));

  const colW = `${Math.floor(100 / Math.max(1, groups.length))}%`;

  return (
    <PrintShell
      title="학년별 · 교과군별 강좌 일람표"
      hint="강좌 일람표 미리보기 · 가로 인쇄(Ctrl/⌘+P)"
      width="xl"
      pageStyle={'@page { size: A4 landscape; margin: 12mm; }'}
    >
      <PrintMeta>개설 강좌 {courses.length}개 · 교과군 {groups.filter(([name]) => name).length}개</PrintMeta>

      {GRADES.map((grade) => {
        // 이 학년에 강좌가 있는 교과군만 열로 사용
        const gradeGroups = groups
          .map(([name, list]) => [name, forGrade(list, grade)] as [string, Course[]])
          .filter(([, list]) => list.length > 0);
        return (
          <section key={grade} className="mb-8 break-inside-avoid">
            <h2 className="mb-2 text-base font-bold text-slate-900">{grade}학년</h2>
            {gradeGroups.length === 0 ? (
              <p className="rounded border border-dashed border-slate-300 py-4 text-center text-sm text-slate-400">
                신청 가능한 강좌가 없습니다.
              </p>
            ) : (
              <table className="print-table w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    {gradeGroups.map(([name, list]) => (
                      <Th key={name || '__none__'} w={colW}>
                        {name || '교과군 미지정'}
                        {name && (
                          <div className="mt-0.5 text-[11px] font-normal text-slate-500">
                            {list[0]?.schedule_label}
                          </div>
                        )}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {gradeGroups.map(([name, list]) => (
                      <Td key={name || '__none__'} className="align-top">
                        <ul className="space-y-1.5">
                          {list.map((c) => {
                            const multi = isMultiGrade(c);
                            return (
                              <li
                                key={c.id}
                                className={`rounded px-1.5 py-1 text-[13px] leading-snug ${
                                  multi ? 'bg-amber-100 print:bg-amber-100' : ''
                                }`}
                                style={multi ? { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } : undefined}
                              >
                                <div className="font-medium text-slate-800">
                                  {c.title}
                                  {/* 흑백 인쇄 대비: 걸친 학년을 텍스트로 병기 */}
                                  {multi && (
                                    <span className="ml-1 text-[11px] font-bold text-amber-700">
                                      [{targetGradesLabel(c.target_grades)}]
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {c.teacher_name} · 정원 {c.capacity}
                                  {/* 교과군 미지정 강좌는 시간을 개별 표기 */}
                                  {!name && <> · {c.schedule_label}</>}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </Td>
                    ))}
                  </tr>
                </tbody>
              </table>
            )}
          </section>
        );
      })}

      <p className="mt-1 text-xs text-slate-500">
        ※ <span className="rounded bg-amber-100 px-1 font-semibold text-amber-700" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>색 표시 + [학년]</span>
        는 여러 학년이 함께 수강하는 강좌입니다.
        같은 교과군의 강좌는 수업 시간이 겹치므로 교과군마다 한 강좌만 신청할 수 있습니다.
      </p>
    </PrintShell>
  );
}
