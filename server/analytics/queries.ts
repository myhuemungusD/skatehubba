/**
 * Analytics Queries for North Star Metrics
 *
 * These SQL queries power the investor-ready dashboard.
 * Run in Metabase, pgAdmin, or any SQL client connected to Postgres.
 *
 * North Star: WAB/AU (Weekly Active Battles per Active User)
 * - Proves social density, not passive scrolling
 * - Target: 0.5-1.0 WAB/AU
 */

// ============================================================================
// H. WAB/AU QUERIES
// ============================================================================

/**
 * H1. Single Week Snapshot (Last 7 Days)
 *
 * Returns:
 * - wab: Users who participated in battles
 * - au: All active users
 * - wab_per_au: The ratio (your North Star)
 */
export const WAB_AU_SNAPSHOT = `
WITH last_week AS (
  SELECT *
  FROM analytics_events
  WHERE occurred_at >= now() - interval '7 days'
),
au AS (
  SELECT COUNT(DISTINCT uid) AS au
  FROM last_week
  WHERE event_name IN (
    'battle_created','battle_joined','battle_response_uploaded','battle_voted','battle_completed',
    'clip_uploaded','spot_checkin_validated'
  )
),
wab AS (
  SELECT COUNT(DISTINCT uid) AS wab
  FROM last_week
  WHERE event_name IN (
    'battle_created','battle_joined','battle_response_uploaded','battle_voted','battle_completed'
  )
)
SELECT
  wab.wab,
  au.au,
  CASE WHEN au.au = 0 THEN 0 ELSE (wab.wab::float / au.au::float) END AS wab_per_au
FROM wab, au;
`;

/**
 * H2. Weekly Trend (Last 12 Weeks) - Dashboard Ready
 *
 * Returns a time series perfect for a line chart:
 * - week_start: Start of each week
 * - wab: Battle-active users that week
 * - au: All active users that week
 * - wab_per_au: The ratio
 */
export const WAB_AU_TREND_12_WEEKS = `
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
   AND e.event_name IN (
     'battle_created','battle_joined','battle_response_uploaded','battle_voted','battle_completed',
     'clip_uploaded','spot_checkin_validated'
   )
  GROUP BY w.week_start
),
wab AS (
  SELECT w.week_start, COUNT(DISTINCT e.uid) AS wab
  FROM weeks w
  LEFT JOIN events_by_week e
    ON e.week_start = w.week_start
   AND e.event_name IN (
     'battle_created','battle_joined','battle_response_uploaded','battle_voted','battle_completed'
   )
  GROUP BY w.week_start
)
SELECT
  au.week_start::date,
  wab.wab,
  au.au,
  CASE WHEN au.au = 0 THEN 0 ELSE (wab.wab::float / au.au::float) END AS wab_per_au
FROM au
JOIN wab USING (week_start)
ORDER BY week_start ASC;
`;

// ============================================================================
// J. KPI LADDER QUERIES
// ============================================================================

/**
 * J1. % Uploads with Response in 48 Hours (Battle Density)
 *
 * Measures how quickly the community responds to battle uploads.
 * Target: 25-40%
 *
 * Note: Assumes properties include battle_id on upload/response events.
 */
export const UPLOADS_WITH_RESPONSE_48H = `
WITH uploads AS (
  SELECT
    (properties->>'battle_id') AS battle_id,
    uid,
    occurred_at AS uploaded_at
  FROM analytics_events
  WHERE event_name = 'battle_response_uploaded'
    AND occurred_at >= now() - interval '7 days'
),
responses AS (
  SELECT
    (properties->>'battle_id') AS battle_id,
    occurred_at AS response_at
  FROM analytics_events
  WHERE event_name IN ('battle_voted', 'battle_completed')
    AND occurred_at >= now() - interval '7 days'
)
SELECT
  COUNT(*) AS total_uploads,
  COUNT(*) FILTER (WHERE r.response_at IS NOT NULL) AS uploads_with_response,
  CASE WHEN COUNT(*) = 0 THEN 0
       ELSE (COUNT(*) FILTER (WHERE r.response_at IS NOT NULL)::float / COUNT(*)::float)
  END AS pct_uploads_with_response_48h
FROM uploads u
LEFT JOIN responses r
  ON r.battle_id = u.battle_id
 AND r.response_at <= u.uploaded_at + interval '48 hours';
`;

/**
 * J2. Votes per Battle (Judging Marketplace Health)
 *
 * Measures community engagement in judging.
 * Target: 5+ average votes per battle
 */
export const VOTES_PER_BATTLE = `
SELECT
  COUNT(DISTINCT (properties->>'battle_id')) AS total_battles,
  COUNT(*) AS total_votes,
  AVG(vote_count)::float AS avg_votes_per_battle
FROM (
  SELECT (properties->>'battle_id') AS battle_id, COUNT(*) AS vote_count
  FROM analytics_events
  WHERE event_name = 'battle_voted'
    AND occurred_at >= now() - interval '7 days'
  GROUP BY (properties->>'battle_id')
) t;
`;

