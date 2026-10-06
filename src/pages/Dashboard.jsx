import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  useResource, Card, Button, Icon, Pill, Avatar, Bar, Money, Empty, Skeleton, ErrorBox,
  fmt, fmtDate, fmtDay, daysUntil, timeAgo, useToast, useGroup, Bar as ProgressBar,
} from '../ui.jsx';

const ACT_ICON = {
  payment: 'receipt', payout: 'wallet', loan: 'loan', reminder: 'bell',
  member: 'users', system: 'gear',
};

function CollectionChart({ data }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.collected, d.expected)));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 168, paddingTop: 8 }}>
      {data.map((d) => {
        const h = Math.max(3, (d.collected / max) * 140);
        const full = d.expected > 0 && d.collected >= d.expected;
        return (
          <div key={d.n} style={{ flex: 1, textAlign: 'center', minWidth: 0 }} title={`Round ${d.n}: ${d.collected} of ${d.expected}`}>
            <div style={{ height: 140, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <div style={{
                width: '72%', height: h, borderRadius: '7px 7px 3px 3px',
                background: d.disbursed ? 'linear-gradient(180deg,var(--primary),var(--primary-h))'
                  : full ? 'linear-gradient(180deg,#4bbd8a,var(--primary))'
                  : 'linear-gradient(180deg,var(--accent),#e8c274)',
                opacity: d.collected > 0 ? 1 : .25,
                transition: 'height .5s cubic-bezier(.2,.8,.2,1)',
              }} />
            </div>
            <div className="tiny muted" style={{ marginTop: 8, whiteSpace: 'nowrap' }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function Kpi({ label, value, foot, icon, tone }) {
  return (
    <div className="card kpi">
      <div className="lab">{label}</div>
      <div className={`val${String(value).length > 9 ? ' sm' : ''}`}>{value}</div>
      {foot && <div className="foot">{foot}</div>}
      <div className="ico" style={tone === 'warn' ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : tone === 'bad' ? { background: 'var(--danger-soft)', color: 'var(--danger)' } : undefined}>
        <Icon n={icon} size={17} />
      </div>
    </div>
  );
}

export default function Dashboard({ me }) {
  const dash = useResource(() => api.dashboard(), []);
  const toast = useToast();
  const { settings } = useGroup();
  const [busy, setBusy] = useState('');

  useEffect(() => {
    const h = () => dash.reload({ silent: true });
    window.addEventListener('omogusii:refresh', h);
    return () => window.removeEventListener('omogusii:refresh', h);
  }, [dash.reload]);

  const act = async (type, label) => {
    setBusy(type);
    try {
      const res = await api.bulkReminders(type);
      toast(`${res.created} ${label} queued`);
      window.dispatchEvent(new CustomEvent('omogusii:refresh'));
      dash.reload({ silent: true });
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(''); }
  };

  if (dash.loading) {
    return (
      <div className="grid" style={{ gap: 16 }}>
        <div className="grid kpis">
          {[0, 1, 2, 3, 4].map((i) => (
            <div className="card kpi" key={i}><Skeleton h={12} w="55%" /><Skeleton h={26} w="70%" /><Skeleton h={12} w="45%" /></div>
          ))}
        </div>
        <div className="grid g2">
          <div className="card"><div className="bd"><Skeleton h={14} w={140} /><Skeleton h={150} /></div></div>
          <div className="card"><div className="bd"><Skeleton h={14} w={140} /><Skeleton h={150} /></div></div>
        </div>
      </div>
    );
  }
  if (dash.error) return <ErrorBox>{dash.error}</ErrorBox>;
  const d = dash.data;
  const cur = settings?.currency || d.kpis.currency;

  const round = d.activeRound;
  const next = d.nextPayout;
  const mine = d.me?.member;

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* ── hero ── */}
      <div className="card" style={{ background: 'linear-gradient(135deg,var(--primary),var(--primary-h))', border: 0, color: '#fff', overflow: 'hidden' }}>
        <div className="bd" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ minWidth: 240, flex: 1 }}>
            <div className="tiny" style={{ opacity: .8, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
              {next ? `Next payout · Round ${next.round}` : 'All rounds paid out'}
            </div>
            <div style={{ fontSize: 24, fontWeight: 750, letterSpacing: '-.02em', margin: '6px 0 2px' }}>
              {next?.member ? next.member.name : 'Rotation complete'}
            </div>
            <div style={{ opacity: .85, fontSize: 13 }}>
              {next ? `${fmtDate(next.due)} · ${daysUntil(next.due)}` : 'Add another round to keep going'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <span className="pill" style={{ background: 'rgba(255,255,255,.18)', color: '#fff' }}>
                {d.kpis.members} members × {cur} {d.kpis.contribution}
              </span>
              <span className="pill" style={{ background: 'rgba(255,255,255,.18)', color: '#fff' }}>
                Pot <Money v={next?.amount || d.kpis.potPerRound} />
              </span>
            </div>
          </div>
          <div style={{ flex: 1.2, minWidth: 260 }}>
            <div className="flex" style={{ justifyContent: 'space-between', fontSize: 12.5, opacity: .9, marginBottom: 8 }}>
              <span>Round {round?.n ?? '—'} collection</span>
              <span><Money v={round?.collected || 0} /> of <Money v={round?.expected || 0} /></span>
            </div>
            <div style={{ height: 10, background: 'rgba(255,255,255,.22)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                width: `${round && round.expected ? Math.min(100, (round.collected / round.expected) * 100) : 0}%`,
                height: '100%', background: '#fff', borderRadius: 99, transition: 'width .5s',
              }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <Button size="sm" variant="ghost" icon={<Icon n="check" size={15} />} onClick={() => (window.location.hash = '#/rounds')}>
                Record payments
              </Button>
              <Button size="sm" variant="ghost" icon={<Icon n="bell" size={15} />} disabled={!!busy}
                onClick={() => act('defaulters', 'defaulter nudges')}>
                {busy === 'defaulters' ? 'Queueing…' : 'Nudge defaulters'}
              </Button>
              <Button size="sm" variant="ghost" icon={<Icon n="users" size={15} />} disabled={!!busy}
                onClick={() => act('all', 'reminders')}>
                {busy === 'all' ? 'Queueing…' : 'Remind everyone'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── kpis ── */}
      <div className="grid kpis">
        <Kpi label={`Collected · Round ${round?.n ?? '—'}`} value={<Money v={d.kpis.collectedThisRound} />}
             foot={`${round?.paidCount || 0} paid · ${round?.partialCount || 0} partial · ${round?.unpaidCount || 0} unpaid`} icon="wallet" />
        <Kpi label="Still outstanding" value={<Money v={d.kpis.outstandingThisRound} />}
             foot={`${d.kpis.defaulters} member${d.kpis.defaulters === 1 ? '' : 's'} yet to finish`}
             icon="alert" tone={d.kpis.outstandingThisRound > 0 ? 'warn' : ''} />
        <Kpi label="Collected all-time" value={<Money v={d.kpis.collectedAllTime} />}
             foot={`${d.kpis.roundsDone} of ${d.kpis.roundsTotal} rounds paid out`} icon="trend" />
        <Kpi label="Loan balance owed" value={<Money v={d.kpis.loansOutstanding} />}
             foot={<>in KES ≈ <Money v={d.kpis.loansOutstanding * (d.kpis.fx || 1)} currency={d.kpis.secondaryCurrency} /></>}
             icon="loan" tone={d.kpis.loansOutstanding > 0 ? 'bad' : ''} />
        <Kpi label="Reminders waiting" value={d.kpis.remindersPending}
             foot="queued to send" icon="bell" tone={d.kpis.remindersPending ? 'warn' : ''} />
      </div>

      {/* ── your standing + chart ── */}
      <div className="grid g2">
        {mine && (
          <Card title="Your standing">
            <div className="flex" style={{ gap: 14, marginBottom: 14 }}>
              <Avatar name={mine.name} />
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 15 }}>{mine.name}</b>
                <div className="small muted">
                  Position {mine.position} · {d.me.round ? `you receive Round ${d.me.round.n} on ${fmtDay(d.me.round.due_date || d.me.round.due)}` : 'no payout assigned'}
                </div>
              </div>
              <div className="sp" style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 750 }}><Money v={d.standing.find((s) => s.id === mine.id)?.paidIn || 0} /></div>
                <div className="tiny muted">paid in</div>
              </div>
            </div>
            {round && d.me.line && (
              <div className="stack">
                <div className="flex small">
                  <span className="muted">This round ({cur} {round.expected / Math.max(1, round.lines.length)})</span>
                  <span className="sp" style={{ fontWeight: 700 }}><Money v={d.me.line.amount} /></span>
                </div>
                <ProgressBar value={d.me.line.amount} max={d.me.line.expected || 1} warn={d.me.line.amount < d.me.line.expected} />
                <div className="tiny muted">
                  {d.me.line.status === 'paid' ? '✓ You are fully paid for this round'
                    : d.me.line.amount > 0 ? `Balance ${cur} ${(d.me.line.expected - d.me.line.amount).toFixed(0)}`
                    : `Nothing recorded yet — ${cur} ${d.me.line.expected} due`}
                </div>
              </div>
            )}
            <div className="divider" style={{ margin: '14px 0' }} />
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', gap: 10, textAlign: 'center' }}>
              {[
                ['Rounds paid', `${d.standing.find((s) => s.id === mine.id)?.roundsPaid || 0}/${d.kpis.roundsTotal}`],
                ['Received', fmt(d.standing.find((s) => s.id === mine.id)?.received || 0, cur)],
                ['Net', fmt(d.standing.find((s) => s.id === mine.id)?.net || 0, cur)],
              ].map(([l, v]) => (
                <div key={l}><div className="tiny muted">{l}</div><b style={{ fontSize: 14 }}>{v}</b></div>
              ))}
            </div>
          </Card>
        )}

        <Card title="Collection by round" actions={<span className="tiny muted">{cur} per member</span>}>
          {d.chart.length ? <CollectionChart data={d.chart} />
            : <Empty icon="layers" title="No rounds yet" text="Add members to build the rotation." />}
          <div className="flex small muted" style={{ marginTop: 12, gap: 16 }}>
            <span className="flex" style={{ gap: 6 }}><i className="dot" style={{ background: 'var(--primary)', width: 9, height: 9, borderRadius: 99 }} /> paid out</span>
            <span className="flex" style={{ gap: 6 }}><i className="dot" style={{ background: 'var(--accent)', width: 9, height: 9, borderRadius: 99 }} /> collecting</span>
          </div>
        </Card>
      </div>

      {/* ── defaulters + activity ── */}
      <div className="grid g2">
        <Card title="Yet to complete this round"
          actions={<>
            <Button size="sm" variant="soft" icon={<Icon n="bell" size={14} />} disabled={!!busy} onClick={() => act('defaulters', 'defaulter nudges')}>
              {busy === 'defaulters' ? 'Queueing…' : 'Nudge all'}
            </Button>
          </>}>
          {d.defaulters.length === 0
            ? <Empty icon="check" title="Everyone has paid" text={`Round ${round?.n ?? ''} pot is complete.`} />
            : <div className="stack">
                {d.defaulters.map((x) => (
                  <div className="flex" key={x.memberId}>
                    <Avatar name={x.name} size="sm" />
                    <div style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 13.5 }}>{x.name}</b>
                      <div className="tiny muted">{x.paid > 0 ? `paid ${fmt(x.paid, cur)}` : 'nothing yet'}</div>
                    </div>
                    <div className="sp" style={{ textAlign: 'right' }}>
                      <b style={{ color: 'var(--danger)' }}><Money v={x.balance} /></b>
                      <div className="tiny muted">outstanding</div>
                    </div>
                  </div>
                ))}
              </div>}
        </Card>

        <Card title="Recent activity" actions={<Button size="sm" variant="ghost" onClick={() => dash.reload({ silent: true })}><Icon n="refresh" size={14} /></Button>}>
          <div className="stack">
            {d.activity.slice(0, 8).map((a) => (
              <div className="flex" key={a.id} style={{ alignItems: 'flex-start', gap: 12 }}>
                <div className="av sm" style={{ background: 'var(--panel-2)', color: 'var(--muted)' }}>
                  <Icon n={ACT_ICON[a.type] || 'grid'} size={14} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5 }}>{a.text}</div>
                  <div className="tiny muted">{timeAgo(a.ts)}{a.actor ? ` · ${a.actor}` : ''}</div>
                </div>
              </div>
            ))}
            {!d.activity.length && <Empty icon="grid" title="Nothing yet" text="Payments and payouts will show up here." />}
          </div>
        </Card>
      </div>

      {/* ── rotation preview ── */}
      <Card title="Rotation at a glance"
        actions={<Button size="sm" variant="ghost" onClick={() => (window.location.hash = '#/breakdown')}>Full breakdown <Icon n="layers" size={14} /></Button>} flush>
        <div className="wrap">
          <table>
            <thead><tr><th>Round</th><th>Due</th><th>Receives</th><th className="num">Collected</th><th>Status</th></tr></thead>
            <tbody>
              {d.breakdown.slice(0, 5).map((b) => (
                <tr key={b.id}>
                  <td><b>{b.n}</b></td>
                  <td className="nowrap">{fmtDay(b.due)}</td>
                  <td><div className="who"><Avatar name={b.recipient} size="sm" /><b>{b.recipient}</b></div></td>
                  <td className="num"><Money v={b.collected} /> <span className="muted tiny">/ {fmt(b.expected, cur)}</span></td>
                  <td><Pill kind={b.status === 'paid_out' ? 'ok' : b.status === 'open' ? 'warn' : b.status === 'overdue' ? 'bad' : 'mute'}>
                    {b.status === 'paid_out' ? 'Paid out' : b.status === 'open' ? 'Open' : b.status === 'overdue' ? 'Behind' : 'Upcoming'}
                  </Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
