# Maps and Navigation Debug Audit

Date: 2026-06-08

## Findings

1. Google Maps `DrawingManager` is not viable for production drawing.
   - Google now marks the DrawingManager functionality as unavailable in Maps JavaScript API v3.65.
   - The app previously rendered `DrawingManager` on `/app` and `/app/workspaces/:id`, which caused route-level runtime failures when that library was missing.

2. Existing map assets can be preserved without a data migration.
   - Saved shapes live on `Prospect.geometry` as GeoJSON-like data, not inside Google DrawingManager overlay instances.
   - Point geometry uses `[lng, lat]`.
   - Polygon and rectangle geometry can continue to use closed GeoJSON rings in `Prospect.geometry.coordinates`.
   - Statuses, notes, submarkets, contacts, lot sizes, and workspace links remain on the existing prospect records and link tables.

3. The white-screen behavior came from incomplete route error containment.
   - A runtime error in a lazy route could blank the app.
   - `apps/web/src/App.tsx` now wraps the switch in a keyed route-level `RouteErrorBoundary` so navigation failures render the fallback screen instead of a blank app shell.

4. Local browser smoke testing exposed a separate Google Maps key/project problem.
   - `/app` and `/app/workspaces/:id` no longer show the DrawingManager crash.
   - Chrome still reports `Google Maps JavaScript API error: ApiProjectMapError` locally when a key is present but rejected by Google.
   - This checkout also has no root `.env`, and the current shell does not expose a Maps frontend env var, so local Vite builds cannot inject a key.
   - `apps/web/dist` has no embedded Google Maps key after the current build.
   - The stale tracked root `public` build artifact contained old key-bearing route chunks and has been removed.

## Implemented Map Fix

1. Added a shared TerraDraw controller.
   - File: `apps/web/src/features/map/useTerraDrawGoogleMaps.ts`
   - Owns TerraDraw lifecycle, mode changes, Google map interaction toggles, `finish` handling, clearing, and conversion into `Prospect.geometry`.
   - Supports `select`, `point`, `polygon`, and `rectangle`.
   - Uses `terra-draw-google-maps-adapter` with the existing Google Maps instance, so the app keeps Google Maps for base maps and only replaces the removed drawing layer.

2. Wired TerraDraw into the main map.
   - File: `apps/web/src/pages/home.tsx`
   - Toolbar point, polygon, rectangle, select, pan, and clear actions now go through TerraDraw.
   - New shapes still save through the existing prospect create/update paths.
   - Drawing an area for an existing prospect updates that prospect instead of creating a duplicate.

3. Wired TerraDraw into workspace maps.
   - File: `apps/web/src/pages/workspace.tsx`
   - Workspace map controls now use the same shared TerraDraw hook.
   - New and existing workspace-linked prospect geometry continues through the current APIs and cache updates.

4. Disabled the legacy Google DrawingManager render path.
   - Active map pages no longer import `DrawingManager` and no longer request the `drawing` library.
   - Existing saved shapes still render through the app's Google `Polygon` and marker overlays.
   - Removed the unused `apps/web/src/pages/home-backup.tsx` legacy backup file that still referenced DrawingManager.

5. Added geometry conversion coverage.
   - File: `apps/web/src/features/map/useTerraDrawGoogleMaps.test.ts`
   - Verifies TerraDraw points preserve `[lng, lat]` and polygons are normalized to closed rings before save.

## Data Preservation Rules

- Do not overwrite existing `Prospect.geometry` unless a user completes a new drawing or edit.
- Normalize all newly saved polygons to closed GeoJSON rings.
- Preserve all non-geometry fields on patch: `status`, `notes`, `submarketId`, contact fields, business fields, and follow-up fields.
- Keep `lotSizeAcres` recalculation behavior for polygons and rectangles.
- Existing saved assets should render unchanged because the storage schema did not change.

## Remaining Recommendations

1. Fix the local and deployed Google Maps API key/project configuration.
   - Confirm the key is present in the frontend environment as `VITE_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, or `GOOGLE_MAPS_API_KEY`.
   - Prefer `VITE_GOOGLE_MAPS_API_KEY` for Vite/Vercel clarity.
   - Redeploy after changing the env var because Vite embeds client env values at build time.
   - Visit `/debug` after deploy. It should report `Maps key: present` and the expected key source without exposing the key.
   - If `/debug` is present but Google still reports `ApiProjectMapError`, confirm the associated Google Cloud project is active, Maps JavaScript API is enabled, billing is active, and localhost/deployed referrers are allowed.

2. Clean up stale artifacts.
   - Removed the tracked root `public` build artifact that contained old key-bearing compiled map code.
   - Added root `public/` to `.gitignore`; `vercel.json` deploys `apps/web/dist`.

3. Standardize Maps loader configuration.
   - `getGoogleMapsApiKey()` is already centralized, but map pages still duplicate loader setup.

4. Do a real click-to-draw browser QA pass with a valid Maps key.
   - Verify point creation, polygon creation, rectangle creation, drawing onto an existing prospect, cache refresh, and persisted reload on both `/app` and `/app/workspaces/:id`.

## Verification Run

- `npm.cmd --workspace @apps/web run test`: passed, 12 tests.
- `npm.cmd run build`: passed, including web production build and API bundle.
- Browser smoke test on `http://127.0.0.1:5176/app`: route rendered, no route-error screen, no DrawingManager error.
- Browser smoke test on `http://127.0.0.1:5176/app/workspaces/b1091d91-f94f-4189-8e9e-c7ecfd68bd40`: route rendered, no route-error screen, no DrawingManager error.
- Browser console still showed local Google Maps `ApiProjectMapError`; this is a key/project issue and prevented full draw interaction QA.
