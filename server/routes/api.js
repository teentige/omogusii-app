import { Router } from 'express';
import QRCode from 'qrcode';
import {
  db, getSettings, setSettings, addPeriod, now, today, r2, toGroup, fromGroup,
  logActivity, syncRounds, roundProgress, activeRound,
} from '../db.js';
import { hash, verify, signToken, requireAuth, requireAdmin, publicUser } from '../auth.js';
import { seedAll } from '../seed.js';

export const api = Router();

const membersOrdered = () => db.prepare('SELECT * FROM members ORDER BY position, id').all();
const roundsOrdered  = () => db.prepare('SELECT * FROM rounds ORDER BY n').all();
const potExpected    = (s, ms) => (Number(s.contribution) || 0) * ms.filter((m) => m.active).length;

/* ══════════════════════════  AUTH  ══════════════════════════ */
api.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').toLowerCase().trim());
  if (!user || !verify(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  logActivity('system', `${user.name} signed in`, user.name);
  res.json({ token: signToken(user), user: publicUser(user) });
});

api.post('/auth/register', (req, res) => {
  const { username, password, name, memberId } = req.body || {};
  const u = String(username || '').toLowerCase().trim();
  if (!u || !password || String(password).length < 6) {
    return res.status(400).json({ error: 'Pick a username and a password of 6+ characters' });
  }
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(u)) {
    return res.status(409).json({ error: 'That username is taken' });
  }
  const info = db.prepare(
    'INSERT INTO users (username, name, password_hash, role, member_id, created_at) VALUES (?,?,?,?,?,?)'
  ).run(u, name || u, hash(String(password)), 'member', memberId || null, now());
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  logActivity('system', `${user.name} joined the group`, user.name);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

api.get('/auth/me', requireAuth, (req, res) => {
  const s = getSettings();
  const member = req.user.member_id ? db.prepare('SELECT * FROM members WHERE id = ?').get(req.user.member_id) : null;
  res.json({ user: publicUser(req.user), member, settings: s });
});

api.post('/auth/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!verify(String(current || ''), req.user.password_hash)) return res.status(400).json({ error: 'Current password is wrong' });
  if (!next || String(next).length < 6) return res.status(400).json({ error: 'New password must be 6+ characters' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash(String(next)), req.user.id);
  res.json({ ok: true });
});

/* ══════════════════════════  DASHBOARD  ══════════════════════════ */
api.get('/dashboard', requireAuth, (req, res) => {
  const s = getSettings();
  const members = membersOrdered();
  const rounds = roundsOrdered();
  const active = activeRound(s);
  const prog = active ? roundProgress(active, s) : null;
  const all = rounds.map((r) => roundProgress(r, s));
  const pot = potExpected(s, members);
  const collectedAllTime = r2(all.reduce((a, p) => a + p.collected, 0));

  const nextRound = rounds.find((r) => !r.disbursed_at) || null;
  const nextMember = nextRound ? members.find((m) => m.id === nextRound.recipient_id) : null;

  const loans = db.prepare(`
    SELECT l.*, m.name AS member_name,
           COALESCE((SELECT SUM(amount) FROM loan_repayments WHERE loan_id = l.id), 0) AS repaid,
           (SELECT COUNT(*) FROM loan_repayments WHERE loan_id = l.id) AS repayments
    FROM loans l JOIN members m ON m.id = l.member_id
    ORDER BY l.status = 'open' DESC, l.issued_at DESC`).all();
  const loansOutstanding = r2(loans.filter((l) => l.status === 'open').reduce((a, l) => {
    const owed = Math.max(0, l.principal * (1 + (l.interest_rate || 0) / 100) - l.repaid);
    return a + toGroup(owed, l.currency, s);
  }, 0));

  const standing = members.map((m) => {
    const paidIn = r2(all.reduce((a, p) => {
      const line = p.lines.find((l) => l.member.id === m.id);
      return a + (line ? line.amount : 0);
    }, 0));
    const payouts = rounds.filter((r) => r.disbursed_at && r.recipient_id === m.id);
    const received = payouts.length * pot;
    const openLoan = loans.find((l) => l.member_id === m.id && l.status === 'open');
    return {
      id: m.id, name: m.name, phone: m.phone, position: m.position, active: !!m.active,
      paidIn, received, net: r2(paidIn - received), payouts: payouts.length,
      roundsPaid: all.filter((p) => (p.lines.find((l) => l.member.id === m.id) || {}).status === 'paid').length,
      rounds: all.length,
      loanOutstanding: openLoan ? r2(Math.max(0, openLoan.principal * (1 + (openLoan.interest_rate || 0) / 100) - openLoan.repaid)) : 0,
      loanCurrency: openLoan ? openLoan.currency : null,
    };
  });

  const defaulters = prog
    ? prog.lines.filter((l) => l.amount < l.expected).map((l) => ({
        memberId: l.member.id, name: l.member.name, phone: l.member.phone,
        paid: l.amount, expected: l.expected, balance: r2(l.expected - l.amount), status: l.status,
      }))
    : [];

  const meMember = req.user.member_id ? members.find((m) => m.id === req.user.member_id) : null;
  const myRound = meMember ? rounds.find((r) => r.recipient_id === meMember.id) : null;
  const myLine = prog && meMember ? prog.lines.find((l) => l.member.id === meMember.id) : null;

  const chart = all.map((p) => ({
    n: p.n, label: `R${p.n}`, due: p.due_date,
    collected: p.collected, expected: p.expected, disbursed: !!p.disbursed_at,
  }));

  const breakdown = all.map((p) => {
    const st = p.disbursed_at ? 'paid_out'
      : active && p.id === active.id ? 'open'
      : p.due_date < today() ? 'overdue' : 'upcoming';
    return {
      id: p.id, n: p.n, due: p.due_date,
      recipient: members.find((m) => m.id === p.recipient_id)?.name || 'Unassigned',
      recipientId: p.recipient_id,
      expected: p.expected, collected: p.collected, outstanding: p.outstanding,
      paidCount: p.paidCount, partialCount: p.partialCount, unpaidCount: p.unpaidCount,
      disbursedAt: p.disbursed_at, status: st,
    };
  });

  const activity = db.prepare('SELECT * FROM activity ORDER BY ts DESC, id DESC LIMIT 14').all();
  const remindersPending = db.prepare("SELECT COUNT(*) c FROM reminders WHERE status = 'pending'").get().c;

  res.json({
    settings: s,
    me: { ...publicUser(req.user), member: meMember || null, round: myRound || null, line: myLine || null },
    kpis: {
      currency: s.currency, secondaryCurrency: s.secondaryCurrency, fx: s.fx,
      contribution: Number(s.contribution) || 0,
      members: members.filter((m) => m.active).length,
      potPerRound: pot,
      collectedThisRound: prog ? prog.collected : 0,
      outstandingThisRound: prog ? prog.outstanding : 0,
      collectedAllTime,
      roundsDone: rounds.filter((r) => r.disbursed_at).length,
      roundsTotal: rounds.length,
      loansOutstanding,
      defaulters: defaulters.length,
      remindersPending,
    },
    activeRound: prog,
    nextPayout: nextRound ? { round: nextRound.n, due: nextRound.due_date, member: nextMember, amount: pot } : null,
    chart, breakdown, defaulters, standing, activity, loans,
  });
});

/* ══════════════════════════  MEMBERS  ══════════════════════════ */
const memberSummary = (s) => membersOrdered().map((m) => {
  const all = roundsOrdered().map((r) => roundProgress(r, s));
  const pot = potExpected(s, membersOrdered());
  const paidIn = r2(all.reduce((a, p) => {
    const line = p.lines.find((l) => l.member.id === m.id);
    return a + (line ? line.amount : 0);
  }, 0));
  const payouts = all.filter((p) => p.disbursed_at && p.recipient_id === m.id).length;
  const loans = db.prepare(`
    SELECT l.*, COALESCE((SELECT SUM(amount) FROM loan_repayments WHERE loan_id = l.id),0) AS repaid
    FROM loans l WHERE l.member_id = ?`).all(m.id);
  return {
    ...m,
    paidIn,
    received: payouts * pot,
    net: r2(paidIn - payouts * pot),
    payouts,
    roundsPaid: all.filter((p) => (p.lines.find((l) => l.member.id === m.id) || {}).status === 'paid').length,
    rounds: all.length,
    loanOutstanding: r2(loans.filter((l) => l.status === 'open')
      .reduce((a, l) => a + Math.max(0, l.principal * (1 + (l.interest_rate || 0) / 100) - l.repaid), 0)),
    loanCurrency: (loans.find((l) => l.status === 'open') || {}).currency || null,
  };
});

api.get('/members', requireAuth, (req, res) => res.json(memberSummary(getSettings())));

api.get('/members/:id', requireAuth, (req, res) => {
  const s = getSettings();
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  const history = db.prepare(`
    SELECT c.*, r.n AS round_n, r.due_date
    FROM contributions c JOIN rounds r ON r.id = c.round_id
    WHERE c.member_id = ? ORDER BY r.n DESC`).all(member.id);
  const loans = db.prepare(`
    SELECT l.*, COALESCE((SELECT SUM(amount) FROM loan_repayments WHERE loan_id = l.id),0) AS repaid
    FROM loans l WHERE l.member_id = ? ORDER BY l.issued_at DESC`).all(member.id);
  const repayments = db.prepare(`
    SELECT rp.* FROM loan_repayments rp JOIN loans l ON l.id = rp.loan_id
    WHERE l.member_id = ? ORDER BY rp.paid_at DESC`).all(member.id);
  const rounds = roundsOrdered();
  const myRound = rounds.find((r) => r.recipient_id === member.id);
  res.json({
    member, history, loans, repayments,
    payoutRound: myRound ? { n: myRound.n, due: myRound.due_date, disbursedAt: myRound.disbursed_at } : null,
    summary: memberSummary(s).find((m) => m.id === member.id),
    settings: s,
  });
});

api.post('/members', requireAuth, requireAdmin, (req, res) => {
  const { name, phone, email, notes, joinedAt } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Name is required' });
  const pos = db.prepare('SELECT COALESCE(MAX(position),0)+1 p FROM members').get().p;
  const info = db.prepare(
    'INSERT INTO members (name, phone, email, position, joined_at, active, notes, created_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run(String(name).trim(), phone || null, email || null, pos, joinedAt || today(), 1, notes || null, now());
  syncRounds();
  logActivity('member', `${name} joined the group`, req.user.name, { id: info.lastInsertRowid });
  res.status(201).json(memberSummary(getSettings()).find((m) => m.id === info.lastInsertRowid));
});

api.patch('/members/:id', requireAuth, requireAdmin, (req, res) => {
  const { name, phone, email, notes, active, joinedAt } = req.body || {};
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Member not found' });
  db.prepare(`UPDATE members SET
      name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email),
      notes = COALESCE(?, notes), active = COALESCE(?, active), joined_at = COALESCE(?, joined_at)
    WHERE id = ?`)
    .run(name ?? null, phone ?? null, email ?? null, notes ?? null,
         active === undefined ? null : (active ? 1 : 0), joinedAt ?? null, m.id);
  syncRounds();
  logActivity('member', `Updated ${m.name}'s details`, req.user.name, { id: m.id });
  res.json(memberSummary(getSettings()).find((x) => x.id === m.id));
});

api.delete('/members/:id', requireAuth, requireAdmin, (req, res) => {
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Member not found' });
  db.prepare('DELETE FROM members WHERE id = ?').run(m.id);
  db.prepare('UPDATE users SET member_id = NULL WHERE member_id = ?').run(m.id);
  syncRounds();
  logActivity('member', `Removed ${m.name} from the group`, req.user.name, { id: m.id });
  res.json({ ok: true });
});

api.post('/members/reorder', requireAuth, requireAdmin, (req, res) => {
  const { id, direction } = req.body || {};
  const list = membersOrdered();
  const i = list.findIndex((m) => String(m.id) === String(id));
  if (i < 0) return res.status(404).json({ error: 'Member not found' });
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return res.json(memberSummary(getSettings()));
  const swap = db.transaction((a, b) => {
    db.prepare('UPDATE members SET position = -1 WHERE id = ?').run(a.id);
    db.prepare('UPDATE members SET position = ? WHERE id = ?').run(a.position, b.id);
    db.prepare('UPDATE members SET position = ? WHERE id = ?').run(b.position, a.id);
  });
  swap(list[i], list[j]);
  syncRounds();
  logActivity('member', `Payout order changed — ${list[i].name} moved ${direction}`, req.user.name);
  res.json(memberSummary(getSettings()));
});

api.get('/members/:id/qr', requireAuth, async (req, res) => {
  const s = getSettings();
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Member not found' });
  const payload = JSON.stringify({
    group: s.name, member: m.name, phone: m.phone,
    amount: `${s.currency} ${s.contribution}`, frequency: s.frequency,
    payTo: s.account,
  });
  const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 320, errorCorrectionLevel: 'M' });
  res.json({ dataUrl, payload });
});

