# Omogusii Merry-Go-Round

A full-stack app for the **Omogusii merry-go-round** — 10 members, **QAR 200 each per month**,
one member takes the pot every round, and the rotation runs until everyone has had a turn.

Built from the ground up (the original `teentige/omogusii-merry-go-round` repo 404s). Everything
below — members, rotation state, the loan — is seeded from the details you gave, and is editable.

---

## Run it

```bash
cd omogusii-app
npm install
npm run build      # bundles the React frontend into dist/
npm start          # serves API + app on http://localhost:3000
```

For development with hot reload, run both:

```bash
npm start          # API on :3000
npx vite           # UI on :5173, proxies /api → :3000
```

The SQLite database is created and seeded automatically on first boot at `data/omogusii.db`.
To start over: delete `data/omogusii.db` (or use **Settings → Reload demo data**).

### Demo accounts

| Username | Password | Role | Sees |
|---|---|---|---|
| `gabriel` | `omogusii2026` | **admin** (treasurer) | Everything, full CRUD |
| `nehemiah` | `omogusii2026` | member | Everything read-only + his own payments |
| `moseti` | `omogusii2026` | member | Everything read-only + his own payments |

---

## The group, as seeded

**Rotation order (this is the payout order):**

| # | Member | Receives | Status |
|---|---|---|---|
| 1 | Gabriel | Round 1 | ✅ Paid out |
| 2 | Isaac | Round 2 | ✅ Paid out |
| 3 | Nehemiah | Round 3 | ⏳ **Round open now — due today** |
| 4 | Moseti | Round 4 | Scheduled |
| 5 | David | Round 5 | Scheduled |
| 6 | Godfrey | Round 6 | Scheduled |
| 7 | Jones | Round 7 | Scheduled |
| 8 | Joackim | Round 8 | Scheduled |
| 9 | Dennis | Round 9 | Scheduled |
| 10 | Titus | Round 10 | Scheduled |

**The maths**

- Contribution: **QAR 200** per member per month → **QAR 2,000 pot** every round
- 10 members → **10 rounds** → a full cycle takes **10 months** and moves **QAR 20,000**
- Each member pays **QAR 2,000** across the cycle and receives **QAR 2,000** once
- Everyone ends the cycle at **net zero** — that is what makes it fair

**Where it stands**

- Rounds 1–2 collected in full and handed over (Gabriel, Isaac)
- Round 3 (Nehemiah): **QAR 1,380 of 2,000** collected — 620 outstanding
  - Paid: Gabriel, Isaac, Moseti, Godfrey, Joackim, Titus (280 — includes his 80 arrears)
  - Dennis partial (100), Nehemiah / David / Jones still to pay
- **Moseti's loan: KSh 10,000, interest-free, issued in round 2.** KSh 4,000 repaid in two
  instalments, **KSh 6,000 outstanding ≈ QAR 169** at the seeded rate of 35.6 KES per QAR.

The seed is **anchored to today**: round 1 always lands two months back and round 3 is always
due today, so the demo never goes stale.

---

## What the app does

| Screen | What you get |
|---|---|
| **Dashboard** | Next payout hero with live progress, 5 KPIs (collected this round, outstanding, all-time, loans owed, reminders waiting), collection-by-round chart, your standing, defaulter list, activity feed, 4 one-tap reminder buttons |
| **Breakdown** | The full rotation table — every round, date, recipient, expected vs collected, status — plus a standing table showing who is ahead and who has taken their pot, and an explanation of the maths |
| **Members** | Full CRUD, search, reorder the rotation (up/down), per-member detail with payment history, loans and a scannable payment QR |
| **Rounds** | All 10 rounds; open one for the contribution grid — amount + M-Pesa/bank reference per member, mark-paid toggle, mark-all-paid, and handover |
| **Contributions** | The whole payment ledger, filterable by round, member and status, with a running total |
| **Loans** | Full CRUD, interest handling, instalments, progress bars, auto-close on final repayment, dual-currency totals |
| **Reminders** | 4 bulk buttons (defaulters / everyone / loans / payout), a queue with pending-snoozed-sent tabs, and per-message **WhatsApp** or **SMS** buttons that open a pre-written message and mark it sent |
| **Settings** | Group rules, contribution, frequency, start date, currencies + FX rate, payment details, group QR, password change, reset-to-demo |

### Reminders

Reminder buttons queue real, pre-written messages addressed to each member by name. Sending opens
`wa.me` (WhatsApp) or the SMS composer with the message ready — **no API keys or SMS costs**, and
it works on a phone today. Swap in Africa's Talking / Twilio later by replacing the `send()`
handler in `src/pages/Reminders.jsx` with an API call.

---

## Architecture

