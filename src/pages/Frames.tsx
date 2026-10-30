import { useState, type ReactNode } from 'react';
import { ArrowRight, Bell, Check, Droplet, Footprints, HeartPulse, Minus, Moon, MoreHorizontal, Pill, Plus, Sparkles, Utensils, WandSparkles } from 'lucide-react';
import {
  WDS, addDays, adherence, api, appliesOn, dayLogs, dayTotal, doses, fmtN, keepRate, kept, lines, pct, today, weekDays,
  type Frame, type FrameMode,
} from '../lib';
import { useStore } from '../store';
import { Bar, Empty, Field, Head, IconTile, Masonry, Modal, Trend, useForm, wow } from '../ui';

// group → colour and icon
const GROUPS: Record<string, [string, typeof Droplet]> = {
  'Ăn uống': ['#079455', Utensils], 'Nước': ['#386ff1', Droplet], 'Supplement': ['#7a5af8', Pill],
  'Vận động': ['#e04f16', Footprints], 'Giấc ngủ': ['#475467', Moon], 'Khác': ['#0e9384', Sparkles],
};
export const groupOf = (f: Frame) => GROUPS[f.grp] ?? GROUPS['Khác'];

// mode → label, explanation, chip colours
const MODES: Record<FrameMode, [string, string, string, string]> = {
  remind: ['Chỉ nhắc', 'Không nhập gì. App hiện chuẩn và nhắc đúng giờ.', '#f2f4f7', '#475467'],
  daily: ['Tick mỗi ngày', 'Một chạm mỗi ngày: hôm nay có giữ khung không.', '#ecfdf3', '#067647'],
  doses: ['Tick theo giờ', 'Mỗi dòng một lần có giờ (VD: 07:30 Vitamin D3), tick từng lần.', '#f4f3ff', '#5925dc'],
  count: ['Đếm theo ngày', 'Cộng dần trong ngày tới mục tiêu, về 0 mỗi sáng.', '#eef4ff', '#2f5fd8'],
  schedule: ['Theo lịch', 'Chọn ngày trong tuần, tick khi làm. Chỉ đo tỉ lệ tuân thủ lịch.', '#fff4ed', '#b93815'],
};

const dayNames = (days: string) => [...days].sort().map((d) => WDS[+d - 1]).join(' · ');
export const stepsOf = (f: Frame) => {
  const xs = (f.steps ?? '').split(/[;\s]+/).map((x) => +x.replace(',', '.')).filter((x) => x > 0);
  return xs.length ? xs : [1];
};
const timesOf = (f: Frame) => (f.times ?? '').split(',').map((t) => t.trim()).filter(Boolean).sort();
/** The next reminder time today, else the first one tomorrow. */
const nextTime = (f: Frame) => {
  const hm = new Date().toTimeString().slice(0, 5);
  const ts = f.mode === 'doses' ? doses(f).map((d) => d.time).filter(Boolean).sort() : timesOf(f);
  return ts.find((t) => t > hm) ?? ts[0] ?? null;
};

export function useFrameActions() {
  const s = useStore();
  return {
    toggle: (f: Frame, date: string, item = 0) => (dayLogs(f, s.flogs, date).some((l) => l.item === item)
      ? s.exec('DELETE FROM frame_logs WHERE frame_id = ? AND date = ? AND item = ?', [f.id, date, item])
      : s.exec('INSERT INTO frame_logs(frame_id, date, item, value) VALUES(?,?,?,1)', [f.id, date, item])),
    // one running total per day; never below zero
    add: (f: Frame, date: string, v: number) => s.exec(
      'INSERT INTO frame_logs(frame_id, date, item, value) VALUES(?,?,0,MAX(0,?)) ON CONFLICT(frame_id, date, item) DO UPDATE SET value = MAX(0, value + ?)',
      [f.id, date, v, v]),
  };
}

function Rules({ f, color }: { f: Frame; color: string }) {
  const xs = lines(f.rules);
  if (!xs.length) return null;
  return <ul className="fr-rules">{xs.map((r) => <li key={r}><i style={{ background: color }} />{r}</li>)}</ul>;
}

/** Last 7 days: kept, missed, or nothing asked. */
function Last7({ f, color }: { f: Frame; color: string }) {
  const s = useStore();
  const now = today();
  const days = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6));
  return (
    <span className="fr-last7" aria-label="7 ngày qua">
      {days.map((d) => {
        const k = kept(f, s.flogs, d);
        return <i key={d} className={k ? 'ok' : k === false && d < now ? 'miss' : 'na'} style={k ? { background: color } : undefined} title={d.slice(8) + '/' + d.slice(5, 7)} />;
      })}
    </span>
  );
}

