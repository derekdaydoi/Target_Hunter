import { useState } from 'react';
import { Activity, ArrowRight, BarChart3, CalendarDays, CheckCircle2, CheckSquare, ChevronRight, Flag, Pencil, Plus, Smile, Sun, Target, Timer, TrendingUp } from 'lucide-react';
import { SERIES, WDS, fmtH, fmtN, fmtShort, metricView, pct, today, trackProgress, weekStats, type Task } from '../lib';
import { useStore } from '../store';
import { Bar, Empty, Field, IconTile, Modal, Mountain, Tag, TaskModal, TaskRow, useForm, useTaskActions } from '../ui';
import { LineChart } from './Tracking';

function NorthStarModal({ onClose }: { onClose(): void }) {
  const s = useStore();
  const { f, bind } = useForm({
    ns_metric_id: s.settings.ns_metric_id ?? '', ns_title: s.settings.ns_title ?? '', ns_desc: s.settings.ns_desc ?? '',
    ns_current: s.settings.ns_current ?? '0', ns_target: s.settings.ns_target ?? '0',
    ns_unit: s.settings.ns_unit ?? '', ns_target_year: s.settings.ns_target_year ?? '',
  });
  const save = async () => {
    for (const [k, v] of Object.entries(f)) await s.setSetting(k, v);
    onClose();
  };
  return (
    <Modal title="Mục tiêu chính (North Star)" onClose={onClose} onSave={save}>
      <Field label="Mục tiêu" wide><input autoFocus {...bind('ns_title')} /></Field>
      <Field label="Mô tả một dòng" wide><input {...bind('ns_desc')} placeholder="Bạn sẽ đạt mục tiêu này bằng cách nào?" /></Field>
      <Field label="Nguồn số liệu" wide>
        <select {...bind('ns_metric_id')}>
          <option value="">Nhập tay</option>
          {s.metrics.map((m) => <option key={m.id} value={m.id}>Lấy từ biến số: {m.name}</option>)}
        </select>
      </Field>
      {!f.ns_metric_id && <Field label="Hiện tại"><input type="number" step="0.1" {...bind('ns_current')} /></Field>}
      {!f.ns_metric_id && <Field label="Mục tiêu"><input type="number" step="0.1" {...bind('ns_target')} /></Field>}
      {!f.ns_metric_id && <Field label="Đơn vị"><input {...bind('ns_unit')} /></Field>}
      <Field label="Năm đạt mục tiêu"><input type="number" {...bind('ns_target_year')} /></Field>
    </Modal>
  );
}

export function NorthStar() {
  const { settings: st, metrics, logs } = useStore();
  const [edit, setEdit] = useState(false);
  // when linked to a tracked variable, its latest log is the current value
  const linked = metrics.find((m) => String(m.id) === st.ns_metric_id);
  const cur = linked ? metricView(linked, logs).cur : +st.ns_current || 0;
  const tgt = linked?.target ?? (+st.ns_target || 0);
  const unit = linked ? linked.unit : st.ns_unit ?? '';
  const year = new Date().getFullYear();
  const years = Math.max(0, (+st.ns_target_year || year) - year);
  const growth = cur > 0 && tgt > cur && years > 0 ? (Math.pow(tgt / cur, 1 / years) - 1) * 100 : 0;
  const p = pct(cur, tgt);
  return (
    <section className="card hero">
      <Mountain />
      <header>
        <h3><Target size={22} color="#f04438" />Mục tiêu chính (North Star)</h3>
        <button className="chipbtn" onClick={() => setEdit(true)}><Pencil size={13} />Chỉnh sửa</button>
      </header>
      <div className="hero-title">{st.ns_title}</div>
      {st.ns_desc && <p className="hero-desc">{st.ns_desc}</p>}
      <div className="hero-track">
        <div className="ns-ends">
          <div><small>Hiện tại ({year})</small><b>{fmtN(cur)}{unit}</b></div>
          <div className="right"><small>Mục tiêu ({st.ns_target_year})</small><b>{fmtN(tgt)}{unit}</b></div>
        </div>
        <div className="nsbar"><i style={{ width: `${p}%` }} /><b style={{ left: `${p}%` }}>{p}%</b></div>
        <small>Còn {years} năm · Tăng trưởng cần đạt: ~{growth.toFixed(0)}%/năm</small>
      </div>
      {edit && <NorthStarModal onClose={() => setEdit(false)} />}
    </section>
  );
}

