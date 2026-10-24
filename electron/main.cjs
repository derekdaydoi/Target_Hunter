const { app, BrowserWindow, Menu, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const TABLES = ['settings', 'tracks', 'milestones', 'tasks', 'reviews', 'metrics', 'metric_logs', 'slips'];
const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS tracks(id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT, done INTEGER DEFAULT 0, done_at TEXT);
CREATE TABLE IF NOT EXISTS milestones(id INTEGER PRIMARY KEY, track_id INTEGER NOT NULL, title TEXT NOT NULL, done INTEGER DEFAULT 0, done_at TEXT);
CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY, title TEXT NOT NULL, category TEXT, track_id INTEGER, due TEXT, est REAL DEFAULT 0, done INTEGER DEFAULT 0, done_at TEXT, priority INTEGER DEFAULT 0, t_start TEXT, t_end TEXT);
CREATE TABLE IF NOT EXISTS slips(id INTEGER PRIMARY KEY, task_id INTEGER, title TEXT, date TEXT, from_due TEXT, to_due TEXT, deadline TEXT);
CREATE TABLE IF NOT EXISTS reviews(week TEXT PRIMARY KEY, rating TEXT, wins TEXT, blockers TEXT, focus TEXT);
CREATE TABLE IF NOT EXISTS metrics(id INTEGER PRIMARY KEY, name TEXT NOT NULL, unit TEXT, start REAL DEFAULT 0, target REAL);
CREATE TABLE IF NOT EXISTS metric_logs(id INTEGER PRIMARY KEY, metric_id INTEGER NOT NULL, date TEXT NOT NULL, value REAL NOT NULL, UNIQUE(metric_id, date));
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due);`;

let db, win, saveTimer;
const dbPath = () => path.join(app.getPath('userData'), 'derekos.sqlite');

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// ---------- database (SQLite via sql.js, persisted as a real .sqlite file) ----------
function flush() {
  if (!db) return;
  clearTimeout(saveTimer);
  const tmp = dbPath() + '.tmp';
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  fs.renameSync(tmp, dbPath());
}
const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 200); };

function all(sql, params = []) {
  const st = db.prepare(sql);
  st.bind(params);
  const rows = [];
  while (st.step()) rows.push(st.getAsObject());
  st.free();
  return rows;
}
function run(sql, params = []) {
  db.run(sql, params);
  const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  scheduleSave();
  return id;
}
function insert(table, row) {
  const keys = Object.keys(row);
  db.run(`INSERT INTO ${table}(${keys.map((k) => `"${k}"`).join(',')}) VALUES(${keys.map(() => '?').join(',')})`, keys.map((k) => row[k]));
}

const setSetting = (key, value) => db.run('INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)', [key, String(value)]);

// Sample tracked variables. The income metric feeds the North Star card.
function seedMetrics() {
  const now = new Date();
  const get = (key) => all('SELECT value FROM settings WHERE key = ?', [key])[0]?.value;
  const metric = (name, unit, start, target, logs) => {
    insert('metrics', { name, unit, start, target });
    const metric_id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    logs.forEach(([daysAgo, value]) => insert('metric_logs', { metric_id, date: ymd(shift(now, -daysAgo)), value }));
    return metric_id;
  };
  const income = +get('ns_current') || 0;
  setSetting('ns_metric_id', metric('Thu nhập net/tháng', get('ns_unit') || 'M', income, +get('ns_target') || null, [[0, income]]));
  metric('Cân nặng', 'kg', 72, 66, [[35, 72], [28, 71.6], [21, 71.1], [14, 70.9], [7, 70.2], [0, 69.8]]);
  metric('Giấc ngủ', 'giờ', 6, 7.5, [[9, 6], [8, 6.5], [7, 5.8], [6, 6.4], [5, 7], [4, 6.6], [3, 7.1], [2, 6.8], [1, 7.2], [0, 7]]);
  setSetting('metrics_seeded', 1);
}

/** Same rule as deadlineOf in src/lib.ts: timed tasks are due that day, date-only tasks by the Sunday of their week. */
function deadlineOf(due, start) {
  if (!due || start) return due;
  const d = new Date(due + 'T00:00');
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return ymd(d);
}

function seed(withSamples) {
  const now = new Date();
  const today = ymd(now);
  const mon = shift(now, -((now.getDay() + 6) % 7));
  const d = (n) => ymd(shift(mon, n));
  const settings = {
    name: 'Alex', ns_title: 'Thu nhập 50M net/tháng', ns_current: '20', ns_target: '50', ns_unit: 'M', ns_desc: 'Dữ liệu mẫu: thay bằng mục tiêu của bạn ở nút Chỉnh sửa.',
    ns_target_year: String(now.getFullYear() + 4), quote: 'Mỗi ngày một bước nhỏ.', remind_time: '08:30',
  };
  for (const [key, value] of Object.entries(settings)) insert('settings', { key, value });
  if (!withSamples) return setSetting('metrics_seeded', 1);

  // goal branches are measured by completion: each has milestones to tick off
  [['Kỹ năng chuyên môn', '#12b76a', ['Hoàn thành khoá nền tảng', 'Làm bài tập thực hành', 'Viết bản tổng kết kiến thức']],
   ['Phân tích dữ liệu', '#2e90fa', ['Học truy vấn cơ bản', 'Học hàm nâng cao', 'Dự án nhỏ: phân tích bộ dữ liệu mẫu']],
   ['Lập trình', '#9b6cf6', ['Cú pháp cơ bản', 'Xử lý dữ liệu với thư viện']],
   ['Báo cáo trực quan', '#fdb022', ['Khoá công cụ cơ bản', 'Dashboard hoàn chỉnh']],
   ['Sản phẩm cá nhân', '#f97066', ['Phỏng vấn 5 người dùng', 'Viết 1 trang mô tả ý tưởng']]]
    .forEach(([name, color, steps], i) => {
      insert('tracks', { name, color });
      steps.forEach((title, j) => insert('milestones', { track_id: i + 1, title, done: i < 2 && j === 0 ? 1 : 0, done_at: i < 2 && j === 0 ? today : null }));
    });

  const task = (title, category, track_id, due, est, extra = {}) =>
    insert('tasks', { title, category, track_id, due, est, done: 0, priority: 0, ...extra });
  const done = (due) => ({ done: 1, done_at: due < today ? due : today });
  task('Làm bài tập truy vấn dữ liệu', 'Học tập', 2, today, 1.5, { priority: 1, t_start: '09:00', t_end: '10:30' });
  task('Hoàn thiện dashboard tuần này', 'Dự án', 4, today, 2, { priority: 1, t_start: '10:30', t_end: '12:30' });
  task('Đọc 30 trang sách chuyên ngành', 'Sách', 1, today, 1, { priority: 1, t_start: '13:30', t_end: '14:30' });
  task('Hoàn thành bài học hàm nâng cao', 'Học tập', 2, d(0), 3, done(d(0)));
  task('Viết ghi chú tổng kết tuần', 'Công việc', 1, d(1), 2, done(d(1)));
  task('Chuẩn bị nội dung thuyết trình', 'Công việc', null, d(3), 2);
  task('Đọc 50 trang sách về thiết kế sản phẩm', 'Học tập', 5, d(4), 2);
  task('Tập gym 3 buổi', 'Sức khỏe', null, d(5), 3, { t_start: '19:00', t_end: '20:00' });
  task('Lên kế hoạch quý tới', 'Cá nhân', null, d(6), 1.5);
  // last week, so week-over-week figures have something to compare with
  task('Học bài hàm cơ bản', 'Học tập', 2, d(-6), 1.5, done(d(-6)));
  task('Làm dashboard mẫu', 'Dự án', 4, d(-4), 1, done(d(-4)));
  task('Đọc tài liệu chuyên ngành', 'Sách', 1, d(-2), 1, done(d(-2)));
  task('Tổng hợp ghi chú', 'Công việc', null, d(-1), 1);

  seedMetrics();
}

async function openDb() {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm')) });
  const fresh = !fs.existsSync(dbPath());
  db = fresh ? new SQL.Database() : new SQL.Database(fs.readFileSync(dbPath()));
  db.exec(SCHEMA);
  if (!all('PRAGMA table_info(tracks)').some((c) => c.name === 'done')) { // upgrade from 1.1
    db.exec('ALTER TABLE tracks ADD COLUMN done INTEGER DEFAULT 0; ALTER TABLE tracks ADD COLUMN done_at TEXT');
  }
  for (const [t, c] of [['tasks', 'note'], ['metrics', 'note']]) { // added in 1.3
    if (!all(`PRAGMA table_info(${t})`).some((x) => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} TEXT`);
  }
  if (fresh) seed(true);
  else if (!all("SELECT 1 FROM settings WHERE key = 'metrics_seeded'").length) seedMetrics(); // upgrade from 1.0
  flush();
}

