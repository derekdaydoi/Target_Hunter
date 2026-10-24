import { useState } from 'react';
import { AlarmClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, FileText, ListChecks, MoreHorizontal, Play, Plus, Target } from 'lucide-react';
import { CATS, WDS, addDays, carried, deadline, fmtH, fmtShort, monday, pct, taskState, today, weekDays, ymd, type Task } from '../lib';
import { useStore } from '../store';
import { Bar, Empty, IconTile, Mountain, StarBtn, Tag, TaskModal, useTaskActions } from '../ui';

const SCOPES = ['Hôm nay', 'Tuần này', 'Quá hạn', 'Tất cả'];
const STATES = ['Tất cả trạng thái', 'Đang thực hiện', 'Quá hạn', 'Đã hoàn thành', 'Xong trễ hạn'];
const LABEL = { open: 'Đang thực hiện', overdue: 'Quá hạn', done: 'Đã hoàn thành', late: 'Xong trễ hạn' } as const;

export function TasksPage() {
  const s = useStore();
  const a = useTaskActions();
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [scope, setScope] = useState('Tuần này');
  const [state, setState] = useState(STATES[0]);
  const [cat, setCat] = useState('Tất cả nhãn');
  const [closed, setClosed] = useState<string[]>(['Đã hoàn thành']);
  const days = weekDays(s.anchor);
  const now = today();
  const status = (t: Task) => LABEL[taskState(t, now)];
  const inScope = (t: Task) =>
    scope === 'Hôm nay' ? t.due === now || carried(t, now) : scope === 'Tuần này' ? t.due >= days[0] && t.due <= days[6]
      : scope === 'Quá hạn' ? status(t) === 'Quá hạn' : true;
  const scoped = s.tasks.filter(inScope);
  const list = scoped.filter((t) => (state === STATES[0] || status(t) === state) && (cat === 'Tất cả nhãn' || t.category === cat));

  const count = (st: string) => scoped.filter((t) => status(t) === st).length;
  const tiles: [typeof Target, string, string, number][] = [
    [CheckCircle2, '#1673ff', 'Đã hoàn thành', scoped.filter((t) => t.done).length],
    [Play, '#12b76a', 'Đang thực hiện', count('Đang thực hiện')],
    [AlarmClock, '#f79009', 'Quá hạn', count('Quá hạn')],
    [ListChecks, '#667085', 'Tổng nhiệm vụ', scoped.length],
  ];
  const groups: [string, string, Task[]][] = [
    ['Quá hạn', '#f04438', list.filter((t) => status(t) === 'Quá hạn')],
    ['Tuần này', '#1673ff', list.filter((t) => status(t) === 'Đang thực hiện' && t.due <= weekDays(now)[6])],
    ['Sắp tới', '#667085', list.filter((t) => status(t) === 'Đang thực hiện' && t.due > weekDays(now)[6])],
    ['Đã hoàn thành', '#12b76a', list.filter((t) => t.done)],
  ];
  const flip = (g: string) => setClosed(closed.includes(g) ? closed.filter((x) => x !== g) : [...closed, g]);

  return (
    <div className="stack">
      <section className="card banner tasks-banner">
        <div>
          <span className="chip-soft"><Target size={15} color="#f04438" />Tập trung làm điều quan trọng</span>
          <h2>Biến mục tiêu thành hành động</h2>
          <p>{scoped.length} nhiệm vụ · {fmtH(scoped.reduce((x, t) => x + t.est, 0))} ước lượng · {scope.toLowerCase()}</p>
        </div>
        <Mountain />
        <div className="banner-tiles">
          {tiles.map(([Icon, color, label, n]) => (
            <div key={label}>
              <IconTile color={color} size="round"><Icon size={17} /></IconTile>
              <b>{n}</b><small>{label}</small>
              <span className="barline"><Bar value={pct(n, scoped.length)} color={color} /><small>{pct(n, scoped.length)}%</small></span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="toolbar">
          <div className="seg">{SCOPES.map((k) => <button key={k} className={k === scope ? 'on' : ''} onClick={() => setScope(k)}>{k}</button>)}</div>
          <span className="grow" />
          <select value={state} onChange={(e) => setState(e.target.value)}>{STATES.map((x) => <option key={x}>{x}</option>)}</select>
          <select value={cat} onChange={(e) => setCat(e.target.value)}>{['Tất cả nhãn', ...Object.keys(CATS)].map((c) => <option key={c}>{c}</option>)}</select>
          <button className="btn primary" onClick={() => setEdit({ due: now })}><Plus size={15} />Thêm nhiệm vụ</button>
        </div>
        <div className="trow thead"><span /><span>Nhiệm vụ</span><span>Trạng thái</span><span>Thời gian ước lượng</span><span>Hạn hoàn thành</span><span>Nhãn</span><span>Thao tác</span></div>
        {groups.filter(([, , xs]) => xs.length).map(([name, color, xs]) => (
          <div key={name}>
            <button className="group" style={{ background: color + '12' }} onClick={() => flip(name)}>
              {closed.includes(name) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              <Clock size={18} color={color} /><b>{name}</b><span style={{ color, background: color + '1c' }}>{xs.length}</span>
            </button>
            {!closed.includes(name) && xs.map((t) => (
              <div key={t.id} className={t.done ? 'trow done' : 'trow'}>
                <input type="checkbox" checked={!!t.done} onChange={() => a.toggle(t)} />
                <div className="tname" onDoubleClick={() => setEdit(t)}><FileText size={16} /><span><b>{t.title}</b>{t.note && <small>{t.note}</small>}</span></div>
                <span><Tag label={status(t)} color={status(t) === 'Xong trễ hạn' ? '#f79009' : color} /></span>
                <span className="meta"><Clock size={14} />{fmtH(t.est)}</span>
                <span className={status(t) === 'Quá hạn' || status(t) === 'Xong trễ hạn' ? 'meta late' : 'meta'} title={t.t_start ? `Có giờ ${t.t_start}: phải xong trong ngày` : `Linh động đến hết CN ${fmtShort(deadline(t))}`}>{fmtShort(t.due)}/{t.due.slice(0, 4)}{t.t_start && ` · ${t.t_start}`}</span>
                <span>{t.category && <Tag label={t.category} />}</span>
                <span className="acts"><StarBtn t={t} /><button className="icon-btn" title="Sửa" onClick={() => setEdit(t)}><MoreHorizontal size={17} /></button></span>
              </div>
            ))}
          </div>
        ))}
        {!list.length && <Empty>Không có nhiệm vụ nào trong bộ lọc này.</Empty>}
      </section>
      {edit && <TaskModal task={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

const iso = (y: number, m: number, d = 1) => ymd(new Date(y, m, d));

/** 6-week mini grid of one month; `counts` tints days by number of tasks. */
export function MiniMonth({ year, month, counts, onPick }: { year: number; month: number; counts?: Map<string, Task[]>; onPick?: (d: string) => void }) {
  const first = monday(iso(year, month));
  const now = today();
  return (
    <div className="mini-month">
      {WDS.map((d) => <small key={d}>{d}</small>)}
      {Array.from({ length: 42 }, (_, i) => addDays(first, i)).map((d) => {
        const inside = +d.slice(5, 7) - 1 === month;
        const n = counts && inside ? (counts.get(d) ?? []).length : 0;
        return (
          <i key={d} className={`${inside ? '' : 'out '}${n ? 'l' + Math.min(n, 4) : ''}${d === now ? ' now' : ''}`}
            title={n ? `${n} việc` : undefined} onClick={onPick && (() => onPick(d))}>{+d.slice(8)}</i>
        );
      })}
    </div>
  );
}

const MODES = ['Tháng', 'Tuần', 'Năm'] as const;
const WD_FULL = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

export function CalendarPage() {
  const s = useStore();
  const a = useTaskActions();
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [mode, setMode] = useState<(typeof MODES)[number]>('Tháng');
  const now = today();
  const [cur, setCur] = useState(now); // any day inside the period on screen
  const year = +cur.slice(0, 4), month = +cur.slice(5, 7) - 1;
  const move = (n: number) => setCur(mode === 'Tuần' ? addDays(cur, n * 7) : iso(year + (mode === 'Năm' ? n : 0), month + (mode === 'Tháng' ? n : 0)));
  const byDay = new Map<string, Task[]>();
  for (const t of s.tasks) byDay.set(t.due, [...(byDay.get(t.due) ?? []), t]);

  // month grid: whole weeks from the Monday on/before the 1st
  const start = monday(iso(year, month));
  const inMonth = (d: string) => +d.slice(5, 7) - 1 === month;
  const weeks = [0, 1, 2, 3, 4, 5].filter((w) => w < 4 || inMonth(addDays(start, w * 7)));
  const wk = weekDays(cur);
  const label = mode === 'Tháng' ? `Tháng ${month + 1}, ${year}` : mode === 'Năm' ? `Năm ${year}` : `${fmtShort(wk[0])} – ${fmtShort(wk[6])}/${year}`;
  const chip = (t: Task) => (
    <span key={t.id} className={t.done ? 'chip done' : 'chip'} style={{ borderColor: a.color(t), background: a.color(t) + '14' }} title={t.title}
      onClick={(e) => { e.stopPropagation(); setEdit(t); }}>
      <b>{t.title}</b>{t.t_start && <time>{t.t_start}</time>}
    </span>
  );

  return (
    <div className="cal">
      <div className="toolbar">
        <div className="weeknav">
          <button className="icon-btn" onClick={() => move(-1)}><ChevronLeft size={17} /></button>
          <span>{label}</span>
          <button className="icon-btn" onClick={() => move(1)}><ChevronRight size={17} /></button>
        </div>
        <button className="btn" onClick={() => setCur(now)}>Hôm nay</button>
        <div className="seg soft">{MODES.map((m) => <button key={m} className={m === mode ? 'on' : ''} onClick={() => setMode(m)}>{m}</button>)}</div>
        <span className="grow" />
        <button className="btn primary lg" onClick={() => setEdit({ due: now })}><Plus size={16} />Thêm nhiệm vụ</button>
      </div>

      {mode === 'Năm' ? (
        <div className="year">
          {Array.from({ length: 12 }, (_, m) => (
            <section key={m} className="card" onClick={() => { setCur(iso(year, m)); setMode('Tháng'); }}>
              <header><h3>Tháng {m + 1}</h3></header>
              <MiniMonth year={year} month={m} counts={byDay} />
            </section>
          ))}
        </div>
      ) : (
        <div className="month card" style={{ gridTemplateRows: `auto repeat(${mode === 'Tuần' ? 1 : weeks.length}, minmax(0, 1fr))` }}>
          {WD_FULL.map((d) => <div key={d} className="wd">{d}</div>)}
          {(mode === 'Tuần' ? wk : weeks.flatMap((w) => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(start, w * 7 + i)))).map((d) => {
            const xs = byDay.get(d) ?? [];
            const max = mode === 'Tuần' ? 12 : 3;
            return (
              <div key={d} className={`cell${mode === 'Tháng' && !inMonth(d) ? ' out' : ''}${d === now ? ' now' : ''}`} onClick={() => setEdit({ due: d })}>
                <b>{+d.slice(8)}</b>
                {xs.slice(0, max).map(chip)}
                {xs.length > max && <small>+{xs.length - max} việc khác</small>}
              </div>
            );
          })}
        </div>
      )}
      {mode !== 'Năm' && !s.tasks.length && <Empty>Bấm vào một ô ngày để thêm nhiệm vụ đầu tiên.</Empty>}
      {edit && <TaskModal task={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
