import { db, getSettings, setSettings, addPeriod, now, logActivity, syncRounds } from './db.js';
import { hash } from './auth.js';

/* Demo data for the Omogusii merry-go-round (10 members, QAR 200 monthly). */

/* Keep the demo fresh: everything is anchored so Round 1 sits two months back
   and Round 3 is always due today, whenever the app is first opened. */
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftDate = (s, days) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d); t.setDate(t.getDate() + days); return isoOf(t); };
const ANCHOR = '2026-08-05';
const anchor = () => { const d = new Date(); d.setMonth(d.getMonth() - 2); return isoOf(d); };
const DELTA = Math.round((new Date(anchor() + 'T00:00:00') - new Date(ANCHOR + 'T00:00:00')) / 86400000);
const D  = (s) => (s ? shiftDate(s, DELTA) : s);                                  // date string
const DT = (s) => { const t = new Date(s); t.setDate(t.getDate() + DELTA); return t.toISOString(); };  // timestamp


const MEMBERS = [
  ['Gabriel',  '+974 3312 4567', 'gabriel.omogusii@gmail.com'],
  ['Isaac',    '+974 5580 1123', 'isaac.omogusii@gmail.com'],
  ['Nehemiah', '+974 7021 8890', 'nehemiah.omogusii@gmail.com'],
  ['Moseti',   '+974 3355 7731', 'moseti.omogusii@gmail.com'],
  ['David',    '+974 6612 3409', 'david.omogusii@gmail.com'],
  ['Godfrey',  '+974 7790 2245', 'godfrey.omogusii@gmail.com'],
  ['Jones',    '+974 5021 6678', 'jones.omogusii@gmail.com'],
  ['Joackim',  '+974 3140 9912', 'joackim.omogusii@gmail.com'],
  ['Dennis',   '+974 6678 4450', 'dennis.omogusii@gmail.com'],
  ['Titus',    '+974 7789 3314', 'titus.omogusii@gmail.com'],
];

// round n → [[memberIndex, amount, paidAt, ref, note?]]
const PAYMENTS = {
  1: [
    [7, 200, '2026-08-01', 'TXN4A78'], [0, 200, '2026-08-02', 'TXN4A71'],
    [1, 200, '2026-08-03', 'TXN4A72'], [2, 200, '2026-08-03', 'TXN4A73'],
    [3, 200, '2026-08-04', 'TXN4A74'], [4, 200, '2026-08-04', 'TXN4A75'],
    [5, 200, '2026-08-05', 'TXN4A76'], [6, 200, '2026-08-05', 'TXN4A77'],
    [8, 200, '2026-08-05', 'TXN4A79'], [9, 200, '2026-08-06', 'TXN4A80', 'Paid a day late'],
  ],
  2: [
    [1, 200, '2026-09-01', 'TXN7B02'], [0, 200, '2026-09-02', 'TXN7B01'],
    [5, 200, '2026-09-03', 'TXN7B06'], [2, 200, '2026-09-04', 'TXN7B03'],
    [7, 200, '2026-09-04', 'TXN7B08'], [3, 200, '2026-09-05', 'TXN7B04'],
    [4, 200, '2026-09-05', 'TXN7B05'], [6, 200, '2026-09-05', 'TXN7B07'],
    [8, 200, '2026-09-05', 'TXN7B09'], [9, 120, '2026-09-06', 'TXN7B10', 'Short 80 — promised with round 3'],
  ],
  3: [
    [0, 200, '2026-10-01', 'TXN9C01'], [1, 200, '2026-10-02', 'TXN9C02'],
    [3, 200, '2026-10-03', 'TXN9C04'], [5, 200, '2026-10-04', 'TXN9C06'],
    [7, 200, '2026-10-04', 'TXN9C08'], [8, 100, '2026-10-04', 'TXN9C09', 'Half — balance before payout'],
    [9, 280, '2026-10-05', 'TXN9C10', 'Includes 80 arrears from round 2'],
  ],
};

