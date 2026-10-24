import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, monday, today, type Data, type Frame, type FrameLog, type Slip, type Metric, type MetricLog, type Milestone, type Review, type Task, type Track } from './lib';

export type Page = 'home' | 'metrics' | 'frames' | 'goals' | 'tasks' | 'calendar' | 'stats' | 'review' | 'settings';
type Ctx = Data & {
  page: Page; go(p: Page): void;
  anchor: string; setAnchor(s: string): void; // any date inside the week being viewed
  exec(sql: string, params?: unknown[]): Promise<number>;
  setSetting(key: string, value: string): Promise<void>;
  reload(): Promise<void>;
  toast(msg: string, undo?: () => void): void;
};

const C = createContext<Ctx>(null!);
export const useStore = () => useContext(C);

const initialPage = () => (location.hash.replace(/^#\/?/, '') || 'home') as Page;

export function Store({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [page, go] = useState<Page>(initialPage);
  const [anchor, setAnchor] = useState(today());
  const [day, setDay] = useState(today());
  const [msg, setMsg] = useState('');
  const [undo, setUndo] = useState<(() => void) | null>(null);
  const timer = useRef(0);

  const reload = useCallback(async () => {
    const [s, tracks, tasks, milestones, reviews, metrics, logs, slips, frames, flogs] = await Promise.all([
      api.all<{ key: string; value: string }>('SELECT * FROM settings'),
      api.all<Track>('SELECT * FROM tracks ORDER BY id'),
      api.all<Task>('SELECT * FROM tasks ORDER BY due, priority DESC, t_start IS NULL, t_start, id'),
      api.all<Milestone>('SELECT * FROM milestones ORDER BY done, id'),
      api.all<Review>('SELECT * FROM reviews'),
      api.all<Metric>('SELECT * FROM metrics ORDER BY id'),
      api.all<MetricLog>('SELECT * FROM metric_logs ORDER BY date, id'),
      api.all<Slip>('SELECT * FROM slips ORDER BY date, id'),
      api.all<Frame>('SELECT * FROM frames ORDER BY id'),
      api.all<FrameLog>('SELECT * FROM frame_logs ORDER BY date, id'),
    ]);
    setData({ settings: Object.fromEntries(s.map((r) => [r.key, r.value])), tracks, tasks, milestones, reviews, metrics, logs, slips, frames, flogs });
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // The app can stay open past midnight: when the date changes, re-render so "today" is right, and if the user was
  // looking at the week that just ended, move to the new current week.
  useEffect(() => {
    const check = () => {
      const t = today();
      if (t === day) return;
      setAnchor((a) => (monday(a) === monday(day) ? t : a));
      setDay(t);
    };
    const id = window.setInterval(check, 30000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(id); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [day]);

  const toast = useCallback((m: string, onUndo?: () => void) => {
    setMsg(m);
    setUndo(() => onUndo ?? null);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(''), onUndo ? 5000 : 2600);
  }, []);
  const exec = useCallback(async (sql: string, params: unknown[] = []) => {
    const id = await api.run(sql, params);
    await reload();
    return id;
  }, [reload]);
  const setSetting = useCallback(async (key: string, value: string) => {
    await exec('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  }, [exec]);

  if (!data) return null;
  return (
    <C.Provider value={{ ...data, page, go, anchor, setAnchor, exec, setSetting, reload, toast }}>
      {children}
      {msg && (
        <div className="toast">
          {msg}
          {undo && <button onClick={() => { undo(); setMsg(''); }}>Hoàn tác</button>}
        </div>
      )}
    </C.Provider>
  );
}
