# Strava Analyzer

A self-hosted Nuxt 4 dashboard for your Strava data. It downloads your full history once, stores it in a Docker volume, and keeps it up to date automatically.

## What's inside

| Page | Statistics |
|---|---|
| **Overview** | Totals (count, distance, time, elevation, calories, kudos, PRs), weekly averages, active days, current streak, Eddington number, GitHub-style activity calendar, monthly volume stacked by sport, weekly volume, time per sport, fun facts (Everests, laps of Earth, Moon %), Strava's official recent/YTD/all-time totals, sport breakdown table, recent activities |
| **Trends** | Year-over-year cumulative distance, per-year distance/time/elevation/count with year-on-year change, monthly pace/speed trend, monthly heart rate, pace over time, distance vs pace, HR vs pace (efficiency), monthly elevation, day of week, start hour, day × hour punchcard, distance histogram, HR histogram |
| **Records & PRs** | Eddington number, daily and weekly streaks, 16 all-time records (longest, fastest, highest climb, top speed, max HR, power, kJ, calories, kudos, steepest…), best efforts (400 m → marathon) with top 5 and best-per-year progression |
| **Heatmap** | Every GPS route on one map, colored as a heatmap or by sport, with adjustable intensity. Click a route to open it on Strava |
| **Activities** | Sortable, searchable table with 16 columns, filters (races, commutes, indoor, HR) and CSV export |
| **Gear** | Lifetime distance per bike/shoe, usage stats, recording devices, your HR and power zones |

You can filter every page by **sport** and **year**, switch between **km and miles**, and choose light, dark or automatic theme.

---

## Step 1: Create a Strava API application (5 minutes)

1. Log in to Strava and go to **https://www.strava.com/settings/api**.
2. Fill in the form:
   - **Application Name**: anything, e.g. `My Stats`
   - **Category**: `Data Importer` (or anything else)
   - **Website**: anything, e.g. `http://localhost`
   - **Authorization Callback Domain**: **only the host name** of the address you open the dashboard on. No `http://`, port or path:
     - `192.168.1.50` if you use `http://192.168.1.50:3000`
     - `strava.mydomain.com` if you use a reverse proxy at `https://strava.mydomain.com`
     - `localhost` for local testing
3. Upload any icon, then save.
4. Copy the **Client ID** and the **Client Secret** (click "show").

> Your app starts in Strava's "single player" mode: it can only be connected to **your own** account. That's all you need.

## Step 2: Deploy on Portainer

There are two ways to get the image onto your server. Option A is the easiest.

### Option A: Build the image in Portainer (no command line)

1. Zip or tar this project folder **without** `node_modules`, `.nuxt`, `.output` and `data`. For example, from the project folder on Windows PowerShell:
   ```powershell
   tar -czf strava-analyzer.tar.gz --exclude=node_modules --exclude=.nuxt --exclude=.output --exclude=data .
   ```
2. In Portainer, open **Images → Build a new image**.
   - Name: `strava-analyzer:latest`
   - Build method: **Upload**, then select `strava-analyzer.tar.gz`
   - Click **Build the image** (takes 1–2 min).
3. Open **Stacks → Add stack → Web editor**, name it `strava-analyzer`, and paste the contents of [`portainer-stack.yml`](portainer-stack.yml).
4. Replace the values in `environment:` (see the table below), then click **Deploy the stack**.

### Option B: Portainer stack from a Git repository

Push this folder to a (private) GitHub/GitLab repo. In Portainer, go to **Stacks → Add stack → Repository**, enter the repo URL (and credentials if it's private), and use `docker-compose.yml` as the compose path. Portainer builds the image itself. Set the variables under **Environment variables**: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `APP_URL`, `DASHBOARD_PASSWORD`.

### Option C: Command line on the Docker host
```bash
docker build -t strava-analyzer:latest .
```
Then deploy `portainer-stack.yml` as in Option A, step 3.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `NUXT_STRAVA_CLIENT_ID` | ✅ | From strava.com/settings/api |
| `NUXT_STRAVA_CLIENT_SECRET` | ✅ | From strava.com/settings/api |
| `NUXT_APP_URL` | ✅ | The exact URL you type in the browser, e.g. `http://192.168.1.50:3000` (no trailing slash). Its host name must match the Strava **Authorization Callback Domain**. |
| `NUXT_DASHBOARD_PASSWORD` | recommended | Shows a login page. Leave empty to disable it. Use a password if the dashboard can be reached from outside your home network, because it shows private activities and where you train. |
| `NUXT_SYNC_INTERVAL_MINUTES` | | Auto-sync interval (default `60`, `0` = manual only) |
| `NUXT_DETAIL_SYNC` | | `true` (default): slowly downloads each activity's details (best efforts, calories, device) |
| `TZ` | | Container time zone |

Your data (tokens and activities) is stored in the `strava-data` volume at `/data`, so it survives updates.

## Step 3: Connect

1. Open `NUXT_APP_URL` (e.g. `http://192.168.1.50:3000`) and log in if you set a password.
2. The **Settings** page opens. Click **Connect with Strava**, approve on Strava, and **keep the "View data about your private activities" box ticked**.
3. You are sent back to the dashboard and the first sync starts. A few thousand activities take about a minute.

### About Strava's rate limits
Strava allows 100 read requests per 15 minutes and 1,000 per day. Activity summaries come 200 per request, so the full history downloads quickly. **Best efforts (5K, 10K… PRs), calories and device names need one request per activity.** The app fetches those in the background, about 90 every 15 minutes (runs first), so with a big history they fill in over a day or two. The Settings page shows progress and your current API usage.

## Updating the app
Rebuild the image (Option A step 2 / `docker build`), then in Portainer open the stack and click **Update the stack** (or recreate the container). Your data volume is kept.

## Troubleshooting

| Problem | Fix |
|---|---|
| Strava says **"redirect_uri invalid"** | The Authorization Callback Domain on strava.com doesn't match the host in `NUXT_APP_URL`. The Settings page shows the exact values to use. |
| Back on the dashboard with "invalid_state" | You opened the dashboard on a different address than `NUXT_APP_URL` (e.g. `localhost` vs IP). Always use the same URL. |
| "missing_activity_scope" | You unticked activity access on the Strava screen. Click Connect again and keep it ticked. |
| Behind a reverse proxy (Nginx Proxy Manager, Traefik, Caddy) | Set `NUXT_APP_URL=https://strava.yourdomain.com`, set the callback domain to `strava.yourdomain.com`, and proxy to port 3000. |
| Port 3000 already used | Change the left side of `ports:`, e.g. `"8085:3000"`, and update `NUXT_APP_URL`. |

## Local development
```bash
npm install
cp .env.example .env   # fill NUXT_* values, NUXT_APP_URL=http://localhost:3000
npm run dev            # http://localhost:3000 (Strava callback domain: localhost)
```

## How it works
- **Nuxt 4** single-page app, with a **Nitro** server that handles OAuth, token refresh, sync and the statistics API.
- Data is stored as JSON files in `/data` (`tokens.json`, `activities.json`, `details.json`, …). There is no database.
- Charts use Chart.js and the map uses Leaflet with OpenStreetMap tiles.
- The app only **reads** from Strava (`read, profile:read_all, activity:read_all`). It never writes to your account.
