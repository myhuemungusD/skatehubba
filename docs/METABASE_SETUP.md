# Metrics Dashboard Setup (Metabase)

Get an investor-ready screenshot in 30 minutes.

## Quick Start (Local)

```bash
# Run Metabase locally
docker run -d -p 3000:3000 --name metabase metabase/metabase

# Open in browser
open http://localhost:3000
```

## Setup Steps

### 1. Connect Your Database

1. Go to Admin → Databases → Add Database
2. Select **PostgreSQL**
3. Enter your connection details:
   - Host: `your-postgres-host`
   - Port: `5432`
   - Database: `skatehubba`
   - Username: `your-user`
   - Password: `your-password`

### 2. Create WAB/AU KPI Card (North Star)

1. Click **New → Question**
2. Select **Native Query**
3. Paste:

```sql
WITH last_week AS (
  SELECT * FROM analytics_events WHERE occurred_at >= now() - interval '7 days'
),
au AS (
  SELECT COUNT(DISTINCT uid) AS au FROM last_week
  WHERE event_name IN ('battle_created','battle_joined','battle_response_uploaded','battle_voted','battle_completed','clip_uploaded','spot_checkin_validated')
),
wab AS (
  SELECT COUNT(DISTINCT uid) AS wab FROM last_week
  WHERE event_name IN ('battle_created','battle_joined','battle_response_uploaded','battle_voted','battle_completed')
)
SELECT
  ROUND((wab.wab::float / NULLIF(au.au, 0)::float)::numeric, 2) AS "WAB/AU"
FROM wab, au;
```

4. Save as "WAB/AU - Current"
5. Set visualization: **Number**

### 3. Create WAB/AU Trend Line Chart

1. **New → Question → Native Query**
2. Paste the 12-week trend query:

```sql
WITH weeks AS (
  SELECT date_trunc('week', now()) - (n || ' weeks')::interval AS week_start
  FROM generate_series(0, 11) AS n
),
events_by_week AS (
  SELECT date_trunc('week', occurred_at) AS week_start, uid, event_name
  FROM analytics_events
  WHERE occurred_at >= date_trunc('week', now()) - interval '12 weeks'
),
au AS (
  SELECT w.week_start, COUNT(DISTINCT e.uid) AS au
  FROM weeks w
  LEFT JOIN events_by_week e
    ON e.week_start = w.week_start
   AND e.event_name IN ('battle_created','battle_joined','battle_response_uploaded','battle_voted','battle_completed','clip_uploaded','spot_checkin_validated')
  GROUP BY w.week_start
),
wab AS (
  SELECT w.week_start, COUNT(DISTINCT e.uid) AS wab
  FROM weeks w
  LEFT JOIN events_by_week e
    ON e.week_start = w.week_start
   AND e.event_name IN ('battle_created','battle_joined','battle_response_uploaded','battle_voted','battle_completed')
  GROUP BY w.week_start
)
SELECT
  au.week_start::date AS "Week",
  wab.wab AS "Battle Users",
  au.au AS "Active Users",
  ROUND((wab.wab::float / NULLIF(au.au, 0)::float)::numeric, 2) AS "WAB/AU"
FROM au
JOIN wab USING (week_start)
ORDER BY week_start ASC;
```

3. Save as "WAB/AU - 12 Week Trend"
4. Set visualization: **Line Chart**
   - X-axis: Week
   - Y-axis: WAB/AU

### 4. Create Supporting KPI Cards

**Votes per Battle:**

```sql
SELECT ROUND(AVG(vote_count)::numeric, 1) AS "Avg Votes/Battle"
FROM (
  SELECT COUNT(*) AS vote_count
  FROM analytics_events
  WHERE event_name = 'battle_voted' AND occurred_at >= now() - interval '7 days'
  GROUP BY properties->>'battle_id'
) t;
```

**D7 Retention:**

```sql
WITH first_seen AS (
  SELECT uid, MIN(occurred_at::date) AS first_day
  FROM analytics_events
  WHERE occurred_at >= now() - interval '14 days'
  GROUP BY uid
),
d7_active AS (
  SELECT DISTINCT e.uid
  FROM analytics_events e
  JOIN first_seen f ON e.uid = f.uid
  WHERE e.occurred_at::date = f.first_day + interval '7 days'
)
SELECT ROUND((COUNT(DISTINCT d.uid)::float / NULLIF(COUNT(DISTINCT f.uid), 0)::float * 100)::numeric, 1) || '%' AS "D7 Retention"
FROM first_seen f
LEFT JOIN d7_active d ON f.uid = d.uid
WHERE f.first_day <= now() - interval '7 days';
```

### 5. Build the Dashboard

1. Click **New → Dashboard**
2. Name it "SkateHubba - Investor Metrics"
3. Add cards:
   - **Top row:** WAB/AU Number (large), D7 Retention, Votes/Battle
   - **Middle:** WAB/AU 12-Week Trend (full width)
   - **Bottom:** AU and WAB bar chart

### 6. Take Screenshot

1. Click the dashboard menu (⋮)
2. Select **Enter fullscreen**
3. Take screenshot
4. This is your "Metrics Proof Pack" for the deck

## Production Setup

For a real deployment, consider:

1. **Metabase Cloud** - Managed hosting at metabase.com
2. **Railway/Render** - One-click deploys with persistent storage
3. **Self-hosted** - Docker Compose with persistence volume

### Docker Compose (Persistent)

```yaml
version: "3"
services:
  metabase:
    image: metabase/metabase
    ports:
      - "3000:3000"
    volumes:
      - metabase-data:/metabase-data
    environment:
      MB_DB_FILE: /metabase-data/metabase.db

volumes:
  metabase-data:
```

## API Endpoints (Alternative)

If you prefer programmatic access, use the metrics API:

```bash
# Get current WAB/AU (admin auth required)
curl -H "Authorization: Bearer $TOKEN" \
  https://your-api.com/api/metrics/wab-au

# Get 12-week trend
curl -H "Authorization: Bearer $TOKEN" \
  https://your-api.com/api/metrics/wab-au/trend

# Get all KPIs
curl -H "Authorization: Bearer $TOKEN" \
  https://your-api.com/api/metrics/kpi
```

## What Investors Want to See

1. **WAB/AU ratio** - Proves social density
2. **Trend direction** - Even small numbers with upward trend wins
3. **Definitions** - Show them you know what you're measuring
4. **Authenticity** - Real data, even if small, beats projections

Target ranges to aim for:

- WAB/AU: 0.5-1.0 (early target)
- D7 Retention: 12-18%
- Votes per battle: 5+
- Response in 48h: 25-40%
