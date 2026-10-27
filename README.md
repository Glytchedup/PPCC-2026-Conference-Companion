# PPCC 2026 · Field Companion

A mobile-first conference field app for **David and Peter**, seeded from `PPCC_2026_Two_Person_Plan.pdf` (Oct 27–29, MGM Grand). The plan was prepared Oct 24 and revised Oct 26.

## What works out of the box

- Individual David/Peter agenda views and combined view, with a full three-day timetable, rooms, priorities, objectives and links to official session pages.
- **Swap session** opens a searchable same-time picker with all **172 published concurrent sessions** imported from the official October 24 PDF, plus curated field-guide recommendations. Choose any concurrent session for David or Peter independently and restore the original instantly; the other person’s plan is unchanged.
- Session attended/skipped statuses, usefulness scores and separate check-ins even when both share a keynote.
- A named-target tracker with 17 conversation tracks, questions, people to seek, requests and supporting evidence.
- Eight conference objectives, a six-item sanitized evidence-pack checklist, and action-oriented structured meeting notes.
- Add appointments/meeting holds, track product conversations, classify issues into **supported design / tenant configuration / product defect / roadmap gap**, capture target dates.
- CSV follow-up export and JSON backup/import merge. Offline PWA service worker when hosted on HTTPS.

All entries are **tentative**; the field guide does not imply speaker availability, booking confirmation, passes or feature GA status. Confirm session times/rooms in the official conference agenda each morning.

## GitHub Pages deployment

This repository includes `.github/workflows/pages.yml`; every push to `main` validates and publishes **only** the `public/` folder using official GitHub Pages actions. No build tools or secrets are needed.

1. Create a GitHub repository, suggested name `PPCC-2026-Conference-Companion`. **Do not initialize with a README** if you will push this entire directory using `git`.
2. Upload/push the full contents of this directory, including the `.github/` folder, to the repository's `main` branch.
3. In the repository choose **Settings → Pages → Build and deployment → Source: GitHub Actions**. The provided **Publish Conference Companion** workflow deploys the site on push; run it manually from **Actions** if needed.
4. Open the URL displayed in the workflow's **Deploy to GitHub Pages** step, normally `https://YOUR-USERNAME.github.io/PPCC-2026-Conference-Companion/`. If installed to your phone's home screen, refresh after future updates.

**Important privacy limitation:** GitHub Pages sites are publicly accessible, including when published from a private repository. Session targets, names, and preloaded questions in `public/data.js` are visible to site visitors. **Do not put room keys, real meeting notes, passwords, or confidential business data in the repository.** Saved notes stay in the device's `localStorage` unless you separately enable the Cloudflare sync service below.

### Quick publishing from a terminal

```sh
git init
git add .
git commit -m "Initial PPCC 2026 Conference Companion"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/PPCC-2026-Conference-Companion.git
git push -u origin main
```

## Quick local preview

Open `public/index.html` in a browser. Browser file restrictions can limit saved data or service workers; for a full preview run a local server:

```sh
cd public
python -m http.server 8000
# open http://localhost:8000
```

Initial data is in `public/data.json` (machine-readable) and `public/data.js` (used by the web app). Concurrent-session options are sourced from the published [PPCC October 24 schedule](https://devintxcontent.blob.core.windows.net/showcontent/Schedule/PPCC-Schedule-2026-10-24.pdf). No external JS/CSS dependencies.

## Shared live updates with Cloudflare Workers (optional)

**Local notes do not automatically appear on the other person's phone until you deploy a sync endpoint and configure both devices.** For cross-device sync, this package contains a lightweight Worker + KV implementation. The Worker can also serve the front end from the same domain, or be used only as a sync API for the GitHub Pages front end.

1. Install [Node.js](https://nodejs.org/) and sign in to your own Cloudflare account: `npx wrangler login`.
2. Create a KV namespace: `npx wrangler kv namespace create EVENTS`. Copy the returned namespace ID to `wrangler.toml`, replacing `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.
3. Deploy from this directory: `npx wrangler deploy`. The output gives you a `https://...workers.dev` URL, which hosts a copy of the app and the sync API. If you are using the GitHub Pages website, keep opening that Pages URL and enter the Worker URL in its Settings.
4. Open the same app website (the Pages URL or Worker URL) on both devices. In **Settings**, set the **Worker URL** to that URL, and **Generate strong key** on one device. Securely give the same 48-character key to the other attendee and paste it into Settings there.
5. Tap **Save & sync** on both devices. Both may add notes/check-ins. The app polls every 30 seconds and syncs new updates while connected. Offline updates are stored locally and uploaded later.
6. On phones, use **Add to Home Screen** from the browser for the PWA (served via HTTPS).

### Security and data handling

The room key functions as a bearer credential. **Do not send it publicly or put it in GitHub.** The Worker does not log/save the raw key. The corresponding SHA-256 digest namespaces the data in KV. People holding the secret can read/edit the shared room. No Microsoft or Marriott credentials are used, and you should not enter confidential hotel data, credentials or restricted evidence. There is no enterprise authentication or role enforcement; use only sanitized notes.

Notes are stored as individual immutable events in Cloudflare KV to avoid stale overwrites. KV is eventually consistent; updates can take time to propagate. Changes with the same field are resolved by event timestamp (tie-breaker: ID). The app retrieves all room events when syncing, so it is intended for this small 3-day conference, not long-term high-volume use. Client-side data is also kept in `localStorage`. For full audit/role access, use an authenticated enterprise backend.

### Publishing without live sync

Upload everything in `public/` to any static HTTPS host (e.g. GitHub Pages or Cloudflare Pages). You can still use offline notes, JSON backup and CSV exports; two attendees can exchange exported JSON files and merge them via **Settings → Import backup JSON**.

## Files

- `public/index.html`, `style.css`, `app.js`, `data.js`: complete front end
- `public/data.json`: editable structured plan
- `public/service-worker.js`, `manifest.webmanifest`: offline-capable installable web app
- `worker.js`, `wrangler.toml`: optional hosted real-time-ish event-sync endpoint
- `.github/workflows/pages.yml`: validation + automatic GitHub Pages deployment
- `build_data.py`: generator from the provided plan; *not needed to deploy*. Requires PyMuPDF if rerun.

The source PDF is not bundled so that private conference notes and documents remain separately controlled.