import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  useResource, Card, Button, Icon, Pill, Avatar, Modal, Field, Input, Select, Textarea, Empty,
  Skeleton, ErrorBox, useToast, useGroup, fmtDate, fmt, today,
} from '../ui.jsx';

const TYPES = {
  contribution_due: { label: 'Contribution', icon: 'receipt', kind: 'info' },
  overdue:          { label: 'Overdue',      icon: 'alert',   kind: 'bad' },
  loan_repayment:   { label: 'Loan',         icon: 'loan',    kind: 'warn' },
  payout_notice:    { label: 'Payout',       icon: 'wallet',  kind: 'ok' },
  custom:           { label: 'Custom',       icon: 'bell',    kind: 'mute' },
};
const STATUS = { pending: ['Pending', 'warn'], snoozed: ['Snoozed', 'info'], sent: ['Sent', 'ok'], dismissed: ['Dismissed', 'mute'] };

const digits = (p = '') => p.replace(/\D/g, '');
const waUrl = (phone, msg) => `https://wa.me/${digits(phone)}?text=${encodeURIComponent(msg)}`;
const smsUrl = (phone, msg) => `sms:${digits(phone)}${/\biP(hone|ad|od)/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(msg)}`;

function NewReminder({ members, rounds, loans, onClose, onSaved }) {
  const { settings } = useGroup();
  const openRound = rounds.find((r) => !r.disbursedAt);
  const [f, setF] = useState({
    memberId: members[0] ? String(members[0].id) : '',
    type: 'contribution_due', channel: 'whatsapp', scheduledFor: today(), message: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const toast = useToast();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const template = (memberId, type) => {
    const m = members.find((x) => String(x.id) === String(memberId));
    const name = m ? m.name : 'there';
    const loan = loans.find((l) => l.member_id === m?.id && l.status === 'open');
    switch (type) {
      case 'contribution_due':
        return `Habari ${name} 👋 Round ${openRound?.n ?? ''} contribution of ${settings?.currency} ${settings?.contribution} is due ${openRound ? fmtDate(openRound.due) : 'soon'}. Pay to ${settings?.account}. Asante!`;
      case 'overdue':
        return `Habari ${name} 👋 your Round ${openRound?.n ?? ''} contribution is still outstanding. Please clear it today so the payout is not delayed.`;
      case 'loan_repayment':
        return `Habari ${name} 👋 your loan balance is ${loan ? fmt(loan.outstanding, loan.currency) : 'outstanding'}. Please pay your next instalment to ${settings?.account}.`;
      case 'payout_notice':
        return `Habari ${name} 🎉 you receive the Round ${openRound?.n ?? ''} pot on ${openRound ? fmtDate(openRound.due) : 'the next payout date'}.`;
      default: return '';
    }
  };

  const change = (k) => (e) => {
    const v = e.target.value;
    const next = { ...f, [k]: v };
    if (k === 'type' || k === 'memberId') next.message = template(k === 'memberId' ? v : f.memberId, k === 'type' ? v : f.type);
    setF(next);
  };

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api.addReminder({
        memberId: Number(f.memberId), type: f.type, channel: f.channel,
        message: f.message, scheduledFor: f.scheduledFor, roundId: openRound?.id ?? null,
      });
      toast('Reminder queued');
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="New reminder" subtitle="Queue it now, then send it from the list" onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Queue reminder'}</Button>
      </>}>
      <form onSubmit={submit}>
        <div className="row2">
          <Field label="Member">
            <Select value={f.memberId} onChange={change('memberId')}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={f.type} onChange={change('type')}>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="row2">
          <Field label="Channel">
            <Select value={f.channel} onChange={set('channel')}>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
              <option value="in-app">In-app only</option>
            </Select>
          </Field>
          <Field label="Send on"><Input type="date" value={f.scheduledFor} onChange={set('scheduledFor')} /></Field>
        </div>
        <Field label="Message" hint="Opens ready to send in WhatsApp or SMS">
          <Textarea value={f.message} onChange={set('message')} rows={5} />
        </Field>
        {err && <div className="pill bad">{err}</div>}
      </form>
    </Modal>
  );
}

