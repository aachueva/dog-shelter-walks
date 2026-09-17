# Dog Shelter Walk Dashboard

A fast, phone-first dashboard that tells shelter volunteers which dogs should be walked next. It reads two tabs from one public Google Sheet:

- **Current Dogs** is the authoritative shelter roster.
- **Walks** stores each dog's walk dates across the row.

Dogs that only appear in historical data are excluded. New dogs appear immediately even when they have no walk history.

## How prioritization works

The dashboard features at least three dogs by default. It automatically includes any additional dogs tied with the third dog's 14-day walk count, so equally underwalked dogs are never hidden. A dog already walked today is not eligible. The remaining dogs are ranked by:

1. Fewest walks in the trailing 14 days
2. Longest time since the last recorded walk
3. Dog name, for deterministic ties

Set `DAILY_PRIORITY_COUNT` to change the number featured.

## Google Sheet layout

**Current Dogs**

| Column A |
|---|
| Frankie Avalon |
| Duke |
| Pixie |

**Walks**

| Column A | Column B | Column C |
|---|---|---|
| Frankie Avalon | Sep 13 | Sep 5 |
| Duke | Sep 6 | Aug 30 |
| Pixie | | |

Whitespace and capitalization are normalized when the two tabs are joined.

## Run locally

1. Copy `.env.example` to `.env`.
2. Share the Google Sheet as **Anyone with the link can view**.
3. Put the spreadsheet ID in `.env`:

```text
GOOGLE_SHEET_ID=YOUR_SPREADSHEET_ID
```

The ID is the text between `/d/` and `/edit` in the Google Sheet URL.

Then run:

```bash
python3 server.py
```

Open http://127.0.0.1:8080.

## Render setup

In Render, open the `dog-shelter-walks` service, choose **Environment**, and set:

```text
GOOGLE_SHEET_ID=YOUR_SPREADSHEET_ID
```

The tab names default to `Current Dogs` and `Walks`. The server requests both tabs at runtime and caches them for five minutes. Sheet updates do not require another deployment.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `GOOGLE_SHEET_ID` | empty | Recommended Google spreadsheet ID |
| `CURRENT_DOGS_TAB` | Current Dogs | Authoritative roster tab |
| `WALKS_TAB` | Walks | Walk history tab |
| `DAILY_PRIORITY_COUNT` | 3 | Number of featured dogs |
| `DATA_CACHE_SECONDS` | 300 | Server-side data cache |
| `SHELTER_TIMEZONE` | America/Los_Angeles | Day boundary used for “today” |
| `PORT` | 8080 | HTTP port |
| `HOST` | 0.0.0.0 | Bind address |

Complete CSV URLs can be supplied with `GOOGLE_SHEET_CURRENT_DOGS_CSV_URL` and `GOOGLE_SHEET_WALKS_CSV_URL` instead.

## Test

```bash
python3 -m unittest -v
```

## Live app

https://dog-shelter-walks.onrender.com/
