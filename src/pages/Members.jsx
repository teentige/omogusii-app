import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  useResource, Card, Button, Icon, Pill, Avatar, Modal, Field, Input, Textarea, Empty,
  SkeletonTable, ErrorBox, Confirm, useToast, useGroup, fmt, fmtDate, timeAgo,
} from '../ui.jsx';

function MemberForm({ member, onClose, onSaved }) {
  const [f, setF] = useState({
    name: member?.name || '', phone: member?.phone || '', email: member?.email || '',
    notes: member?.notes || '', joinedAt: member?.joined_at || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const toast = useToast();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await (member ? api.updateMember(member.id, f) : api.addMember(f));
      toast(member ? 'Member updated' : `${f.name} added to the rotation`);
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={member ? `Edit ${member.name}` : 'Add a member'} subtitle={member ? 'Changes apply everywhere immediately' : 'They join at the end of the payout rotation'}
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : member ? 'Save changes' : 'Add member'}</Button>
      </>}>
      <form onSubmit={submit}>
        <Field label="Full name"><Input value={f.name} onChange={set('name')} placeholder="e.g. Godfrey" required /></Field>
        <div className="row2">
          <Field label="Phone"><Input value={f.phone} onChange={set('phone')} placeholder="+974 3312 4567" /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} placeholder="optional" /></Field>
        </div>
        <Field label="Joined"><Input type="date" value={f.joinedAt} onChange={set('joinedAt')} /></Field>
        <Field label="Notes" hint="Anything the group should remember"><Textarea value={f.notes} onChange={set('notes')} /></Field>
        {err && <div className="pill bad">{err}</div>}
      </form>
    </Modal>
  );
}

