import { StrictMode, useState, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, BarChart3, Bell, Calendar, CheckSquare, ChevronLeft, ChevronRight, ClipboardCheck, HeartPulse, Home, Search, Settings, Target, type LucideIcon } from 'lucide-react';
import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-500.css';
import '@fontsource/be-vietnam-pro/vietnamese-600.css';
import '@fontsource/be-vietnam-pro/vietnamese-700.css';
import '@fontsource/be-vietnam-pro/latin-400.css';
import '@fontsource/be-vietnam-pro/latin-500.css';
import '@fontsource/be-vietnam-pro/latin-600.css';
import '@fontsource/be-vietnam-pro/latin-700.css';
import './styles.css';
import { addDays, fmtLong, fmtShort, fmtWeek, pct, today, weekStats } from './lib';
import { Store, useStore, type Page } from './store';
import { Bar, Logo } from './ui';
import Dashboard from './pages/Dashboard';
import { CalendarPage, TasksPage } from './pages/Work';
import { MetricsPage } from './pages/Tracking';
import { FramesPage } from './pages/Frames';
import { GoalsPage, ReviewPage, SettingsPage, StatsPage } from './pages/Insight';

// page, menu label, icon, view, subtitle (null = show the "local" pill and today's date instead)
const NAV: [Page, string, LucideIcon, ComponentType, string | null][] = [
  ['home', 'Tổng quan', Home, Dashboard, ''],
  ['goals', 'Mục tiêu', Target, GoalsPage, null],
  ['metrics', 'Theo dõi', Activity, MetricsPage, null],
  ['frames', 'Khung sống', HeartPulse, FramesPage, 'Chuẩn sống của bạn, luôn trong tầm mắt. Nhập ít, nhắc đúng lúc.'],
  ['tasks', 'Nhiệm vụ', CheckSquare, TasksPage, 'Quản lý công việc hằng ngày, tập trung vào những gì quan trọng.'],
  ['calendar', 'Lịch', Calendar, CalendarPage, null],
  ['review', 'Review tuần', ClipboardCheck, ReviewPage, null],
  ['stats', 'Thống kê', BarChart3, StatsPage, 'Theo dõi tiến độ học tập, làm việc và xây dựng thói quen của bạn.'],
  ['settings', 'Cài đặt', Settings, SettingsPage, ''],
];

function SearchBox() {
  const s = useStore();
  const [q, setQ] = useState('');
  const k = q.trim().toLowerCase();
  const hit = (x: string | null) => !!x && x.toLowerCase().includes(k);
  const results: [Page, string, string][] = !k ? [] : [
    ...s.tasks.filter((t) => hit(t.title) || hit(t.note)).map((t): [Page, string, string] => ['tasks', 'Nhiệm vụ', t.title]),
    ...s.milestones.filter((m) => hit(m.title)).map((m): [Page, string, string] => ['goals', 'Mốc mục tiêu', m.title]),
    ...s.metrics.filter((m) => hit(m.name)).map((m): [Page, string, string] => ['metrics', 'Biến số', m.name]),
    ...s.frames.filter((f) => hit(f.name) || hit(f.rules)).map((f): [Page, string, string] => ['frames', 'Khung sống', f.name]),
  ].slice(0, 8);
  return (
    <div className="search">
      <Search size={17} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm kiếm…" />
      {k && (
        <div className="pop">
          {results.map(([p, kind, title], i) => <button key={i} onClick={() => { s.go(p); setQ(''); }}><small>{kind}</small>{title}</button>)}
          {!results.length && <span className="muted">Không tìm thấy.</span>}
        </div>
      )}
    </div>
  );
}

/** Bell: what needs attention right now (overdue, then today's unfinished work). */
function Alerts() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const now = today();
  const items = s.tasks.filter((t) => !t.done && t.due <= now).sort((x, y) => x.due.localeCompare(y.due)).slice(0, 7);
  return (
    <div className="search bell">
      <button className="circle" title="Việc cần chú ý" onClick={() => setOpen(!open)}><Bell size={19} />{items.length > 0 && <i />}</button>
      {open && (
        <div className="pop" onClick={() => { s.go('tasks'); setOpen(false); }}>
          {items.map((t) => <button key={t.id}><small>{t.due < now ? `Quá hạn từ ${fmtShort(t.due)}` : 'Hôm nay'}</small>{t.title}</button>)}
          {!items.length && <span className="muted">Không có việc nào cần chú ý.</span>}
        </div>
      )}
    </div>
  );
}

function Shell() {
  const s = useStore();
  const [, title, , View, sub] = NAV.find(([p]) => p === s.page) ?? NAV[0];
  const now = today();
  const w = weekStats(s, now);
  const name = s.settings.name || 'bạn';
  const subtitle = s.page === 'home' ? s.settings.quote || 'Tập trung hôm nay để gần hơn với mục tiêu lớn.' : sub;
  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><Logo size={30} /><span><span>Target <b>Hunter</b></span><small>© derekdaydoi</small></span></div>
        <nav>
          {NAV.map(([p, label, Icon]) => (
            <button key={p} className={p === s.page ? 'on' : ''} onClick={() => s.go(p)}><Icon size={20} />{label}</button>
          ))}
        </nav>
        <span className="grow" />
        <button className="weekmini" title="Mở Review tuần" onClick={() => s.go('review')}>
          <span><small>Tuần này</small><b>{w.done}/{w.due.length} việc</b></span>
          <Bar value={pct(w.done, w.due.length)} />
        </button>
        <button className={s.page === 'settings' ? 'user on' : 'user'} title="Cài đặt" onClick={() => s.go('settings')}>
          <span className="avatar">{name[0].toUpperCase()}</span><b>{name}</b>
        </button>
      </aside>
      <main>
        <div className="top">
          <div className="hello">
            <h1>{s.page === 'home' ? `Chào ${name}, 👋` : title}{sub === null && <span className="pill"><i />Chạy local trên máy</span>}</h1>
            {subtitle !== '' && <p>{subtitle ?? fmtLong(now)}</p>}
          </div>
          <div className="tools">
            {s.page !== 'calendar' && (
              <div className="weeknav">
                <button className="icon-btn" title="Tuần trước" onClick={() => s.setAnchor(addDays(s.anchor, -7))}><ChevronLeft size={17} /></button>
                <span>Tuần {fmtWeek(s.anchor)}, {s.anchor.slice(0, 4)}</span>
                <button className="icon-btn" title="Tuần sau" onClick={() => s.setAnchor(addDays(s.anchor, 7))}><ChevronRight size={17} /></button>
              </div>
            )}
            {s.page !== 'calendar' && <button className="btn" onClick={() => s.setAnchor(now)}>Hôm nay</button>}
            <SearchBox />
            <Alerts />
          </div>
        </div>
        <div className="content"><View /></div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Store><Shell /></Store></StrictMode>);