api.get('/qr/group', requireAuth, async (req, res) => {
  const s = getSettings();
  const payload = JSON.stringify({
    group: s.name, contribution: `${s.currency} ${s.contribution}`, frequency: s.frequency,
    payTo: s.account, note: 'Scan, pay, then send your reference to the treasurer',
  });
  const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 320, errorCorrectionLevel: 'M' });
  res.json({ dataUrl, payload });
});

/* ══════════════════════════  ROUNDS  ══════════════════════════ */
api.get('/rounds', requireAuth, (req, res) => {
  const s = getSettings();
  res.json(roundsOrdered().map((r) => {
    const p = roundProgress(r, s);
    return {
      id: r.id, n: r.n, due: r.due_date, disbursedAt: r.disbursed_at, note: r.note,
      recipient: membersOrdered().find((m) => m.id === r.recipient_id) || null,
      collected: p.collected, expected: p.expected, outstanding: p.outstanding,
      paidCount: p.paidCount, partialCount: p.partialCount, unpaidCount: p.unpaidCount,
      status: r.disbursed_at ? 'paid_out' : (r.due_date < today() && r.id === (activeRound(s) || {}).id ? 'open' : 'upcoming'),
    };
  }));
});

api.get('/rounds/:id', requireAuth, (req, res) => {
  const s = getSettings();
  const r = db.prepare('SELECT * FROM rounds WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Round not found' });
  res.json({ ...roundProgress(r, s), settings: s });
});

