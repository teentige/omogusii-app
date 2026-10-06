const TOKEN_KEY = 'omogusii.token';

/* Where the API lives. Empty in dev (same origin, Vite proxies it).
   In the Android build, VITE_API_URL points at the deployed backend. */
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

/* a touch of latency so skeletons / loading states are actually visible */
const LATENCY = Number(import.meta.env.VITE_LATENCY ?? 200);

async function request(path, { method = 'GET', body, params } = {}) {
  if (LATENCY) await new Promise((r) => setTimeout(r, LATENCY));
  const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString() : '';
  const res = await fetch(`${API_BASE}/api${path}${qs}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  // auth
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  register: (body) => request('/auth/register', { method: 'POST', body }),
  me: () => request('/auth/me'),
  password: (current, next) => request('/auth/password', { method: 'POST', body: { current, next } }),

  // data
  dashboard: () => request('/dashboard'),
  activity: () => request('/activity'),
  settings: () => request('/settings'),
  saveSettings: (patch) => request('/settings', { method: 'PUT', body: patch }),

  members: () => request('/members'),
  member: (id) => request(`/members/${id}`),
  addMember: (body) => request('/members', { method: 'POST', body }),
  updateMember: (id, body) => request(`/members/${id}`, { method: 'PATCH', body }),
  deleteMember: (id) => request(`/members/${id}`, { method: 'DELETE' }),
  reorder: (id, direction) => request('/members/reorder', { method: 'POST', body: { id, direction } }),
  memberQr: (id) => request(`/members/${id}/qr`),
  groupQr: () => request('/qr/group'),

  rounds: () => request('/rounds'),
  round: (id) => request(`/rounds/${id}`),
  addRound: () => request('/rounds', { method: 'POST' }),
  updateRound: (id, body) => request(`/rounds/${id}`, { method: 'PATCH', body }),
  disburse: (id) => request(`/rounds/${id}/disburse`, { method: 'POST' }),
  deleteRound: (id) => request(`/rounds/${id}`, { method: 'DELETE' }),
  saveContribution: (roundId, body) => request(`/rounds/${roundId}/contributions`, { method: 'POST', body }),

  contributions: (params) => request('/contributions', { params }),
  deleteContribution: (id) => request(`/contributions/${id}`, { method: 'DELETE' }),

  loans: () => request('/loans'),
  loan: (id) => request(`/loans/${id}`),
  addLoan: (body) => request('/loans', { method: 'POST', body }),
  updateLoan: (id, body) => request(`/loans/${id}`, { method: 'PATCH', body }),
  deleteLoan: (id) => request(`/loans/${id}`, { method: 'DELETE' }),
  repay: (id, body) => request(`/loans/${id}/repayments`, { method: 'POST', body }),
  deleteRepayment: (id) => request(`/repayments/${id}`, { method: 'DELETE' }),

  reminders: (params) => request('/reminders', { params }),
  addReminder: (body) => request('/reminders', { method: 'POST', body }),
  bulkReminders: (type) => request('/reminders/bulk', { method: 'POST', body: { type } }),
  updateReminder: (id, body) => request(`/reminders/${id}`, { method: 'PATCH', body }),
  deleteReminder: (id) => request(`/reminders/${id}`, { method: 'DELETE' }),

  reseed: () => request('/demo/reseed', { method: 'POST' }),
};
