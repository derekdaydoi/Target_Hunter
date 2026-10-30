import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { addDays, monday, parse, today, weekDays, ymd, type Task } from '../lib';
import { useStore } from '../store';
import { TaskModal, useTaskActions } from '../ui';

// Google Calendar style: day / week views on an hour grid, month view as a date grid.
const VIEWS = [['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng']] as const;
type View = (typeof VIEWS)[number][0];
const HOUR = 52; // px per hour on the time grid
const WD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const VIEW_KEY = 'th-cal-view';

const mins = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const nowMins = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

/** Start and end in minutes: t_end if set, else the estimate, else one hour. */
function span(t: Task) {
  const s = mins(t.t_start!);
  const e = t.t_end && mins(t.t_end) > s ? mins(t.t_end) : s + Math.max(30, Math.round((t.est || 1) * 60));
  return { s, e: Math.min(e, 24 * 60) };
}

/** Side-by-side lanes for overlapping events, like Google Calendar. */
function lanes(xs: Task[]) {
  const items = xs.map((t) => ({ t, ...span(t), lane: 0, of: 1 })).sort((a, b) => a.s - b.s || b.e - a.e);
  let group: typeof items = [], end = -1;
  const close = () => { const n = Math.max(...group.map((g) => g.lane)) + 1; group.forEach((g) => (g.of = n)); };
  for (const it of items) {
    if (it.s >= end && group.length) { close(); group = []; }
    const used = group.filter((g) => g.e > it.s).map((g) => g.lane);
    let l = 0; while (used.includes(l)) l++;
    it.lane = l; group.push(it); end = Math.max(end, it.e);
  }
  if (group.length) close();
  return items;
}

function title(view: View, cur: string) {
  const d = parse(cur);
  if (view === 'month') return `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
  if (view === 'day') return `${+cur.slice(8)} Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
  const w = weekDays(cur), a = parse(w[0]), b = parse(w[6]);
  return a.getMonth() === b.getMonth() ? `Tháng ${b.getMonth() + 1}, ${b.getFullYear()}` : `Th${a.getMonth() + 1} – Th${b.getMonth() + 1}, ${b.getFullYear()}`;
}

