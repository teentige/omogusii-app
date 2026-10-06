import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  useResource, Card, Button, Icon, Pill, Avatar, Bar, Modal, Field, Input, Select, Empty,
  Skeleton, ErrorBox, Confirm, useToast, useGroup, fmt, fmtDate, daysUntil, today,
} from '../ui.jsx';

function LoanForm({ loan, members, onClose, onSaved }) {
  const { settings } = useGroup();
  const [f, setF] = useState({
    memberId: loan?.member_id ? String(loan.member_id) : (members[0] ? String(members[0].id) : ''),
    principal: loan ? String(loan.principal) : '',
    currency: loan?.currency || settings?.secondaryCurrency || 'KES',
    interestRate: loan ? String(loan.interest_rate || 0) : '0',
    issuedAt: loan?.issued_at || today(),
    dueAt: loan?.due_at || '',
    termMonths: loan?.term_months ? String(loan.term_months) : '',
    purpose: loan?.purpose || '',
    note: loan?.note || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const toast = useToast();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const body = { ...f, memberId: Number(f.memberId), principal: Number(f.principal), interestRate: Number(f.interestRate), termMonths: f.termMonths ? Number(f.termMonths) : null };
      await (loan ? api.updateLoan(loan.id, body) : api.addLoan(body));
      toast(loan ? 'Loan updated' : 'Loan recorded');
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={loan ? 'Edit loan' : 'Record a loan'} subtitle="Loans sit alongside the rotation — the pot is never silently reduced"
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : loan ? 'Save changes' : 'Record loan'}</Button>
      </>}>
      <form onSubmit={submit}>
        <Field label="Member">
          <Select value={f.memberId} onChange={set('memberId')} disabled={!!loan}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <div className="row2">
          <Field label="Amount"><Input type="number" min="0" step="100" value={f.principal} onChange={set('principal')} required /></Field>
          <Field label="Currency">
            <Select value={f.currency} onChange={set('currency')}>
              {[settings?.secondaryCurrency || 'KES', settings?.currency || 'QAR'].map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <div className="row2">
          <Field label="Interest %" hint="0 for an interest-free loan"><Input type="number" min="0" step="1" value={f.interestRate} onChange={set('interestRate')} /></Field>
          <Field label="Term (months)"><Input type="number" min="1" value={f.termMonths} onChange={set('termMonths')} placeholder="optional" /></Field>
        </div>
        <div className="row2">
          <Field label="Issued on"><Input type="date" value={f.issuedAt} onChange={set('issuedAt')} /></Field>
          <Field label="Final due date"><Input type="date" value={f.dueAt} onChange={set('dueAt')} /></Field>
        </div>
        <Field label="Purpose"><Input value={f.purpose} onChange={set('purpose')} placeholder="e.g. school fees" /></Field>
        <Field label="Note"><Input value={f.note} onChange={set('note')} placeholder="agreed instalments, witness…" /></Field>
        {err && <div className="pill bad">{err}</div>}
      </form>
    </Modal>
  );
}

function RepayModal({ loan, onClose, onSaved }) {
  const [f, setF] = useState({ amount: '', paidAt: today(), ref: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const toast = useToast();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api.repay(loan.id, { amount: Number(f.amount), paidAt: f.paidAt, ref: f.ref, note: f.note });
      toast(`Repayment of ${fmt(Number(f.amount) || 0, loan.currency)} recorded`);
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Record a repayment" subtitle={`${loan.member_name} · ${fmt(loan.principal, loan.currency)} loan`} onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Record repayment'}</Button>
      </>}>
      <form onSubmit={submit}>
        <div className="row2">
          <Field label="Amount"><Input type="number" min="1" step="100" value={f.amount} onChange={set('amount')} required /></Field>
          <Field label="Paid on"><Input type="date" value={f.paidAt} onChange={set('paidAt')} /></Field>
        </div>
        <Field label="Reference"><Input value={f.ref} onChange={set('ref')} /></Field>
        <Field label="Note"><Input value={f.note} onChange={set('note')} /></Field>
        {err && <div className="pill bad">{err}</div>}
      </form>
    </Modal>
  );
}

