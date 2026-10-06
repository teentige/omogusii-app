import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  useResource, Card, Button, Icon, Pill, Avatar, Modal, Field, Input, Select, Empty,
  SkeletonTable, ErrorBox, Confirm, useToast, useGroup, fmt, fmtDate, today,
} from '../ui.jsx';

function PaymentModal({ rounds, members, onClose, onSaved, me }) {
  const { settings } = useGroup();
  const [f, setF] = useState({
    memberId: me?.member_id && me.role !== 'admin' ? String(me.member_id) : (members[0]?.id ? String(members[0].id) : ''),
    roundId: rounds[0] ? String(rounds[0].id) : '',
    amount: String(settings?.contribution ?? 0),
    ref: '', method: settings?.method || '', paidAt: today(), note: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const toast = useToast();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api.saveContribution(f.roundId, {
        memberId: Number(f.memberId), amount: Number(f.amount) || 0,
        ref: f.ref, method: f.method, paidAt: f.paidAt, note: f.note,
      });
      toast('Payment saved');
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Record a payment" subtitle="One row per member per round — saving again updates the same row"
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save payment'}</Button>
      </>}>
      <form onSubmit={submit}>
        <div className="row2">
          <Field label="Member">
            <Select value={f.memberId} onChange={set('memberId')} disabled={me?.role !== 'admin'}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label="Round">
            <Select value={f.roundId} onChange={set('roundId')}>
              {rounds.map((r) => <option key={r.id} value={r.id}>Round {r.n} · {fmtDate(r.due)}</option>)}
            </Select>
          </Field>
        </div>
        <div className="row2">
          <Field label="Amount"><Input type="number" min="0" step="10" value={f.amount} onChange={set('amount')} /></Field>
          <Field label="Paid on"><Input type="date" value={f.paidAt} onChange={set('paidAt')} /></Field>
        </div>
        <div className="row2">
          <Field label="Reference"><Input value={f.ref} onChange={set('ref')} placeholder="M-Pesa / bank ref" /></Field>
          <Field label="Method">
            <Select value={f.method} onChange={set('method')}>
              {['Bank transfer', 'M-Pesa', 'Cash', 'Other'].map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Note"><Input value={f.note} onChange={set('note')} placeholder="optional" /></Field>
        {err && <div className="pill bad">{err}</div>}
      </form>
    </Modal>
  );
}

export default function Contributions({ me }) {
  const [filters, setFilters] = useState({ roundId: '', memberId: '', status: '' });
  const { data, setData, loading, error, reload } = useResource(() => api.contributions(filters), [JSON.stringify(filters)]);
  const members = useResource(() => api.members(), []);
  const rounds = useResource(() => api.rounds(), []);
  const [modal, setModal] = useState(false);
  const [kill, setKill] = useState(null);
  const toast = useToast();
  const { settings } = useGroup();
  const admin = me?.role === 'admin';

  useEffect(() => {
    const h = () => reload({ silent: true });
    window.addEventListener('omogusii:refresh', h);
    return () => window.removeEventListener('omogusii:refresh', h);
  }, [reload]);

  const total = (data || []).reduce((a, c) => a + c.amountGroup, 0);

  const remove = async (c) => {
    const prev = data;
    setData(data.filter((x) => x.id !== c.id));
    setKill(null);
    try { await api.deleteContribution(c.id); toast('Payment removed'); reload({ silent: true }); }
    catch (e) { setData(prev); toast(e.message, 'err'); }
  };

  return (
    <>
      <Card title="Contribution ledger"
        actions={<>
          <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={{ width: 130 }}>
            <option value="">All statuses</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="unpaid">Unpaid</option>
          </Select>
          <Select value={filters.roundId} onChange={(e) => setFilters({ ...filters, roundId: e.target.value })} style={{ width: 150 }}>
            <option value="">All rounds</option>
            {(rounds.data || []).map((r) => <option key={r.id} value={r.id}>Round {r.n}</option>)}
          </Select>
          <Select value={filters.memberId} onChange={(e) => setFilters({ ...filters, memberId: e.target.value })} style={{ width: 160 }}>
            <option value="">All members</option>
            {(members.data || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          <Button size="sm" icon={<Icon n="plus" size={15} />} onClick={() => setModal(true)}>Record payment</Button>
        </>} flush>
        {loading ? <SkeletonTable rows={8} cols={7} />
          : error ? <ErrorBox>{error}</ErrorBox>
            : !data?.length ? <Empty icon="receipt" title="No payments match" text="Change the filters, or record the first payment for this round."
                action={<Button onClick={() => setModal(true)} icon={<Icon n="plus" size={15} />}>Record payment</Button>} />
              : (
                <>
                  <div className="wrap">
                    <table>
                      <thead><tr>
                        <th>Round</th><th>Member</th><th>Paid on</th><th>Method</th><th>Reference</th>
                        <th className="num">Amount</th><th>Status</th><th />
                      </tr></thead>
                      <tbody>
                        {data.map((c) => (
                          <tr key={c.id}>
                            <td><b>R{c.round_n}</b><div className="tiny muted">{fmtDate(c.due_date)}</div></td>
                            <td><div className="who"><Avatar name={c.member_name} size="sm" /><b>{c.member_name}</b></div></td>
                            <td className="nowrap">{fmtDate(c.paid_at)}</td>
                            <td className="muted small">{c.method || '—'}</td>
                            <td className="muted small">{c.ref || '—'}</td>
                            <td className="num" style={{ fontWeight: 650 }}>{fmt(c.amountGroup, settings?.currency)}</td>
                            <td><Pill kind={c.status === 'paid' ? 'ok' : c.status === 'partial' ? 'warn' : 'mute'}>{c.status}</Pill></td>
                            <td style={{ textAlign: 'right' }}>
                              {admin && <button className="ib danger" onClick={() => setKill(c)}><Icon n="trash" size={14} /></button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bd" style={{ borderTop: '1px solid var(--line-2)', display: 'flex', gap: 14, alignItems: 'center' }}>
                    <b>{data.length} payment{data.length === 1 ? '' : 's'}</b>
                    <span className="sp" />
                    <span className="muted small">Total</span>
                    <b style={{ fontSize: 16 }}>{fmt(total, settings?.currency)}</b>
                  </div>
                </>
              )}
      </Card>

      {modal && rounds.data && members.data && (
        <PaymentModal rounds={rounds.data} members={members.data} me={me}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); reload(); window.dispatchEvent(new CustomEvent('omogusii:refresh')); }} />
      )}
      {kill && (
        <Confirm title="Delete this payment?" text={`${kill.member_name} · Round ${kill.round_n} · ${fmt(kill.amountGroup, settings?.currency)}`}
          onClose={() => setKill(null)} onConfirm={() => remove(kill)} />
      )}
    </>
  );
}
