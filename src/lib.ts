export type Track = { id: number; name: string; color: string; done: number; done_at: string | null };
export type Milestone = { id: number; track_id: number; title: string; done: number; done_at: string | null };
export type Task = {
  id: number; title: string; category: string; track_id: number | null; due: string; est: number;
  done: number; done_at: string | null; priority: number; t_start: string | null; t_end: string | null; note: string | null;
};
export type Slip = { id: number; task_id: number; title: string; date: string; from_due: string; to_due: string; deadline: string };
export type Review = { week: string; rating: string; wins: string; blockers: string; focus: string };
export type Metric = { id: number; name: string; unit: string; start: number; target: number | null; note: string | null };
export type MetricLog = { id: number; metric_id: number; date: string; value: number };
export type Data = {
  settings: Record<string, string>; tracks: Track[]; milestones: Milestone[]; tasks: Task[];
  reviews: Review[]; metrics: Metric[]; logs: MetricLog[]; slips: Slip[];
};

type Api = {
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<number>;
  exportJson(): Promise<boolean>; exportCsv(): Promise<boolean>; importJson(): Promise<boolean>;
  backup(): Promise<boolean>; reset(): Promise<boolean>; openDataDir(): Promise<string>;
};
declare global { interface Window { api: Api } }
export const api = window.api;

export const CATS: Record<string, string> = {
  'Học tập': '#2e90fa', 'Công việc': '#12b76a', 'Dự án': '#0e9384', 'Sách': '#f79009',
  'Sức khỏe': '#7a5af8', 'Cá nhân': '#ee46bc', 'Kế hoạch': '#667085',
};
export const SERIES = ['#1673ff', '#f0458f', '#12b76a', '#8b5cf6']; // chart color per tracked variable, by position
export const MAX_PRIORITY = 3; // Focus Filter: at most 3 priority tasks per day

// ---------- dates (local, ISO yyyy-mm-dd strings) ----------
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => ymd(new Date());
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
export const monday = (s: string) => addDays(s, -((parse(s).getDay() + 6) % 7));
export const weekDays = (s: string) => Array.from({ length: 7 }, (_, i) => addDays(monday(s), i));
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5);

// ---------- discipline ----------
/** A task with a start time must be done that day; one with only a date may move freely within its week (until Sunday). */
export const deadlineOf = (due: string, t_start?: string | null) => (t_start ? due : addDays(monday(due), 6));
export const deadline = (t: Task) => deadlineOf(t.due, t.t_start);
export type TaskState = 'open' | 'overdue' | 'done' | 'late';
export const taskState = (t: Task, now = today()): TaskState =>
  t.done ? (t.done_at && t.done_at > deadline(t) ? 'late' : 'done') : now > deadline(t) ? 'overdue' : 'open';
/** Open, date-only and from an earlier day of this week: still in its window, so it belongs on today's list. */
export const carried = (t: Task, now = today()) => !t.done && !t.t_start && t.due < now && now <= deadline(t);

const WD = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
export const WDS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
export const fmtLong = (s: string) => { const d = parse(s); return `${WD[d.getDay()]}, ${d.getDate()} Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`; };
export const fmtShort = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');
export const fmtWeek = (s: string) => { const d = weekDays(s); return `${+d[0].slice(8)} – ${+d[6].slice(8)} Tháng ${+d[6].slice(5, 7)}`; };
export const fmtN = (v: number) => String(+v.toFixed(2));
export const fmtH = (h: number) => `${+h.toFixed(1)}h`;

// ---------- progress scoring ----------
const sum = (xs: Task[]) => xs.reduce((s, t) => s + (t.est || 0), 0);
export const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);

/** A goal branch is done by completion: its milestones ticked off, or the branch itself when it has none. */
export function trackProgress(t: Track, milestones: Milestone[]) {
  const items = milestones.filter((m) => m.track_id === t.id);
  const done = items.filter((m) => m.done).length;
  return { items, done, total: items.length, pct: items.length ? pct(done, items.length) : t.done ? 100 : 0 };
}

/** Current value, change and progress of a tracked variable. Logs arrive sorted by date. */
export function metricView(m: Metric, logs: MetricLog[]) {
  const pts = logs.filter((l) => l.metric_id === m.id);
  const cur = pts.length ? pts[pts.length - 1].value : m.start;
  const prev = pts.length > 1 ? pts[pts.length - 2].value : m.start;
  const span = m.target == null ? 0 : m.target - m.start;
  return {
    pts, cur,
    delta: cur - prev,
    progress: span ? Math.max(0, Math.min(100, Math.round(((cur - m.start) / span) * 100))) : null,
    // is the latest change moving toward the target?
    good: span !== 0 && cur !== prev ? (cur - prev) * span > 0 : null,
  };
}

export function weekStats(d: Data, anchor: string) {
  const days = weekDays(anchor);
  const inWeek = (s: string | null) => !!s && s >= days[0] && s <= days[6];
  const due = d.tasks.filter((t) => inWeek(t.due));
  return {
    days, due,
    done: due.filter((t) => t.done).length,
    hours: sum(d.tasks.filter((t) => t.done && inWeek(t.done_at))),
    // milestones (or whole branches) completed this week
    wins: d.milestones.filter((m) => m.done && inWeek(m.done_at)).length + d.tracks.filter((t) => t.done && inWeek(t.done_at)).length,
    review: d.reviews.find((r) => r.week === days[0]),
    discipline: discipline(d, (s) => inWeek(s)),
  };
}

/** Commitments whose deadline falls in the period and is already settled: done on time, done late, missed, or pushed later. */
export function discipline(d: Data, inPeriod: (date: string) => boolean, now = today()) {
  const settled = d.tasks.filter((t) => inPeriod(deadline(t)) && taskState(t, now) !== 'open');
  const of = (st: TaskState) => settled.filter((t) => taskState(t, now) === st);
  const onTime = of('done'), late = of('late'), missed = of('overdue');
  const slips = d.slips.filter((x) => inPeriod(x.deadline));
  const total = onTime.length + late.length + missed.length + slips.length;
  return { onTime, late, missed, slips, total, rate: total ? pct(onTime.length, total) : null };
}
