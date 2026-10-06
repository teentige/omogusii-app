/**
 * API smoke tests — no dependencies, run against a live server.
 *   node server/index.js        # in one terminal
 *   npm test                    # in another
 * Set BASE to test a deployed backend:  BASE=https://omogusii-api.onrender.com npm test
 */
const BASE = (process.env.BASE || 'http://127.0.0.1:3000') + '/api';
let token = '';
let pass = 0, fail = 0;

async function call(method, path, body, asToken = token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(asToken ? { Authorization: 'Bearer ' + asToken } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
const get = (p, t) => call('GET', p, null, t);
const post = (p, b, t) => call('POST', p, b, t);
const patch = (p, b, t) => call('PATCH', p, b, t);
const del = (p, t) => call('DELETE', p, null, t);
const put = (p, b, t) => call('PUT', p, b, t);
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra ? '→ ' + JSON.stringify(extra).slice(0, 200) : ''); }
}

(async () => {
  console.log(`\nTesting ${BASE}\n═══ AUTH ═══`);
  let r = await get('/health');
  check('health endpoint', r.status === 200 && r.data.ok);
  r = await get('/dashboard');
  check('protected route rejects anonymous', r.status === 401);
  r = await post('/auth/login', { username: 'gabriel', password: 'wrong' });
  check('wrong password rejected', r.status === 401);
  r = await post('/auth/login', { username: 'gabriel', password: 'omogusii2026' });
  token = r.data.token;
  check('treasurer can sign in', r.status === 200 && r.data.user.role === 'admin');
  const member = await post('/auth/login', { username: 'moseti', password: 'omogusii2026' });
  check('member can sign in', member.status === 200 && member.data.user.role === 'member');

  console.log('\n═══ CORS (needed by the Android WebView) ═══');
  r = await call('OPTIONS', '/auth/login', null);
  const allow = r.headers.get('access-control-allow-origin') || '';
  check('preflight answered with CORS headers', !!allow || r.headers.get('access-control-allow-methods') !== null, allow);

  console.log('\n═══ SEEDED GROUP ═══');
  r = await get('/dashboard');
  const d = r.data;
  check('10 members', d.kpis.members === 10, d.kpis.members);
  check('QAR 200 contribution', d.kpis.currency === 'QAR' && d.kpis.contribution === 200);
  check('QAR 2,000 pot per round', d.kpis.potPerRound === 2000);
  check('10 rounds, 2 paid out', d.kpis.roundsTotal === 10 && d.kpis.roundsDone === 2);
  check('round 3 is the open round', d.activeRound?.n === 3);
  check('next payout is Nehemiah', d.nextPayout?.member?.name === 'Nehemiah');
  check('loan ≈ QAR 168.54 (KSh 6,000 @ 35.6)', near(d.kpis.loansOutstanding, 6000 / 35.6, 0.3), d.kpis.loansOutstanding);
  r = await get('/members');
  check('rotation order is correct',
    r.data.map((m) => m.name).join(',') === 'Gabriel,Isaac,Nehemiah,Moseti,David,Godfrey,Jones,Joackim,Dennis,Titus');
  check('Moseti owes KSh 6,000', r.data.find((m) => m.name === 'Moseti')?.loanOutstanding === 6000);

  console.log('\n═══ PERMISSIONS ═══');
  const round3 = (await get('/rounds')).data[2];
  const isaac = (await get('/members')).data.find((m) => m.name === 'Isaac');
  check('member cannot pay for someone else',
    (await post(`/rounds/${round3.id}/contributions`, { memberId: isaac.id, amount: 200 }, member.data.token)).status === 403);
  check('member can pay for themselves',
    (await post(`/rounds/${round3.id}/contributions`, { memberId: member.data.user.member_id, amount: 200 }, member.data.token)).status === 200);
  check('member cannot change settings', (await put('/settings', { contribution: 999 }, member.data.token)).status === 403);

  console.log('\n═══ CONTRIBUTIONS ═══');
  const jones = (await get('/members')).data.find((m) => m.name === 'Jones');
  const before = (await get(`/rounds/${round3.id}`)).data.collected;
  r = await post(`/rounds/${round3.id}/contributions`, { memberId: jones.id, amount: 200, ref: 'TST-1' });
  check('payment saved and total updated', near(r.data.collected, before + 200), `${before} → ${r.data.collected}`);
  check('member marked paid', r.data.lines.find((l) => l.member.id === jones.id).status === 'paid');
  r = await post(`/rounds/${round3.id}/contributions`, { memberId: jones.id, amount: 200, ref: 'TST-2' });
  check('re-saving updates instead of duplicating',
    (await get('/contributions')).data.filter((c) => c.member_id === jones.id && c.round_id === round3.id).length === 1);
  await post(`/rounds/${round3.id}/contributions`, { memberId: jones.id, amount: 0 });
  check('clearing restores the total', near((await get(`/rounds/${round3.id}`)).data.collected, before));

  console.log('\n═══ REMINDERS ═══');
  const pending = (await get('/reminders?status=pending')).data.length;
  check('nudge defaulters queues messages', (await post('/reminders/bulk', { type: 'defaulters' })).data.created > 0);
  check('loan reminder queues', (await post('/reminders/bulk', { type: 'loan' })).data.created === 1);
  check('payout notice queues', (await post('/reminders/bulk', { type: 'payout' })).data.created === 1);
  check('queue grew', (await get('/reminders?status=pending')).data.length > pending);
  const rem = (await get('/reminders?status=pending')).data[0];
  check('reminder can be marked sent', (await patch('/reminders/' + rem.id, { status: 'sent' })).data.status === 'sent');
  check('reminder can be deleted', (await del('/reminders/' + rem.id)).status === 200);

  console.log('\n═══ ROTATION + CRUD ═══');
  r = await post(`/rounds/${round3.id}/disburse`);
  check('round 3 pays out', !!r.data.disbursed_at);
  check('next payout moves to Moseti', (await get('/dashboard')).data.nextPayout?.member?.name === 'Moseti');
  await post(`/rounds/${round3.id}/disburse`);
  check('handover can be undone', (await get('/dashboard')).data.nextPayout?.member?.name === 'Nehemiah');
  r = await post('/members', { name: 'CI Test Member' });
  check('member created', r.status === 201);
  check('rotation grows to 11', (await get('/rounds')).data.length === 11);
  check('member updated', (await patch('/members/' + r.data.id, { name: 'Renamed' })).data.name === 'Renamed');
  check('member deleted', (await del('/members/' + r.data.id)).status === 200);
  check('rotation back to 10', (await get('/rounds')).data.length === 10);

  console.log('\n═══ LOANS (float-safe) ═══');
  const dennis = (await get('/members')).data.find((m) => m.name === 'Dennis');
  const loan = (await post('/loans', { memberId: dennis.id, principal: 3000, currency: 'KES', interestRate: 10 })).data;
  check('loan with 10% interest totals 3,300', near(loan.total, 3300), loan.total);
  check('repayment tracks balance', near((await post(`/loans/${loan.id}/repayments`, { amount: 1000 })).data.outstanding, 2300));
  r = await post(`/loans/${loan.id}/repayments`, { amount: 2300 });
  check('final repayment auto-closes the loan', r.data.status === 'closed' && near(r.data.outstanding, 0), r.data);
  await del('/loans/' + loan.id);

  console.log('\n═══ SETTINGS + QR ═══');
  check('settings saved', (await put('/settings', { contribution: 250 })).data.contribution === 250);
  check('pot recalculated', (await get('/dashboard')).data.kpis.potPerRound === 2500);
  await put('/settings', { contribution: 200 });
  check('group QR generated', (await get('/qr/group')).data.dataUrl?.startsWith('data:image/png;base64,'));
  check('member QR generated', (await get('/members/' + jones.id + '/qr')).data.dataUrl?.startsWith('data:image/png;base64,'));
  check('unknown route 404s', (await get('/does-not-exist')).status === 404);
  check('demo reseed works', (await post('/demo/reseed')).status === 200);
  check('state restored after reseed', (await get('/dashboard')).data.kpis.roundsDone === 2);

  console.log(`\n${fail ? '✗ FAILURES' : '✓ ALL PASSED'}  (${pass} passed, ${fail} failed)\n`);
  process.exit(fail ? 1 : 0);
})();