function replaceAll(data) {
  db.exec('BEGIN');
  try {
    for (const t of TABLES) {
      db.run(`DELETE FROM ${t}`);
      const cols = new Set(all(`PRAGMA table_info(${t})`).map((c) => c.name));
      for (const row of Array.isArray(data?.[t]) ? data[t] : []) {
        insert(t, Object.fromEntries(Object.entries(row).filter(([k]) => cols.has(k))));
      }
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  flush();
}

// ---------- IPC ----------
const stamp = () => ymd(new Date());
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function registerIpc() {
  ipcMain.handle('db:all', (_e, sql, params) => all(sql, params));
  ipcMain.handle('db:run', (_e, sql, params) => run(sql, params));

  ipcMain.handle('data:exportJson', async () => {
    const { filePath } = await dialog.showSaveDialog(win, { defaultPath: `derekos-${stamp()}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!filePath) return false;
    fs.writeFileSync(filePath, JSON.stringify(Object.fromEntries(TABLES.map((t) => [t, all(`SELECT * FROM ${t}`)])), null, 2));
    return true;
  });
  ipcMain.handle('data:exportCsv', async () => {
    const { filePath } = await dialog.showSaveDialog(win, { defaultPath: `derekos-tasks-${stamp()}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (!filePath) return false;
    const now = ymd(new Date());
    const rows = all('SELECT t.title, t.category, k.name AS track, t.due, t.t_start, t.est, t.done, t.done_at FROM tasks t LEFT JOIN tracks k ON k.id = t.track_id ORDER BY t.due')
      .map((r) => {
        const deadline = deadlineOf(r.due, r.t_start);
        return { ...r, deadline, status: r.done ? (r.done_at > deadline ? 'late' : 'on_time') : now > deadline ? 'missed' : 'open' };
      });
    const head = ['title', 'category', 'track', 'due', 't_start', 'deadline', 'est', 'done', 'done_at', 'status'];
    // BOM so Excel reads Vietnamese correctly
    fs.writeFileSync(filePath, '\ufeff' + [head.join(','), ...rows.map((r) => head.map((h) => csvCell(r[h])).join(','))].join('\r\n'));
    return true;
  });
  ipcMain.handle('data:importJson', async () => {
    const { filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!filePaths[0]) return false;
    replaceAll(JSON.parse(fs.readFileSync(filePaths[0], 'utf8')));
    return true;
  });
  ipcMain.handle('data:backup', async () => {
    const { filePath } = await dialog.showSaveDialog(win, { defaultPath: `derekos-backup-${stamp()}.sqlite`, filters: [{ name: 'SQLite', extensions: ['sqlite'] }] });
    if (!filePath) return false;
    flush();
    fs.copyFileSync(dbPath(), filePath);
    return true;
  });
  ipcMain.handle('data:reset', () => { replaceAll({}); seed(false); flush(); return true; });
  ipcMain.handle('data:openDir', () => shell.openPath(app.getPath('userData')));

}

// ---------- notification scheduler ----------
function startReminders() {
  let lastMinute = '';
  setInterval(() => {
    const now = new Date();
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (hm === lastMinute || !Notification.isSupported()) return;
    lastMinute = hm;
    const today = ymd(now);
    for (const t of all('SELECT title FROM tasks WHERE due = ? AND done = 0 AND t_start = ?', [today, hm])) {
      new Notification({ title: 'Đến giờ rồi', body: t.title }).show();
    }
    const remind = all("SELECT value FROM settings WHERE key = 'remind_time'")[0]?.value;
    if (remind === hm) {
      const open = all('SELECT title FROM tasks WHERE due = ? AND done = 0 ORDER BY priority DESC LIMIT 3', [today]);
      if (open.length) new Notification({ title: 'Việc quan trọng hôm nay', body: open.map((t) => `• ${t.title}`).join('\n') }).show();
    }
  }, 20000);
}

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 600, show: false, backgroundColor: '#f4f6f9',
    icon: path.join(__dirname, 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#f4f6f9', symbolColor: '#17243b', height: 40 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: process.env.DEREKOS_ROUTE || '' });
  // Dev aid: DEREKOS_SIZE=<w>x<h> sets the content size for layout checks.
  if (process.env.DEREKOS_SIZE) win.setContentSize(...process.env.DEREKOS_SIZE.split('x').map(Number));
  win.once('ready-to-show', () => win.show());
  // Chromium remembers the zoom of earlier versions (which scaled the UI); always render at 100%.
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(1));


  // Dev aid: DEREKOS_SHOT=<png path> captures the window and exits.
  if (process.env.DEREKOS_SHOT) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (process.env.DEREKOS_EVAL) fs.writeFileSync(process.env.DEREKOS_SHOT + '.txt', String(await win.webContents.executeJavaScript(process.env.DEREKOS_EVAL)));
      if (process.env.DEREKOS_SCROLL) await win.webContents.executeJavaScript("document.querySelector('.content').scrollTo(0, 1e6)");
      fs.writeFileSync(process.env.DEREKOS_SHOT, (await win.webContents.capturePage()).toPNG());
      app.quit();
    }, 1500));
  }
}

// The app was renamed DerekOS -> Target Hunter; keep reading the original data folder so nothing is lost.
// Dev aid: DEREKOS_DATA=<dir> runs against a separate data folder.
app.setPath('userData', process.env.DEREKOS_DATA || path.join(app.getPath('appData'), 'DerekOS'));

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.setAppUserModelId('com.derekos.app');
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.on('before-quit', flush);
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    await openDb();
    registerIpc();
    createWindow();
    startReminders();
  });
}