api.post('/rounds', requireAuth, requireAdmin, (req, res) => {
  const s = getSettings();
  const rounds = roundsOrdered();
  const last = rounds[rounds.length - 1];
  const n = (last ? last.n : 0) + 1;
  const info = db.prepare('INSERT INTO rounds (n, due_date, recipient_id, created_at) VALUES (?,?,?,?)')
    .run(n, addPeriod(s.startDate, n - 1, s.frequency), null, now());
  syncRounds();
  logActivity('system', `Extra round ${n} added to the schedule`, req.user.name);
  res.status(201).json(db.prepare('SELECT * FROM rounds WHERE id = ?').get(info.lastInsertRowid));
});

api.patch('/rounds/:id', requireAuth, requireAdmin, (req, res) => {
  const { due, recipientId, note } = req.body || {};
  const r = db.prepare('SELECT * FROM rounds WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Round not found' });
  db.prepare('UPDATE rounds SET due_date = COALESCE(?, due_date), recipient_id = COALESCE(?, recipient_id), note = COALESCE(?, note) WHERE id = ?')
    .run(due || null, recipientId === undefined ? null : recipientId, note ?? null, r.id);
  logActivity('system', `Round ${r.n} updated`, req.user.name, { id: r.id });
  res.json(db.prepare('SELECT * FROM rounds WHERE id = ?').get(r.id));
});

