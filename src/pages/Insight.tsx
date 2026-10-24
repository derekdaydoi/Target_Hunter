import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity, AlarmClock, ArrowRight, BarChart3, BookOpen, Briefcase, CalendarClock, CalendarDays, CheckCircle2, ChevronDown, CircleX, ChevronRight, Clock, Code2, Database, Download,
  FileText, Flag, FolderOpen, LayoutGrid, Layers, List, MoreHorizontal, Plus, Save, ShieldCheck, Sun, Target, Trash2, Upload, User,
} from 'lucide-react';
import { CATS, WDS, addDays, api, deadline, discipline, fmtH, fmtShort, monday, pct, today, trackProgress, weekStats, type Milestone, type Task, type Track } from '../lib';
import { useStore } from '../store';
import { Bar, Empty, Field, Head, IconTile, Modal, StatTile, Trend, wow, Tag, useForm, useTaskActions } from '../ui';
import { NorthStar, TrackList } from './Dashboard';
import { LineChart } from './Tracking';
import { FramesWeek } from './Frames';

// ---------- goals ----------
function TrackModal({ track, onClose }: { track: Partial<Track>; onClose(): void }) {
  const s = useStore();
  const { f, bind } = useForm({ name: track.name ?? '', color: track.color ?? '#2e90fa' });
  const save = async () => {
    if (!f.name.trim()) return s.toast('Hãy nhập tên nhánh mục tiêu.');
    if (track.id) await s.exec('UPDATE tracks SET name = ?, color = ? WHERE id = ?', [f.name.trim(), f.color, track.id]);
    else await s.exec('INSERT INTO tracks(name, color) VALUES(?, ?)', [f.name.trim(), f.color]);
    onClose();
  };
  const del = track.id ? async () => {
    if (!confirm(`Xoá nhánh "${track.name}" và các mốc của nó?`)) return;
    await s.exec('UPDATE tasks SET track_id = NULL WHERE track_id = ?', [track.id]);
    await s.exec('DELETE FROM milestones WHERE track_id = ?', [track.id]);
    await s.exec('DELETE FROM tracks WHERE id = ?', [track.id]);
    onClose();
  } : undefined;
  return (
    <Modal title={track.id ? 'Sửa nhánh mục tiêu' : 'Thêm nhánh mục tiêu'} onClose={onClose} onSave={save} onDelete={del}>
      <Field label="Tên" wide><input autoFocus {...bind('name')} placeholder="VD: SQL, Giảm cân, Dự án cá nhân" /></Field>
      <Field label="Màu"><input type="color" {...bind('color')} /></Field>
    </Modal>
  );
}