/**
 * J3. Crew Join Rate (% of WAUs who join a crew)
 *
 * Measures social stickiness.
 * Target: 25%+ of WAUs
 */
export const CREW_JOIN_RATE = `
WITH last_week AS (
  SELECT *
  FROM analytics_events
  WHERE occurred_at >= now() - interval '7 days'
),
wau AS (
  SELECT COUNT(DISTINCT uid) AS wau
  FROM last_week
  WHERE event_name IN (
    'battle_created','battle_joined','battle_response_uploaded','battle_voted','battle_completed',
    'clip_uploaded','spot_checkin_validated','crew_joined','crew_created'
  )
),
crew_joiners AS (
  SELECT COUNT(DISTINCT uid) AS joiners
  FROM last_week
  WHERE event_name IN ('crew_joined', 'crew_created')
)
SELECT
  wau.wau,
  crew_joiners.joiners,
  CASE WHEN wau.wau = 0 THEN 0 ELSE (crew_joiners.joiners::float / wau.wau::float) END AS crew_join_rate
FROM wau, crew_joiners;
`;

/**
 * J4. D7 Retention (Users active day 7 after first event)
 *
 * Classic retention metric.
 * Target: 12-18%
 */
export const D7_RETENTION = `
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
SELECT
  COUNT(DISTINCT f.uid) AS cohort_size,
  COUNT(DISTINCT d.uid) AS d7_active,
  CASE WHEN COUNT(DISTINCT f.uid) = 0 THEN 0
       ELSE (COUNT(DISTINCT d.uid)::float / COUNT(DISTINCT f.uid)::float)
  END AS d7_retention_rate
FROM first_seen f
LEFT JOIN d7_active d ON f.uid = d.uid
WHERE f.first_day <= now() - interval '7 days';
`;

/**
 * J5. Share/Export-Driven Sessions
 *
 * Measures viral coefficient potential.
 * Target: 20%+ of sessions include export
 */
export const EXPORT_DRIVEN_SESSIONS = `
WITH last_week AS (
  SELECT *
  FROM analytics_events
  WHERE occurred_at >= now() - interval '7 days'
),
total_sessions AS (
  SELECT COUNT(DISTINCT session_id) AS sessions
  FROM last_week
  WHERE session_id IS NOT NULL
),
export_sessions AS (
  SELECT COUNT(DISTINCT session_id) AS sessions
  FROM last_week
  WHERE event_name = 'clip_exported'
    AND session_id IS NOT NULL
)
SELECT
  total_sessions.sessions AS total_sessions,
  export_sessions.sessions AS export_sessions,
  CASE WHEN total_sessions.sessions = 0 THEN 0
       ELSE (export_sessions.sessions::float / total_sessions.sessions::float)
  END AS export_session_rate
FROM total_sessions, export_sessions;
`;

// ============================================================================
// FULL KPI DASHBOARD QUERY (All metrics in one)
// ============================================================================

/**
 * Combined KPI Dashboard Query
 *
 * Returns all key metrics in a single query for dashboard display.
 */
export const KPI_DASHBOARD = `
WITH last_week AS (
  SELECT * FROM analytics_events WHERE occurred_at >= now() - interval '7 days'
),
-- WAB/AU
au AS (
  SELECT COUNT(DISTINCT uid) AS au FROM last_week
  WHERE event_name IN ('battle_created','battle_joined','battle_response_uploaded','battle_voted','battle_completed','clip_uploaded','spot_checkin_validated')
),
wab AS (
  SELECT COUNT(DISTINCT uid) AS wab FROM last_week
  WHERE event_name IN ('battle_created','battle_joined','battle_response_uploaded','battle_voted','battle_completed')
),
-- Votes per battle
votes AS (
  SELECT AVG(cnt)::float AS avg_votes FROM (
    SELECT COUNT(*) AS cnt FROM last_week WHERE event_name = 'battle_voted' GROUP BY properties->>'battle_id'
  ) t
),
-- Crew join rate
crew AS (
  SELECT COUNT(DISTINCT uid) AS joiners FROM last_week WHERE event_name IN ('crew_joined','crew_created')
)
SELECT
  wab.wab,
  au.au,
  CASE WHEN au.au = 0 THEN 0 ELSE (wab.wab::float / au.au::float) END AS wab_per_au,
  COALESCE(votes.avg_votes, 0) AS avg_votes_per_battle,
  CASE WHEN au.au = 0 THEN 0 ELSE (crew.joiners::float / au.au::float) END AS crew_join_rate
FROM wab, au, votes, crew;
`;