export default function Loans({ me }) {
  const { data, setData, loading, error, reload } = useResource(() => api.loans(), []);
  const members = useResource(() => api.members(), []);
  const [form, setForm] = useState(null);
  const [repay, setRepay] = useState(null);
  const [kill, setKill] = useState(null);
  const toast = useToast();
  const { settings } = useGroup();
  const admin = me?.role === 'admin';

  useEffect(() => {
    const h = () => reload({ silent: true });
    window.addEventListener('omogusii:refresh', h);
    return () => window.removeEventListener('omogusii:refresh', h);
  }, [reload]);

  const remove = async (l) => {
    const prev = data;
    setData(data.filter((x) => x.id !== l.id));       // optimistic
    setKill(null);
    try { await api.deleteLoan(l.id); toast('Loan deleted'); reload({ silent: true }); }
    catch (e) { setData(prev); toast(e.message, 'err'); }
  };

  if (loading) {
    return (
      <div className="grid g2">
        <Card title="Loans"><div className="bd"><Skeleton h={110} /><Skeleton h={110} /></div></Card>
        <Card title="Summary"><div className="bd"><Skeleton h={180} /></div></Card>
      </div>
    );
  }
  if (error) return <ErrorBox>{error}</ErrorBox>;

  const open = (data || []).filter((l) => l.status === 'open');
  const closed = (data || []).filter((l) => l.status !== 'open');
  const owedGroup = open.reduce((a, l) => a + l.outstandingGroup, 0);

  return (
    <>
      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <div className="card kpi">
          <div className="lab">Outstanding loans</div>
          <div className="val">{fmt(owedGroup, settings?.currency)}</div>
          <div className="foot">{open.length} open · {closed.length} cleared</div>
          <div className="ico"><Icon n="loan" size={17} /></div>
        </div>
        <div className="card kpi">
          <div className="lab">In {settings?.secondaryCurrency}</div>
          <div className="val">{fmt(owedGroup * (Number(settings?.fx) || 1), settings?.secondaryCurrency)}</div>
          <div className="foot">at 1 {settings?.currency} = {settings?.fx} {settings?.secondaryCurrency}</div>
          <div className="ico"><Icon n="trend" size={17} /></div>
        </div>
        <div className="card kpi">
          <div className="lab">Repayments recorded</div>
          <div className="val">{(data || []).reduce((a, l) => a + (l.repayments || 0), 0)}</div>
          <div className="foot">across {(data || []).length} loan{(data || []).length === 1 ? '' : 's'}</div>
          <div className="ico"><Icon n="check" size={17} /></div>
        </div>
      </div>

      <Card title="Loans" actions={<>
        {admin && <Button size="sm" icon={<Icon n="plus" size={15} />} onClick={() => setForm({})}>New loan</Button>}
      </>}>
        {!data?.length
          ? <Empty icon="loan" title="No loans yet" text="When the group lends from its savings, record it here and track instalments."
              action={admin ? <Button onClick={() => setForm({})} icon={<Icon n="plus" size={15} />}>Record a loan</Button> : null} />
          : (
            <div className="stack">
              {[...open, ...closed].map((l) => (
                <div key={l.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 16, background: 'var(--panel-2)' }}>
                  <div className="flex" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <Avatar name={l.member_name} />
                    <div style={{ minWidth: 170 }}>
                      <b style={{ fontSize: 15 }}>{l.member_name}</b>
                      <div className="small muted">{fmt(l.principal, l.currency)} · {l.purpose || 'loan'}</div>
                      <div className="tiny muted">issued {fmtDate(l.issued_at)}{l.due_at ? ` · due ${fmtDate(l.due_at)} (${daysUntil(l.due_at)})` : ''}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div className="flex small">
                        <span className="muted">repaid {fmt(l.repaid, l.currency)} of {fmt(l.total, l.currency)}</span>
                        <span className="sp" style={{ fontWeight: 700, color: l.status === 'open' ? 'var(--danger)' : 'var(--primary)' }}>
                          {l.status === 'open' ? `owes ${fmt(l.outstanding, l.currency)}` : 'cleared'}
                        </span>
                      </div>
                      <div style={{ marginTop: 8 }}><Bar value={l.repaid} max={l.total} warn={l.status === 'open'} /></div>
                      <div className="tiny muted" style={{ marginTop: 6 }}>
                        {l.progress}% repaid · {l.repayments} instalment{l.repayments === 1 ? '' : 's'}
                        {l.interest_rate ? ` · ${l.interest_rate}% interest` : ' · interest-free'}
                        {l.status === 'open' && ` · ≈ ${fmt(l.outstandingGroup, settings?.currency)}`}
                      </div>
                    </div>
                    <div className="flex" style={{ gap: 6 }}>
                      <Pill kind={l.status === 'open' ? 'warn' : 'ok'}>{l.status === 'open' ? 'Open' : 'Closed'}</Pill>
                      {admin && l.status === 'open' && <Button size="sm" variant="soft" onClick={() => setRepay(l)}>Repay</Button>}
                      {admin && <button className="ib" onClick={() => setForm(l)}><Icon n="edit" size={14} /></button>}
                      {admin && <button className="ib danger" onClick={() => setKill(l)}><Icon n="trash" size={14} /></button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </Card>

      {form && members.data && (
        <LoanForm loan={form.id ? form : null} members={members.data} onClose={() => setForm(null)}
          onSaved={() => { setForm(null); reload(); window.dispatchEvent(new CustomEvent('omogusii:refresh')); }} />
      )}
      {repay && <RepayModal loan={repay} onClose={() => setRepay(null)}
        onSaved={() => { setRepay(null); reload(); window.dispatchEvent(new CustomEvent('omogusii:refresh')); }} />}
      {kill && (
        <Confirm title={`Delete ${kill.member_name}'s loan?`} text="The loan and every instalment against it will be removed."
          onClose={() => setKill(null)} onConfirm={() => remove(kill)} />
      )}
    </>
  );
}
