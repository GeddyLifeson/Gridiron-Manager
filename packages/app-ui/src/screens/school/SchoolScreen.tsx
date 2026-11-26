// Coaching school screen (G-94: N5.1, N5.3 to N5.6). The curriculum map with lesson states, the drill
// records, and "My development" (the current work-on card, patterns over the career, duty offers).
// Draws read-model data only; holds no football logic. Prerequisites are shown, never enforced.
import TEXT from './text.json';
import { SCHOOL_TABS, type Accuracy, type DrillsData, type DevelopmentPage, type MapCourse, type SchoolData, type SchoolTab, type WorkOnCard } from './types.ts';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;

/** School text by id with `{slot}` filled; an unknown id shows itself so a gap is visible (O6.6.1). */
export function st(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

export const schoolTextIds = (): string[] => Object.keys(STRINGS);

export function parseTab(v: unknown): SchoolTab {
  return typeof v === 'string' && (SCHOOL_TABS as readonly string[]).includes(v) ? (v as SchoolTab) : 'lessons';
}

const counts = (r: Record<string, number>) => Object.entries(r).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');

function Course({ course, onOpenLesson }: { course: MapCourse; onOpenLesson?: (id: string) => void }) {
  return (
    <section className="gm-school-course" data-course={course.id}>
      <h3>{course.order}. {course.title} <span className="gm-school-course-state">{st(`school.course.${course.state}`)}</span></h3>
      <ol>
        {course.lessons.map((l) => (
          <li key={l.id} data-lesson={l.id} data-state={l.state}>
            <button type="button" onClick={() => onOpenLesson?.(l.id)}>{l.title}</button>
            {' '}<span>{st(`school.state.${l.state}`)}</span>{' '}<span>{st('school.minutes', { m: l.minutes })}</span>
            {l.prerequisites.length > 0 && <div className="gm-school-prereq">{st('school.prereq', { list: l.prerequisites.join(', ') })}</div>}
            {!l.gradable && <div className="gm-school-nopack">{st('school.no_pack')}</div>}
            {l.otherLevel && <div className="gm-school-level">{st('school.other_level')}</div>}
            {l.flaggedTerms.map((t) => <div key={t.id} className="gm-school-flag" data-term={t.id}>{st('school.flagged', { term: t.id, status: t.status })}</div>)}
          </li>
        ))}
      </ol>
    </section>
  );
}

function AccuracyList({ rows }: { rows: Accuracy[] }) {
  if (rows.length === 0) return <p>{st('school.drill.none')}</p>;
  return <ul>{rows.map((r) => <li key={r.key}>{st('school.drill.accuracy', { key: r.key, correct: r.correct, n: r.n })}</li>)}</ul>;
}

function Drills({ d }: { d: DrillsData }) {
  return (
    <div className="gm-school-drills">
      <section data-drill="call_speed"><h3>{st('school.drill.call_speed')}</h3>
        {d.callSpeed.length === 0 ? <p>{st('school.drill.none')}</p> : <ul>{d.callSpeed.map((s) => <li key={s.session}>{st('school.drill.session', { n: s.session, median: s.median.toFixed(1), worst: s.worst.toFixed(1) })}</li>)}</ul>}
      </section>
      <section data-drill="recognition"><h3>{st('school.drill.recognition')}</h3>
        <AccuracyList rows={d.recognition.byFamily} />
        {d.recognition.mostMissed && <p>{st('school.drill.most_missed', { key: d.recognition.mostMissed })}</p>}
      </section>
      <section data-drill="protection"><h3>{st('school.drill.protection')}</h3><AccuracyList rows={d.protection} /></section>
      <section data-drill="clock"><h3>{st('school.drill.clock')}</h3><AccuracyList rows={d.clock} /></section>
    </div>
  );
}

export function WorkOn({ card, onOpenLesson }: { card: WorkOnCard | null; onOpenLesson?: (id: string) => void }) {
  if (!card) return <section className="gm-school-workon"><h3>{st('school.work_on')}</h3><p>{st('school.work_on.none')}</p></section>;
  return (
    <section className="gm-school-workon" data-bucket={card.bucket}>
      <h3>{st('school.work_on')}</h3>
      <p>{st('school.work_on.evidence', { games: card.games, decisions: card.decisions, type: card.decisionType.replace(/_/g, ' '), chosen: counts(card.chosen), favoured: counts(card.modelFavoured) })}</p>
      <p>{st('school.work_on.cost', { pts: (card.costPerGame * 100).toFixed(1) })}</p>
      {card.lesson && <button type="button" onClick={() => onOpenLesson?.(card.lesson!)}>{st('school.work_on.lesson', { lesson: card.lesson })}</button>}
      {card.drill && <p>{st('school.work_on.drill', { drill: st(`school.drill.${card.drill}`) })}</p>}
    </section>
  );
}

function Development({ dev, current, onOpenLesson }: { dev: DevelopmentPage; current: WorkOnCard | null; onOpenLesson?: (id: string) => void }) {
  return (
    <div className="gm-school-development">
      <WorkOn card={current} onOpenLesson={onOpenLesson} />
      <ul className="gm-school-patterns">
        {dev.patterns.map((e) => <li key={`${e.card.bucket}-${e.shownAfterGame}`} data-status={e.status}>{e.card.bucket}: {st(`school.improvement.${e.status}`)}</li>)}
      </ul>
      {dev.offers.length > 0 && (
        <section><h3>{st('school.offers')}</h3>
          <ul>{dev.offers.map((o) => <li key={o.duty}>{st('school.offer', { duty: o.duty, lessons: o.lessons.join(', ') })}</li>)}</ul>
        </section>
      )}
    </div>
  );
}

export interface SchoolScreenProps {
  tab: SchoolTab;
  data: SchoolData;
  onTab: (tab: SchoolTab) => void;
  onOpenLesson?: (lessonId: string) => void;
}

export function SchoolScreen({ tab, data, onTab, onOpenLesson }: SchoolScreenProps) {
  return (
    <div className="gm-school">
      <div role="tablist" aria-label={st('school.tabs')}>
        {SCHOOL_TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => onTab(t)}>{st(`school.tab.${t}`)}</button>)}
      </div>
      <p className="gm-school-progress">{st('school.progress', { passed: data.map.passed, total: data.map.total, mastered: data.map.mastered })}</p>
      {tab === 'lessons' && data.map.courses.map((c) => <Course key={c.id} course={c} onOpenLesson={onOpenLesson} />)}
      {tab === 'drills' && <Drills d={data.drills} />}
      {tab === 'development' && <Development dev={data.development} current={data.current} onOpenLesson={onOpenLesson} />}
      <p className="gm-school-note">{st('school.no_benefit')}</p>
    </div>
  );
}