/** `cur` (any day inside the period on screen) is owned by the caller so the mini month in the side panel can drive it. */
export default function Calendar({ cur, setCur }: { cur: string; setCur(d: string): void }) {
  const s = useStore();
  const a = useTaskActions();
  const now = today();
  const [view, setView] = useState<View>(() => { try { return (localStorage.getItem(VIEW_KEY) as View) || 'week'; } catch { return 'week'; } });
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ } }, [view]);

  const byDay = new Map<string, Task[]>();
  for (const t of s.tasks) byDay.set(t.due, [...(byDay.get(t.due) ?? []), t]);
  const move = (n: number) => {
    if (view === 'day') return setCur(addDays(cur, n));
    if (view === 'week') return setCur(addDays(cur, n * 7));
    const d = parse(cur); setCur(ymd(new Date(d.getFullYear(), d.getMonth() + n, 1)));
  };
  const openDay = (d: string) => { setCur(d); setView('day'); };

  return (
    <div className="gcal">
      <div className="gcal-bar">
        <button className="pill" onClick={() => setCur(now)}>Hôm nay</button>
        <button className="round" title="Trước" onClick={() => move(-1)}><ChevronLeft size={18} /></button>
        <button className="round" title="Sau" onClick={() => move(1)}><ChevronRight size={18} /></button>
        <h2>{title(view, cur)}</h2>
        <span className="grow" />
        <div className="gseg">{VIEWS.map(([k, l]) => <button key={k} className={k === view ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>
        <button className="pill dark" onClick={() => setEdit({ due: view === 'month' ? now : cur })}><Plus size={16} />Tạo</button>
      </div>
      {view === 'month'
        ? <Month cur={cur} byDay={byDay} color={a.color} onDay={openDay} onTask={setEdit} onNew={(d) => setEdit({ due: d })} />
        : <TimeGrid days={view === 'week' ? weekDays(cur) : [cur]} byDay={byDay} color={a.color} toggle={a.toggle} onDay={openDay} onTask={setEdit}
            onNew={(d, m) => setEdit({ due: d, t_start: hm(m), t_end: hm(Math.min(m + 60, 23 * 60 + 59)), est: 1 })} />}
      {edit && <TaskModal task={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

type GridProps = {
  days: string[]; byDay: Map<string, Task[]>; color(t: Task): string; toggle(t: Task): void;
  onDay(d: string): void; onTask(t: Task): void; onNew(d: string, m: number): void;
};

function TimeGrid({ days, byDay, color, toggle, onDay, onTask, onNew }: GridProps) {
  const now = today();
  const scroller = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(nowMins());
  useEffect(() => { const id = setInterval(() => setTick(nowMins()), 60000); return () => clearInterval(id); }, []);
  // open around the working day, like Google Calendar
  useLayoutEffect(() => { if (scroller.current) scroller.current.scrollTop = HOUR * 7 - 8; }, []);
  const cols = { gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` };
  const allDay = days.map((d) => (byDay.get(d) ?? []).filter((t) => !t.t_start));

  const block = (t: Task, style: CSSProperties, small: boolean) => (
    <div key={t.id} className={`ev${t.done ? ' done' : ''}`} style={{ ...style, background: color(t) }} title={t.title}
      onClick={(e) => { e.stopPropagation(); onTask(t); }}>
      <button className="ev-check" title={t.done ? 'Bỏ đánh dấu xong' : 'Đánh dấu xong'} onClick={(e) => { e.stopPropagation(); toggle(t); }}>{t.done ? <Check size={11} /> : null}</button>
      <b>{t.title}</b>
      {!small && t.t_start && <small>{t.t_start}{t.t_end ? ` – ${t.t_end}` : ''}</small>}
    </div>
  );

  return (
    <div className="tg card-x">
      <div className="tg-head" style={cols}>
        <span />
        {days.map((d) => (
          <button key={d} className={`tg-day${d === now ? ' now' : ''}`} onClick={() => onDay(d)}>
            <small>{WD[(parse(d).getDay() + 6) % 7]}</small><b>{+d.slice(8)}</b>
          </button>
        ))}
      </div>
      <div className="tg-allday" style={cols}>
        <small className="tg-gut">Cả ngày</small>
        {allDay.map((xs, i) => (
          <div key={days[i]} className="tg-adcell">
            {xs.map((t) => block(t, {}, true))}
          </div>
        ))}
      </div>
      <div className="tg-scroll" ref={scroller}>
        <div className="tg-body" style={{ ...cols, height: HOUR * 24 }}>
          <div className="tg-hours">{Array.from({ length: 24 }, (_, h) => <small key={h} style={{ top: h * HOUR }}>{h ? `${String(h).padStart(2, '0')}:00` : ''}</small>)}</div>
          {days.map((d) => (
            <div key={d} className="tg-col" onClick={(e) => {
              const y = e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
              onNew(d, Math.floor(y / HOUR * 2) * 30);
            }}>
              {lanes((byDay.get(d) ?? []).filter((t) => t.t_start)).map(({ t, s, e, lane, of }) =>
                block(t, { top: (s / 60) * HOUR + 1, height: Math.max(22, ((e - s) / 60) * HOUR - 3), left: `calc(${(lane / of) * 100}% + 2px)`, width: `calc(${100 / of}% - 6px)`, position: 'absolute' }, e - s < 45))}
              {d === now && <div className="tg-now" style={{ top: (tick / 60) * HOUR }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Month({ cur, byDay, color, onDay, onTask, onNew }: Omit<GridProps, 'days' | 'toggle' | 'onNew'> & { cur: string; onNew(d: string): void }) {
  const now = today();
  const d0 = parse(cur), month = d0.getMonth();
  const start = monday(ymd(new Date(d0.getFullYear(), month, 1)));
  const weeks = Array.from({ length: 6 }, (_, w) => w).filter((w) => w < 5 || parse(addDays(start, w * 7)).getMonth() === month);
  const MAX = 3;
  return (
    <div className="mg card-x" style={{ gridTemplateRows: `auto repeat(${weeks.length}, minmax(0, 1fr))` }}>
      {WD.map((w) => <div key={w} className="mg-wd">{w}</div>)}
      {weeks.flatMap((w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i))).map((d) => {
        const xs = [...(byDay.get(d) ?? [])].sort((x, y) => (x.t_start ? 1 : 0) - (y.t_start ? 1 : 0) || (x.t_start ?? '').localeCompare(y.t_start ?? ''));
        const out = parse(d).getMonth() !== month;
        return (
          <div key={d} className={`mg-cell${out ? ' out' : ''}`} onClick={() => onNew(d)}>
            <button className={`mg-num${d === now ? ' now' : ''}`} onClick={(e) => { e.stopPropagation(); onDay(d); }}>{+d.slice(8)}</button>
            {xs.slice(0, MAX).map((t) => t.t_start ? (
              <div key={t.id} className={`mg-ev timed${t.done ? ' done' : ''}`} title={t.title} onClick={(e) => { e.stopPropagation(); onTask(t); }}>
                <i style={{ background: color(t) }} /><time>{t.t_start}</time><b>{t.title}</b>
              </div>
            ) : (
              <div key={t.id} className={`mg-ev${t.done ? ' done' : ''}`} style={{ background: color(t) }} title={t.title} onClick={(e) => { e.stopPropagation(); onTask(t); }}>
                <b>{t.title}</b>
              </div>
            ))}
            {xs.length > MAX && <button className="mg-more" onClick={(e) => { e.stopPropagation(); onDay(d); }}>+{xs.length - MAX} việc khác</button>}
          </div>
        );
      })}
    </div>
  );
}
