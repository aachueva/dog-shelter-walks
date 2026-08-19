# Dog Shelter Walk Dashboard

A lightweight web dashboard for dog shelter volunteers and staff. It reads a walk log from a public Google Sheet and highlights dogs that are underwalked each week.

## Live demo

**[Open the live Dog Shelter Walk Dashboard](https://dog-shelter-walks.onrender.com/)**

## Dashboard preview

![Dog Shelter Walk Dashboard](dashboard_screenshot.png)

## Features

- Weekly walks per dog
- Underwalked dogs highlighted in red (default: fewer than 1 walk per week)
- Summary cards for total walks, dogs walked, and underwalked count
- Walk detail table with dates (and optional walker / check-in times if your sheet has them)
- Works with demo data out of the box

## Expected Google Sheet layout

The dashboard supports two sheet layouts:

**Option A — walk log (two columns)**

| Dog Name | Date of Walk |
|----------|--------------|
| Buddy | 2026-06-09 |
| Luna | 6/10/2026 |

Required columns: **Dog Name**, **Date of Walk** (flexible header naming is supported)

Optional extra columns: **Walker Name**, **Checking Out**, **Checking In**

**Option B — wide matrix (dog names in column A)**

| holden | Jan 4 | Jan 3 | Dec 7 |
| franklin | Jan 4 | Dec 14 | Dec 21 |

Each row is a dog; each cell after column A is a walk date. Dates like `Jan 4`, `Feb 08`, and `2026-06-09` are supported.

## Quick start

1. Copy the example env file:

```bash
cp .env.example .env
```

2. Add your Google Sheet CSV export URL to `.env`:

```bash
GOOGLE_SHEET_CSV_URL=https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv&gid=0
```

To get that URL:
- Open your Google Sheet
- Share it as **Anyone with the link can view**
- Replace `YOUR_SHEET_ID` in the URL above
- If your data is on a different tab, change `gid=0` to the tab's gid (visible in the sheet URL)

3. Start the server:

```bash
python3 server.py
```

4. Open [http://127.0.0.1:8080](http://127.0.0.1:8080)

Without a sheet URL configured, the app uses `sample-data.csv` so you can preview the dashboard immediately.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_SHEET_CSV_URL` | _(empty)_ | Public CSV export URL for your walk log |
| `UNDERWALKED_THRESHOLD` | `1` | Dogs with fewer than this many walks in a week are flagged |
| `PORT` | `8080` | Server port (Render and other hosts set this automatically) |
| `HOST` | `0.0.0.0` | Bind address. Use `0.0.0.0` for public web hosting |

## Deploy to the web

The public deployment is available at **https://dog-shelter-walks.onrender.com/**.

To deploy your own copy with Render:

1. Push this project to a GitHub repository.
2. In Render, click **New → Blueprint** and connect the repo. Render reads `render.yaml` automatically.
3. When prompted, set `GOOGLE_SHEET_CSV_URL` to your sheet's CSV export URL.
4. Click **Apply**. Render builds and deploys the app.

Your Google Sheet must stay shared as **Anyone with the link can view** so the server can read walk data.

**Docker alternative:** build and run anywhere that supports containers:

```bash
docker build -t dog-shelter-walks .
docker run -p 8080:8080 \
  -e GOOGLE_SHEET_CSV_URL="https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv&gid=YOUR_GID" \
  dog-shelter-walks
```

Then map port 8080 on your host or platform load balancer.

## How underwalked is calculated

Each walk is counted in the week of its **Date** column (Monday–Sunday). A dog is marked **underwalked** when its walk count for the selected week is below `UNDERWALKED_THRESHOLD`.

With the default threshold of `1`, any dog with **0 walks** in a week is highlighted.

## Project structure

```
dog-shelter-walks/
├── server.py          # Web server + Google Sheet fetch
├── walk_stats.py      # CSV parsing and weekly aggregation
├── render.yaml        # One-click deploy config for Render
├── Dockerfile         # Container deploy option
├── sample-data.csv    # Demo walk log
├── public/            # Dashboard UI
│   ├── index.html
│   ├── app.js
│   ├── charts.js
│   └── styles.css
└── .env.example
```

## Requirements

- Python 3.9+ (stdlib only — no pip install needed)
