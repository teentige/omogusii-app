import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  useResource, Card, Button, Icon, Pill, Avatar, Bar, Money, Empty, Skeleton, SkeletonTable,
  ErrorBox, Confirm, useToast, useGroup, fmt, fmtDate, daysUntil, today,
} from '../ui.jsx';

/* ══════════════════  ROUND DETAIL  ══════════════════ */
function RoundDetail({ id, onBack, admin, myMemberId }) {
  const { data, setData, loading, error, reload } = useResource(() => api.round(id), [id]);
  const toast = useToast();
  const { settings } = useGroup();
  const [confirm, setConfirm] = useState(null);

  const patchLine = (memberId, amount) => {
    setData((d) => {
      if (!d) return d;
      const lines = d.lines.map((l) => l.member.id === memberId ? { ...l, amount, status: amount <= 0 ? 'unpaid' : amount >= l.expected ? 'paid' : 'partial' } : l);
      return { ...d, lines, collected: lines.reduce((a, l) => a + l.amount, 0) };
    });
  };

  const save = async (line, amount, extra = {}) => {
    const prev = data;
    patchLine(line.member.id, amount);                                  // optimistic
    try {
      const updated = await api.saveContribution(id, {
        memberId: line.member.id, amount, ref: extra.ref ?? line.contribution?.ref,
        method: line.contribution?.method, note: line.contribution?.note, paidAt: amount > 0 ? (line.contribution?.paid_at || today()) : null,
      });
      setData(updated);
      window.dispatchEvent(new CustomEvent('omogusii:refresh'));
    } catch (e) { setData(prev); toast(e.message, 'err'); }
  };

  const togglePaid = (line) => {
    const paid = line.amount >= line.expected && line.expected > 0;
    save(line, paid ? 0 : line.expected);
  };

  const markAll = async () => {
    if (!data) return;
    const prev = data;
    setData({ ...data, lines: data.lines.map((l) => ({ ...l, amount: l.expected, status: 'paid' })), collected: data.expected });
    try {
      for (const l of prev.lines) {
        await api.saveContribution(id, { memberId: l.member.id, amount: l.expected, ref: l.contribution?.ref });
      }
      toast('Everyone marked as paid');
      reload({ silent: true });
      window.dispatchEvent(new CustomEvent('omogusii:refresh'));
    } catch (e) { setData(prev); toast(e.message, 'err'); }
  };

  const disburse = async () => {
    if (!data) return;
    const prev = data;
    setData({ ...data, disbursed_at: data.disbursed_at ? null : today() });
    try {
      const updated = await api.disburse(id);
      setData(updated);
      toast(data.disbursed_at ? 'Handover un-marked' : `Pot handed to ${data.lines.find((l) => l.member.id === data.recipient_id)?.member.name || 'member'}`);
      reload({ silent: true });
      window.dispatchEvent(new CustomEvent('omogusii:refresh'));
    } catch (e) { setData(prev); toast(e.message, 'err'); }
  };

  if (loading) return <Card title="Round"><SkeletonTable rows={6} cols={4} /></Card>;
  if (error) return <ErrorBox>{error}</ErrorBox>;
  const pct = data.expected ? Math.min(100, Math.round((data.collected / data.expected) * 100)) : 0;

  return (
    <>
      <Button variant="ghost" size="sm" icon={<Icon n="x" size={14} />} onClick={onBack} style={{ marginBottom: 12 }}>Back to rounds</Button>

      <Card title={`Round ${data.n}`}
        actions={<>
          <Pill kind={data.disbursed_at ? 'ok' : 'warn'}>{data.disbursed_at ? 'Paid out' : 'Open'}</Pill>
          {admin && <Button size="sm" variant="ghost" onClick={() => setConfirm('round')}><Icon n="trash" size={14} /></Button>}
        </>}>
        <div className="flex" style={{ gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ minWidth: 220 }}>
            <div className="tiny muted" style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>Receives the pot</div>
            <div className="flex" style={{ gap: 10, marginTop: 8 }}>
              <Avatar name={data.lines.find((l) => l.member.id === data.recipient_id)?.member.name || '—'} />
              <div>
                <b style={{ fontSize: 15 }}>{data.lines.find((l) => l.member.id === data.recipient_id)?.member.name || 'Unassigned'}</b>
                <div className="small muted">{fmtDate(data.due_date)} · {daysUntil(data.due_date)}</div>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="flex small muted"><span>Collected</span><span className="sp"><Money v={data.collected} /> of <Money v={data.expected} /></span></div>
            <div style={{ marginTop: 8 }}><Bar value={data.collected} max={data.expected} /></div>
            <div className="tiny muted" style={{ marginTop: 8 }}>
              {data.paidCount} paid · {data.partialCount} partial · {data.unpaidCount} unpaid
              {data.outstanding > 0 && ` · ${fmt(data.outstanding, settings?.currency)} outstanding`}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="tiny muted">Full pot</div>
            <div style={{ fontSize: 20, fontWeight: 750 }}><Money v={data.expected} /></div>
            <div className="tiny muted">{pct}% collected</div>
          </div>
        </div>

        <div className="flex" style={{ marginTop: 16, gap: 8, flexWrap: 'wrap' }}>
          {admin && <Button size="sm" variant="soft" icon={<Icon n="check" size={14} />} onClick={markAll}>Mark all paid</Button>}
          {admin && <Button size="sm" variant={data.disbursed_at ? 'ghost' : ''} icon={<Icon n="wallet" size={14} />} onClick={disburse}>
            {data.disbursed_at ? 'Un-mark handover' : 'Mark pot handed over'}
          </Button>}
        </div>
      </Card>

      <Card title="Contributions" flush>
        <div className="wrap">
          <table>
            <thead><tr><th>Member</th><th style={{ width: 130 }}>Amount</th><th style={{ width: 180 }}>Reference</th><th style={{ width: 90 }}>Status</th><th /></tr></thead>
            <tbody>
              {data.lines.map((l) => {
                const mine = String(l.member.id) === String(myMemberId);
                const editable = admin || mine;
                return (
                  <tr key={l.member.id}>
                    <td>
                      <div className="who">
                        <Avatar name={l.member.name} size="sm" />
                        <span style={{ minWidth: 0 }}>
                          <b>{l.member.name}{mine && <span className="pill info" style={{ marginLeft: 6 }}>you</span>}</b>
                          <span>#{l.member.position} · {l.member.phone || '—'}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <input className="input" type="number" min="0" step="10" value={l.amount || ''} placeholder="0"
                        disabled={!editable}
                        onChange={(e) => patchLine(l.member.id, Math.max(0, Number(e.target.value) || 0))}
                        onBlur={(e) => {
                          const v = Math.max(0, Number(e.target.value) || 0);
                          if (v !== (l.contribution?.amount ?? 0)) save(l, v);
                        }}
                        style={{ textAlign: 'right', padding: '7px 10px' }} />
                    </td>
                    <td>
                      <input className="input" defaultValue={l.contribution?.ref || ''} placeholder="M-Pesa / bank ref" disabled={!editable}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (l.contribution?.ref || '')) save(l, l.amount, { ref: v });
                        }}
                        style={{ padding: '7px 10px' }} />
                    </td>
                    <td>
                      <Pill kind={l.status === 'paid' ? 'ok' : l.status === 'partial' ? 'warn' : 'mute'}>
                        {l.status === 'paid' ? 'Paid' : l.status === 'partial' ? 'Partial' : 'Unpaid'}
                      </Pill>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button size="sm" variant={l.status === 'paid' ? 'ghost' : 'soft'} disabled={!editable} onClick={() => togglePaid(l)}>
                        {l.status === 'paid' ? 'Clear' : 'Mark paid'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {confirm === 'round' && (
        <Confirm title={`Delete round ${data.n}?`} text="Rounds with payments or a payout can't be deleted."
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            setConfirm(null);
            try { await api.deleteRound(id); toast('Round deleted'); onBack(); window.dispatchEvent(new CustomEvent('omogusii:refresh')); }
            catch (e) { toast(e.message, 'err'); }
          }} />
      )}
    </>
  );
}

