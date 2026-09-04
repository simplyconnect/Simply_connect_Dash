# Simply Connect · Analytics Dashboard v2

Premium call center analytics dashboard with **Calls Data + Sales Data** fully visualized.
**Stack:** HTML · CSS · JavaScript · Chart.js · Google Apps Script API · GitHub → Vercel

Current static snapshot: **52,292 calls** and **3,085 sales** (Aug 1 – Sep 2, 2026), generated
from the uploaded `calls & sales Data.xlsx`.

---

## What's in this Dashboard

| Tab | Data Source | Key Metrics |
|-----|-------------|-------------|
| Overview | Both sheets | KPIs, daily trend, call results, team comparison, provider + service charts |
| Call Analytics | Calls Data | Answer/abandon rates, bounce distribution, talk/wait time trends |
| Sales Analytics | Sales Data | Provider share, service mix, install type, closers, state map, sales log |
| Agent Performance | Both sheets | Calls + sales combined per agent, scatter chart, underperformer alerts |
| Campaigns | Calls Data | Call volume & answer rate per queue |
| State Analytics | Sales Data | Sales & RGU breakdown by state |
| Hourly Heatmap | Calls Data | Answer rate heatmap, peak hour analysis |
| Insights | Both sheets | Automated management insights, computed live from the current dataset |
| API Setup | — | Step-by-step deploy guide + full GAS code |

All KPI captions, insights, and table counts are computed from whatever data is loaded
(static snapshot or live sheet) — nothing is hardcoded to this particular snapshot.

---

## Columns Used

### Calls Data Sheet
| Column | Used For |
|--------|----------|
| Date | Daily trend charts, date filtering |
| Time Frame | Hourly heatmap (e.g. `19-20CT`) |
| Agent Name | Agent performance table — **blank on unanswered calls** (see note below) |
| Call Result | Answered/Abandoned/Overflow/Stranded/Escaped/Transferred KPIs & chart |
| Talk Time | Avg talk time KPI and scatter chart |
| Wait Time | Avg wait time KPI and trend |
| Number of Bounces | Bounce distribution chart |
| Call Center Name | Campaign/queue breakdown |

> **Data quirk worth knowing:** in your export, `Agent Name` is only populated on rows where
> `Call Result = Answered`. Abandoned/Overflow/Stranded/Escaped/Transferred calls have no
> agent attributed. That means per-agent "Calls" and "Answered" are always equal (100%) —
> that's not a bug, it's how the source system logs it. Team- and campaign-level totals
> still include the unattributed calls; only the per-agent breakdown excludes them.

### Sales Data Sheet
| Column | Used For |
|--------|----------|
| Date | Sales log date filtering |
| Agent Name | Sales log, agent combined view |
| Team | Team performance cards |
| Provider | Provider doughnut, RGU-by-provider chart |
| Services | Service type pie chart |
| State | State analytics bar + table |
| RGU's | RGU KPIs, state table |
| Installation Type | Install type pie chart |
| Closer Name | Closer bar chart |
| Sale Processed | Sales log |
| Call Received from Queue Name | Shown as "Queue" in the sales log — **not used for filtering** |