const ACTIVITY = [
  ['2026-08-01T09:12:00Z', 'system',   'Omogusii Merry-Go-Round created with 10 members', 'Gabriel'],
  ['2026-08-05T17:40:00Z', 'payment',  'Round 1 fully collected — QAR 2,000 in the pot', 'Gabriel'],
  ['2026-08-06T10:05:00Z', 'payout',   'Round 1 pot of QAR 2,000 handed to Gabriel', 'Gabriel'],
  ['2026-09-05T18:20:00Z', 'payment',  'Round 2 closed at QAR 1,920 — Titus short 80', 'Gabriel'],
  ['2026-09-06T11:00:00Z', 'payout',   'Round 2 pot of QAR 2,000 handed to Isaac', 'Gabriel'],
  ['2026-09-06T11:04:00Z', 'reminder', 'Overdue nudge sent to Titus (WhatsApp)', 'Gabriel'],
  ['2026-09-10T08:30:00Z', 'loan',     'Loan of KSh 10,000 issued to Moseti (school fees)', 'Gabriel'],
  ['2026-09-28T15:12:00Z', 'loan',     'Moseti repaid KSh 2,000 — balance KSh 8,000', 'Gabriel'],
  ['2026-10-01T07:45:00Z', 'payment',  'Gabriel paid QAR 200 for Round 3', 'Gabriel'],
  ['2026-10-02T19:02:00Z', 'loan',     'Moseti repaid KSh 2,000 — balance KSh 6,000', 'Gabriel'],
  ['2026-10-02T19:30:00Z', 'payment',  'Isaac paid QAR 200 for Round 3', 'Gabriel'],
  ['2026-10-03T09:15:00Z', 'payment',  'Moseti paid QAR 200 for Round 3', 'Gabriel'],
  ['2026-10-04T13:22:00Z', 'payment',  'Godfrey paid QAR 200 for Round 3', 'Gabriel'],
  ['2026-10-04T16:48:00Z', 'payment',  'Joackim paid QAR 200 for Round 3', 'Gabriel'],
  ['2026-10-04T20:05:00Z', 'payment',  'Dennis paid QAR 100 for Round 3 (half)', 'Gabriel'],
  ['2026-10-05T07:10:00Z', 'payment',  'Titus paid QAR 280 for Round 3 (includes arrears)', 'Gabriel'],
  ['2026-10-05T07:12:00Z', 'reminder', '3 contribution reminders queued for Round 3', 'Gabriel'],
];

