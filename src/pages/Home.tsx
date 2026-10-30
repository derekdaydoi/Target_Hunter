import { useEffect, useState, type ReactNode } from 'react';
import { CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Plus, Repeat, Settings, Target, X } from 'lucide-react';
import { addDays, dayLogs, dayTotal, doses, fmtLong, fmtN, kept, lines, monday, pct, today, trackProgress, appliesOn, weekDays, type Frame, type Milestone, type Task, type Track } from '../lib';
import { useStore } from '../store';
import { Logo, TaskModal, useTaskActions } from '../ui';
import { NorthStarModal } from './Dashboard';
import { SettingsPage, TrackModal } from './Insight';
import { FrameModal, groupOf, stepsOf, useFrameActions } from './Frames';
import Calendar from './Calendar';

// ---------- which tree nodes are open (remembered on this machine) ----------
const OPEN_KEY = 'th-tree-open';
function useOpen() {
  const [open, setOpen] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '') as string[]; } catch { return ['goal', 'routine']; }
  });
  useEffect(() => { try { localStorage.setItem(OPEN_KEY, JSON.stringify(open)); } catch { /* storage may be unavailable */ } }, [open]);
  // functional updates so several quick toggles in a row all land
  return {
    is: (k: string) => open.includes(k),
    flip: (k: string) => setOpen((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k])),
    show: (k: string) => setOpen((o) => (o.includes(k) ? o : [...o, k])),
  };
}

/** One row of the tree. Children render below it, indented behind a connector line. */
function Node(p: { id?: string; tree?: ReturnType<typeof useOpen>; icon?: ReactNode; label: ReactNode; meta?: ReactNode; actions?: ReactNode; children?: ReactNode; root?: boolean; done?: boolean }) {
  const open = p.id && p.tree ? p.tree.is(p.id) : true;
  const hasKids = !!p.children;
  return (
    <li className={`tn${p.root ? ' root' : ''}${p.done ? ' done' : ''}`}>
      <div className="tn-row">
        {hasKids && p.id && p.tree
          ? <button className="tn-caret" onClick={() => p.tree!.flip(p.id!)} title={open ? 'Thu gọn' : 'Mở ra'}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
          : <span className="tn-caret" />}
        {p.icon}
        <span className="tn-label">{p.label}</span>
        {p.meta && <span className="tn-meta">{p.meta}</span>}
        {p.actions && <span className="tn-acts">{p.actions}</span>}
      </div>
      {hasKids && open && <ul className="tree">{p.children}</ul>}
    </li>
  );
}

/** Text that turns into an input on double-click; Enter or leaving the field saves. */
function Editable({ value, onSave }: { value: string; onSave(v: string): void }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value);
  if (!edit) return <span onDoubleClick={() => { setV(value); setEdit(true); }} title="Bấm đúp để đổi tên">{value}</span>;
  const commit = () => { setEdit(false); if (v.trim() && v.trim() !== value) onSave(v.trim()); };
  return <input className="tn-input" autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={commit}
    onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEdit(false); }} />;
}

/** Inline "add child" field at the bottom of a branch. */
function AddLine({ placeholder, onAdd }: { placeholder: string; onAdd(v: string): void }) {
  const [v, setV] = useState('');
  return (
    <li className="tn add">
      <div className="tn-row">
        <span className="tn-caret" /><Plus size={14} />
        <input className="tn-input ghost" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); } }} />
      </div>
    </li>
  );
}

const ids = (v?: string) => (v ?? '').split(',').filter(Boolean).map(Number);