api.post('/rounds/:id/disburse', requireAuth, requireAdmin, (req, res) => {
  const s = getSettings();
  const r = db.prepare('SELECT * FROM rounds WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Round not found' });
  const undoing = !!r.disbursed_at;
  db.prepare('UPDATE rounds SET disbursed_at = ? WHERE id = ?').run(undoing ? null : today(), r.id);
  const who = membersOrdered().find((m) => m.id === r.recipient_id);
  const amount = potExpected(s, membersOrdered());
  logActivity('payout', undoing
    ? `Payout for round ${r.n} un-marked`
    : `Round ${r.n} pot of ${s.currency} ${r2(amount).toLocaleString()} handed to ${who ? who.name : 'member'}`,
    req.user.name, { id: r.id });
  res.json(roundProgress(db.prepare('SELECT * FROM rounds WHERE id = ?').get(r.id), s));
});

api.delete('/rounds/:id', requireAuth, requireAdmin, (req, res) => {
  const r = db.prepare('SELECT * FROM rounds WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Round not found' });
  const used = db.prepare('SELECT COUNT(*) c FROM contributions WHERE round_id = ? AND amount > 0').get(r.id).c;
  if (used > 0 || r.disbursed_at) return res.status(400).json({ error: 'Can only delete an empty, unpaid round' });
  db.prepare('DELETE FROM rounds WHERE id = ?').run(r.id);
  syncRounds();
  logActivity('system', `Round ${r.n} deleted`, req.user.name);
  res.json({ ok: true });
});