export function TrackList({ title }: { title: string }) {
  const s = useStore();
  return (
    <section className="card">
      <header><h3>{title}</h3><button className="link" onClick={() => s.go('goals')}>Xem chi tiết<ArrowRight size={14} /></button></header>
      <div className="tracks">
        {s.tracks.map((t) => {
          const p = trackProgress(t, s.milestones).pct;
          return <div key={t.id} className="track"><i style={{ background: t.color }} /><span>{t.name}</span><Bar value={p} color={t.color} /><b>{p}%</b></div>;
        })}
        {!s.tracks.length && <Empty>Chưa có nhánh mục tiêu nào.</Empty>}
      </div>
    </section>
  );
}

export default function Dashboard() {
  const s = useStore();
  const a = useTaskActions();
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [sel, setSel] = useState('');
  const now = today();
  const w = weekStats(s, s.anchor);
  const day = w.days.includes(sel) ? sel : w.days.includes(now) ? now : w.days[0];

  const todays = s.tasks.filter((t) => t.due === now && !t.done); // done tasks leave the list at once
  const doneToday = s.tasks.some((t) => t.due === now && t.done);
  const weekOpen = w.due.filter((t) => !t.done);
  const schedule = s.tasks.filter((t) => t.due === day).slice(0, 4);
  const dot = (d: string) => {
    const xs = s.tasks.filter((t) => t.due === d);
    return !xs.length ? '#d0d5dd' : xs.every((t) => t.done) ? '#12b76a' : d < now ? '#f79009' : '#1673ff';
  };
  const kpis: [typeof Target, string, string, string, string][] = [
    [CheckCircle2, '#12b76a', 'Nhiệm vụ hoàn thành', `${w.done}/${w.due.length}`, ''],
    [Timer, '#1673ff', 'Thời gian tập trung', fmtH(w.hours), ''],
    [TrendingUp, '#12b76a', 'Mốc mục tiêu đạt được', String(w.wins), ''],
    [Smile, '#f79009', 'Đánh giá tuần này', w.review?.rating || 'Chưa review', 'warn'],
  ];
  const open = s.milestones.filter((m) => !m.done);

  return (
    <div className="grid">
      <div className="c8"><NorthStar /></div>
      <div className="c4"><TrackList title="Tiến độ theo mục tiêu học tập & công việc" /></div>

      <section className="card c4">
        <header>
          <h3><Sun size={21} color="#1673ff" />Việc cần làm hôm nay</h3>
          <button className="btn sm" onClick={() => setEdit({ due: now, priority: todays.filter((t) => t.priority).length < 3 ? 1 : 0 })}><Plus size={14} />Thêm việc</button>
        </header>
        {todays.slice(0, 3).map((t) => <TaskRow key={t.id} t={t} onEdit={setEdit} />)}
        {!todays.length && <Empty>{doneToday ? 'Đã xong hết việc hôm nay.' : 'Chọn tối đa 3 việc quan trọng nhất cho hôm nay.'}</Empty>}
        <footer className="foot"><button className="link" onClick={() => s.go('tasks')}>Xem tất cả {todays.length} việc<ArrowRight size={14} /></button></footer>
      </section>

      <section className="card c4">
        <header><h3><CalendarDays size={21} color="#1673ff" />Lịch trong tuần</h3><button className="link" onClick={() => s.go('calendar')}>Xem tất cả<ArrowRight size={14} /></button></header>
        <div className="strip">
          {w.days.map((d, i) => (
            <button key={d} className={d === day ? 'on' : d === now ? 'now' : ''} onClick={() => setSel(d)}>
              <small>{WDS[i]}</small><b>{+d.slice(8)}</b><i style={{ background: dot(d) }} />
            </button>
          ))}
        </div>
        {schedule.map((t) => (
          <div key={t.id} className={t.done ? 'slot done' : 'slot'} onClick={() => setEdit(t)}>
            <time>{t.t_start ? `${t.t_start}${t.t_end ? ' – ' + t.t_end : ''}` : 'Trong ngày'}</time>
            <span style={{ borderColor: a.color(t) }}>{t.title}</span>
          </div>
        ))}
        {!schedule.length && <Empty>Không có lịch ngày {fmtShort(day)}.</Empty>}
      </section>

      <section className="card c4">
        <header><h3><BarChart3 size={21} color="#1673ff" />Review tuần</h3><button className="link" onClick={() => s.go('review')}>Xem chi tiết<ArrowRight size={14} /></button></header>
        {kpis.map(([Icon, color, label, value, cls]) => (
          <div key={label} className="kpi" onClick={() => s.go('review')}>
            <Icon size={24} color={color} /><span>{label}</span><b className={cls}>{value}</b><ChevronRight size={16} />
          </div>
        ))}
      </section>

      <section className="card c12">
        <header><h3><Activity size={21} color="#1673ff" />Các chỉ số đang theo dõi</h3><button className="link" onClick={() => s.go('metrics')}>Xem chi tiết<ArrowRight size={14} /></button></header>
        <div className="minis">
          {s.metrics.slice(0, 4).map((m, i) => {
            const v = metricView(m, s.logs);
            return (
              <div key={m.id} className="mini" onClick={() => s.go('metrics')}>
                <IconTile color={SERIES[i % SERIES.length]} size="round"><Activity size={20} /></IconTile>
                <span><small>{m.name}</small><b>{fmtN(v.cur)} <small>{m.unit}</small></b></span>
                <LineChart compact height={44} points={v.pts} target={m.target} unit={m.unit} color={SERIES[i % SERIES.length]} />
              </div>
            );
          })}
          {s.metrics.length < 4 && (
            <div className="mini" onClick={() => s.go('stats')}>
              <IconTile color="#12b76a" size="round"><Timer size={20} /></IconTile>
              <span><small>Thời gian tập trung tuần này</small><b>{fmtH(w.hours)}</b></span>
            </div>
          )}
          {s.metrics.length < 3 && (
            <div className="mini" onClick={() => s.go('goals')}>
              <IconTile color="#8b5cf6" size="round"><Flag size={20} /></IconTile>
              <span><small>Mốc mục tiêu đạt được</small><b>{s.milestones.filter((m) => m.done).length}/{s.milestones.length}</b></span>
            </div>
          )}
        </div>
      </section>

      <section className="card c6">
        <header>
          <h3><CheckSquare size={21} color="#1673ff" />Nhiệm vụ tuần này</h3>
          <button className="btn sm" onClick={() => setEdit({ due: w.days.includes(now) ? now : w.days[0] })}><Plus size={14} />Thêm việc</button>
        </header>
        {weekOpen.slice(0, 5).map((t) => <TaskRow key={t.id} t={t} showDue onEdit={setEdit} />)}
        {!weekOpen.length && <Empty>{w.due.length ? 'Đã xong hết việc tuần này.' : 'Chưa có nhiệm vụ nào trong tuần.'}</Empty>}
        <footer className="foot"><button className="link" onClick={() => s.go('tasks')}>Xem tất cả {weekOpen.length} việc còn lại<ArrowRight size={14} /></button></footer>
      </section>

      <section className="card c6">
        <header><h3><Flag size={21} color="#1673ff" />Mốc đang theo đuổi</h3><button className="link" onClick={() => s.go('goals')}>Xem tất cả<ArrowRight size={14} /></button></header>
        {open.slice(0, 5).map((m) => {
          const t = s.tracks.find((k) => k.id === m.track_id);
          return (
            <div key={m.id} className="row">
              <input type="checkbox" checked={false} onChange={() => s.exec('UPDATE milestones SET done = 1, done_at = ? WHERE id = ?', [now, m.id])} />
              <span className="title">{m.title}</span>{t && <Tag label={t.name} color={t.color} />}
            </div>
          );
        })}
        {!open.length && <Empty>Thêm mốc cho từng nhánh ở trang Mục tiêu.</Empty>}
      </section>

      {edit && <TaskModal task={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
