import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './routes/api.js';
import { seedAll } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 3000;

/* seed demo data the first time the database is created */
const seeded = seedAll();
if (seeded) console.log('🌱 Seeded demo data');

const app = express();
/* The Android app runs in a WebView on https://localhost, so its calls to the
   deployed API are cross-origin. Restrict ORIGIN to your backend URL in production. */
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '2mb' }));
app.use('/api', api);
app.use(express.static(DIST, { maxAge: '1h' }));

app.get('*', (req, res) => {
  res.sendFile(path.join(DIST, 'index.html'), (err) => {
    if (err) res.status(500).send('<h2>Frontend not built</h2><p>Run <code>npm run build</code> then reload.</p>');
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Omogusii Merry-Go-Round → http://0.0.0.0:${PORT}\n`);
});
