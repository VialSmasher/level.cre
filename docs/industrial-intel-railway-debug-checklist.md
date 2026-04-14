# Industrial Intel Railway Debug Checklist

## Purpose
Use this checklist when the live Vercel app and the expected Tool B data do not match.

Current known signal:
- live app renders the new Tool B map shell
- authenticated `/api/intel/listings` calls are happening
- repo-side DB check shows populated Industrial Intel tables
- live app still shows zero listings

This strongly suggests environment mismatch.

## Known Facts
- Vercel rewrites `/api/*` to `https://levelcre-production.up.railway.app/api/*`
- frontend auth sends `Authorization: Bearer <supabase token>`
- live authenticated requests are reaching the listings endpoint
- `/srv/levelcre/.env` DB has data:
  - `intel_listings = 15`
  - `active intel_listings = 13`
  - `intel_sources = 5`

## Debug Goal
Prove whether Railway production is using:
- the same populated database
- a different database
- or the same database but a stale / unexpected backend state

## Step 1, Confirm live app target
In deployed `vercel.json`, confirm:
- `/api/(.*)` rewrites to Railway prod API

Expected:
- `https://levelcre-production.up.railway.app/api/$1`

## Step 2, Confirm Railway service deploy target
In Railway:
- open the production API service
- confirm latest deploy time
- confirm branch/source repo
- confirm service is the one serving `levelcre-production.up.railway.app`

## Step 3, Confirm auth is not the issue
In browser devtools on the live app:
- inspect `/api/intel/listings`
- confirm request includes `Authorization: Bearer ...`

Expected result:
- yes, bearer token present

If present, auth wiring is not the problem.

## Step 4, Confirm Railway DB binding
In Railway service variables:
- inspect `DATABASE_URL`
- confirm the attached DB/service identity
- verify it is the expected production DB, not a lookalike or reset clone

Do not compare only by friendly name if multiple similar DBs exist.
Compare:
- attached service/project
- environment
- creation/reset history if visible

## Step 5, Query row counts on Railway-connected DB
Run:
```sql
select count(*) as total_listings from public.intel_listings;
select count(*) as active_listings from public.intel_listings where removed_at is null;
select count(*) as total_sources from public.intel_sources;
```

### Interpretation
#### If counts match populated repo-side DB
Then the live backend should not be returning zero.
Next checks:
- inspect actual `/api/intel/listings` response body from Railway
- inspect backend logs for intel route behavior
- confirm no accidental schema/search-path mismatch

#### If counts are zero
Then Railway prod is using the wrong DB or an empty DB.
That is the root cause.

## Step 6, Compare route behavior directly
Authenticated request should return listings JSON, not `[]` if counts are nonzero.

If needed, compare:
- live browser response body from `/api/intel/listings`
- DB row counts

If DB is populated but response is empty, inspect:
- route code version on Railway
- whether Railway is running current backend commit
- whether code is querying the expected table/schema

## Step 7, Confirm migration state
For map metadata work, verify migration state on Railway DB:
- `0006_industrial_intel_map_fields.sql` applied or not

This does not explain zero listings by itself, but it matters for map-ready payload shape.

## Step 8, Tomorrow decision tree
### Case A, Railway DB empty
Action:
- fix `DATABASE_URL` / environment binding
- redeploy Railway API
- retest live app

### Case B, Railway DB populated but API response empty
Action:
- inspect Railway backend logs
- verify deployed backend commit/version
- inspect `getListings()` result path against live DB

### Case C, Railway DB populated and API returns listings
Action:
- clear browser cache / refetch
- verify why stale cached empty response persisted
- confirm listings page updates live

## Adjacent follow-up, email -> Telegram/OpenClaw path
Pat reported the email/Telegram integration is about 90% complete from terminal work but not fully tidied up.

Add this to tomorrow's follow-up list:
- audit current OpenClaw mail hook state
- inspect `hooks.gmail` in `~/.openclaw/openclaw.json`
- verify Gmail auth/OAuth still holds
- run Gmail webhook setup and runtime commands if needed
- confirm incoming email path actually lands where expected for Telegram/OpenClaw handling
- avoid rotating unrelated OpenClaw settings while fixing this

## Fastest success signal tomorrow
The fastest clean proof is:
1. Railway DB row counts
2. live `/api/intel/listings` response body
3. compare the two

Once those match, the environment mystery is over.