```
omogusii-app/
├── server/
│   ├── index.js        Express: API + static SPA
│   ├── db.js           SQLite schema, settings, FX, rotation sync, derived maths
│   ├── auth.js         bcrypt hashing, JWT, requireAuth / requireAdmin
│   ├── seed.js         Demo data (anchored to today)
│   └── routes/api.js   Every endpoint
├── src/
│   ├── App.jsx         Auth gate, sidebar shell, hash routing
│   ├── api.js          Fetch client (token + latency for visible loading states)
│   ├── ui.jsx          Design system: cards, modals, toasts, money, skeletons
│   └── pages/          8 screens
├── data/omogusii.db    SQLite (created on first run)
└── dist/               Built frontend (npm run build)
```

**Stack:** React 19 + Vite · Express 4 · SQLite (better-sqlite3) · JWT + bcrypt · qrcode ·
Capacitor 8 for the Android build.

## Android app & deployment

The `android/` folder is a real, committed Capacitor project (icons and splash screens
included), and `.github/workflows/android.yml` builds a downloadable debug APK on every push.
The backend is deployed with `render.yaml` (Render Blueprint) and stays warm via
`keepalive.yml`.

**Full step-by-step: [`DEPLOY.md`](DEPLOY.md)** — GitHub → Render → APK in about 15 minutes.

**Data model:** `users`, `members`, `rounds`, `contributions`, `loans`, `loan_repayments`,
`reminders`, `activity`, `settings`.

**Rules that keep the books honest**

- One round per member. Reordering members re-assigns future recipients; **paid rounds are never
  re-dated or re-assigned**, so history is immutable.
- Deleting a round is refused if it holds money or a payout.
- A member can record their own payment; only the treasurer can edit anyone else's.
- Loans carry their own currency and are converted for group totals with the editable FX rate.

### API

`POST /api/auth/login` · `/register` · `GET /auth/me` · `POST /auth/password`

`GET /dashboard` · `GET /activity` · `GET|PUT /settings`

`GET|POST /members` · `GET|PATCH|DELETE /members/:id` · `POST /members/reorder` · `GET /members/:id/qr` · `GET /qr/group`

`GET|POST /rounds` · `GET|PATCH|DELETE /rounds/:id` · `POST /rounds/:id/disburse` · `POST /rounds/:id/contributions`

`GET /contributions` · `DELETE /contributions/:id`

`GET|POST /loans` · `GET|PATCH|DELETE /loans/:id` · `POST /loans/:id/repayments` · `DELETE /repayments/:id`

`GET|POST /reminders` · `POST /reminders/bulk` · `PATCH|DELETE /reminders/:id` · `POST /demo/reseed`

---

## Quality

- **Empty states** on every list, each with a call to action
- **Loading states** — shimmer skeletons for KPIs, tables and modals
- **Optimistic updates** — marking a payment, deleting a row, reordering members and changing
  reminder status apply instantly and roll back with a toast if the server rejects them
- **Responsive** — sidebar collapses to a drawer under 1000px, tables scroll, KPIs reflow
- **Dark mode** — toggle in the header, persisted
- **Dual currency** — QAR for the group, KES for loans, converted at an editable rate

**Verified:** 76 API checks (auth, permissions, CRUD, rotation, payouts, loans, reminders, FX,
reseed) and 45 headless-UI checks (login, every screen, optimistic payment round-trip, QR,
theme) — **121 passing, 0 failing**. Run them with the scripts in the project history
(`vite.test.config.js` builds the jsdom-testable bundle).

---

## Assumptions I made — correct any that are wrong

1. **"200qr" = 200 Qatari Riyal per member per month** (you're in Doha, and you said "convert to
   qr"). Pot = QAR 2,000. Change it in **Settings → Group** if it should be KES.
2. **Moseti's loan is KSh 10,000, interest-free**, repayable in 5 monthly instalments of
   KSh 2,000, with KSh 4,000 repaid so far. It is tracked in KES while contributions are in QAR,
   converted at 35.6 KES/QAR (editable in Settings).
3. **"2 people have received money, this month is number 3"** → Gabriel and Isaac have been paid
   out; **Nehemiah receives this month** and round 3 is open and collecting.
4. **The recipient still contributes** — the standard chama rule, so the pot is always
   members × contribution.
5. **Gabriel is the treasurer** (admin); members get read access plus their own payments.
6. **Reminders send via WhatsApp/SMS share links** rather than a paid gateway.

## Natural next steps

- M-Pesa Daraja / STK Push so payments confirm themselves
- Automatic scheduled reminders (a cron that fires the queue daily)
- Cloud sync so all 10 members see the same live pot
- PDF statement per member, or per completed cycle
- Ekegusii language toggle — send me the words and I'll wire it in