function FrameCard({ f, onEdit }: { f: Frame; onEdit(): void }) {
  const s = useStore();
  const a = useFrameActions();
  const now = today();
  const [color, Icon] = groupOf(f);
  const [label, , bg, fg] = MODES[f.mode];
  const on = appliesOn(f, now);
  const next = nextTime(f);
  let sub = '';
  let body: ReactNode;

  if (f.mode === 'count') {
    const v = dayTotal(f, s.flogs, now), t = f.target || 0, p = pct(v, t);
    sub = `${fmtN(t)} ${f.unit ?? ''} mỗi ngày`;
    body = on ? (
      <>
        <div className="fr-big"><b>{fmtN(v)}</b><span>/ {fmtN(t)} {f.unit}</span><em style={{ color }}>{p}%</em></div>
        <Bar value={p} color={color} />
        <div className="fr-actions">
          {stepsOf(f).map((x) => <button key={x} className="btn" onClick={() => a.add(f, now, x)}>+ {fmtN(x)} {f.unit}</button>)}
          <button className="icon-btn" title="Bớt một lần" aria-label="Bớt một lần" onClick={() => a.add(f, now, -stepsOf(f)[0])}><Minus size={16} /></button>
        </div>
        <Rules f={f} color={color} />
      </>
    ) : <><Empty>Hôm nay không áp dụng khung này.</Empty><Rules f={f} color={color} /></>;
  } else if (f.mode === 'daily') {
    sub = `${lines(f.rules).length} chuẩn`;
    body = (
      <>
        <Rules f={f} color={color} />
        <footer className="fr-foot">
          {on ? <label className="fr-check"><input type="checkbox" checked={!!kept(f, s.flogs, now)} onChange={() => a.toggle(f, now)} />Hôm nay giữ đúng khung</label>
            : <span className="meta">Hôm nay nghỉ</span>}
          <Last7 f={f} color={color} />
        </footer>
      </>
    );
  } else if (f.mode === 'doses') {
    const ds = doses(f), logs = dayLogs(f, s.flogs, now);
    sub = on ? `${logs.length}/${ds.length} lần hôm nay` : 'Hôm nay nghỉ';
    body = (
      <div className="fr-doses">
        {ds.map((d, i) => (
          <label key={i} className="fr-dose">
            <input type="checkbox" disabled={!on} checked={logs.some((l) => l.item === i)} onChange={() => a.toggle(f, now, i)} />
            <b>{d.time || '—'}</b><span>{d.name}</span>
          </label>
        ))}
      </div>
    );
  } else if (f.mode === 'schedule') {
    const week = weekDays(now), ad = adherence(f, s.flogs);
    sub = `Lịch: ${dayNames(f.days)}`;
    body = (
      <>
        <div className="fr-week7">
          {week.map((d, i) => {
            const planned = appliesOn(f, d), done = dayLogs(f, s.flogs, d).length > 0;
            const cls = ['fr-slot', planned && 'planned', done && 'done', planned && !done && d < now && 'miss', d === now && 'today'].filter(Boolean).join(' ');
            return (
              <button key={d} className={cls} disabled={d > now} onClick={() => a.toggle(f, d)}
                style={done ? { background: color, borderColor: color } : planned ? { borderColor: color } : undefined}
                title={planned ? 'Có lịch' : 'Ngoài lịch'}>
                <small>{WDS[i]}</small>{done ? <Check size={15} /> : planned ? <span className="fr-planned" /> : null}
              </button>
            );
          })}
        </div>
        <p className="fr-adh">
          {ad.rate == null ? 'Chưa có buổi nào tới lịch trong 4 tuần qua.'
            : <>Tuân thủ 4 tuần: <b>{ad.rate}%</b> · {ad.done}/{ad.asked} buổi theo lịch{ad.extra ? ` · ${ad.extra} buổi ngoài lịch` : ''}</>}
        </p>
        <Rules f={f} color={color} />
      </>
    );
  } else {
    sub = 'Không cần nhập gì';
    body = (
      <>
        <Rules f={f} color={color} />
        {next && <div className="fr-next"><Bell size={15} />Lời nhắc tiếp theo: {next}</div>}
      </>
    );
  }

  return (
    <section className="card fr-card">
      <header>
        <IconTile color={color}><Icon size={20} /></IconTile>
        <span className="fr-title"><b>{f.name}</b><small>{sub}</small></span>
        <span className="fr-chip" style={{ background: bg, color: fg }}>{label}</span>
        <button className="icon-btn" title="Sửa khung" aria-label="Sửa khung" onClick={onEdit}><MoreHorizontal size={17} /></button>
      </header>
      {body}
      {f.mode !== 'remind' && f.mode !== 'doses' && timesOf(f).length > 0 && <small className="fr-times"><Bell size={13} />Nhắc {timesOf(f).join(' · ')} nếu chưa giữ khung</small>}
    </section>
  );
}

