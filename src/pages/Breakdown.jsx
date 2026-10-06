import React, { useEffect } from 'react';
import { api } from '../api.js';
import {
  useResource, Card, Button, Icon, Pill, Avatar, Bar, Money, Empty, SkeletonTable, ErrorBox,
  useGroup, fmt, fmtDate, daysUntil,
} from '../ui.jsx';

export default function Breakdown() {
  const d = useResource(() => api.dashboard(), []);
  const { settings } = useGroup();

  useEffect(() => {
    const h = () => d.reload({ silent: true });
    window.addEventListener('omogusii:refresh', h);
    return () => window.removeEventListener('omogusii:refresh', h);
  }, [d.reload]);

  if (d.loading) return <Card title="Breakdown"><SkeletonTable rows={10} cols={7} /></Card>;
  if (d.error) return <ErrorBox>{d.error}</ErrorBox>;
  const data = d.data;
  const cur = settings?.currency || data.kpis.currency;
  const members = data.kpis.members;
  const perRound = data.kpis.potPerRound;
  const cycle = perRound * data.kpis.roundsTotal;

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* how it works */}
      <div className="card" style={{ background: 'linear-gradient(135deg,var(--primary),var(--primary-h))', border: 0, color: '#fff' }}>
        <div className="bd">
          <div className="tiny" style={{ opacity: .8, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
            How your merry-go-round works
          </div>
          <div style={{ fontSize: 20, fontWeight: 750, letterSpacing: '-.02em', margin: '8px 0 16px' }}>
            {members} members · {cur} {data.kpis.contribution} each · {settings?.frequency}
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
            {[
              ['1', 'Everyone pays in', `${cur} ${data.kpis.contribution} per member, every round`],
              ['2', 'One pot per round', `${cur} ${fmt(perRound)} collected before handover`],
              ['3', 'One member takes it', 'The order rotates until everyone has had a turn'],
              ['4', 'Full cycle', `${data.kpis.roundsTotal} rounds · ${cur} ${fmt(cycle)} moves through the group`],
            ].map(([n, t, s]) => (
              <div key={n} style={{ background: 'rgba(255,255,255,.12)', borderRadius: 12, padding: 14 }}>
                <div style={{ width: 26, height: 26, borderRadius: 9, background: 'rgba(255,255,255,.2)', display: 'grid', placeItems: 'center', fontWeight: 750, marginBottom: 8 }}>{n}</div>
                <b style={{ fontSize: 13.5 }}>{t}</b>
                <div style={{ fontSize: 12, opacity: .8, marginTop: 3 }}>{s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* rotation */}
      <Card title="Full rotation" actions={<span className="tiny muted">{data.kpis.roundsDone} of {data.kpis.roundsTotal} paid out</span>} flush>
        <div className="wrap">
          <table>
            <thead>
              <tr>
                <th>Round</th><th>Due</th><th>Receives</th>
                <th className="num">Expected</th><th className="num">Collected</th>
                <th className="num">Outstanding</th><th style={{ width: 150 }}>Progress</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.breakdown.map((b) => (
                <tr key={b.id}>
                  <td><b>{b.n}</b></td>
                  <td className="nowrap">{fmtDate(b.due)}<div className="tiny muted">{daysUntil(b.due)}</div></td>
                  <td><div className="who"><Avatar name={b.recipient} size="sm" /><b>{b.recipient}</b></div></td>
                  <td className="num">{fmt(b.expected, cur)}</td>
                  <td className="num">{fmt(b.collected, cur)}</td>
                  <td className="num" style={{ color: b.outstanding > 0 && b.status !== 'upcoming' ? 'var(--danger)' : undefined }}>
                    {fmt(b.outstanding, cur)}
                  </td>
                  <td><Bar value={b.collected} max={b.expected} /></td>
                  <td><Pill kind={b.status === 'paid_out' ? 'ok' : b.status === 'open' ? 'warn' : b.status === 'overdue' ? 'bad' : 'mute'}>
                    {b.status === 'paid_out' ? 'Paid out' : b.status === 'open' ? 'Open' : b.status === 'overdue' ? 'Behind' : 'Upcoming'}
                  </Pill></td>
                </tr>
              ))}
              {!data.breakdown.length && <tr><td colSpan={8}><Empty icon="layers" title="No rounds yet" text="Add members and the rotation builds itself." /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* standing */}
      <Card title="Who is ahead, who has taken" flush>
        <div className="wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Member</th><th>Receives in</th>
                <th className="num">Paid in</th><th className="num">Received</th><th className="num">Net position</th><th>Loan</th>
              </tr>
            </thead>
            <tbody>
              {data.standing.map((s) => {
                const round = data.breakdown.find((b) => b.recipientId === s.id);
                return (
                  <tr key={s.id}>
                    <td className="muted">{s.position}</td>
                    <td><div className="who"><Avatar name={s.name} size="sm" /><b>{s.name}</b></div></td>
                    <td>{round ? <>Round {round.n}<div className="tiny muted">{fmtDate(round.due)}{round.disbursedAt ? ' · paid' : ''}</div></> : '—'}</td>
                    <td className="num">{fmt(s.paidIn, cur)}</td>
                    <td className="num">{fmt(s.received, cur)}</td>
                    <td className="num" style={{ fontWeight: 700, color: s.net < 0 ? 'var(--danger)' : s.net > 0 ? 'var(--primary)' : 'var(--muted)' }}>
                      {s.net > 0 ? '+' : ''}{fmt(s.net, cur)}
                    </td>
                    <td>{s.loanOutstanding > 0 ? <Pill kind="warn">{fmt(s.loanOutstanding, s.loanCurrency || 'KES')}</Pill> : <span className="muted tiny">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="bd" style={{ borderTop: '1px solid var(--line-2)' }}>
          <div className="small muted">
            <b>Net position</b> = everything a member has paid in, minus the pot they have received. Positive means they have
            put in more than they have taken; negative means they have already received their pot. Over a full cycle everyone lands at zero.
          </div>
        </div>
      </Card>
    </div>
  );
}
