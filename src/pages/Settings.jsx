import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { getServer, setServer, serverOptions } from '../api.js';
import {
  Card, Button, Icon, Pill, Field, Input, Select, Modal, Confirm, useToast, useGroup,
  Skeleton, fmtDate,
} from '../ui.jsx';

function PasswordModal({ onClose }) {
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const toast = useToast();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (f.next !== f.again) return setErr('The new passwords do not match');
    setBusy(true); setErr(null);
    try { await api.password(f.current, f.next); toast('Password changed'); onClose(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Change your password" onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Change password'}</Button>
      </>}>
      <form onSubmit={submit}>
        <Field label="Current password"><Input type="password" value={f.current} onChange={set('current')} /></Field>
        <Field label="New password"><Input type="password" value={f.next} onChange={set('next')} /></Field>
        <Field label="Repeat new password"><Input type="password" value={f.again} onChange={set('again')} /></Field>
        {err && <div className="pill bad">{err}</div>}
      </form>
    </Modal>
  );
}

export default function Settings({ me, onSaved, onUser }) {
  const { settings, reload } = useGroup();
  const [f, setF] = useState(null);
  const [qr, setQr] = useState(null);
  const [pw, setPw] = useState(false);
  const [reseed, setReseed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [srv, setSrv] = useState(() => getServer() || serverOptions.baked || '');
  const [probe, setProbe] = useState(null);
  const [probing, setProbing] = useState(false);
  const toast = useToast();
  const admin = me?.role === 'admin';

  const saveServer = () => {
    setServer(srv.trim());
    toast('Server address saved — it applies immediately');
  };
  const testServer = async () => {
    setProbing(true); setProbe(null);
    try {
      const res = await fetch(`${srv.trim().replace(/\/$/, '')}/api/health`);
      const ok = res.ok && (await res.json()).ok;
      setProbe(ok);
      toast(ok ? 'Connected to the server ✓' : 'Server replied, but not with a healthy status', ok ? 'ok' : 'err');
    } catch (e) {
      setProbe(false);
      toast('Could not reach that address', 'err');
    } finally { setProbing(false); }
  };

  useEffect(() => { if (settings) setF({ ...settings }); }, [settings]);
  useEffect(() => { api.groupQr().then(setQr).catch(() => {}); }, []);

  if (!f) return <Card title="Settings"><div className="bd"><Skeleton h={300} /></div></Card>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api.saveSettings({
        name: f.name, tagline: f.tagline, currency: f.currency, secondaryCurrency: f.secondaryCurrency,
        fx: Number(f.fx), contribution: Number(f.contribution), frequency: f.frequency,
        startDate: f.startDate, method: f.method, account: f.account, reminderDays: Number(f.reminderDays),
      });
      await reload();
      onSaved && onSaved();
      toast('Settings saved — rotation re-dated');
      window.dispatchEvent(new CustomEvent('omogusii:refresh'));
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <form onSubmit={save}>
        <Card title="Group" actions={admin ? <Button size="sm" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button> : <Pill kind="mute">Treasurer only</Pill>}>
          <div className="row2">
            <Field label="Group name"><Input value={f.name} onChange={set('name')} disabled={!admin} /></Field>
            <Field label="Tagline"><Input value={f.tagline || ''} onChange={set('tagline')} disabled={!admin} /></Field>
          </div>
          <div className="row2">
            <Field label="Contribution per member"><Input type="number" min="0" value={f.contribution} onChange={set('contribution')} disabled={!admin} /></Field>
            <Field label="Frequency">
              <Select value={f.frequency} onChange={set('frequency')} disabled={!admin}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </Select>
            </Field>
          </div>
          <div className="row2">
            <Field label="First round due"><Input type="date" value={f.startDate} onChange={set('startDate')} disabled={!admin} /></Field>
            <Field label="Reminder lead time (days)"><Input type="number" min="0" value={f.reminderDays} onChange={set('reminderDays')} disabled={!admin} /></Field>
          </div>
          <div className="hint" style={{ marginTop: -6 }}>
            Changing the start date or frequency re-dates every round that has not been paid out yet. Paid rounds are never touched.
          </div>
        </Card>
      </form>

      <form onSubmit={save}>
        <Card title="Money" actions={admin ? <Button size="sm" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button> : null}>
          <div className="row2">
            <Field label="Group currency"><Input value={f.currency} onChange={set('currency')} disabled={!admin} /></Field>
            <Field label="Second currency"><Input value={f.secondaryCurrency} onChange={set('secondaryCurrency')} disabled={!admin} /></Field>
          </div>
          <Field label={`Exchange rate (${f.secondaryCurrency} per 1 ${f.currency})`} hint="Loans are recorded in their own currency and converted with this rate">
            <Input type="number" step="0.1" value={f.fx} onChange={set('fx')} disabled={!admin} />
          </Field>
          <div className="row2">
            <Field label="Payment method"><Input value={f.method} onChange={set('method')} disabled={!admin} /></Field>
            <Field label="Account / paybill"><Input value={f.account} onChange={set('account')} disabled={!admin} /></Field>
          </div>
        </Card>
      </form>

      <Card title="Server connection"
        actions={probe === true ? <Pill kind="ok">Connected</Pill> : probe === false ? <Pill kind="bad">Unreachable</Pill> : null}>
        <Field label="Backend address"
               hint="Changing this moves the app to a different server instantly — no rebuild, no reinstall.">
          <Input value={srv} onChange={(e) => setSrv(e.target.value)} placeholder="https://omogusii-api.onrender.com" inputMode="url" />
        </Field>
        <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" onClick={saveServer}>Save address</Button>
          <Button size="sm" variant="ghost" onClick={testServer} disabled={probing || !srv.trim()}>
            {probing ? 'Testing…' : 'Test connection'}
          </Button>
        </div>
      </Card>

      <div className="grid g2">
        <Card title="Group payment QR">
          {qr ? (
            <div className="flex" style={{ gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <img src={qr.dataUrl} alt="group QR" width={132} height={132} style={{ borderRadius: 12, background: '#fff' }} />
              <div style={{ minWidth: 170, flex: 1 }}>
                <b>{f.name}</b>
                <div className="small muted">{f.currency} {f.contribution} per member · {f.frequency}</div>
                <div className="small muted" style={{ marginTop: 6 }}>{f.account}</div>
                <div className="tiny muted" style={{ marginTop: 8 }}>
                  Share this in the group chat — members scan, pay, then send their reference to the treasurer.
                </div>
              </div>
            </div>
          ) : <Skeleton h={132} />}
        </Card>

        <Card title="Your account">
          <div className="stack">
            <div className="flex">
              <div className="av">{me.name.slice(0, 1).toUpperCase()}</div>
              <div style={{ minWidth: 0 }}>
                <b>{me.name}</b>
                <div className="small muted">@{me.username} · <span style={{ textTransform: 'capitalize' }}>{me.role}</span></div>
              </div>
            </div>
            <div className="divider" />
            <div className="flex">
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 13.5 }}>Password</b>
                <div className="small muted">Change the password for this account</div>
              </div>
              <div className="sp"><Button size="sm" variant="ghost" onClick={() => setPw(true)}>Change</Button></div>
            </div>
          </div>
        </Card>
      </div>

      {admin && (
        <Card title="Danger zone">
          <div className="flex" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div style={{ minWidth: 200, flex: 1 }}>
              <b style={{ fontSize: 13.5 }}>Reload demo data</b>
              <div className="small muted">Wipes everything and restores the seeded group: 10 members, 3 rounds, Moseti's KSh 10,000 loan.</div>
            </div>
            <Button variant="danger" icon={<Icon n="refresh" size={15} />} onClick={() => setReseed(true)}>Reset to demo data</Button>
          </div>
        </Card>
      )}

      {pw && <PasswordModal onClose={() => setPw(false)} />}
      {reseed && (
        <Confirm title="Reset everything?" confirmLabel="Yes, reload demo data"
          text="Every member, payment, loan and reminder will be replaced with the original demo data. This cannot be undone."
          onClose={() => setReseed(false)}
          onConfirm={async () => {
            setReseed(false);
            try {
              await api.reseed();
              toast('Demo data restored');
              await reload();
              window.dispatchEvent(new CustomEvent('omogusii:refresh'));
            } catch (e) { toast(e.message, 'err'); }
          }} />
      )}
    </>
  );
}