/* ══════════════════════════  CONTRIBUTIONS  ══════════════════════════ */
api.get('/contributions', requireAuth, (req, res) => {
  const { roundId, memberId, status } = req.query;
  const s = getSettings();
  const rows = db.prepare(`
    SELECT c.*, m.name AS member_name, m.position, r.n AS round_n, r.due_date
    FROM contributions c
    JOIN members m ON m.id = c.member_id
    JOIN rounds r ON r.id = c.round_id
    WHERE (? IS NULL OR c.round_id = ?) AND (? IS NULL OR c.member_id = ?)
    ORDER BY r.n DESC, m.position
    LIMIT 400`).all(roundId || null, roundId || null, memberId || null, memberId || null);
  const exp = Number(s.contribution) || 0;
  const out = rows.map((c) => {
    const amount = toGroup(c.amount, c.currency, s);
    return { ...c, amountGroup: r2(amount),
      status: amount <= 0 ? 'unpaid' : amount >= exp ? 'paid' : 'partial' };
  });
  res.json(status ? out.filter((c) => c.status === status) : out);
});

api.post('/rounds/:id/contributions', requireAuth, (req, res) => {
  const s = getSettings();
  const round = db.prepare('SELECT * FROM rounds WHERE id = ?').get(req.params.id);
  if (!round) return res.status(404).json({ error: 'Round not found' });
  const { memberId, amount, ref, method, note, paidAt } = req.body || {};
  if (!memberId) return res.status(400).json({ error: 'Pick a member' });
  // a plain member may only record their own payment
  if (req.user.role !== 'admin' && String(req.user.member_id) !== String(memberId)) {
    return res.status(403).json({ error: 'Members can only record their own payment' });
  }
  const amt = Math.max(0, Number(amount) || 0);
  const existing = db.prepare('SELECT * FROM contributions WHERE round_id = ? AND member_id = ?').get(round.id, memberId);
  db.prepare(`
    INSERT INTO contributions (round_id, member_id, amount, currency, method, ref, paid_at, note, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(round_id, member_id) DO UPDATE SET
      amount = excluded.amount, currency = excluded.currency, method = excluded.method,
      ref = excluded.ref, paid_at = excluded.paid_at, note = excluded.note
  `).run(round.id, memberId, amt, s.currency, method || s.method, ref || null,
         paidAt || (amt > 0 ? today() : null), note || null, now());

  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
  const was = existing ? Number(existing.amount) : 0;
  logActivity('payment',
    amt === 0
      ? `Payment cleared for ${m.name} in round ${round.n}`
      : `${m.name} ${was > 0 ? 'updated to' : 'paid'} ${s.currency} ${r2(amt).toLocaleString()} for round ${round.n}${ref ? ` (${ref})` : ''}`,
    req.user.name, { round: round.n, memberId: m.id });

  res.json(roundProgress(round, s));
});

api.delete('/contributions/:id', requireAuth, requireAdmin, (req, res) => {
  const c = db.prepare('SELECT * FROM contributions WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM contributions WHERE id = ?').run(c.id);
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(c.member_id);
  logActivity('payment', `Removed a payment record for ${m.name}`, req.user.name);
  res.json({ ok: true });
});

/* ══════════════════════════  LOANS  ══════════════════════════ */
const loanQuery = `
  SELECT l.*, m.name AS member_name,
         COALESCE((SELECT SUM(amount) FROM loan_repayments WHERE loan_id = l.id), 0) AS repaid,
         (SELECT COUNT(*) FROM loan_repayments WHERE loan_id = l.id) AS repayments
  FROM loans l JOIN members m ON m.id = l.member_id`;