export default function Reminders({ me }) {
  const [tab, setTab] = useState('');
  const { data, setData, loading, error, reload } = useResource(() => api.reminders(tab ? { status: tab } : {}), [tab]);
  const members = useResource(() => api.members(), []);
  const rounds = useResource(() => api.rounds(), []);
  const loans = useResource(() => api.loans(), []);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState('');
  const toast = useToast();

  useEffect(() => {
    const h = () => reload({ silent: true });
    window.addEventListener('omogusii:refresh', h);
    return () => window.removeEventListener('omogusii:refresh', h);
  }, [reload]);

  const bulk = async (type, label) => {
    setBusy(type);
    try {
      const res = await api.bulkReminders(type);
      toast(`${res.created} ${label} queued`);
      reload();
      window.dispatchEvent(new CustomEvent('omogusii:refresh'));
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(''); }
  };

  const patch = async (r, body, msg) => {
    const prev = data;
    setData(data.map((x) => (x.id === r.id ? { ...x, ...body } : x)));     // optimistic
    try { await api.updateReminder(r.id, body); if (msg) toast(msg); reload({ silent: true }); }
    catch (e) { setData(prev); toast(e.message, 'err'); }
  };

  const send = async (r) => {
    const url = r.channel === 'sms' ? smsUrl(r.member_phone, r.message) : waUrl(r.member_phone, r.message);
    if (r.channel !== 'in-app') window.open(url, '_blank', 'noopener');
    await patch(r, { status: 'sent' }, r.channel === 'in-app' ? 'Marked as sent' : `Opened in ${r.channel === 'sms' ? 'Messages' : 'WhatsApp'}`);
  };

  const snooze = (r) => {
    const d = new Date(); d.setDate(d.getDate() + 3);
    patch(r, { status: 'snoozed', scheduledFor: d.toISOString().slice(0, 10) }, 'Snoozed for 3 days');
  };

  const remove = async (r) => {
    const prev = data;
    setData(data.filter((x) => x.id !== r.id));
    try { await api.deleteReminder(r.id); toast('Reminder deleted'); }
    catch (e) { setData(prev); toast(e.message, 'err'); }
  };

  const tabs = [['', 'All'], ['pending', 'Pending'], ['snoozed', 'Snoozed'], ['sent', 'Sent']];

  return (
    <>
      <Card title="Quick reminders"
        actions={<span className="tiny muted">queues a message for every matching member</span>}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          {[
            ['defaulters', 'Nudge defaulters', 'alert', 'bad', 'Members who still owe this round'],
            ['all', 'Remind everyone', 'users', 'info', 'Round reminder to all active members'],
            ['loan', 'Loan reminder', 'loan', 'warn', 'Everyone with an open loan'],
            ['payout', 'Payout notice', 'wallet', 'ok', 'Whoever receives the next pot'],
          ].map(([type, label, icon, tone, hint]) => (
            <button key={type} onClick={() => bulk(type, label.toLowerCase())}
              style={{
                textAlign: 'left', padding: 14, borderRadius: 12, border: '1px solid var(--line)',
                background: 'var(--panel-2)', opacity: busy && busy !== type ? .5 : 1,
              }}>
              <div className="flex">
                <div className="av sm" style={{ background: `var(--${tone === 'ok' ? 'primary' : tone}-soft)`, color: `var(--${tone === 'ok' ? 'primary' : tone})` }}>
                  <Icon n={icon} size={15} />
                </div>
                <b style={{ fontSize: 13.5 }}>{busy === type ? 'Queueing…' : label}</b>
              </div>
              <div className="tiny muted" style={{ marginTop: 8 }}>{hint}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Reminder queue"
        actions={<>
          <div className="flex" style={{ gap: 6 }}>
            {tabs.map(([v, l]) => (
              <button key={l} className={`btn sm ${tab === v ? '' : 'ghost'}`} onClick={() => setTab(v)}>{l}</button>
            ))}
          </div>
          <Button size="sm" icon={<Icon n="plus" size={15} />} onClick={() => setModal(true)}>New</Button>
        </>}>
        {loading ? <div className="stack">{[0, 1, 2].map((i) => <Skeleton key={i} h={72} mb={0} />)}</div>
          : error ? <ErrorBox>{error}</ErrorBox>
            : !data?.length
              ? <Empty icon="bell" title="Nothing in the queue" text="Use a quick reminder above, or write one yourself."
                  action={<Button onClick={() => setModal(true)} icon={<Icon n="plus" size={15} />}>New reminder</Button>} />
              : (
                <div className="stack">
                  {data.map((r) => {
                    const t = TYPES[r.type] || TYPES.custom;
                    const [label, kind] = STATUS[r.status] || STATUS.pending;
                    return (
                      <div key={r.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: 'var(--panel-2)' }}>
                        <div className="flex" style={{ gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <div className="av sm" style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
                            <Icon n={t.icon} size={15} />
                          </div>
                          <div style={{ minWidth: 180, flex: 1 }}>
                            <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
                              <b style={{ fontSize: 14 }}>{r.member_name || 'Whole group'}</b>
                              <Pill kind={t.kind}>{t.label}</Pill>
                              <Pill kind={kind}>{label}</Pill>
                              <Pill kind="mute">{r.channel}</Pill>
                              {r.round_n && <span className="tiny muted">Round {r.round_n}</span>}
                            </div>
                            <div style={{ fontSize: 13, marginTop: 8, color: 'var(--muted)' }}>{r.message}</div>
                            <div className="tiny muted" style={{ marginTop: 6 }}>
                              {r.status === 'sent' ? `sent ${fmtDate(r.sent_at)}` : `scheduled ${fmtDate(r.scheduled_for)}`} · by {r.created_by || '—'}
                            </div>
                          </div>
                          <div className="flex" style={{ gap: 6, flexWrap: 'wrap' }}>
                            {r.status !== 'sent' && (
                              <Button size="sm" icon={<Icon n={r.channel === 'sms' ? 'sms' : 'whatsapp'} size={14} />} onClick={() => send(r)}>
                                {r.channel === 'sms' ? 'SMS' : r.channel === 'in-app' ? 'Mark sent' : 'WhatsApp'}
                              </Button>
                            )}
                            {r.status === 'pending' && <Button size="sm" variant="ghost" icon={<Icon n="clock" size={14} />} onClick={() => snooze(r)}>Snooze</Button>}
                            {r.status !== 'sent' && <Button size="sm" variant="ghost" onClick={() => patch(r, { status: 'dismissed' }, 'Dismissed')}>Dismiss</Button>}
                            <button className="ib danger" onClick={() => remove(r)}><Icon n="trash" size={14} /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
      </Card>

      {modal && members.data && rounds.data && (
        <NewReminder members={members.data} rounds={rounds.data} loans={loans.data || []}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); reload(); window.dispatchEvent(new CustomEvent('omogusii:refresh')); }} />
      )}
    </>
  );
}
