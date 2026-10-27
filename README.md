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

GitHub Pages is live at <https://glytchedup.github.io/PPCC-2026-Conference-Companion/>. Each phone can use it independently. Cross-phone updates require the Cloudflare Worker as a shared endpoint and **account authorization by the Cloudflare account owner**.

### Deploy in the Cloudflare dashboard

[**Deploy the shared-sync Worker to Cloudflare**](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FGlytchedup%2FPPCC-2026-Conference-Companion)

1. Open the deployment link, sign in to your Cloudflare account, authorize repository access if prompted, and confirm the Worker deployment. Cloudflare's GitHub integration may offer to clone/fork the public repository into your account.
2. Cloudflare Workers Builds automatically provisions the `EVENTS` KV namespace (Wrangler 4.45 or newer); no KV ID or API token needs to be pasted into this GitHub repository. Record the deployed `https://...workers.dev` address.
3. On both phones, open the deployed Worker site **or** the existing GitHub Pages site. In **Settings**, paste the same Worker URL as the sync endpoint. If visiting the Worker-hosted site, the URL is filled in automatically.
4. Tap **Generate strong key** on David's phone; share the key privately with Peter and paste the same value in Peter's Settings. Do not post the key publicly or commit it to GitHub.
5. Tap **Save & sync** on both devices. Future activity uploads when connected and sync checks run every 30 seconds. When offline, updates remain on each device until connectivity returns.

The Cloudflare account owner must authorize deployment; GitHub access alone cannot deploy into a personal Cloudflare account. Check the Worker deployment result before treating phone-to-phone sync as enabled.

### Alternative command-line deployment

If the deploy button is unavailable, clone this repository and run `npx wrangler@latest login` followed by `npx wrangler@latest deploy`. Wrangler automatically creates/binds `EVENTS` the first time. No manual namespace ID is needed. For Cloudflare Git builds, use **Build command: `npm install` (or leave blank)** and **Deploy command: `npx wrangler deploy`** if prompted.

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