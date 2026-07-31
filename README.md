# Conjugate Session Planner (PWA)

A mobile-first Westside conjugate training planner and logger. Rebuilt from the
original single-file HTML planner as an installable progressive web app.

## Features

- **Session types:** ME Lower/Upper, DE Lower/Upper, GPP / Extra Workout, Recovery / Restoration, Deload
- **Plan & Log modes** with local draft autosave
- **Fast gym logging:** big touch targets, "Add Set" copies the last set, built-in rest timer with presets
- **Readiness scoring** (sleep / energy / soreness / stress + pain gate)
- **DE wave calculations** (base max × percentage → bar weight, barbell volume, total reps)
- **Progress view:** estimated-1RM trend per exact ME variation, weekly barbell volume, readiness trend, PR review + CSV export
- **History:** open / copy / delete past sessions, merge remote history from Google Sheets
- **Google Sheets sync** via the existing Apps Script backend (`gas/Code.gs`) — same payloads as the original planner
- **Offline-first PWA:** installable to a phone home screen, works with no signal in the gym
- **JSON backup/import** — backups from the original HTML planner import unchanged

## Run locally

Serve the folder with any static server (service workers need http, not file://):

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Deploy (GitHub Pages)

1. Push this repo to GitHub.
2. Repo → Settings → Pages → Deploy from branch → `main` / root.
3. Open the published URL on your phone → browser menu → **Add to Home Screen**.

## Google Sheets sync

`gas/Code.gs` is the Apps Script bridge (unchanged from the original bundle).
Deploy it as a Web App from the linked Google Sheet, then paste the Web App URL
and access token into the app's Settings view. See `gas/SETUP_GUIDE.txt`.