/** total / outstanding / progress, rounded to cents (avoids 1.1 float drift) */
function enrichLoan(l, settings = getSettings()) {
  const total = r2(l.principal * (1 + (l.interest_rate || 0) / 100));
  const outstanding = r2(Math.max(0, total - (l.repaid || 0)));
  return {
    ...l,
    total,
    outstanding,
    outstandingGroup: r2(toGroup(outstanding, l.currency, settings)),
    progress: total > 0 ? Math.min(100, Math.round(((l.repaid || 0) / total) * 100)) : 0,
  };
}

api.get('/loans', requireAuth, (req, res) => {
  const rows = db.prepare(`${loanQuery} ORDER BY l.status = 'open' DESC, l.issued_at DESC`).all();
  res.json(rows.map((l) => enrichLoan(l)));
});

api.get('/loans/:id', requireAuth, (req, res) => {
  const s = getSettings();
  const l = db.prepare(`${loanQuery} WHERE l.id = ?`).get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Loan not found' });
  const repayments = db.prepare('SELECT * FROM loan_repayments WHERE loan_id = ? ORDER BY paid_at DESC').all(l.id);
  res.json({ ...enrichLoan(l, s), repayments, settings: s });
});

api.post('/loans', requireAuth, requireAdmin, (req, res) => {
  const { memberId, principal, currency, interestRate, issuedAt, dueAt, termMonths, purpose, note } = req.body || {};
  if (!memberId || !(Number(principal) > 0)) return res.status(400).json({ error: 'Member and amount are required' });
  const info = db.prepare(`
    INSERT INTO loans (member_id, principal, currency, interest_rate, issued_at, due_at, term_months, purpose, status, note, created_at)
    VALUES (?,?,?,?,?,?,?,?,'open',?,?)`)
    .run(memberId, Number(principal), currency || 'KES', Number(interestRate) || 0,
         issuedAt || today(), dueAt || null, termMonths || null, purpose || null, note || null, now());
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
  logActivity('loan', `Loan of ${currency || 'KES'} ${Number(principal).toLocaleString()} issued to ${m.name}`, req.user.name, { id: info.lastInsertRowid });
  res.status(201).json(enrichLoan(db.prepare(`${loanQuery} WHERE l.id = ?`).get(info.lastInsertRowid)));
});

api.patch('/loans/:id', requireAuth, requireAdmin, (req, res) => {
  const { principal, currency, interestRate, dueAt, termMonths, purpose, note, status } = req.body || {};
  const l = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Loan not found' });
  db.prepare(`UPDATE loans SET principal = COALESCE(?, principal), currency = COALESCE(?, currency),
      interest_rate = COALESCE(?, interest_rate), due_at = COALESCE(?, due_at), term_months = COALESCE(?, term_months),
      purpose = COALESCE(?, purpose), note = COALESCE(?, note), status = COALESCE(?, status) WHERE id = ?`)
    .run(principal ?? null, currency ?? null, interestRate ?? null, dueAt ?? null,
         termMonths ?? null, purpose ?? null, note ?? null, status ?? null, l.id);
  logActivity('loan', 'Loan details updated', req.user.name, { id: l.id });
  res.json(enrichLoan(db.prepare(`${loanQuery} WHERE l.id = ?`).get(l.id)));
});

api.delete('/loans/:id', requireAuth, requireAdmin, (req, res) => {
  const l = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Loan not found' });
  db.prepare('DELETE FROM loans WHERE id = ?').run(l.id);
  logActivity('loan', 'Loan record deleted', req.user.name);
  res.json({ ok: true });
});

api.post('/loans/:id/repayments', requireAuth, requireAdmin, (req, res) => {
  const { amount, paidAt, ref, note } = req.body || {};
  const l = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Loan not found' });
  if (!(Number(amount) > 0)) return res.status(400).json({ error: 'Enter an amount above zero' });
  db.prepare('INSERT INTO loan_repayments (loan_id, amount, paid_at, ref, note, created_at) VALUES (?,?,?,?,?,?)')
    .run(l.id, Number(amount), paidAt || today(), ref || null, note || null, now());
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(l.member_id);
  const after = db.prepare(`${loanQuery} WHERE l.id = ?`).get(l.id);
  if (enrichLoan(after).outstanding <= 0) db.prepare("UPDATE loans SET status = 'closed' WHERE id = ?").run(l.id);
  const fresh = db.prepare(`${loanQuery} WHERE l.id = ?`).get(l.id);
  const owed = enrichLoan(fresh).outstanding;
  logActivity('loan', `${m.name} repaid ${l.currency} ${Number(amount).toLocaleString()} — balance ${l.currency} ${r2(owed).toLocaleString()}`,
    req.user.name, { id: l.id });
  res.json(enrichLoan(fresh));
});