export function FrameModal({ frame, onClose }: { frame: Partial<Frame>; onClose(): void }) {
  const s = useStore();
  const { f, setF, bind } = useForm({
    name: frame.name ?? '', grp: frame.grp ?? 'Ăn uống', rules: frame.rules ?? '', mode: frame.mode ?? 'daily',
    unit: frame.unit ?? '', target: frame.target == null ? '' : String(frame.target), steps: frame.steps ?? '',
    times: frame.times ?? '', days: frame.days ?? '1234567',
  });
  const mode = f.mode as FrameMode;
  const flipDay = (d: string) => setF((p) => ({ ...p, days: p.days.includes(d) ? p.days.replace(d, '') : [...p.days + d].sort().join('') }));
  const save = async () => {
    if (!f.name.trim()) return s.toast('Hãy đặt tên cho khung.');
    if (!f.days) return s.toast('Chọn ít nhất một ngày.');
    if (mode === 'count' && !(+f.target > 0)) return s.toast('Đặt mục tiêu mỗi ngày lớn hơn 0.');
    if (mode === 'doses' && !doses({ rules: f.rules } as Frame).some((d) => d.time)) return s.toast('Mỗi lần uống cần có giờ, VD: 07:30 Vitamin D3.');
    const times = mode === 'doses' ? [] : f.times.split(/[,;\s]+/).filter(Boolean).map((t) => t.padStart(5, '0'));
    if (times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) return s.toast('Giờ nhắc viết dạng 09:00, 14:30.');
    const v = [f.name.trim(), f.grp, f.rules.trim() || null, mode, f.unit.trim() || null, f.target === '' ? null : +f.target,
      f.steps.trim() || null, times.join(',') || null, f.days];
    if (frame.id) await s.exec('UPDATE frames SET name=?, grp=?, rules=?, mode=?, unit=?, target=?, steps=?, times=?, days=? WHERE id=?', [...v, frame.id]);
    else await s.exec('INSERT INTO frames(name, grp, rules, mode, unit, target, steps, times, days, since) VALUES(?,?,?,?,?,?,?,?,?,?)', [...v, today()]);
    onClose();
  };
  const del = frame.id ? async () => {
    await s.exec('DELETE FROM frame_logs WHERE frame_id = ?', [frame.id]);
    await s.exec('DELETE FROM frames WHERE id = ?', [frame.id]);
    onClose();
  } : undefined;
  return (
    <Modal title={frame.id ? 'Sửa khung' : 'Tạo khung'} onClose={onClose} onSave={save} onDelete={del}>
      <Field label="Tên khung" wide><input autoFocus {...bind('name')} placeholder="VD: Uống nước, Chạy bộ, Cầu lông" /></Field>
      <div className="field wide">
        <span>Nhóm</span>
        <div className="picks">
          {Object.entries(GROUPS).map(([g, [c, I]]) => (
            <button type="button" key={g} className={f.grp === g ? 'pick on' : 'pick'} onClick={() => setF({ ...f, grp: g })}><I size={15} color={c} />{g}</button>
          ))}
        </div>
      </div>
      <div className="field wide">
        <span>Theo dõi thế nào</span>
        <div className="fr-modes">
          {(Object.keys(MODES) as FrameMode[]).map((m) => (
            <label key={m} className={mode === m ? 'fr-mode on' : 'fr-mode'}>
              <input type="radio" name="frame-mode" checked={mode === m} onChange={() => setF({ ...f, mode: m })} />
              <span><b>{MODES[m][0]}</b><small>{MODES[m][1]}</small></span>
            </label>
          ))}
        </div>
      </div>
      <Field label={mode === 'doses' ? 'Các lần (mỗi dòng: giờ và tên)' : 'Chuẩn của khung (mỗi dòng một chuẩn)'} wide>
        <textarea rows={4} {...bind('rules')} placeholder={mode === 'doses' ? '07:30 Vitamin D3\n21:30 Magie' : 'VD: 3 bữa chính, không bỏ bữa sáng'} />
      </Field>
      {mode === 'count' && (
        <>
          <Field label="Mục tiêu mỗi ngày"><input type="number" step="any" min="0" {...bind('target')} /></Field>
          <Field label="Đơn vị"><input {...bind('unit')} placeholder="L, ly, phút…" /></Field>
          <Field label="Nút cộng nhanh" wide><input {...bind('steps')} placeholder="Cách nhau bằng dấu cách, VD: 0.25 0.5" /></Field>
        </>
      )}
      {mode !== 'doses' && <Field label="Nhắc lúc" wide><input {...bind('times')} placeholder="VD: 09:00, 14:00, 19:00" /></Field>}
      <div className="field wide">
        <span>{mode === 'schedule' ? 'Ngày theo lịch' : 'Áp dụng các ngày'}</span>
        <div className="fr-days">
          {WDS.map((w, i) => {
            const d = String(i + 1);
            return <button type="button" key={w} className={f.days.includes(d) ? 'on' : ''} aria-pressed={f.days.includes(d)} onClick={() => flipDay(d)}>{w}</button>;
          })}
        </div>
      </div>
      <small className="hint wide">
        {mode === 'remind' ? 'Khung chỉ nhắc luôn báo đúng giờ, không cần nhập gì.'
          : mode === 'doses' ? 'Mỗi lần tự nhắc đúng giờ của nó cho tới khi được tick.'
            : 'Lời nhắc chỉ bật khi hôm nay chưa giữ khung.'}
      </small>
    </Modal>
  );
}

