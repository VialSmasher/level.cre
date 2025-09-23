What changed & why

Summary

- Unified Supabase PKCE OAuth flow on the client; removed legacy hash parsing.
- De‑duplicated auth listeners and added a single, global auth header cache to avoid repeated `getSession()` calls.
- Added `/api/bootstrap` endpoint returning `{ user, profile, config }` to cut waterfalls on app mount; AuthProvider hydrates the profile query cache from this.
- Standardized fetch helper with credentials and optional request timing logs. Eliminated duplicate auth/profile fetches.
- Instrumented temporary client and server logging around auth gates and create mutations for diagnosis.
- Replaced legacy `useAuth` hook usage in pages with the central `AuthContext` to avoid conflicting auth sources.

Root causes addressed

- Duplicate/slow auth lookups: Client called `supabase.auth.getSession()` on every request, causing extra network and latency. Fixed with in‑memory Authorization caching and a single onAuthStateChange subscriber.
- Conflicting auth sources: Pages used a separate `hooks/useAuth` that fetched `/api/auth/user`, creating redundant requests and stale state. Replaced with `AuthContext` throughout.
- Waterfall on first render: Separate calls for profile on login increased TTI. Added `/api/bootstrap` and seeded the profile cache.
- Silent no‑ops after Google login: Requests could fire before the Authorization header was ready. Protected gate + cached token reduces this window; request logging added to surface any 401s.

New/changed envs

- VITE_LOG_API (optional): set to `1` to log client API timings in dev.
- APP_ORIGIN: already supported and used by `/api/auth/google` to craft `redirectTo`.

Files touched (key)

- client/src/lib/supabase.ts: Explicit PKCE config.
- client/src/lib/queryClient.ts: Global auth header cache, optional API timing logs.
- client/src/contexts/AuthContext.tsx: PKCE‑only callback handling, one‑time bootstrap call, de‑duped listener, logging.
- client/src/components/ProtectedRoute.tsx, client/src/App.tsx: Gate instrumentation.
- client/src/pages/home.tsx, client/src/pages/knowledge.tsx: Use `AuthContext` instead of legacy hook.
- server/routes.ts: Added `/api/bootstrap`; added timing logs to create routes; minor OAuth route debugging messages retained.

How to verify

1) First load `/` (fast 3G): login page should paint quickly; minimal network.
2) Click "Continue with Google": redirected via server `/api/auth/google`; after callback, AuthProvider exchanges code and performs one `/api/bootstrap` call.
3) Navigate to `/app`: requests use a cached Authorization header; no duplicate `onAuthStateChange` logs; creating prospects/workspaces succeeds (201s) with server timing logs.
4) Toggle Demo Mode from landing: creates `X-Demo-Mode` header; mutations still work; swap back to Google and re‑test.

Temporary logging

- Client: set `VITE_LOG_API=1` to see `[api]` lines and gate logs in dev console.
- Server: creation routes print `[route]` lines with user and timing. Express also logs API timing in dev.

