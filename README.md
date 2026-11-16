# Garmin Analyzer

A self-hosted Nuxt 4 dashboard for your Garmin watch (built and tested for a Forerunner 255; any Garmin that writes FIT files works).
Data comes from **FIT files** (always works, no account needed) and optionally from **Garmin Connect auto-sync** (new activities + daily health data).

## What's inside

| Page | Statistics |
|---|---|
| **Overview** | Totals, per-week averages, active days, streaks, Eddington number, activity calendar, monthly/weekly volume by sport, time per sport, fitness snapshot (fitness/fatigue/form, VO2 max, resting HR, HRV, sleep), sport breakdown, recent activities |
| **Trends** | Year-over-year cumulative distance, per-year table, monthly pace/speed and heart rate, pace over time, distance vs pace, HR vs pace, elevation, day of week, start hour, punchcard, histograms |
| **Training** | Fitness (42-day load), fatigue (7-day load) and form from Garmin's training load, weekly time in HR zones, zone distribution (80/20), aerobic/anaerobic Training Effect, running dynamics (cadence, stride length, ground contact time, vertical oscillation, vertical ratio), power curve |
| **Records & PRs** | Eddington, streaks, 16 all-time records (incl. training load, TE, cadence, stride), best efforts 400 m → 50K computed from every run's distance stream, top 5 and best per year |
| **Heatmap** | Every GPS track on one map, heat or by sport |
| **Activities** | Sortable/searchable table, filters (races, indoor, HR, running dynamics), CSV export |
| **Health** *(Garmin Connect)* | Resting HR, HRV, sleep stages and score, bed/wake time, VO2 max, steps vs goal, Body Battery, stress, intensity minutes, race predictions |
| **Devices & zones** | Recording devices, your watch's HR zones and time in each, physiological profile (VO2 max, lactate threshold HR…) |

Filter every page by **sport** and **year**, switch **km / miles**, light / dark / auto theme.

---

## 1. Build the image and deploy on Portainer

1. Pack the project folder **without** `node_modules`, `.nuxt`, `.output` and `data`. From the project folder in PowerShell:
   ```powershell
   tar -czf garmin-analyzer.tar.gz --exclude=node_modules --exclude=.nuxt --exclude=.output --exclude=data --exclude=*.tar.gz .
   ```
2. Portainer → **Images → Build a new image** → name `strava-analyzer:latest` → **Upload** the `.tar.gz` → **Build the image** (2–4 min).
3. Portainer → **Stacks** → your existing stack (or **Add stack**) → **Editor** → paste [`portainer-stack.yml`](portainer-stack.yml) → set `NUXT_DASHBOARD_PASSWORD` → **Update / Deploy the stack**.
4. Open `http://<server-ip>:5000` (or your reverse-proxy domain).

(Alternatives: `docker build -t strava-analyzer:latest .` on the host, or a Portainer stack from a Git repo using `docker-compose.yml`.)

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `NUXT_DASHBOARD_PASSWORD` | *(empty)* | Login page for the dashboard. **Strongly recommended** if reachable from the internet: it shows your health data and where you train. |
| `NUXT_SYNC_INTERVAL_MINUTES` | `60` | How often to sync Garmin Connect (and the import folder). `0` = only when you click Sync. |
| `NUXT_GARMIN_HEALTH_DAYS` | `365` | Days of health history to download and keep up to date. |
| `NUXT_GARMIN_MAX_DOWNLOADS` | `150` | Activity files downloaded from Garmin Connect per sync (a long history takes a few syncs). |
| `NUXT_IMPORT_DIR` | *(empty)* | Folder inside the container to watch for new `.fit` / `.zip` files, e.g. `/import` (mount a host folder there). |
| `TZ` | | Container time zone. |

Everything (activities, original FIT files, health data, Garmin token) lives in the `strava-data` volume at `/data`.

## 2. Get your data in

### A. Import FIT files (recommended for your history, no login needed)
In **Settings → Import FIT files**, drop any of these:
- **Your whole history:** [garmin.com → Account → Data Management → Export Your Data](https://www.garmin.com/account/datamanagement/exportdata). Garmin emails a zip (hours to days). Upload the zip as is. Nested zips are handled, and activity names come from the `summarizedActivities.json` inside.
- **From the watch:** plug the Forerunner into a computer via USB, copy `GARMIN/Activity/*.fit`.
- **A single activity:** Garmin Connect → activity → ⚙ → *Export Original*.
- **From Strava:** Strava's "Download your data" archive (`.fit.gz` inside) also works.

Duplicates are detected by start time, so importing the same file twice is harmless.
Optional: mount a folder as `/import` (see the stack file) and drop files there, e.g. via Syncthing or an SMB share. It's scanned every 5 minutes.

> Behind a reverse proxy, large uploads need a big enough body limit (Nginx: `client_max_body_size 0;`, which Nginx Proxy Manager → *Advanced* lets you set). If the export zip is too big to upload, copy it into the watched `/import` folder instead.

### B. Garmin Connect auto-sync (optional)
In **Settings → Garmin Connect auto-sync**, log in with your Garmin email and password (and the verification code if you use 2-step verification). The password is used once and **never stored**; only the login token is kept in the data volume. Each sync then:
- downloads new activities as original FIT files (same pipeline as import, so the same stats),
- downloads daily health data: sleep, HRV, resting HR, steps, stress, Body Battery, intensity minutes, VO2 max, race predictions.

The first sync of a long history takes several runs (150 activities and 45 days of health data per sync, to stay below Garmin's rate limits). Importing your Garmin export first makes it much faster.

**Important:** Garmin has no official API for individuals. This uses the unofficial login of the Garmin Connect app via [python-garminconnect](https://github.com/cyberjunky/python-garminconnect). Garmin changes it from time to time, which can break login until the library catches up. Rebuilding the image always installs the latest library version. FIT import keeps working regardless.

If the login form keeps failing (rate limited / blocked), wait 15–30 minutes, or log in from a terminal: Portainer → Containers → `strava-analyzer` → **Console** → Connect, then:
```sh
python3 /app/garmin/bridge.py login-cli
```

## Updating
Rebuild the image (step 1.2) and click **Update the stack**. Data is kept. After an update, **Settings → Re-process all FIT files** recomputes everything from the stored originals.

## Troubleshooting

| Problem | Fix |
|---|---|
| Upload fails on big files | Raise the reverse proxy's body size limit, or use the `/import` folder. |
| "Too many login attempts" / 429 | Garmin rate limit. Wait, then retry once. |
| "Garmin rejected the saved login" | The token expired or was revoked. Log in again in Settings. |
| Times shifted by an hour | The watch didn't write a time zone; times from Garmin Connect/export fix themselves on the next sync. |
| Port 5000 already used | Change the left side of `ports:` (e.g. `"8085:3000"`). |

## Local development
```bash
npm install
npm run dev            # http://localhost:3000, data in ./data
pip install garminconnect   # optional, Python 3.12+, for Garmin Connect sync
```

## How it works
- **Nuxt 4** single-page app + **Nitro** server: imports, statistics API, scheduler.
- FIT files are decoded with Garmin's official [FIT JavaScript SDK](https://www.npmjs.com/package/@garmin/fitsdk); best efforts and the power curve are computed from the record streams.
- `garmin/bridge.py` (Python) talks to Garmin Connect; the Node server runs it and merges the results.
- Data is stored as JSON files plus the original FIT files in `/data`. No database.
- Charts: Chart.js. Map: Leaflet + OpenStreetMap.