> Two columns from the old spec don't exist in your actual sheet and have been removed
> from the dashboard: **`Total Points`** (no such column — the old "Points" KPI/chart is
> now RGU-based instead) and **`gRPCampaign Number`** (the closest real column,
> `Call Received from Queue Name`, uses different labels than `Call Center Name` in Calls
> Data and is blank on about half the rows, so it can't reliably join to the Campaigns tab
> — it's just displayed as-is on the sales log for reference).

---

## Quick Start (Local)

```bash
# No build step needed — just open in browser
open index.html
# Or use a local server:
npx serve .
python3 -m http.server 3000
```

---

## Connect Live Google Sheets Data

### Step 1 — Google Sheets Setup
- Create a new Google Spreadsheet (or use your existing one)
- Name Sheet 1: **`Calls Data`**
- Name Sheet 2: **`Sales Data`** (sheet-name matching is case/whitespace-tolerant, but this
  is the canonical spelling used throughout)
- Column headers must match the tables above exactly
- Copy your Spreadsheet ID from the URL: `https://docs.google.com/spreadsheets/d/**SPREADSHEET_ID**/edit`

### Step 2 — Google Apps Script
1. In your Sheet: **Extensions → Apps Script**
2. Delete all existing code
3. Click **"API Setup"** tab in the dashboard → **"View Full GAS Code"**
4. Paste the full code
5. Replace `YOUR_GOOGLE_SPREADSHEET_ID` with your actual Sheet ID
6. Save (`Ctrl+S`)

### Step 3 — Deploy the API
1. Click **Deploy → New Deployment**
2. Type: **Web App**
3. Description: `Simply Connect API`
4. Execute as: **Me**
5. Who has access: **Anyone**
6. Click **Deploy**
7. Copy the deployment URL (looks like `https://script.google.com/macros/s/ABC.../exec`)

### Step 4 — Connect Dashboard to API
Open `js/data.js`, find near the top:
```js
window.API_URL = '';
```
Replace with:
```js
window.API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

### Step 5 — Test
Reload `index.html`. The status pill should show **"Live data"** in green. If the sheet
name, ID, or a column header is wrong, it'll turn red and show **"API error"** — hover
the pill for the exact error message instead of silently showing stale numbers.

---

## Deploy to GitHub + Vercel

```bash
# 1. Initialize Git repo
git init
git add .
git commit -m "feat: Simply Connect v2 dashboard"
git branch -M main

# 2. Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/simplyconnect-dashboard.git
git push -u origin main
```

**Vercel setup:**
1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repo
3. Framework: **Other** (no build needed)
4. Root Directory: `/` (default)
5. Click **Deploy**

Every `git push` to `main` triggers auto-deployment. `vercel.json` now ships as
zero-config static hosting, so `css/`, `js/`, and `assets/` are included (an earlier
version of this file only deployed `index.html`).

---

## Daily Data Update Workflow

```
Every day:
  1. Export today's calls from your call center platform
  2. Paste rows into Google Sheet → "Calls Data" (append below existing rows)
  3. Export today's sales
  4. Paste rows into Google Sheet → "Sales Data" (append below existing rows)
  5. Dashboard auto-refreshes in 5 minutes — or click ↻ Refresh
```

No code changes required. The Apps Script API always reads the latest data from the sheet.

### Regenerating the static snapshot
The offline fallback in `js/data.js` (`window.STATIC`) is a point-in-time snapshot, not
live data. To refresh it from a newer export: re-run the same aggregation this file was
generated from against your latest `.xlsx`/`.csv` export, and replace the `window.STATIC =
{...}` object in `js/data.js`. If you'd like, send me the newer file and I'll regenerate it.

---

## API Endpoints

| Action | Description |
|--------|-------------|
| `?action=all` | Full dataset (all aggregations) — used on dashboard load |
| `?action=callresults` | Call result breakdown |
| `?action=dailycalls` | Daily call volume |
| `?action=hourly` | Hourly distribution |
| `?action=campaigns` | Campaign/queue breakdown |
| `?action=agents` | Agent performance (calls + sales combined) |
| `?action=teams` | Team-level stats |
| `?action=sales` | Raw sales records |
| `?action=states` | State-level sales |
| `?action=providers` | Provider sales breakdown |
| `?action=services` | Service type breakdown |
| `?action=installtypes` | Installation type breakdown |
| `?action=closers` | Closer performance |
| `?action=summary` | Top-level KPI numbers |

### Filter Parameters
Append any of these to filter the response:
```
&start=2026-08-01    — start date (YYYY-MM-DD), applies to both sheets
&end=2026-09-02      — end date
&team=Team+Hassan    — filter by team name (Sales Data + estimated per-agent team)
&campaign=Group+44+Sales — filter by Calls Data queue name (call volume only)
&state=TX            — filter by state (Sales Data)
&agent=Agent+Name    — filter to single agent
```

Example:
```
https://script.google.com/.../exec?action=all&start=2026-08-01&end=2026-08-15&team=Team+Hassan
```

---

## File Structure

```
simplyconnect-v2/
├── index.html          ← Shell, sidebar, topbar, slicer bar, modal
├── vercel.json         ← Vercel static routing config (zero-config static hosting)
├── README.md           ← This file
├── assets/
│   ├── logo-icon.png   ← Sidebar mark (white rounded square + orange "S")
│   └── logo-full.png   ← Full "simply connect." wordmark
├── css/
│   └── style.css       ← Full design system (tokens, animations, responsive)
└── js/
    ├── data.js         ← Static snapshot (real data) + live API fetch + filter logic
    ├── charts.js       ← All Chart.js chart factories (15 chart types)
    └── app.js          ← Controller: 9 tabs, routing, rendering, events, export, GAS code
```

---

## Changelog

### This update — real data integration
- Replaced the old placeholder dataset with a static snapshot computed from your actual
  `calls & sales Data.xlsx` (52,292 calls, 3,085 sales, 114 agents, 37 campaign queues,
  33 states, 13 providers, 43 closers).
- Removed the fabricated **Points** system (no `Total Points` column exists in your data)
  and replaced every Points KPI/chart/table column with real **RGU**-based equivalents.
- Fixed an Apps Script bug where `Talk Time`/`Wait Time`/`Hold Time`/`Wrap Up Time` — which
  arrive as JS `Date` objects when read from time-formatted Sheets cells — would always
  compute as `0`. `toSecs()` now handles both `Date` objects and `"H:MM:SS"` strings.
  This bug never showed up in the old demo because that data was hardcoded, not computed.
- Rewrote the Agents aggregator to union both sheets — agents who only appear in Sales
  Data (spelled differently between the two sheets, or who took no logged calls) no
  longer silently disappear from the Agent Performance table.
- Added date-range filtering to the sales side of the API (previously only calls were
  filtered by date, even though the slicer bar has date pickers for both).
- Removed the unreliable Sales↔Campaign join (`gRPCampaign Number` doesn't exist;
  `Call Received from Queue Name` uses different labels and is ~50% blank) — the
  Campaigns tab is now calls-volume-only, matching what's actually reliable in the data.
- Replaced dozens of hardcoded captions ("33 transactions", "TX — 10 sales", "232.5
  points earned", "92 agents", etc.) with values computed live from whatever data is
  loaded, so the dashboard stays accurate as your sheet grows.
- Capped the Sales Log table to the 150 most recent rows for render performance (all
  3,085+ rows are still in the CSV export) and added a Date column.
- Team/Campaign/State filter dropdowns now populate from real data instead of a
  hardcoded subset of options.
- Fixed a KPI-animation bug where any KPI using a text override (e.g. "TX", an agent
  name) would flash the real value, then get overwritten with "0" by the count-up
  animation half a second later.

### Earlier update — branding
- Sidebar re-skinned to match the brand mockup: near-black (`#0B0B0B`) background, bright
  orange active pill (`#FFB300 → #FE9500`) with a white ring + glow, light-gray inactive
  text.
- Real logo wired in as the sidebar mark and browser favicon.
- `vercel.json` fixed — the old config only ever deployed `index.html`; `css/`, `js/`,
  and `assets/` were silently missing from every deploy.
- Apps Script sheet-name lookup made case/whitespace-tolerant, and errors are now
  returned as JSON with the status pill turning red instead of quietly showing stale data.

---

## Known data-quality notes (from your sheet, not introduced by this update)

- **~22 agent names** appear in Sales Data but don't exactly match any name in Calls Data
  (e.g. `"Uzair Siddique"` vs `"Uzair Siddiqui"`, `"Zeeshan Imran"` vs `"Zeeshan Khan"`).
  They still show up in the Agent Performance table (with `—` for call stats) but won't
  merge with their call-side counterpart until the spelling is made consistent.
- **~59% of call volume has no team attribution.** Team is only recorded in Sales Data;
  an agent's team is inferred from their sales rows. Agents who never appear in Sales
  Data land in an "Unassigned" bucket on the Teams chart/table — that's a limitation of
  the source schema (Calls Data has no Team column), not something the dashboard can fix.
- **`Call Received from Queue Name`** is blank on about half of Sales Data rows and uses
  different labels than `Call Center Name` in Calls Data (e.g. `"Fiber Op"` vs.
  `"Fiber Opp"`), so it can't be used to join sales to a specific calling campaign.

---

## Charts Included

| Chart | Type | Tab |
|-------|------|-----|
| Daily Call Volume | Area (3 series) | Overview, Call Analytics |
| Answer/Abandon Rate Trend | Line | Overview, Call Analytics |
| Call Result Breakdown | Doughnut | Overview, Call Analytics |
| Team Performance | Grouped Bar | Overview |
| Provider Distribution | Doughnut | Overview, Sales |
| Service Type Mix | Doughnut | Overview, Sales |
| Talk Time vs Wait Time | Dual-axis Line | Call Analytics |
| Bounce Distribution | Bar (log scale) | Call Analytics |
| Provider Sales Share | Doughnut | Sales |
| Installation Type | Doughnut | Sales |
| RGUs by Provider | Bar | Sales |
| Top 10 Closers | Bar | Sales |
| State Performance | Horizontal Bar | Sales, States |
| Agent Calls vs Answered | Horizontal Bar | Agents |
| Agent Efficiency Scatter | Scatter | Agents |
| Campaign Volume | Horizontal Bar | Campaigns |
| Hourly Volume & Rate | Grouped Bar | Hourly Heatmap |