api.delete('/repayments/:id', requireAuth, requireAdmin, (req, res) => {
  const rp = db.prepare('SELECT * FROM loan_repayments WHERE id = ?').get(req.params.id);
  if (!rp) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM loan_repayments WHERE id = ?').run(rp.id);
  db.prepare("UPDATE loans SET status = 'open' WHERE id = ?").run(rp.loan_id);
  logActivity('loan', 'Loan repayment removed', req.user.name);
  res.json({ ok: true });
});

/* ══════════════════════════  REMINDERS  ══════════════════════════ */
const reminderQuery = `
  SELECT rm.*, m.name AS member_name, m.phone AS member_phone, r.n AS round_n, r.due_date
  FROM reminders rm
  LEFT JOIN members m ON m.id = rm.member_id
  LEFT JOIN rounds r ON r.id = rm.round_id`;

api.get('/reminders', requireAuth, (req, res) => {
  const { status } = req.query;
  const rows = db.prepare(`${reminderQuery} ${status ? 'WHERE rm.status = ?' : ''} ORDER BY
      CASE rm.status WHEN 'pending' THEN 0 WHEN 'snoozed' THEN 1 WHEN 'sent' THEN 2 ELSE 3 END,
      COALESCE(rm.scheduled_for, rm.created_at) DESC`).all(...(status ? [status] : []));
  res.json(rows);
});

api.post('/reminders', requireAuth, (req, res) => {
  const { memberId, roundId, loanId, type, channel, message, scheduledFor } = req.body || {};
  if (!String(message || '').trim()) return res.status(400).json({ error: 'Write a message first' });
  const info = db.prepare(`
    INSERT INTO reminders (member_id, round_id, loan_id, type, channel, message, status, scheduled_for, created_by, created_at)
    VALUES (?,?,?,?,?,?, 'pending', ?, ?, ?)`)
    .run(memberId || null, roundId || null, loanId || null, type || 'custom', channel || 'whatsapp',
         String(message).trim(), scheduledFor || today(), req.user.name, now());
  logActivity('reminder', 'Reminder created', req.user.name, { id: info.lastInsertRowid });
  res.status(201).json(db.prepare(`${reminderQuery} WHERE rm.id = ?`).get(info.lastInsertRowid));
});

