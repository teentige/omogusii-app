import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '..', 'data');
export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'omogusii.db');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',
  member_id     INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  position   INTEGER NOT NULL,
  joined_at  TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  notes      TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rounds (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  n            INTEGER NOT NULL UNIQUE,
  due_date     TEXT NOT NULL,
  recipient_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  disbursed_at TEXT,
  note         TEXT,
  created_at   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contributions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id   INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount     REAL NOT NULL DEFAULT 0,
  currency   TEXT NOT NULL DEFAULT 'QAR',
  method     TEXT,
  ref        TEXT,
  paid_at    TEXT,
  note       TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(round_id, member_id)
);
CREATE TABLE IF NOT EXISTS loans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id     INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  principal     REAL NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'KES',
  interest_rate REAL NOT NULL DEFAULT 0,
  issued_at     TEXT NOT NULL,
  due_at        TEXT,
  term_months   INTEGER,
  purpose       TEXT,
  status        TEXT NOT NULL DEFAULT 'open',
  note          TEXT,
  created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS loan_repayments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id    INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount     REAL NOT NULL,
  paid_at    TEXT NOT NULL,
  ref        TEXT,
  note       TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id     INTEGER REFERENCES members(id) ON DELETE CASCADE,
  round_id      INTEGER REFERENCES rounds(id) ON DELETE SET NULL,
  loan_id       INTEGER REFERENCES loans(id) ON DELETE SET NULL,
  type          TEXT NOT NULL,
  channel       TEXT NOT NULL DEFAULT 'whatsapp',
  message       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  scheduled_for TEXT,
  sent_at       TEXT,
  created_by    TEXT,
  created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL,
  type    TEXT NOT NULL,
  text    TEXT NOT NULL,
  actor   TEXT,
  meta    TEXT
);
CREATE INDEX IF NOT EXISTS idx_contrib_round ON contributions(round_id);
CREATE INDEX IF NOT EXISTS idx_contrib_member ON contributions(member_id);
`);

/* ── settings ─────────────────────────────────────────────────────── */
const DEFAULTS = {
  name: 'Omogusii Merry-Go-Round',
  tagline: 'Doha · monthly chama',
  currency: 'QAR',
  secondaryCurrency: 'KES',
  fx: 35.6,                 // KES per 1 QAR (editable)
  contribution: 200,
  frequency: 'monthly',
  startDate: '2026-08-05',
  method: 'Bank transfer / M-Pesa',
  account: 'QAR acc 0021-4471 · Paybill 4098771',
  reminderDays: 3,
};

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULTS };
  for (const r of rows) {
    let v = r.value;
    try { v = JSON.parse(r.value); } catch { /* plain string */ }
    out[r.key] = v;
  }
  return out;
}
export function setSettings(patch) {
  const tx = db.transaction((p) => {
    for (const [k, v] of Object.entries(p)) setSettingStmt.run(k, JSON.stringify(v));
  });
  tx(patch);
  return getSettings();
}

/* ── helpers ──────────────────────────────────────────────────────── */
export const now = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);
export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function addPeriod(isoDate, n, frequency = getSettings().frequency) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (frequency === 'weekly') dt.setDate(dt.getDate() + 7 * n);
  else if (frequency === 'biweekly') dt.setDate(dt.getDate() + 14 * n);
  else if (frequency === 'quarterly') dt.setMonth(dt.getMonth() + 3 * n);
  else dt.setMonth(dt.getMonth() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/** Convert an amount into the group currency. */
export function toGroup(amount, currency, settings = getSettings()) {
  const a = Number(amount) || 0;
  if (!currency || currency === settings.currency) return a;
  if (currency === settings.secondaryCurrency) return a / (Number(settings.fx) || 1);
  return a;
}
export function fromGroup(amount, currency, settings = getSettings()) {
  const a = Number(amount) || 0;
  if (!currency || currency === settings.currency) return a;
  if (currency === settings.secondaryCurrency) return a * (Number(settings.fx) || 1);
  return a;
}

export function logActivity(type, text, actor = null, meta = null) {
  db.prepare('INSERT INTO activity (ts, type, text, actor, meta) VALUES (?,?,?,?,?)')
    .run(now(), type, text, actor, meta ? JSON.stringify(meta) : null);
}

/* ── round synchronisation ────────────────────────────────────────── */
/**
 * Keeps one round per member, in member order.
 * Only undistributed rounds are re-dated / re-assigned, so history stays intact.
 */
export function syncRounds(settings = getSettings()) {
  const members = db.prepare('SELECT * FROM members WHERE active = 1 ORDER BY position, id').all();
  const rounds = db.prepare('SELECT * FROM rounds ORDER BY n').all();

  // grow
  for (let i = rounds.length; i < members.length; i++) {
    db.prepare('INSERT INTO rounds (n, due_date, recipient_id, created_at) VALUES (?,?,?,?)')
      .run(i + 1, addPeriod(settings.startDate, i, settings.frequency), members[i] ? members[i].id : null, now());
  }
  // shrink from the tail, but never a round with money or a payout on it
  let list = db.prepare('SELECT * FROM rounds ORDER BY n').all();
  while (list.length > members.length) {
    const last = list[list.length - 1];
    const money = db.prepare('SELECT COUNT(*) c FROM contributions WHERE round_id = ? AND amount > 0').get(last.id).c;
    if (money > 0 || last.disbursed_at) break;
    db.prepare('DELETE FROM rounds WHERE id = ?').run(last.id);
    list = db.prepare('SELECT * FROM rounds ORDER BY n').all();
  }

  // re-number, re-date and re-assign open rounds
  list = db.prepare('SELECT * FROM rounds ORDER BY n').all();
  const upd = db.prepare('UPDATE rounds SET n = ?, due_date = ?, recipient_id = ? WHERE id = ?');
  const tx = db.transaction((rows) => {
    rows.forEach((r, i) => {
      const open = !r.disbursed_at;
      upd.run(
        i + 1,
        open ? addPeriod(settings.startDate, i, settings.frequency) : r.due_date,
        open ? (members[i] ? members[i].id : null) : r.recipient_id,
        r.id
      );
    });
  });
  tx(list);
  return db.prepare('SELECT * FROM rounds ORDER BY n').all();
}

/* ── derived numbers ──────────────────────────────────────────────── */
export function roundProgress(round, settings = getSettings()) {
  const members = db.prepare('SELECT * FROM members WHERE active = 1 ORDER BY position, id').all();
  const rows = db.prepare('SELECT * FROM contributions WHERE round_id = ?').all(round.id);
  const byMember = new Map(rows.map((r) => [r.member_id, r]));
  const expectedEach = Number(settings.contribution) || 0;
  let collected = 0;
  const lines = members.map((m) => {
    const c = byMember.get(m.id);
    const amount = toGroup(c ? c.amount : 0, c ? c.currency : settings.currency, settings);
    collected += amount;
    return {
      member: m,
      contribution: c || null,
      amount,
      expected: expectedEach,
      status: amount <= 0 ? 'unpaid' : amount >= expectedEach ? 'paid' : 'partial',
    };
  });
  const expectedTotal = expectedEach * members.length;
  return {
    ...round,
    lines,
    collected: r2(collected),
    expected: r2(expectedTotal),
    outstanding: r2(Math.max(0, expectedTotal - collected)),
    paidCount: lines.filter((l) => l.status === 'paid').length,
    partialCount: lines.filter((l) => l.status === 'partial').length,
    unpaidCount: lines.filter((l) => l.status === 'unpaid').length,
  };
}

export function activeRound(settings = getSettings()) {
  const rows = db.prepare('SELECT * FROM rounds ORDER BY n').all();
  return rows.find((r) => !r.disbursed_at) || rows[rows.length - 1] || null;
}