// ---------- target tree: main goal → branches → milestones ----------
function TargetTree({ tree }: { tree: ReturnType<typeof useOpen> }) {
  const s = useStore();
  const st = s.settings;
  const [goal, setGoal] = useState(false);
  const [track, setTrack] = useState<Partial<Track> | null>(null);
  const [task, setTask] = useState<Partial<Task> | null>(null);
  const now = today();

  const inGoal = st.ns_source === 'tracks' ? s.tracks.filter((t) => ids(st.ns_tracks).includes(t.id)) : s.tracks;
  const parts = inGoal.map((t) => trackProgress(t, s.milestones));
  const goalPct = st.ns_source === 'tracks'
    ? pct(parts.reduce((x, b) => x + (b.total ? b.done : b.pct === 100 ? 1 : 0), 0), parts.reduce((x, b) => x + Math.max(b.total, 1), 0))
    : pct(+st.ns_current || 0, +st.ns_target || 0);

  const toggle = (m: Milestone) => s.exec('UPDATE milestones SET done = ?, done_at = ? WHERE id = ?', [m.done ? 0 : 1, m.done ? null : now, m.id]);
  const delMilestone = (m: Milestone) => s.exec('DELETE FROM milestones WHERE id = ?', [m.id]).then(() =>
    s.toast(`Đã xoá mốc: ${m.title}`, () => s.exec('INSERT INTO milestones(id, track_id, title, done, done_at) VALUES(?,?,?,?,?)', [m.id, m.track_id, m.title, m.done, m.done_at])));

  return (
    <section className="block">
      <ul className="tree tree-root">
        <Node root id="goal" tree={tree} icon={<span className="tn-ico red"><Target size={15} /></span>}
          label={<b>{st.ns_title || 'Mục tiêu chính'}</b>} meta={<span className="pctpill">{goalPct}%</span>}
          actions={<button className="icon-btn" title="Sửa mục tiêu chính" onClick={() => setGoal(true)}><MoreHorizontal size={16} /></button>}>
          {s.tracks.map((t) => {
            const p = trackProgress(t, s.milestones);
            const open = s.tasks.filter((x) => x.track_id === t.id && !x.done).length;
            return (
              <Node key={t.id} id={`t${t.id}`} tree={tree} done={p.pct === 100}
                icon={<i className="tn-dot" style={{ background: t.color }} />}
                label={<Editable value={t.name} onSave={(v) => s.exec('UPDATE tracks SET name = ? WHERE id = ?', [v, t.id])} />}
                meta={<>{p.done}/{p.total}{open > 0 && <em title="Việc chưa xong gắn với nhánh này"> · {open} việc</em>}</>}
                actions={<>
                  <button className="icon-btn" title="Thêm việc vào lịch" onClick={() => setTask({ due: now, track_id: t.id })}><CalendarPlus size={15} /></button>
                  <button className="icon-btn" title="Sửa nhánh" onClick={() => setTrack(t)}><MoreHorizontal size={16} /></button>
                </>}>
                {p.items.map((m) => (
                  <Node key={m.id} done={!!m.done}
                    icon={<input type="checkbox" checked={!!m.done} onChange={() => toggle(m)} />}
                    label={<Editable value={m.title} onSave={(v) => s.exec('UPDATE milestones SET title = ? WHERE id = ?', [v, m.id])} />}
                    actions={<button className="icon-btn" title="Xoá mốc" onClick={() => delMilestone(m)}><X size={14} /></button>} />
                ))}
                <AddLine placeholder="Thêm mốc, Enter để lưu" onAdd={(v) => s.exec('INSERT INTO milestones(track_id, title) VALUES(?, ?)', [t.id, v])} />
              </Node>
            );
          })}
          <li className="tn add"><div className="tn-row"><span className="tn-caret" />
            <button className="tn-addbtn" onClick={() => setTrack({})}><Plus size={14} />Thêm nhánh</button></div></li>
        </Node>
      </ul>
      {goal && <NorthStarModal onClose={() => setGoal(false)} />}
      {track && <TrackModal track={track} onClose={() => setTrack(null)} />}
      {task && <TaskModal task={task} onClose={() => setTask(null)} />}
    </section>
  );
}

// ---------- routine tree: routines → today's items ----------
function FrameStatus({ f }: { f: Frame }) {
  const s = useStore();
  const a = useFrameActions();
  const now = today();
  if (!appliesOn(f, now)) return <span className="tn-meta">nghỉ</span>;
  if (f.mode === 'count') {
    const v = dayTotal(f, s.flogs, now), step = stepsOf(f)[0];
    return <><span className="tn-meta">{fmtN(v)}/{fmtN(f.target || 0)} {f.unit}</span>
      <button className="btn xs" onClick={() => a.add(f, now, step)}>+{fmtN(step)}</button></>;
  }
  if (f.mode === 'daily' || f.mode === 'schedule')
    return <input type="checkbox" title="Hôm nay đã giữ" checked={dayLogs(f, s.flogs, now).length > 0} onChange={() => a.toggle(f, now)} />;
  if (f.mode === 'doses') {
    const n = doses(f).length, d = dayLogs(f, s.flogs, now).length;
    return <span className="tn-meta">{d}/{n}</span>;
  }
  return <span className="tn-meta">nhắc</span>;
}

