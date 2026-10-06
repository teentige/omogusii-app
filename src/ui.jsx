import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

/* ══════════════ formatting ══════════════ */
const cache = new Map();
function nf(currency, digits) {
  const k = currency + digits;
  if (!cache.has(k)) {
    try { cache.set(k, new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: digits, minimumFractionDigits: digits })); }
    catch { cache.set(k, null); }
  }
  return cache.get(k);
}
export function fmt(v, currency = 'QAR') {
  const n = Number(v) || 0;
  const digits = Math.abs(n % 1) > 0.004 ? 2 : 0;
  const f = nf(currency, digits);
  return f ? f.format(n) : `${currency} ${n.toLocaleString()}`;
}
export const fmtDate = (s) => s ? new Date(s.length > 10 ? s : s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const fmtDay = (s) => s ? new Date(s.length > 10 ? s : s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';
export const fmtDateTime = (s) => s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const initials = (n = '') => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
export const today = () => new Date().toISOString().slice(0, 10);
export function daysUntil(d) {
  if (!d) return '';
  const diff = Math.round((new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
  if (diff === 0) return 'due today';
  if (diff === 1) return 'due tomorrow';
  if (diff > 0) return `in ${diff} days`;
  return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'} overdue`;
}
export function timeAgo(ts) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(ts);
}

/* ══════════════ group context ══════════════ */
const GroupCtx = createContext({ settings: null, reload: () => {} });
export const useGroup = () => useContext(GroupCtx);
export const GroupProvider = GroupCtx.Provider;

export function Money({ v, currency, secondary, className }) {
  const { settings } = useGroup();
  const cur = currency || settings?.currency || 'QAR';
  const main = fmt(v, cur);
  let second = '';
  if (secondary && settings?.secondaryCurrency && cur !== settings.secondaryCurrency) {
    const rate = Number(settings.fx) || 1;
    const converted = cur === settings.currency ? (Number(v) || 0) * rate : (Number(v) || 0) / rate;
    second = ` ≈ ${fmt(converted, settings.secondaryCurrency)}`;
  }
  return <span className={className}>{main}{second && <span className="muted small"> {second}</span>}</span>;
}

/* ══════════════ toasts ══════════════ */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((s) => [...s, { id, msg, kind }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : ''}`}>
            <span>{t.kind === 'err' ? '⚠️' : '✓'}</span>{t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ══════════════ data hook ══════════════ */
export function useResource(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const d = await fetcher();
      if (mounted.current) setData(d);
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(); }, [load]);
  return { data, setData, loading, error, reload: load };
}

/* ══════════════ primitives ══════════════ */
export function Card({ title, actions, children, flush, style }) {
  return (
    <div className="card" style={style}>
      {(title || actions) && (
        <div className="hd"><h3>{title}</h3><div className="sp">{actions}</div></div>
      )}
      <div className={`bd${flush ? ' flush' : ''}`}>{children}</div>
    </div>
  );
}

export function Button({ variant = '', size = '', icon, children, ...rest }) {
  return (
    <button className={`btn ${variant} ${size}`} {...rest}>
      {icon}{children}
    </button>
  );
}

const ICONS = {
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m4 12 6 6L20 6" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  edit: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />,
  trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />,
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  bell: <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />,
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />,
  qr: <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM21 14h0M14 21h7v-3M17 17h4v4" />,
  clock: <><path d="M12 7v5l3 2" /><circle cx="12" cy="12" r="9" /></>,
  wallet: <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6H6" />,
  users: <><path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" /><circle cx="9" cy="7" r="3.2" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  layers: <path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5" />,
  loan: <path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  receipt: <><path d="M4 3h16v18l-3-2-2 2-3-2-3 2-2-2-3 2Z" /><path d="M8 8h8M8 12h8" /></>,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0V21a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H2.8a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9.9 4V3.8a2 2 0 1 1 4 0V4a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11h.2a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></>,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  whatsapp: <><path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.2-5.4A8.4 8.4 0 1 1 21 11.5Z" /><path d="M8.5 9.5c0 4 3.5 7 7.5 7.5" /></>,
  sms: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
  trend: <><path d="m3 17 6-6 4 4 8-8" /><path d="M21 7v6h-6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 11h18" /></>,
  alert: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></>,
};

export function Icon({ n, size = 16, className = '' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}
         fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[n] || ICONS.grid}
    </svg>
  );
}

export function Pill({ kind = 'mute', children }) { return <span className={`pill ${kind}`}>{children}</span>; }
export function Avatar({ name = '', size = '' }) {
  return <div className={`av ${size}`}>{initials(name)}</div>;
}
export function Bar({ value, max, warn }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className={`bar${warn ? ' warn' : ''}`}><i style={{ width: `${pct}%` }} /></div>;
}
export function Modal({ title, subtitle, onClose, children, footer, wide }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? ' wide' : ''}`}>
        <div className="mh">
          <div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
          <button className="x" onClick={onClose} aria-label="Close"><Icon n="x" /></button>
        </div>
        <div className="mb">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  );
}
export function Field({ label, children, hint }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
export const Input = (p) => <input className="input" {...p} />;
export const Select = ({ children, ...p }) => <select className="input" {...p}>{children}</select>;
export const Textarea = (p) => <textarea className="input" {...p} />;

export function Empty({ icon = 'grid', title, text, action }) {
  return (
    <div className="empty">
      <div className="ic"><Icon n={icon} size={24} /></div>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
export function Skeleton({ h = 16, w = '100%', mb = 10 }) {
  return <div className="sk" style={{ height: h, width: w, marginBottom: mb }} />;
}
export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div style={{ padding: 16 }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `2fr repeat(${cols - 1},1fr)`, gap: 14, marginBottom: 14 }}>
          {Array.from({ length: cols }).map((__, c) => <Skeleton key={c} h={14} mb={0} />)}
        </div>
      ))}
    </div>
  );
}
export function ErrorBox({ children }) {
  return (
    <div className="card"><div className="bd">
      <div className="empty" style={{ padding: 24 }}>
        <div className="ic" style={{ color: 'var(--danger)' }}><Icon n="alert" size={24} /></div>
        <b>Something went wrong</b><p>{children}</p>
      </div>
    </div></div>
  );
}
export function Confirm({ title = 'Are you sure?', text, confirmLabel = 'Delete', onConfirm, onClose, danger = true }) {
  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : ''} onClick={onConfirm}>{confirmLabel}</Button>
      </>}>
      <p className="muted" style={{ margin: 0 }}>{text}</p>
    </Modal>
  );
}