/** Bulk reminder buttons: defaulters | all | loan | payout */
api.post('/reminders/bulk', requireAuth, (req, res) => {
  const s = getSettings();
  const kind = (req.body || {}).type || 'defaulters';
  const members = membersOrdered().filter((m) => m.active);
  const active = activeRound(s);
  const prog = active ? roundProgress(active, s) : null;
  const created = [];

  const ins = db.prepare(`
    INSERT INTO reminders (member_id, round_id, loan_id, type, channel, message, status, scheduled_for, created_by, created_at)
    VALUES (?,?,?,?,?,?, 'pending', ?, ?, ?)`);

  const push = (m, text, type, loanId = null, channel = 'whatsapp') => {
    const id = ins.run(m.id, active ? active.id : null, loanId, type, channel, text, today(), req.user.name, now()).lastInsertRowid;
    created.push(id);
  };

  if (kind === 'defaulters' || kind === 'all') {
    if (!prog) return res.status(400).json({ error: 'No open round yet' });
    const lines = prog.lines.filter((l) => (kind === 'all' ? true : l.amount < l.expected));
    for (const l of lines) {
      const bal = r2(l.expected - l.amount);
      const text = kind === 'all'
        ? `Habari ${l.member.name} 👋 Round ${prog.n} contribution of ${s.currency} ${l.expected} is due ${prog.due_date}. Pay to ${s.account}. Asante!`
        : `Habari ${l.member.name} 👋 You still owe ${s.currency} ${bal} for Round ${prog.n} (due ${prog.due_date}). Pay to ${s.account}. Asante!`;
      push(l.member, text, 'contribution_due');
    }
    logActivity('reminder', `${created.length} contribution reminder${created.length === 1 ? '' : 's'} queued for Round ${prog.n}`, req.user.name);
  }

  if (kind === 'loan') {
    const open = db.prepare(`
      SELECT l.*, m.name, COALESCE((SELECT SUM(amount) FROM loan_repayments WHERE loan_id = l.id),0) repaid
      FROM loans l JOIN members m ON m.id = l.member_id WHERE l.status = 'open'`).all();
    for (const l of open) {
      const owed = r2(Math.max(0, l.principal * (1 + (l.interest_rate || 0) / 100) - l.repaid));
      push({ id: l.member_id },
        `Habari ${l.name} 👋 Your loan balance is ${l.currency} ${owed.toLocaleString()}${l.due_at ? `, next instalment due ${l.due_at}` : ''}. Please pay to ${s.account}.`,
        'loan_repayment', l.id);
    }
    logActivity('reminder', `${created.length} loan reminder${created.length === 1 ? '' : 's'} queued`, req.user.name);
  }

  if (kind === 'payout') {
    const next = roundsOrdered().find((r) => !r.disbursed_at);
    if (!next) return res.status(400).json({ error: 'All rounds are paid out' });
    const who = members.find((m) => m.id === next.recipient_id);
    if (!who) return res.status(400).json({ error: 'No recipient on the next round' });
    push(who,
      `Habari ${who.name} 🎉 You receive the Round ${next.n} pot of ${s.currency} ${potExpected(s, members).toLocaleString()} on ${next.due_date}. The treasurer will confirm once everyone has paid.`,
      'payout_notice');
    logActivity('reminder', `Payout notice queued for ${who.name} (Round ${next.n})`, req.user.name);
  }

  res.status(201).json({ created: created.length, ids: created });
});

api.patch('/reminders/:id', requireAuth, (req, res) => {
  const { status, scheduledFor, message, channel } = req.body || {};
  const rm = db.prepare('SELECT * FROM reminders WHERE id = ?').get(req.params.id);
  if (!rm) return res.status(404).json({ error: 'Reminder not found' });
  const sentAt = status === 'sent' ? now() : (status && status !== 'sent' ? null : rm.sent_at);
  db.prepare(`UPDATE reminders SET status = COALESCE(?, status), scheduled_for = COALESCE(?, scheduled_for),
      message = COALESCE(?, message), channel = COALESCE(?, channel), sent_at = ? WHERE id = ?`)
    .run(status ?? null, scheduledFor ?? null, message ?? null, channel ?? null, sentAt, rm.id);
  if (status === 'sent') logActivity('reminder', `Reminder marked as sent to ${(db.prepare('SELECT name FROM members WHERE id = ?').get(rm.member_id) || {}).name || 'group'}`, req.user.name);
  res.json(db.prepare(`${reminderQuery} WHERE rm.id = ?`).get(rm.id));
});

api.delete('/reminders/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM reminders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ══════════════════════════  MISC  ══════════════════════════ */
api.get('/activity', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM activity ORDER BY ts DESC, id DESC LIMIT 60').all());
});

api.get('/settings', requireAuth, (req, res) => res.json(getSettings()));

api.put('/settings', requireAuth, requireAdmin, (req, res) => {
  const patch = req.body || {};
  const clean = {};
  for (const k of ['name', 'tagline', 'currency', 'secondaryCurrency', 'fx', 'contribution',
                   'frequency', 'startDate', 'method', 'account', 'reminderDays']) {
    if (patch[k] !== undefined) clean[k] = patch[k];
  }
  const s = setSettings(clean);
  syncRounds(s);
  logActivity('system', 'Group settings updated', req.user.name);
  res.json(s);
});

api.post('/demo/reseed', requireAuth, requireAdmin, (req, res) => {
  seedAll({ force: true });
  res.json({ ok: true });
});

api.get('/health', (req, res) => res.json({ ok: true, time: now() }));

/* 404 for unknown API paths */
api.use((req, res) => res.status(404).json({ error: `No API route for ${req.method} ${req.path}` }));