function TrackCard({ t, onEdit }: { t: Track; onEdit(): void }) {
  const s = useStore();
  const p = trackProgress(t, s.milestones);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const now = today();
  const add = async () => {
    if (!title.trim()) return;
    await s.exec('INSERT INTO milestones(track_id, title) VALUES(?, ?)', [t.id, title.trim()]);
    setTitle('');
  };
  const toggle = (m: Milestone) => s.exec('UPDATE milestones SET done = ?, done_at = ? WHERE id = ?', [m.done ? 0 : 1, m.done ? null : now, m.id]);
  const hidden = p.items.length - 2;
  return (
    <section className="card goalcard">
      <header>
        <h3><i style={{ background: t.color }} />{t.name}</h3>
        <button className="icon-btn" title={open ? 'Thu gọn' : 'Mở rộng'} onClick={() => setOpen(!open)}>{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>
        <button className="icon-btn" title="Sửa nhánh" onClick={onEdit}><MoreHorizontal size={17} /></button>
      </header>
      <div className="barline"><Bar value={p.pct} color={t.color} /><b>{p.pct}%</b></div>
      <small>{p.done} / {p.total} mốc hoàn thành</small>
      {(open ? p.items : p.items.slice(0, 2)).map((m) => (
        <div key={m.id} className={m.done ? 'row done' : 'row'}>
          <input type="checkbox" checked={!!m.done} onChange={() => toggle(m)} />
          <span className="title">{m.title}</span>
          {open && <button className="icon-btn" title="Xoá mốc" onClick={() => s.exec('DELETE FROM milestones WHERE id = ?', [m.id])}><Trash2 size={14} /></button>}
        </div>
      ))}
      {open ? (
        <form className="addline" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Thêm mốc: khoá học, dự án, chứng chỉ…" />
          <button className="btn sm"><Plus size={14} />Thêm</button>
        </form>
      ) : (
        <button className="more" onClick={() => setOpen(true)}>{hidden > 0 ? `+${hidden} mốc khác` : 'Thêm mốc'}<ChevronDown size={14} /></button>
      )}
    </section>
  );
}

export function GoalsPage() {
  const s = useStore();
  const [edit, setEdit] = useState<Partial<Track> | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  return (
    <div className="stack">
      <div className="grid">
        <div className="c8"><NorthStar /></div>
        <div className="c4"><TrackList title="Tiến độ theo nhánh mục tiêu" /></div>
      </div>
      <Head icon={<Layers size={22} />} title={`Các nhánh mục tiêu (${s.tracks.length})`}>
        <div className="seg soft">
          <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}><LayoutGrid size={15} />Dạng lưới</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}><List size={15} />Dạng danh sách</button>
        </div>
        <button className="btn primary lg" onClick={() => setEdit({})}><Plus size={16} />Thêm nhánh</button>
      </Head>
      {view === 'grid' ? <div className="goals">{s.tracks.map((t) => <TrackCard key={t.id} t={t} onEdit={() => setEdit(t)} />)}</div>
        : <section className="card">{s.tracks.map((t) => <TrackLine key={t.id} t={t} onClick={() => setEdit(t)} />)}</section>}
      {!s.tracks.length && <section className="card"><Empty>Chia mục tiêu chính thành 3–5 nhánh, mỗi nhánh vài mốc cụ thể để tick dần.</Empty></section>}
      {edit && <TrackModal track={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function TrackLine({ t, onClick }: { t: Track; onClick(): void }) {
  const p = trackProgress(t, useStore().milestones);
  return (
    <div className="goal" onClick={onClick}>
      <i style={{ background: t.color }} /><b>{t.name}</b><Bar value={p.pct} color={t.color} /><b>{p.pct}%</b>
      <span className="count">{p.done}/{p.total} mốc</span><ChevronRight size={17} />
    </div>
  );
}

// ---------- stats ----------
const RANGES: [string, number][] = [['8 tuần gần nhất', 8], ['6 tháng', 26], ['1 năm', 52]];

export function StatsPage() {
  const s = useStore();
  const [range, setRange] = useState(8);
  const now = today();
  const weeks = Array.from({ length: range }, (_, i) => addDays(monday(now), (i - range + 1) * 7)).map((w) => ({ date: w, value: weekStats(s, w).hours }));
  const cur = weekStats(s, now), last = weekStats(s, addDays(now, -7));
  const done = s.tasks.filter((t) => t.done);
  const past = s.tasks.filter((t) => t.due <= now);
  const rate = (w: typeof cur) => pct(w.done, w.due.length);
  const start = addDays(monday(now), -105);
  const months = Array.from({ length: 16 }, (_, w) => addDays(start, w * 7)).map((d, i, a) => ((i === 0 ? a[2].slice(5, 7) === d.slice(5, 7) : d.slice(5, 7) !== a[i - 1].slice(5, 7)) ? `Tháng ${+d.slice(5, 7)}` : ''));
  return (
    <div className="stack">
      <div className="tiles">
        <StatTile icon={<Clock size={22} />} color="#1673ff" label="Tổng giờ tập trung" value={fmtH(done.reduce((x, t) => x + t.est, 0))} trend={wow(cur.hours, last.hours)} deco="line" />
        <StatTile icon={<Target size={22} />} color="#12b76a" label="Tỷ lệ hoàn thành" value={`${pct(past.filter((t) => t.done).length, past.length)}%`} trend={wow(rate(cur), rate(last))} deco="line" />
        <StatTile icon={<CheckCircle2 size={22} />} color="#8b5cf6" label="Nhiệm vụ đã xong" value={String(done.length)} trend={wow(cur.done, last.done)} />
        <StatTile icon={<Flag size={22} />} color="#f79009" label="Mốc mục tiêu đã đạt" value={`${s.milestones.filter((m) => m.done).length}/${s.milestones.length}`} trend={wow(cur.wins, last.wins)} deco="line" />
      </div>
      <div className="split">
        <section className="card">
          <Head icon={<BarChart3 size={22} />} title={`Giờ tập trung ${RANGES.find(([, n]) => n === range)![0]}`} sub="Tổng thời gian tập trung theo tuần, giúp bạn thấy xu hướng tiến bộ.">
            <div className="seg soft">{RANGES.map(([label, n]) => <button key={n} className={n === range ? 'on' : ''} onClick={() => setRange(n)}>{label}</button>)}</div>
          </Head>
          <LineChart points={weeks} unit="h" height={250} zero rings={range === 8} />
        </section>
        <section className="card">
          <Head icon={<CalendarDays size={22} />} title="Nhịp làm việc 16 tuần" sub="Mỗi ô vuông là 1 ngày. Màu đậm hơn là tập trung nhiều hơn." />
          <div className="heatwrap">
            <div className="heat-months">{months.map((m, i) => <small key={i}>{m}</small>)}</div>
            <div className="heat">
              {Array.from({ length: 112 }, (_, i) => addDays(start, i)).map((d) => {
                const h = done.filter((t) => t.done_at === d).reduce((x, t) => x + t.est, 0);
                const level = d > now ? 'future' : 'l' + (h <= 0 ? 0 : h < 1 ? 1 : h < 2 ? 2 : h < 4 ? 3 : 4);
                return <i key={d} className={level} title={`${fmtShort(d)}: ${fmtH(h)}`} />;
              })}
            </div>
            <div className="heat-days">{WDS.map((d) => <small key={d}>{d}</small>)}</div>
          </div>
          <span className="heat-legend">Ít{[0, 1, 2, 3, 4].map((l) => <i key={l} className={'l' + l} />)}Nhiều</span>
        </section>
      </div>
      <DisciplineCard title={`Kỷ luật ${RANGES.find(([, n]) => n === range)![0]}`} d={discipline(s, (d) => d >= weeks[0].date && d <= addDays(monday(now), 6))}>
        {(() => {
          const pts = weeks.map((w) => ({ date: w.date, value: discipline(s, (d) => d >= w.date && d <= addDays(w.date, 6)).rate }))
            .filter((p): p is { date: string; value: number } => p.value != null);
          return pts.length > 1 ? <LineChart points={pts} unit="%" height={190} zero /> : null;
        })()}
      </DisciplineCard>
      <section className="card">
        <Head icon={<Target size={22} />} title="Tiến độ theo nhánh mục tiêu" sub="Tỉ lệ mốc đã hoàn thành của từng nhánh mục tiêu." />
        {s.tracks.map((t) => <TrackLine key={t.id} t={t} onClick={() => s.go('goals')} />)}
        {!s.tracks.length && <Empty>Chưa có nhánh mục tiêu.</Empty>}
      </section>
    </div>
  );
}

// ---------- discipline ----------
const KINDS: [string, string, typeof Target][] = [
  ['Đúng hạn', '#12b76a', CheckCircle2], ['Xong trễ hạn', '#f79009', AlarmClock], ['Bỏ lỡ', '#f04438', CircleX], ['Dời hạn', '#8b5cf6', CalendarClock],
];

/** Kept-commitment rate plus the four outcomes; `list` also names each breach. */
function DisciplineCard({ title, d, last, list, children }: { title: string; d: ReturnType<typeof discipline>; last?: ReturnType<typeof discipline>; list?: boolean; children?: ReactNode }) {
  const counts = [d.onTime.length, d.late.length, d.missed.length, d.slips.length];
  const breaches: [number, string, string, string][] = [
    ...d.late.map((t): [number, string, string, string] => [1, 'l' + t.id, t.title, `hạn ${fmtShort(deadline(t))}, xong ${fmtShort(t.done_at)}`]),
    ...d.missed.map((t): [number, string, string, string] => [2, 'm' + t.id, t.title, `hạn ${fmtShort(deadline(t))}`]),
    ...d.slips.map((x): [number, string, string, string] => [3, 's' + x.id, x.title, `${fmtShort(x.from_due)} → ${fmtShort(x.to_due)}`]),
  ];
  return (
    <section className="card disc">
      <Head icon={<ShieldCheck size={22} />} color="#12b76a" title={title}>
        <span className="disc-rate">
          <span><b>{d.rate == null ? '–' : `${d.rate}%`}</b>giữ đúng cam kết</span>
          {last && <Trend pct={d.rate != null && last.rate != null ? wow(d.rate, last.rate) : null} />}
        </span>
      </Head>
      <div className="facts">
        {KINDS.map(([label, color, Icon], i) => (
          <div key={label}><IconTile color={color} size="round"><Icon size={18} /></IconTile><span><small>{label}</small><b>{counts[i]}</b></span></div>
        ))}
      </div>
      {children}
      {list && breaches.map(([k, key, name, when]) => (
        <div key={key} className="pillrow"><Tag label={KINDS[k][0]} color={KINDS[k][1]} /><span className="title">{name}</span><span className="meta">{when}</span></div>
      ))}
      {!d.total && <Empty>Chưa có việc nào tới hạn trong khoảng này.</Empty>}
    </section>
  );
}

// ---------- weekly review ----------
const BUCKETS: [string, typeof Target, string, string[]][] = [
  ['Học tập & Kỹ năng', BookOpen, '#1673ff', ['Học tập', 'Sách']],
  ['Dự án & Công việc', Briefcase, '#12b76a', ['Dự án', 'Công việc', 'Kế hoạch']],
  ['Cá nhân', User, '#8b5cf6', ['Cá nhân', 'Sức khỏe']],
];
const PANELS: [string, 'wins' | 'blockers' | 'focus', typeof Target, string, string, string][] = [
  ['Điều làm tốt / thắng lợi', 'wins', Sun, '#12b76a', 'Những điều bạn đã làm tốt, tiến bộ hoặc tự hào.', 'Viết về những điều làm tốt trong tuần…'],
  ['Điều cản trở / chưa làm được', 'blockers', Target, '#1673ff', 'Những khó khăn, trở ngại hoặc điều chưa hoàn thành.', 'Viết về những điều còn trở ngại…'],
  ['Trọng tâm tuần tới (1–3 việc)', 'focus', BarChart3, '#d946ef', 'Những điều quan trọng nhất bạn muốn tập trung.', 'Viết về 1–3 việc quan trọng cho tuần tới…'],
];

function ReviewForm({ week }: { week: string }) {
  const s = useStore();
  const r = s.reviews.find((x) => x.week === week);
  const { f, setF, bind } = useForm({ rating: r?.rating ?? '', wins: r?.wins ?? '', blockers: r?.blockers ?? '', focus: r?.focus ?? '' });
  const save = async () => {
    await s.exec(
      'INSERT INTO reviews(week, rating, wins, blockers, focus) VALUES(?,?,?,?,?) ON CONFLICT(week) DO UPDATE SET rating=excluded.rating, wins=excluded.wins, blockers=excluded.blockers, focus=excluded.focus',
      [week, f.rating, f.wins, f.blockers, f.focus]);
    s.toast('Đã lưu review tuần.');
  };
  return (
    <section className="card">
      <Head icon={<Activity size={22} />} title="Nhìn lại tuần">
        <button className="btn primary lg" onClick={save}><Save size={16} />Lưu review</button>
      </Head>
      <div className="utabs">{['Tốt', 'Ổn', 'Chưa tốt'].map((x) => <button key={x} className={f.rating === x ? 'on' : ''} onClick={() => setF({ ...f, rating: x })}>{x}</button>)}</div>
      <div className="panels">
        {PANELS.map(([title, key, Icon, color, hint, placeholder]) => (
          <div key={key} style={{ background: `linear-gradient(160deg, ${color}12, ${color}05)`, borderColor: color + '2e' }}>
            <header><IconTile color={color} size="round"><Icon size={20} /></IconTile><b>{title}</b></header>
            <textarea {...bind(key)} placeholder={placeholder} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function ReviewPage() {
  const s = useStore();
  const a = useTaskActions();
  const w = weekStats(s, s.anchor);
  const last = weekStats(s, addDays(s.anchor, -7));
  const missed = w.due.filter((t) => !t.done);
  const line = (t: Task) => (
    <div key={t.id} className="pillrow">
      <input type="checkbox" className="round" checked={false} onChange={() => a.toggle(t)} />
      <span className="title">{t.title}</span><Tag label={t.category} /><span className="meta">{fmtShort(t.due)}</span>
    </div>
  );
  return (
    <div className="stack">
      <div className="tiles">
        <StatTile icon={<CheckCircle2 size={22} />} color="#12b76a" label="Nhiệm vụ hoàn thành" value={`${w.done}/${w.due.length}`} trend={wow(w.done, last.done)} />
        <StatTile icon={<Clock size={22} />} color="#1673ff" label="Thời gian tập trung" value={fmtH(w.hours)} trend={wow(w.hours, last.hours)} />
        <StatTile icon={<Target size={22} />} color="#8b5cf6" label="Mốc mục tiêu đạt được" value={String(w.wins)} trend={wow(w.wins, last.wins)} deco="line" />
        <StatTile icon={<FileText size={22} />} color="#f79009" label="Việc chưa xong" value={String(missed.length)} trend={wow(missed.length, last.due.length - last.done)} inverse deco="line" />
      </div>
      <DisciplineCard title="Kỷ luật tuần này" d={w.discipline} last={last.discipline} list />
      <FramesWeek anchor={s.anchor} />
      <section className="card">
        <Head icon={<Target size={22} />} color="#f04438" title={`Danh sách chưa xong trong tuần (${missed.length})`}>
          <button className="btn" onClick={() => s.go('tasks')}>Xem tất cả<ArrowRight size={14} /></button>
        </Head>
        <div className="buckets">
          {BUCKETS.map(([name, Icon, color, cats]) => {
            const xs = missed.filter((t) => cats.includes(t.category) || (name === 'Cá nhân' && !(t.category in CATS)));
            return (
              <div key={name}>
                <header><Icon size={20} color={color} /><b>{name}</b><small>{xs.length} việc</small></header>
                {xs.map(line)}
              </div>
            );
          })}
        </div>
      </section>
      <ReviewForm key={w.days[0]} week={w.days[0]} />
    </div>
  );
}

// ---------- settings ----------
/** A setting saved on its own when the field is left (text) or changed (pickers): one save mechanism, no buttons. */
function SettingInput({ k, label, type = 'text', max, onSaved }: { k: string; label: string; type?: string; max?: number; onSaved(): void }) {
  const s = useStore();
  const [v, setV] = useState(s.settings[k] ?? '');
  useEffect(() => setV(s.settings[k] ?? ''), [s.settings[k]]); // e.g. after a data reset
  const commit = async (next = v) => {
    if (next === (s.settings[k] ?? '')) return;
    await s.setSetting(k, next);
    onSaved();
  };
  return (
    <Field label={label}>
      <input type={type} value={v} maxLength={max}
        onChange={(e) => { setV(e.target.value); if (type === 'time') commit(e.target.value); }}
        onBlur={() => commit()} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </Field>
  );
}

function Saved({ at }: { at: number }) {
  return <span className={at ? 'saved on' : 'saved'} key={at}><CheckCircle2 size={15} />Đã lưu</span>;
}

function ActionRow({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return <div className="action-row"><span><b>{title}</b><small>{hint}</small></span>{children}</div>;
}

export function SettingsPage() {
  const s = useStore();
  const [savedProfile, setSavedProfile] = useState(0);
  const [savedRemind, setSavedRemind] = useState(0);
  const act = (fn: () => Promise<boolean>, ok: string) => async () => { if (await fn()) { await s.reload(); s.toast(ok); } };
  const reset = async () => {
    if (!confirm('Xoá toàn bộ dữ liệu (mục tiêu, nhiệm vụ, biến số, review)? Hãy sao lưu trước.')) return;
    await act(api.reset, 'Đã xoá toàn bộ dữ liệu.')();
  };
  return (
    <div className="settings">
      <section className="card">
        <header className="sec-head"><h2>Hồ sơ</h2><Saved at={savedProfile} /></header>
        <SettingInput k="name" label="Tên hiển thị" onSaved={() => setSavedProfile(Date.now())} />
        <SettingInput k="quote" label="Câu nhắc bản thân" max={200} onSaved={() => setSavedProfile(Date.now())} />
        <small className="hint">Thay đổi được lưu khi bạn rời ô nhập. Câu nhắc hiện ở đầu trang Tổng quan.</small>
      </section>

      <section className="card">
        <header className="sec-head"><h2>Nhắc việc</h2><Saved at={savedRemind} /></header>
        <SettingInput k="remind_time" type="time" label="Giờ nhắc việc ưu tiên mỗi ngày" onSaved={() => setSavedRemind(Date.now())} />
        <small className="hint">Vào giờ này, app báo tối đa 3 việc hôm nay chưa xong. Nhắc chỉ chạy khi app đang mở.</small>
      </section>

      <section className="card full">
        <header className="sec-head"><h2>Dữ liệu</h2></header>
        <ActionRow title="Sao lưu dữ liệu" hint="Lưu một bản sao file dữ liệu (.sqlite) ra thư mục bạn chọn.">
          <button className="btn" onClick={act(api.backup, 'Đã sao lưu file SQLite.')}><Download size={16} />Tạo bản sao lưu</button>
        </ActionRow>
        <ActionRow title="Khôi phục từ JSON" hint="Thay toàn bộ dữ liệu hiện có bằng file JSON đã xuất trước đó.">
          <button className="btn" onClick={act(api.importJson, 'Đã khôi phục từ JSON.')}><Upload size={16} />Chọn tệp</button>
        </ActionRow>
        <details className="advanced">
          <summary><ChevronRight size={16} />Nâng cao</summary>
          <ActionRow title="Xuất dữ liệu JSON" hint="Toàn bộ dữ liệu, dùng được cho Khôi phục từ JSON.">
            <button className="btn" onClick={act(api.exportJson, 'Đã xuất JSON.')}><Download size={16} />Xuất JSON</button>
          </ActionRow>
          <ActionRow title="Xuất CSV nhiệm vụ" hint="Danh sách nhiệm vụ để mở bằng Excel.">
            <button className="btn" onClick={act(api.exportCsv, 'Đã xuất CSV nhiệm vụ.')}><Download size={16} />Xuất CSV</button>
          </ActionRow>
          <ActionRow title="Thư mục dữ liệu" hint="Nơi lưu file dữ liệu trên máy.">
            <button className="btn" onClick={() => api.openDataDir()}><FolderOpen size={16} />Mở thư mục</button>
          </ActionRow>
        </details>
        <div className="danger-zone">
          <ActionRow title="Xoá toàn bộ dữ liệu" hint="Không thể hoàn tác. Hãy sao lưu trước khi xoá.">
            <button className="btn danger" onClick={reset}><Trash2 size={16} />Xoá dữ liệu</button>
          </ActionRow>
        </div>
      </section>
    </div>
  );
}
