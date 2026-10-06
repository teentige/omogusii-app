import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db.js';

const SECRET = process.env.JWT_SECRET || 'omogusii-dev-secret-change-me';
const TOKEN_TTL = '30d';

export const hash = (pw) => bcrypt.hashSync(pw, 10);
export const verify = (pw, h) => bcrypt.compareSync(pw, h);
export const signToken = (user) => jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: TOKEN_TTL });

export function userFromToken(token) {
  try {
    const p = jwt.verify(token, SECRET);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(p.sub) || null;
  } catch { return null; }
}

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const user = token ? userFromToken(token) : null;
  if (!user) return res.status(401).json({ error: 'Sign in to continue' });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only the treasurer can do that' });
  next();
}

export const publicUser = (u) => ({
  id: u.id, username: u.username, name: u.name, role: u.role, member_id: u.member_id,
});
