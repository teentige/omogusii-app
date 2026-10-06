import React, { useState, useEffect, useCallback } from 'react';
import { api, getToken, setToken, getServer, setServer, serverOptions } from './api.js';
import {
  ToastProvider, GroupProvider, useToast, Icon, Button, Input, Field, useResource,
} from './ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Breakdown from './pages/Breakdown.jsx';
import Members from './pages/Members.jsx';
import Rounds from './pages/Rounds.jsx';
import Contributions from './pages/Contributions.jsx';
import Loans from './pages/Loans.jsx';
import Reminders from './pages/Reminders.jsx';
import Settings from './pages/Settings.jsx';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'breakdown', label: 'Breakdown', icon: 'layers', group: 'Group' },
  { id: 'members', label: 'Members', icon: 'users' },
  { id: 'rounds', label: 'Rounds', icon: 'calendar' },
  { id: 'contributions', label: 'Contributions', icon: 'receipt', group: 'Money' },
  { id: 'loans', label: 'Loans', icon: 'loan' },
  { id: 'reminders', label: 'Reminders', icon: 'bell' },
  { id: 'settings', label: 'Settings', icon: 'gear', group: 'Account' },
];

const TITLES = {
  dashboard: ['Dashboard', 'Where the pot stands right now'],
  breakdown: ['Merry-go-round breakdown', 'The full rotation, round by round'],
  members: ['Members', 'The ten people in the rotation'],
  rounds: ['Rounds', 'Every cycle and who receives it'],
  contributions: ['Contributions', 'Full payment ledger'],
  loans: ['Loans', 'Money borrowed from the group pot'],
  reminders: ['Reminders', 'Queue, send and track every nudge'],
  settings: ['Settings', 'Group rules, currency and your account'],
};

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash.replace('#/', '') || 'dashboard');
  useEffect(() => {
    const onHash = () => setHash(window.location.hash.replace('#/', '') || 'dashboard');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return [hash, (v) => { window.location.hash = '#/' + v; }];
}

/* ══════════════════  LOGIN  ══════════════════ */
function Login({ onDone }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', name: '' });
  const [server, setServerUrl] = useState(() => getServer() || serverOptions.baked || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    setServer(server.trim());
    try {
      const data = mode === 'login'
        ? await api.login(form.username, form.password)
        : await api.register({ username: form.username, password: form.password, name: form.name });
      setToken(data.token);
      onDone(data.user);
      toast(`Welcome, ${data.user.name}`);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const quick = async (u, p) => {
    setBusy(true); setErr(null);
    setServer(server.trim());
    try { const data = await api.login(u, p); setToken(data.token); onDone(data.user); toast(`Signed in as ${data.user.name}`); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="login">
      <div className="art">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="mark" style={{ width: 42, height: 42, borderRadius: 14, background: 'rgba(255,255,255,.16)', display: 'grid', placeItems: 'center' }}>
            <Icon n="refresh" size={22} />
          </div>
          <b style={{ fontSize: 16 }}>Omogusii</b>
        </div>
        <h1>Every member pays in.<br />One member takes the pot.</h1>
        <p>Track the rotation, contributions, loans and reminders for your merry-go-round — in one place, in QAR and KES.</p>
        <div style={{ marginTop: 'auto', position: 'relative', display: 'grid', gap: 10, maxWidth: 430 }}>
          {[
            ['10 members · QAR 200 each month', 'A QAR 2,000 pot, every round'],
            ['Rotation is automatic', 'Round 3 pays Nehemiah, round 4 pays Moseti…'],
            ['Loans tracked separately', 'Moseti’s KSh 10,000 loan, with instalments'],
          ].map(([t, s]) => (
            <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', opacity: .92 }}>
              <span style={{ marginTop: 2 }}><Icon n="check" size={16} /></span>
              <div><b style={{ fontSize: 13.5 }}>{t}</b><div style={{ fontSize: 12.5, opacity: .7 }}>{s}</div></div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="box">
          <h2>{mode === 'login' ? 'Sign in' : 'Create an account'}</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            {mode === 'login' ? 'Treasurer and members use the same door.' : 'Members get read access plus their own payments.'}
          </p>
          <form onSubmit={submit} style={{ marginTop: 22 }}>
            {mode === 'register' && (
              <Field label="Full name"><Input value={form.name} onChange={set('name')} placeholder="e.g. Godfrey" /></Field>
            )}
            <Field label="Username"><Input value={form.username} onChange={set('username')} autoComplete="username" placeholder="gabriel" /></Field>
            <Field label="Password"><Input type="password" value={form.password} onChange={set('password')} autoComplete="current-password" placeholder="••••••••" /></Field>
            <Field label="Server address"
                   hint="Where your group's data lives. Type the Render URL and it's remembered on this phone.">
              <Input value={server} onChange={(e) => setServerUrl(e.target.value)}
                     placeholder="https://omogusii-api.onrender.com" autoComplete="off" inputMode="url" />
            </Field>
            {err && <div className="pill bad" style={{ marginBottom: 12 }}>{err}</div>}
            <Button className="wide lg" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
            <button type="button" className="btn ghost wide" style={{ marginTop: 10 }}
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(null); }}>
              {mode === 'login' ? 'New here? Create an account' : 'I already have an account'}
            </button>
          </form>

          <div className="demo">
            <div className="tiny muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Demo accounts</div>
            {[
              ['gabriel', 'Treasurer — full access'],
              ['nehemiah', 'Member — receives Round 3'],
              ['moseti', 'Member — has the open loan'],
            ].map(([u, label]) => (
              <button key={u} onClick={() => quick(u, 'omogusii2026')} disabled={busy}>
                <span>{label}</span>
                <b>{u} / omogusii2026</b>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════  SHELL  ══════════════════ */
function Shell({ user, settings, refreshSettings, onLogout, onUser }) {
  const [page, setPage] = useHash();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('omogusii.theme') || 'light'; } catch { return 'light'; } });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    document.body.dataset.theme = theme;
    try { localStorage.setItem('omogusii.theme', theme); } catch { /* noop */ }
  }, [theme]);

  const navCount = useResource(() => Promise.all([api.reminders({ status: 'pending' })]), []);
  const pending = navCount.data?.[0]?.length || 0;

  useEffect(() => {
    const h = () => navCount.reload({ silent: true });
    window.addEventListener('omogusii:refresh', h);
    return () => window.removeEventListener('omogusii:refresh', h);
  }, [navCount.reload]);

  const go = (id) => { setPage(id); setOpen(false); window.scrollTo(0, 0); };

  const refreshAll = useCallback(async () => {
    setBusy(true);
    await refreshSettings();
    window.dispatchEvent(new CustomEvent('omogusii:refresh'));
    setTimeout(() => setBusy(false), 400);
    toast('Everything refreshed');
  }, [refreshSettings, toast]);

  const render = () => {
    switch (page) {
      case 'breakdown': return <Breakdown />;
      case 'members': return <Members me={user} />;
      case 'rounds': return <Rounds me={user} />;
      case 'contributions': return <Contributions me={user} />;
      case 'loans': return <Loans me={user} />;
      case 'reminders': return <Reminders me={user} />;
      case 'settings': return <Settings me={user} onSaved={refreshSettings} onUser={onUser} />;
      default: return <Dashboard me={user} />;
    }
  };

  const [title, sub] = TITLES[page] || TITLES.dashboard;

  return (
    <>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={open ? 'open' : ''}>
        <div className="brand">
          <div className="mark"><Icon n="refresh" size={19} /></div>
          <div style={{ minWidth: 0 }}>
            <b>{settings?.name || 'Omogusii'}</b>
            <span>{settings?.tagline || 'Merry-go-round'}</span>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <React.Fragment key={n.id}>
              {n.group && <div className="lbl">{n.group}</div>}
              <a href={`#/${n.id}`} className={page === n.id ? 'on' : ''} onClick={() => go(n.id)}>
                <Icon n={n.icon} />
                {n.label}
                {n.id === 'reminders' && pending > 0 && <span className="count">{pending}</span>}
              </a>
            </React.Fragment>
          ))}
        </nav>
        <div className="side-foot">
          <div className="flex" style={{ padding: '6px 8px' }}>
            <div className="av"><Icon n="users" size={15} /></div>
            <div style={{ minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 13 }}>{user.name}</b>
              <span className="tiny muted" style={{ textTransform: 'capitalize' }}>{user.role}</span>
            </div>
            <button className="ib sp" onClick={onLogout} title="Sign out"><Icon n="logout" /></button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="top">
          <button className="ib hamb" onClick={() => setOpen(true)}><Icon n="menu" /></button>
          <div style={{ minWidth: 0 }}>
            <h1>{title}</h1>
            <div className="sub">{sub}</div>
          </div>
          <div className="sp">
            <button className="ib" onClick={refreshAll} title="Refresh data" disabled={busy}>
              <Icon n="refresh" />
            </button>
            <button className="ib" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme">
              <Icon n={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <span className="pill mute nowrap">{settings?.currency || 'QAR'} {settings?.contribution ?? 0} / month</span>
          </div>
        </header>
        <div className="content">
          {render()}
        </div>
      </div>
    </>
  );
}

/* ══════════════════  ROOT  ══════════════════ */
export default function App() {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [booting, setBooting] = useState(!!getToken());

  const refreshSettings = useCallback(async () => {
    try { setSettings(await api.settings()); } catch { /* keep last */ }
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    api.me()
      .then((d) => { setUser(d.user); setSettings(d.settings); })
      .catch(() => setToken(null))
      .finally(() => setBooting(false));
  }, []);

  const onLogout = () => { setToken(null); setUser(null); setSettings(null); };

  if (booting) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="mark" style={{ width: 46, height: 46, borderRadius: 14, background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
            <Icon n="refresh" size={22} />
          </div>
          <div className="muted small">Opening Omogusii…</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <ToastProvider>
        <Login onDone={(u) => { setUser(u); api.settings().then(setSettings); }} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <GroupProvider value={{ settings, reload: refreshSettings }}>
        <Shell user={user} settings={settings || {}} refreshSettings={refreshSettings} onLogout={onLogout} onUser={setUser} />
      </GroupProvider>
    </ToastProvider>
  );
}