function RoutineTree({ tree }: { tree: ReturnType<typeof useOpen> }) {
  const s = useStore();
  const a = useFrameActions();
  const [edit, setEdit] = useState<Partial<Frame> | null>(null);
  const now = today();
  const asked = s.frames.map((f) => kept(f, s.flogs, now)).filter((k) => k != null);
  return (
    <section className="block">
      <ul className="tree tree-root">
        <Node root id="routine" tree={tree} icon={<span className="tn-ico dark"><Repeat size={15} /></span>}
          label={<b>Routine</b>} meta={asked.length > 0 && <span className="pctpill dark">{asked.filter(Boolean).length}/{asked.length} hôm nay</span>}>
          {s.frames.map((f) => {
            const [color, Icon] = groupOf(f);
            const k = kept(f, s.flogs, now);
            const kids = f.mode === 'doses'
              ? doses(f).map((d, i) => (
                <Node key={i} done={dayLogs(f, s.flogs, now).some((l) => l.item === i)}
                  icon={<input type="checkbox" checked={dayLogs(f, s.flogs, now).some((l) => l.item === i)} onChange={() => a.toggle(f, now, i)} />}
                  label={d.name} meta={d.time} />
              ))
              : lines(f.rules).map((r, i) => <Node key={i} icon={<i className="tn-bullet" />} label={r} />);
            return (
              <Node key={f.id} id={`f${f.id}`} tree={tree} done={k === true}
                icon={<span className="tn-ico" style={{ color, background: color + '1a' }}><Icon size={14} /></span>}
                label={<Editable value={f.name} onSave={(v) => s.exec('UPDATE frames SET name = ? WHERE id = ?', [v, f.id])} />}
                actions={<><FrameStatus f={f} /><button className="icon-btn" title="Sửa routine" onClick={() => setEdit(f)}><MoreHorizontal size={16} /></button></>}>
                {kids.length ? kids : undefined}
              </Node>
            );
          })}
          <li className="tn add"><div className="tn-row"><span className="tn-caret" />
            <button className="tn-addbtn" onClick={() => setEdit({})}><Plus size={14} />Thêm routine</button></div></li>
        </Node>
      </ul>
      {edit && <FrameModal frame={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function SettingsSheet({ onClose }: { onClose(): void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <header><h3>Cài đặt</h3><button className="icon-btn" onClick={onClose}><X size={18} /></button></header>
        <div className="sheet-body"><SettingsPage /></div>
      </div>
    </div>
  );
}

/**
 * Mini month for the space under the routine tree. It takes whatever height is left (flex: 1) with a floor, so it
 * grows when the tree is short and shrinks as branches and routines are added; text scales with its own height.
 */
function MiniMonth({ cur, onPick }: { cur: string; onPick(d: string): void }) {
  const s = useStore();
  const a = useTaskActions();
  const now = today();
  const [shown, setShown] = useState(cur.slice(0, 7)); // yyyy-mm on screen
  useEffect(() => setShown(cur.slice(0, 7)), [cur]);
  const [y, m] = shown.split('-').map(Number);
  const first = monday(`${shown}-01`);
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const week = weekDays(cur);
  const byDay = new Map<string, Task[]>();
  for (const t of s.tasks) byDay.set(t.due, [...(byDay.get(t.due) ?? []), t]);
  const step = (n: number) => { const d = new Date(y, m - 1 + n, 1); setShown(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  return (
    <section className="mini">
      <header>
        <b>Tháng {m}, {y}</b>
        <span className="grow" />
        <button className="round sm" title="Tháng trước" onClick={() => step(-1)}><ChevronLeft size={15} /></button>
        <button className="round sm" title="Tháng sau" onClick={() => step(1)}><ChevronRight size={15} /></button>
      </header>
      <div className="mini-grid">
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((w) => <small key={w}>{w}</small>)}
        {days.map((d) => {
          const xs = byDay.get(d) ?? [];
          const cls = [+d.slice(5, 7) !== m && 'out', d === now && 'now', d === cur && 'sel', week.includes(d) && 'wk'].filter(Boolean).join(' ');
          return (
            <button key={d} className={cls} title={xs.length ? `${xs.length} việc` : undefined} onClick={() => onPick(d)}>
              <span>{+d.slice(8)}</span>
              <i>{xs.slice(0, 3).map((t) => <em key={t.id} style={{ background: a.color(t), opacity: t.done ? 0.35 : 1 }} />)}</i>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function Home() {
  const tree = useOpen();
  const [settings, setSettings] = useState(false);
  const [cur, setCur] = useState(today()); // day the big calendar is showing; the mini month drives it too
  return (
    <div className="home">
      <div className="dragbar" />
      <aside className="panel">
        <header className="panel-head">
          <Logo size={34} />
          <span className="brandtxt"><span>Target <b>Hunter</b></span><small>© derekdaydoi</small></span>
          <span className="grow" />
          <button className="round" title="Cài đặt" onClick={() => setSettings(true)}><Settings size={17} /></button>
        </header>
        <p className="panel-date">{fmtLong(today())}</p>
        <div className="panel-scroll">
          <h4 className="sect">Mục tiêu</h4>
          <TargetTree tree={tree} />
          <h4 className="sect">Routine</h4>
          <RoutineTree tree={tree} />
          <h4 className="sect">Lịch tháng</h4>
          <MiniMonth cur={cur} onPick={setCur} />
        </div>
      </aside>
      <section className="board"><Calendar cur={cur} setCur={setCur} /></section>
      {settings && <SettingsSheet onClose={() => setSettings(false)} />}
    </div>
  );
}