/* ══════════════════  ROUNDS LIST  ══════════════════ */
export default function Rounds({ me }) {
  const { data, loading, error, reload } = useResource(() => api.rounds(), []);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { settings } = useGroup();
  const admin = me?.role === 'admin';

  useEffect(() => {
    const h = () => reload({ silent: true });
    window.addEventListener('omogusii:refresh', h);
    return () => window.removeEventListener('omogusii:refresh', h);
  }, [reload]);

  if (open) return <RoundDetail id={open} onBack={() => { setOpen(null); reload(); }} admin={admin} myMemberId={me?.member_id} />;

  if (loading) return <Card title="Rounds"><SkeletonTable rows={8} cols={5} /></Card>;
  if (error) return <ErrorBox>{error}</ErrorBox>;

  return (
    <>
      <Card title="Rounds" actions={<>
        <span className="tiny muted">{data.length} in the rotation</span>
        {admin && <Button size="sm" variant="ghost" icon={<Icon n="plus" size={14} />} disabled={busy} onClick={async () => {
          setBusy(true);
          try { await api.addRound(); toast('Round added'); reload(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
        }}>Add round</Button>}
      </>}>
        {!data.length
          ? <Empty icon="calendar" title="No rounds yet" text="Add members and the rotation builds itself — one round per member." />
          : (
            <div className="stack">
              {data.map((r) => {
                const pct = r.expected ? Math.min(100, Math.round((r.collected / r.expected) * 100)) : 0;
                return (
                  <button key={r.id} onClick={() => setOpen(r.id)} style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: 14, borderRadius: 12,
                    border: '1px solid var(--line)', background: 'var(--panel-2)',
                  }}>
                    <div className="flex" style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{
                        width: 42, height: 42, flex: '0 0 42px', borderRadius: 13, display: 'grid', placeItems: 'center',
                        fontWeight: 750, background: r.disbursedAt ? 'var(--primary)' : 'var(--panel)',
                        color: r.disbursedAt ? '#fff' : 'var(--muted)', border: r.disbursedAt ? 'none' : '1px solid var(--line)',
                      }}>{r.n}</div>
                      <div style={{ minWidth: 160 }}>
                        <b style={{ fontSize: 14.5 }}>{r.recipient ? r.recipient.name : 'Unassigned'}</b>
                        <div className="small muted">{fmtDate(r.due)} · {daysUntil(r.due)}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <Bar value={r.collected} max={r.expected} warn={!r.disbursedAt && r.collected < r.expected} />
                        <div className="tiny muted" style={{ marginTop: 6 }}>
                          {fmt(r.collected, settings?.currency)} of {fmt(r.expected, settings?.currency)} · {pct}%
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <Pill kind={r.disbursedAt ? 'ok' : r.collected >= r.expected ? 'info' : 'warn'}>
                          {r.disbursedAt ? 'Paid out' : r.collected >= r.expected ? 'Pot complete' : `${r.unpaidCount + r.partialCount} pending`}
                        </Pill>
                      </div>
                      <Icon n="up" size={15} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
      </Card>
      <div className="card"><div className="bd small muted">
        Tap a round to record payments, store M-Pesa or bank references, and confirm the handover. Round {data.find((r) => !r.disbursedAt)?.n ?? '—'} is collecting now.
      </div></div>
    </>
  );
}
