# Conjugate Session Planner (PWA)

A mobile-first Westside conjugate training planner and logger. Rebuilt from the
original single-file HTML planner as an installable progressive web app.

## Features

- **Session types:** ME Lower/Upper, DE Lower/Upper, GPP / Extra Workout, Recovery / Restoration, Deload
- **Plan mode** for programming a session: setup, readiness, exercise selection, targets
- **Log mode** for training it: planning cards hide, each exercise gets checkable
  `weight × reps` set rows pre-seeded from the plan, with the planned target shown as reference
- **Fast gym logging:** big touch targets, "Add Set" copies the last set, built-in rest timer with presets
- **Readiness scoring** (sleep / energy / soreness / stress + pain gate)
- **DE wave calculations** (base max × percentage → bar weight, barbell volume, total reps)
- **Progress view:** estimated-1RM trend per exact ME variation, weekly barbell volume, readiness trend, PR review + CSV export
- **History:** open / copy / delete past sessions, merge remote history from Google Sheets
- **Three storage modes:** device only, device + Google Sheets, or Google Sheets only
  (keeps just the active draft on the phone). Sessions saved without signal queue in an
  outbox and upload automatically on reconnect.
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

## Google Sheets storage

`gas/Code.gs` is the Apps Script backend. It writes three readable tabs
(`Sessions`, `Exercise_Log`, `PRs`) plus a hidden `Sessions_Raw` tab holding the
complete session JSON, so a session reloads into the app with nothing lost.

Deploy it as a Web App from the linked Sheet, run `setupSheets()` once, then paste
the `/exec` URL and access token into Settings and press **Test Google Sheets
Connection**. Full walkthrough in `gas/SETUP_GUIDE.txt`.

After editing `Code.gs` you must redeploy a **new version** — saving alone does not
update the live web app.