/** Kept share of one day, as a heat level for the week strip. */
const level = (rate: number | null) => (rate == null ? 'na' : rate >= 100 ? 'l4' : rate >= 67 ? 'l3' : rate >= 34 ? 'l2' : rate > 0 ? 'l1' : 'l0');

export function FramesPage() {
  const s = useStore();
  const [edit, setEdit] = useState<Partial<Frame> | null>(null);
  const now = today();
  const week = weekDays(now);
  const asked = s.frames.map((f) => kept(f, s.flogs, now)).filter((k) => k != null);
  const wk = keepRate(s.frames, s.flogs, week);
  return (
    <div className="stack">
      <section className="card fr-summary">
        <div className="fr-stat"><small>Hôm nay giữ khung</small><b>{asked.filter(Boolean).length}<span>/{asked.length}</span></b></div>
        <div className="fr-strip">
          {week.map((d, i) => (
            <div key={d} className={d === now ? 'today' : ''}>
              <small>{WDS[i]}</small>
              <i className={d > now ? 'future' : level(keepRate(s.frames, s.flogs, [d]).rate)} />
            </div>
          ))}
        </div>
        <div className="fr-stat"><small>Tuần này</small><b>{wk.rate == null ? '–' : `${wk.rate}%`}</b></div>
        <button className="btn primary" onClick={() => setEdit({})}><Plus size={15} />Thêm khung</button>
      </section>
      {s.frames.length ? (
        <Masonry>{s.frames.map((f) => <FrameCard key={f.id} f={f} onEdit={() => setEdit(f)} />)}</Masonry>
      ) : (
        <section className="card fr-empty">
          <HeartPulse size={28} color="#386ff1" />
          <b>Chưa có khung sống nào</b>
          <p>Khung là chuẩn sống bạn muốn giữ: ăn uống, nước, supplement, vận động, giấc ngủ. Không cần nhập liệu nặng, app nhắc đúng lúc.</p>
          <div className="fr-actions">
            <button className="btn primary" onClick={async () => { await api.addFramePreset(); await s.reload(); }}><WandSparkles size={15} />Dùng bộ khung gợi ý</button>
            <button className="btn" onClick={() => setEdit({})}><Plus size={15} />Tự tạo khung</button>
          </div>
        </section>
      )}
      {edit && <FrameModal frame={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** One compact line per frame, with today's one-tap action. */
function FrameRow({ f }: { f: Frame }) {
  const s = useStore();
  const a = useFrameActions();
  const now = today();
  const [color, Icon] = groupOf(f);
  const on = appliesOn(f, now);
  let mid: ReactNode, end: ReactNode = null;
  if (f.mode === 'count' && on) {
    const v = dayTotal(f, s.flogs, now), t = f.target || 0, step = stepsOf(f)[0];
    mid = <><Bar value={pct(v, t)} color={color} /><span className="meta">{fmtN(v)}/{fmtN(t)} {f.unit}</span></>;
    end = <button className="btn sm" onClick={() => a.add(f, now, step)}>+ {fmtN(step)} {f.unit}</button>;
  } else if (f.mode === 'doses' && on) {
    const ds = doses(f), logs = dayLogs(f, s.flogs, now);
    const left = ds.findIndex((_, i) => !logs.some((l) => l.item === i));
    mid = <span className="fr-sum">{left < 0 ? 'Đã đủ hôm nay' : `Tiếp theo: ${ds[left].name}${ds[left].time ? ` lúc ${ds[left].time}` : ''}`}</span>;
    end = left < 0 ? <b className="meta">{ds.length}/{ds.length}</b>
      : <label className="fr-check"><input type="checkbox" checked={false} onChange={() => a.toggle(f, now, left)} />Đã uống</label>;
  } else if (f.mode === 'daily' && on) {
    mid = <span className="fr-sum">{lines(f.rules).slice(0, 3).join(' · ')}</span>;
    end = <label className="fr-check"><input type="checkbox" checked={!!kept(f, s.flogs, now)} onChange={() => a.toggle(f, now)} />Đã giữ</label>;
  } else if (f.mode === 'schedule') {
    const ad = adherence(f, s.flogs);
    mid = <span className="fr-sum">{on ? 'Hôm nay có lịch' : `Lịch: ${dayNames(f.days)}`}{ad.rate != null && ` · tuân thủ ${ad.rate}%`}</span>;
    end = <label className="fr-check"><input type="checkbox" checked={dayLogs(f, s.flogs, now).length > 0} onChange={() => a.toggle(f, now)} />{on ? 'Đã làm' : 'Làm ngoài lịch'}</label>;
  } else {
    const next = nextTime(f);
    mid = <span className="fr-sum">{lines(f.rules).slice(0, 2).join(' · ')}</span>;
    end = f.mode === 'remind' ? next && <span className="fr-chip">Nhắc {next}</span> : <span className="meta">Hôm nay nghỉ</span>;
  }
  return (
    <div className="fr-row">
      <IconTile color={color} size="round"><Icon size={18} /></IconTile>
      <b className="fr-name">{f.name}</b>
      <div className="fr-mid">{mid}</div>
      {end}
    </div>
  );
}

export function FramesCard() {
  const s = useStore();
  const asked = s.frames.map((f) => kept(f, s.flogs, today())).filter((k) => k != null);
  return (
    <section className="card c12">
      <header>
        <h3><HeartPulse size={21} color="#1673ff" />Khung sống</h3>
        {asked.length > 0 && <span className="fr-headcount"><b>{asked.filter(Boolean).length}/{asked.length}</b> đang giữ hôm nay</span>}
        <button className="link" onClick={() => s.go('frames')}>Xem tất cả<ArrowRight size={14} /></button>
      </header>
      {s.frames.map((f) => <FrameRow key={f.id} f={f} />)}
      {!s.frames.length && <Empty>Đặt khung cho ăn uống, nước, supplement, vận động… ở trang Khung sống.</Empty>}
    </section>
  );
}

/** Weekly review: which frames were kept on which day. Reminder-only frames ask nothing, so they are left out. */
export function FramesWeek({ anchor }: { anchor: string }) {
  const s = useStore();
  const tracked = s.frames.filter((f) => f.mode !== 'remind');
  if (!tracked.length) return null;
  const now = today();
  const days = weekDays(anchor);
  const cur = keepRate(tracked, s.flogs, days), last = keepRate(tracked, s.flogs, weekDays(addDays(anchor, -7)));
  return (
    <section className="card">
      <Head icon={<HeartPulse size={22} />} color="#386ff1" title="Khung sống tuần này">
        <span className="disc-rate">
          <span><b>{cur.rate == null ? '–' : `${cur.rate}%`}</b>giữ khung</span>
          <Trend pct={cur.rate != null && last.rate != null ? wow(cur.rate, last.rate) : null} />
        </span>
      </Head>
      <div className="fr-table">
        <div className="fr-trow head"><span />{WDS.map((w) => <small key={w}>{w}</small>)}<small>Tỉ lệ</small></div>
        {tracked.map((f) => {
          const [color, Icon] = groupOf(f);
          const r = keepRate([f], s.flogs, days);
          return (
            <div key={f.id} className="fr-trow">
              <span className="fr-tname"><Icon size={16} color={color} />{f.name}</span>
              {days.map((d) => {
                const k = d > now ? undefined : kept(f, s.flogs, d);
                const cls = k === undefined ? 'future' : k ? 'ok' : k === false && d < now ? 'miss' : 'na';
                return <i key={d} className={cls} style={k ? { background: color } : undefined} />;
              })}
              <b>{r.rate == null ? '–' : `${r.rate}%`}</b>
            </div>
          );
        })}
      </div>
    </section>
  );
}