export function seedAll({ force = false } = {}) {
  const existing = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (existing > 0 && !force) return false;

  db.exec(`
    DELETE FROM activity; DELETE FROM reminders; DELETE FROM loan_repayments;
    DELETE FROM loans; DELETE FROM contributions; DELETE FROM rounds;
    DELETE FROM members; DELETE FROM users; DELETE FROM settings;
    DELETE FROM sqlite_sequence;
  `);

  /* settings */
  setSettings({
    name: 'Omogusii Merry-Go-Round',
    tagline: 'Doha · 10 members · monthly',
    currency: 'QAR',
    secondaryCurrency: 'KES',
    fx: 35.6,
    contribution: 200,
    frequency: 'monthly',
    startDate: anchor(),
    method: 'Bank transfer / M-Pesa',
    account: 'QAR 0021-4471 · M-Pesa Paybill 4098771',
    reminderDays: 3,
  });
  const settings = getSettings();

  /* members */
  const insMember = db.prepare(
    'INSERT INTO members (name, phone, email, position, joined_at, active, notes, created_at) VALUES (?,?,?,?,?,?,?,?)'
  );
  const memberIds = MEMBERS.map(([name, phone, email], i) =>
    insMember.run(name, phone, email, i + 1, D('2026-08-01'), 1, null, now()).lastInsertRowid
  );

  /* users: gabriel = treasurer/admin, moseti + nehemiah = members */
  const insUser = db.prepare(
    'INSERT INTO users (username, name, password_hash, role, member_id, created_at) VALUES (?,?,?,?,?,?)'
  );
  const pw = hash('omogusii2026');
  insUser.run('gabriel', 'Gabriel (Treasurer)', pw, 'admin', memberIds[0], now());
  insUser.run('moseti', 'Moseti', pw, 'member', memberIds[3], now());
  insUser.run('nehemiah', 'Nehemiah', pw, 'member', memberIds[2], now());

  /* rounds */
  syncRounds(settings);
  const rounds = db.prepare('SELECT * FROM rounds ORDER BY n').all();

  /* contributions */
  const insContrib = db.prepare(
    `INSERT INTO contributions (round_id, member_id, amount, currency, method, ref, paid_at, note, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(round_id, member_id) DO UPDATE SET
       amount = excluded.amount, method = excluded.method, ref = excluded.ref,
       paid_at = excluded.paid_at, note = excluded.note`
  );
  const METHODS = ['Bank transfer', 'M-Pesa', 'Cash'];
  for (const [n, rows] of Object.entries(PAYMENTS)) {
    const round = rounds[Number(n) - 1];
    for (const [mi, amount, paidAt, ref, note] of rows) {
      insContrib.run(round.id, memberIds[mi], amount, 'QAR', METHODS[mi % 3], ref, D(paidAt), note || null, now());
    }
  }

  /* payouts: rounds 1 and 2 already handed over */
  db.prepare('UPDATE rounds SET disbursed_at = ? WHERE n = 1').run(D('2026-08-06'));
  db.prepare('UPDATE rounds SET disbursed_at = ? WHERE n = 2').run(D('2026-09-06'));

  /* loans */
  const insLoan = db.prepare(
    `INSERT INTO loans (member_id, principal, currency, interest_rate, issued_at, due_at, term_months, purpose, status, note, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );
  const mosetiLoan = insLoan.run(
    memberIds[3], 10000, 'KES', 0, D('2026-09-10'), D('2027-02-10'), 5,
    'School fees top-up', 'open', 'Agreed KSh 2,000 per month', now()
  ).lastInsertRowid;
  const gabrielLoan = insLoan.run(
    memberIds[0], 5000, 'KES', 0, D('2026-05-12'), D('2026-07-12'), 2,
    'Medical emergency', 'closed', 'Cleared in two instalments', now()
  ).lastInsertRowid;

  const insRepay = db.prepare(
    'INSERT INTO loan_repayments (loan_id, amount, paid_at, ref, note, created_at) VALUES (?,?,?,?,?,?)'
  );
  insRepay.run(mosetiLoan, 2000, '2026-09-28', 'TXN-RP-01', 'Instalment 1 of 5', now());
  insRepay.run(mosetiLoan, 2000, '2026-10-02', 'TXN-RP-02', 'Instalment 2 of 5', now());
  insRepay.run(gabrielLoan, 3000, '2026-06-09', 'TXN-RP-00', 'Instalment 1 of 2', now());
  insRepay.run(gabrielLoan, 2000, '2026-07-14', 'TXN-RP-0A', 'Final instalment', now());

  /* reminders */
  const insRem = db.prepare(
    `INSERT INTO reminders (member_id, round_id, loan_id, type, channel, message, status, scheduled_for, sent_at, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );
  const dueMsg = (name) =>
    `Habari ${name} 👋 Round 3 contribution of QAR 200 is due 5 Oct 2026. Send to ${settings.account}. Asante!`;
  insRem.run(memberIds[2], rounds[2].id, null, 'contribution_due', 'whatsapp', dueMsg('Nehemiah'), 'pending', D('2026-10-03'), null, 'Gabriel', now());
  insRem.run(memberIds[4], rounds[2].id, null, 'contribution_due', 'whatsapp', dueMsg('David'), 'pending', D('2026-10-03'), null, 'Gabriel', now());
  insRem.run(memberIds[6], rounds[2].id, null, 'contribution_due', 'sms', dueMsg('Jones'), 'pending', D('2026-10-03'), null, 'Gabriel', now());
  insRem.run(memberIds[8], rounds[2].id, null, 'contribution_due', 'sms', 'Dennis, QAR 100 balance for Round 3 — clear it before the payout date please.', 'snoozed', D('2026-10-08'), null, 'Gabriel', now());
  insRem.run(memberIds[9], rounds[1].id, null, 'overdue', 'whatsapp', 'Titus, Round 2 is short QAR 80. Please top up with your Round 3 contribution.', 'sent', D('2026-09-06'), DT('2026-09-06T11:04:00Z'), 'Gabriel', now());
  insRem.run(memberIds[3], null, mosetiLoan, 'loan_repayment', 'whatsapp', 'Moseti, your loan balance is KSh 6,000. Next instalment of KSh 2,000 is due 28 Oct 2026.', 'pending', D('2026-10-26'), null, 'Gabriel', now());
  insRem.run(memberIds[1], rounds[1].id, null, 'payout_notice', 'whatsapp', 'Isaac 🎉 Round 2 payout of QAR 2,000 confirmed for 6 Sep 2026.', 'sent', D('2026-09-05'), DT('2026-09-05T18:30:00Z'), 'Gabriel', now());

  /* activity */
  const insAct = db.prepare('INSERT INTO activity (ts, type, text, actor, meta) VALUES (?,?,?,?,?)');
  for (const [ts, type, text, actor] of ACTIVITY) insAct.run(DT(ts), type, text, actor, null);

  logActivity('system', 'Demo data loaded — 10 members, 10 rounds, 2 payouts, 1 open loan', 'Gabriel');
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(seedAll({ force: true }) ? 'Seeded ✓' : 'Already seeded (use --force)');
}