function MemberDetail({ id, onClose }) {
  const { data, loading, error } = useResource(() => api.member(id), [id]);
  const [qr, setQr] = useState(null);
  useEffect(() => { api.memberQr(id).then(setQr).catch(() => {}); }, [id]);
  const { settings } = useGroup();

  return (
    <Modal wide title={data ? data.member.name : 'Member'} subtitle={data ? `Position ${data.member.position} in the rotation` : ''} onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      {loading && <><SkeletonTable rows={3} cols={3} /></>}
      {error && <div className="pill bad">{error}</div>}
      {data && (
        <div className="stack">
          <div className="flex" style={{ gap: 14, flexWrap: 'wrap' }}>
            <Avatar name={data.member.name} />
            <div style={{ minWidth: 0 }}>
              <b style={{ fontSize: 16 }}>{data.member.name}</b>
              <div className="small muted">{data.member.phone || 'no phone'} · {data.member.email || 'no email'}</div>
            </div>
            <div className="sp flex" style={{ gap: 8 }}>
              {data.payoutRound && <Pill kind={data.payoutRound.disbursedAt ? 'ok' : 'info'}>
                {data.payoutRound.disbursedAt ? `Received round ${data.payoutRound.n}` : `Receives round ${data.payoutRound.n} · ${fmtDate(data.payoutRound.due)}`}
              </Pill>}
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12 }}>
            {[
              ['Paid in', fmt(data.summary?.paidIn || 0, settings?.currency)],
              ['Received', fmt(data.summary?.received || 0, settings?.currency)],
              ['Net position', fmt(data.summary?.net || 0, settings?.currency)],
              ['Rounds paid', `${data.summary?.roundsPaid || 0}/${data.summary?.rounds || 0}`],
            ].map(([l, v]) => (
              <div key={l} style={{ background: 'var(--panel-2)', borderRadius: 12, padding: 12 }}>
                <div className="tiny muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{l}</div>
                <b style={{ fontSize: 16 }}>{v}</b>
              </div>
            ))}
          </div>

          {qr && (
            <div className="flex" style={{ gap: 16, background: 'var(--panel-2)', padding: 14, borderRadius: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <img src={qr.dataUrl} alt="member QR" width={104} height={104} style={{ borderRadius: 10, background: '#fff' }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <b>Payment QR</b>
                <div className="small muted">Scan to pull up this member's contribution details. Share it in the group chat.</div>
                <code className="tiny muted" style={{ display: 'block', marginTop: 6, wordBreak: 'break-all' }}>{qr.payload}</code>
              </div>
            </div>
          )}

          <div>
            <b style={{ fontSize: 13 }}>Contribution history</b>
            <div className="wrap" style={{ marginTop: 8 }}>
              <table>
                <thead><tr><th>Round</th><th>Due</th><th>Ref</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {data.history.map((h) => (
                    <tr key={h.id}><td>R{h.round_n}</td><td className="nowrap">{fmtDate(h.due_date)}</td>
                      <td className="muted">{h.ref || '—'}</td>
                      <td className="num">{fmt(h.amount, h.currency)}</td></tr>
                  ))}
                  {!data.history.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 20 }}>No payments recorded yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {data.loans.length > 0 && (
            <div>
              <b style={{ fontSize: 13 }}>Loans</b>
              <div className="stack" style={{ marginTop: 8 }}>
                {data.loans.map((l) => {
                  const total = l.principal * (1 + (l.interest_rate || 0) / 100);
                  const owed = Math.max(0, total - l.repaid);
                  return (
                    <div key={l.id} className="flex" style={{ background: 'var(--panel-2)', padding: 12, borderRadius: 12 }}>
                      <Icon n="loan" size={17} />
                      <div style={{ minWidth: 0 }}>
                        <b style={{ fontSize: 13.5 }}>{fmt(l.principal, l.currency)} · {l.purpose || 'loan'}</b>
                        <div className="tiny muted">issued {fmtDate(l.issued_at)} · repaid {fmt(l.repaid, l.currency)}</div>
                      </div>
                      <div className="sp"><Pill kind={l.status === 'open' ? 'warn' : 'ok'}>
                        {l.status === 'open' ? `owes ${fmt(owed, l.currency)}` : 'cleared'}</Pill></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Members({ me }) {
  const { data, setData, loading, error, reload } = useResource(() => api.members(), []);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);     // null | {} | member
  const [view, setView] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const toast = useToast();
  const { settings } = useGroup();
  const admin = me?.role === 'admin';

  useEffect(() => {
    const h = () => reload({ silent: true });
    window.addEventListener('omogusii:refresh', h);
    return () => window.removeEventListener('omogusii:refresh', h);
  }, [reload]);

  const move = async (m, direction) => {
    if (!admin) return;
    const prev = data;
    const i = data.findIndex((x) => x.id === m.id);
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= data.length) return;
    const next = [...data];
    [next[i], next[j]] = [next[j], next[i]];
    setData(next.map((x, k) => ({ ...x, position: k + 1 })));   // optimistic
    try { await api.reorder(m.id, direction); reload({ silent: true }); }
    catch (e) { setData(prev); toast(e.message, 'err'); }
  };

  const remove = async (m) => {
    const prev = data;
    setData(data.filter((x) => x.id !== m.id));                  // optimistic
    setConfirm(null);
    try { await api.deleteMember(m.id); toast(`${m.name} removed`); reload({ silent: true }); }
    catch (e) { setData(prev); toast(e.message, 'err'); }
  };

  const list = (data || []).filter((m) => `${m.name} ${m.phone || ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <Card title="Members"
        actions={<>
          <div className="flex" style={{ gap: 8 }}>
            <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 160 }} />
            {admin && <Button size="sm" icon={<Icon n="plus" size={15} />} onClick={() => setForm({})}>Add member</Button>}
          </div>
        </>} flush>
        {loading ? <SkeletonTable rows={6} cols={6} />
          : error ? <ErrorBox>{error}</ErrorBox>
          : !list.length ? <Empty icon="users" title={q ? 'No match' : 'No members yet'}
              text={q ? 'Try a different name or phone number.' : 'Add the first member to start building the rotation.'}
              action={admin && !q ? <Button onClick={() => setForm({})} icon={<Icon n="plus" size={15} />}>Add member</Button> : null} />
            : (
              <div className="wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 46 }}>#</th><th>Member</th>
                      <th className="num">Paid in</th><th className="num">Received</th>
                      <th className="num">Net</th><th>Rounds</th><th>Loan</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((m) => (
                      <tr key={m.id}>
                        <td className="muted">{m.position}</td>
                        <td>
                          <button className="who" onClick={() => setView(m.id)} style={{ textAlign: 'left' }}>
                            <Avatar name={m.name} size="sm" />
                            <span style={{ minWidth: 0 }}>
                              <b>{m.name}</b>
                              <span>{m.phone || '—'}</span>
                            </span>
                          </button>
                        </td>
                        <td className="num">{fmt(m.paidIn, settings?.currency)}</td>
                        <td className="num">{fmt(m.received, settings?.currency)}</td>
                        <td className="num" style={{ color: m.net < 0 ? 'var(--danger)' : m.net > 0 ? 'var(--primary)' : undefined, fontWeight: 650 }}>
                          {m.net > 0 ? '+' : ''}{fmt(m.net, settings?.currency)}
                        </td>
                        <td className="muted nowrap">{m.roundsPaid}/{m.rounds}</td>
                        <td>{m.loanOutstanding > 0
                          ? <Pill kind="warn">{fmt(m.loanOutstanding, m.loanCurrency || 'KES')}</Pill>
                          : <span className="muted tiny">—</span>}</td>
                        <td>
                          <div className="flex" style={{ gap: 4, justifyContent: 'flex-end' }}>
                            {admin && <button className="ib" title="Move up" onClick={() => move(m, 'up')}><Icon n="up" size={14} /></button>}
                            {admin && <button className="ib" title="Move down" onClick={() => move(m, 'down')}><Icon n="down" size={14} /></button>}
                            {admin && <button className="ib" title="Edit" onClick={() => setForm(m)}><Icon n="edit" size={14} /></button>}
                            {admin && <button className="ib danger" title="Remove" onClick={() => setConfirm(m)}><Icon n="trash" size={14} /></button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </Card>

      <div className="card"><div className="bd small muted">
        The order above is the payout rotation. Moving a member changes who receives every future round — recorded payments are never lost.
      </div></div>

      {form && <MemberForm member={form.id ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); window.dispatchEvent(new CustomEvent('omogusii:refresh')); }} />}
      {view && <MemberDetail id={view} onClose={() => setView(null)} />}
      {confirm && (
        <Confirm title={`Remove ${confirm.name}?`} text="Their payment history goes too, and the rotation closes up around them. This cannot be undone."
          onClose={() => setConfirm(null)} onConfirm={() => remove(confirm)} />
      )}
    </>
  );
}
