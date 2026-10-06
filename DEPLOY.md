# Deploying Omogusii: APK + always-on backend

How it fits together:

```
phone (Omogusii APK)  ──https──▶  Render web service (Express + SQLite)
        │                                  │
   UI bundled in the APK            persistent disk holds omogusii.db
        │
   GitHub Actions rebuilds the APK on every push
```

- The **UI is bundled inside the APK**, so the app opens instantly and works offline-ish.
- The **backend lives on Render**, so every phone sees the same live data.
- **Every push to `main`**: Render redeploys the API (database persists) *and* GitHub Actions
  builds a fresh APK.

---

## 0. Installing from a phone (no computer)

Everything below can be done in a mobile browser. The only step that genuinely needs a
keyboard is getting the code into GitHub — ask your agent to push it with a token, or use a
computer for five minutes.

**Fastest route on a phone:**

1. Deploy the backend (step 2) — all taps in the Render dashboard.
2. Open the Render URL in **Chrome on your phone** and sign in.
3. Chrome **⋮ → Add to Home Screen**. You now have the app — no APK needed.
4. Later, for a real installable app: open your repo's **Releases → "latest"** and tap the
   **`.apk`** file. Android installs it directly (allow "Install unknown apps" for Chrome when
   prompted). The workflow publishes a bare `.apk`, not a zip, precisely for this.

## 1. Put the code on GitHub

```bash
cd omogusii-app
git init
git add .
git commit -m "Omogusii merry-go-round"
git branch -M main
git remote add origin https://github.com/<your-user>/omogusii-app.git
git push -u origin main
```

Create the repo empty on GitHub first (no README, no .gitignore — this project has both).

---

## 2. Deploy the backend on Render

**Render → New → Blueprint → pick this repo.** It reads `render.yaml` and sets everything up:
Node 20, `npm install && npm run build`, `npm start`, health checks at `/api/health`,
a generated `JWT_SECRET`, and a 1 GB persistent disk at `/var/data` holding the SQLite file.

- **Use the Starter plan ($7/mo).** It's what buys the persistent disk — without it the free
  instance wipes its filesystem on every restart and your group data resets to the demo seed.
- Region: `frankfurt` is closest to Doha (lowest latency).
- When it finishes, Render gives you a URL like `https://omogusii-api.onrender.com`.
  Check it: `curl https://omogusii-api.onrender.com/api/health` → `{"ok":true,...}`.

**Free-plan alternative (data is not durable):** delete the `disk:` block from `render.yaml`,
set `DB_PATH=/tmp/omogusii.db`, and accept that the group resets after ~15 min idle. Fine for
a demo, not for real money.

---

## 3. Tell the APK where the backend is

In GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://omogusii-api.onrender.com` (no trailing slash) |
| `API_URL` | same URL — used by the keep-awake workflow |

This is baked into the app at build time. If the backend URL ever changes, update the variable
and re-run the workflow.

---

## 4. Build the APK

**Actions → "Build Android APK" → Run workflow** (or just push to `main`).

When it's green, download the artifact **`omogusii-debug-apk`** from the run page, unzip, and
you have `omogusii-main-<shortsha>.apk`.

Install it on your phone:

1. Transfer the APK (WhatsApp/Drive/USB — anything).
2. Open it → Android asks to allow installs from that source → allow.
3. Install. Done — the Omogusii icon appears.

Tag a version to also attach it to a GitHub Release:

```bash
git tag v1.0.0 && git push --tags
```

---

## 5. Keep it running

**Backend uptime**

- Render restarts the service automatically if it crashes, and redeploys on every push.
- The `keepalive.yml` workflow pings `/api/health` every 14 minutes so a free instance never
  sleeps (first request after sleep takes 30–60 s otherwise).
- ⚠️ GitHub disables scheduled workflows after **60 days with no repo activity** — any push
  re-enables them.

**Updates**

| What you change | What happens |
|---|---|
| Backend code | Push → Render redeploys in ~2 min. Data on the disk survives. |
| UI code | Push → Actions builds a new APK → reinstall (or send the APK to members). |
| Group rules (amount, dates) | Change in **Settings** inside the app — no redeploy needed. |

**Database backups** — Render's dashboard lets you snapshot the disk. Also use
**Settings → Export** style backups: grab `omogusii.db` off the disk before any risky change.

---

## Later: Play Store

Debug APKs are for sideloading. For the Play Store you need a signed **AAB**:

```bash
keytool -genkey -v -keystore omogusii.jks -keyalg RSA -keysize 2048 -validity 10000 -alias omogusii
base64 -w0 omogusii.jks        # paste into GitHub secret KEYSTORE_BASE64
```

Then add `KEYSTORE_PASSWORD` / `KEY_ALIAS` / `KEY_PASSWORD` secrets and swap
`assembleDebug` for `bundleRelease` in `.github/workflows/android.yml`. Say the word and I'll
write that job and the signing config.

---

## Reference

```bash
npm run build      # bundle the UI into dist/
npm start          # serve API + UI on :3000
npm test           # 46 API checks against a running server
npm run cap:sync   # build + copy web assets into the Android project
npm run cap:open   # open android/ in Android Studio (needs Android Studio)
```

Environment variables (`.env.example`):

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `./data/omogusii.db` | SQLite file (Render: `/var/data/omogusii.db`) |
| `JWT_SECRET` | dev default | **Change in production** — Render generates one |
| `CORS_ORIGIN` | any | Comma-separated allow-list, e.g. `https://localhost` |
| `VITE_API_URL` | empty | Build-time backend URL for the APK |

## Troubleshooting

**App opens but shows "Something went wrong"** — the APK can't reach the API. Check
`VITE_API_URL` was set when the APK was built (re-run the workflow after adding it), and that
the Render service is awake: `curl https://…/api/health`.

**Login fails but the API is up** — CORS. Set `CORS_ORIGIN` on Render to `https://localhost`.

**Data disappeared after a restart** — you're on the free plan without a disk. Add the disk
(Starter plan) or accept the reset.

**Cold starts feel slow** — that's the free tier sleeping. The keep-awake workflow fixes it;
the Starter plan doesn't sleep at all.
