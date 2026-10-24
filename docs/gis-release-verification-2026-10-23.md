# Parcel preview: release verification and external UX review

Date: October 23, 2026

Status: API deployment `018099c0-6b68-4673-a146-726acfbe0c0b` is successful with GIS disabled. The production-target frontend candidate is READY but is not assigned to `level-cre.vercel.app`. Existing startup schema checks ran; all four checksummed migrations were already applied. No GIS data imports, broker record edits, or feature-flag changes were performed. Authenticated main-map verification is blocked at the protected deployment sign-in.

## Authoritative checkout

Use `C:/Users/patri/.codex/worktrees/gis-readonly-release/level.cre` for the next release step. The earlier prototype in `C:/Users/patri/Documents/GitHub/level.cre` is on an older, heavily modified baseline and must not be deployed wholesale.

This isolated managed worktree starts at `1bcf864a9fd7135f8df7b2b2dffad6120a8b21cd`, the Git SHA reported by the existing live frontend (`dpl_59NkqFrcncBE84LPkYLfzsoUWXBn`). The verified-email-receipt correction from the newer live API commit `4b117619a3ecc4fd4859188ffe8caa16fcb74792` was preserved before release. The exact deployable implementation is commit `7df308dc0317d8f22a2e744dd170df2f6912b29e` on local branch `codex/gis-readonly-release-2026-10-23`. No branch push or merge was made.

The surgical integration preserves the newer Property / Contact / Activity tabs, classification controls, long-held registration evidence, and canonical property/occupant model.

## What changed

1. One requested **Check parcel** loads and shows a unique matched boundary. Ambiguous, conflicted and partial matches still require an explicit inspection choice. A choice is not approval or persistence.
2. The card is shorter: one **Not linked** state, full zoning description beside its code, one compact parcel-ID line, and Refresh beside the boundary toggle. Legal identity, area basis, source dates/links and warnings remain under Sources & details.
3. Boundary fitting measures the actual visible map and profile panel. It runs when a boundary is shown/changed, not on ordinary renders or manual pans. A browser-discovered DOMRect getter bug was fixed and regression-tested. The public mobile rehearsal frame also caps its sheet height while a boundary is shown; the main app retains its existing panel layout pending authenticated testing.
4. Switching assets clears the prior boundary immediately and aborts pending loads. The public rehearsal frame resets scroll, focuses the new heading and closes on Escape, without trapping focus.
5. Browser loads have a 20-second deadline covering auth wait, fetch and body parsing. Record lookup has a five-second deadline and bounded outstanding queries. A failure shows Retry, preserving and clearly labeling a previous preview instead of claiming it saved.
6. GIS requests terminate before write-capable Intel audit middleware, including disabled, invalid, unauthorized and unsupported-method requests. Only verified broker sessions can use the dossier routes; demo, harness and broad agent credentials are rejected.
7. An occupant dossier resolves the owned canonical property's displayed point. Invalid, foreign, merged, self-linked, chained or point-less links require review. A pending map proposal cannot borrow the parcel of a merely suggested dossier match.
8. Malformed individual source records cannot discard valid candidates; oversized geometry/HTTP bodies are bounded and reported. Source dates preserve their calendar day.
9. The public preview has explicit Tailwind paths so it renders from a clean checkout. Local audit/build scratch directories are excluded from deployment inputs.

No saved notes, status, follow-ups, manual geometry, coordinates, lot size or activity were changed. There is no parcel-save/approval endpoint in this slice and no decorative Accept button.

## Browser evidence

The credential-free preview is `http://127.0.0.1:5178/gis-preview.html`. It uses real public City of Edmonton calls, not demo CRM records. Its Leaflet basemap is a rehearsal frame; the integrated app uses Google Maps.

| Check | Result |
| --- | --- |
| Public parcel 150367 at 14505 - 124 Avenue NW | 1.78 gross mapped acres; BE / Business Employment; separate amber boundary |
| Public parcel 701197 at 14515 - 124 Avenue NW | 3.85 gross mapped acres; BE / Business Employment; reverified in the final build |
| One-click unique match | Check parcel directly reveals boundary and Hide boundary control |
| Mobile 390 x 844 | Final measured parcel bottom 457px; panel begins 514px; the whole parcel is visible above it |
| Desktop 1280 x 800 | Compact card and boundary visible together |
| Switch with sources open | Old boundary removed, source disclosure reset, new heading selected |
| Switch immediately after starting lookup | New asset stays in initial state; old result does not appear |
| Deliberate local-service outage | Failed refresh explicitly retains previous preview and shows Retry |
| Service restored, Retry | Warning clears and successful evidence returns without redirect |
| Escape | Panel and boundary both disappear |
| Final desktop console | No captured warning/error entries |
| Public isolation | Health returns public_gis_only / persistence:none; `/api/prospects` returns 404 |
| Existing live map, read-only | Authenticated map opened; switched verified memory to pending review item without a forced-finish interruption; no review/classification/call actions submitted |

Zoning is sampled at the pin, not established across the parcel. Gross mapped area is calculated from geometry, not surveyed/title/developable acreage. The October 19 zoning date is dataset extraction, not the bylaw effective date. Parcel capture date and title currency remain unknown.

Screenshots are saved at `C:/Users/patri/Documents/GitHub/level.cre/work/gis-release-audit/`:

- `10-mobile-boundary-final.jpg`: corrected mobile geometry fit.
- `11-desktop-final.jpg`: final compact summary.
- `12-sources-final.jpg`: expanded source evidence.
- `13-retry-previous-preview.jpg`: failed refresh without a false save claim.
- `14-second-parcel-final.jpg`: final second-property identity and boundary check.

Images 01-09 are intermediate audit evidence, not the final release appearance. Images 01-02 show the early narrow layering defect despite the 01 filename. Image09 records the viewport defect before its final DOMRect fix.

## Gemini Argon review

Review conversation, verified from the open Argon tab: https://gemini.google.com/app/b1e301c3aa379d3d

Only four public-sample screenshots (04, 05, 06, 08) and product context were shared. No client files, CRM screenshots, contact data, tokens or private dossier data were uploaded.

Accepted: panel-aware fitting, one-click unique-match reveal, less repeated preview chrome, full zone name in the summary, and fewer duplicate caveats. These drove a second implementation/browser pass.

Pushed back: its exact occlusion percentages/pixel positions were not valid measurements (including x=985 for a 390px screenshot); it acknowledged the error. We did not auto-select ambiguous parcels, strip provenance warnings, infer permissions, or redesign production markers from the public rehearsal frame. The response stalled after delivering five findings; it was stopped, then a short follow-up completed. Argon endorsed the bounded iteration and emphasized visible geometry, deterministic ambiguity handling and compact retained warnings. Candidate selection is already explicit and shows a boundary for inspection without approving it.

## Automated verification

- GIS regression suite: **61/61 passed**.
- Existing web suite: **173/173 passed**.
- Existing API suite: **329/329 passed** after preserving the newer live correction, under the exact-version x64 runtime described below. The earlier pre-graft run was 328/328.
- API TypeScript check: passed.
- Focused GIS UI/config TypeScript check: passed.
- Main web build with `VITE_PROPERTY_GIS_PREVIEW_ENABLED=1`: passed.
- API bundle and standalone preview build: passed.
- `git diff --check`: passed; package manifests/lock dependency versions unchanged.
- Full root TypeScript check: **not clean**. It still reports broad baseline target/typing problems (including ES5 iteration defaults, drawing types, PapaParse declarations and workspace props). Focused checks/builds do not imply repository-wide type correctness.

The default Windows ARM64 runtime cannot load pinned canvas0.1.80 in the PDF extraction tests. Verification used official Node24.18.0 x64 and the exact lock-pinned canvas-win32-x64-msvc0.1.80, with Node SHA256 and package SHA512 integrity checked. No mocks/stubs masked this issue; only temporary runtime and ignored node_modules files were added. Runtime path:

`C:/Users/patri/AppData/Local/Temp/levelcre-gis-runtime-check-e88d669d4eb945d5bffbc2b4e9c6ded5/node.exe`

Run the API test script with that Node from `apps/api`; set `ESBUILD_BINARY_PATH` to the installed `node_modules/tsx/node_modules/@esbuild/win32-arm64/esbuild.exe` in this release checkout. The ARM binary is a supported subprocess on this host, not a substituted JS dependency.

Dependency audit reported 31 existing advisories (2 critical, 19 high, 9 moderate, 1 low). Critical proxy-addr2.0.7's subnet path is not used by the app's numeric `trust proxy=1` configuration; no req.ip/req.ips consumers were found. Critical shell-quote1.8.3 was in development/optional tooling, not a GIS request-to-shell path. This is limited triage, not a claim the entire dependency tree is safe. Schedule a separately tested dependency-maintenance pass; no blind audit fix or major upgrades were mixed into GIS.

## Deployment receipt and remaining gate

Story: select an existing owned property on the main map, request its municipal parcel, resolve its saved canonical location, retrieve public municipal evidence, and display a separate preview boundary with source-backed area/zoning without saving or moving the property.

- Exact package: `C:/Users/patri/Documents/GitHub/level.cre/work/gis-release-audit/release-7df308d`, 448 source files, 8,389,457 bytes. Content SHA256 `ff207251961571f403caa10c0ac5bd9c1fc88712de73ef4fdfcc24ee1423cab6`. All source bytes and migration hashes were rechecked before upload.
- Railway API: `018099c0-6b68-4673-a146-726acfbe0c0b`, SUCCESS. The minimal readiness gate waits for `/health` (120 seconds); inherited build/start commands were retained. Startup reports all four migrations already applied and migrations current. `/health` and `/api/version` return 200; the latter has commit:null because this is a local source upload.
- Disabled GIS routes: GET site-information and POST parcel-match/preview both return 404 with private/no-store. Unauthenticated `/api/prospects` returns 401. `PROPERTY_GIS_PREVIEW_ENABLED` remains absent/off.
- Vercel candidate: `dpl_CLweyE1a89shtwWSoiR5ng84Ag3p`, READY, production target built with `VITE_PROPERTY_GIS_PREVIEW_ENABLED=1`, using `--skip-domain`. URL: https://level-57dvuu5om-livingstonpatrick1-gmailcoms-projects.vercel.app/app . Build logs confirm success in 33 seconds, including the 118.41 KB home chunk.
- `level-cre.vercel.app` was independently checked after the candidate completed and still points to `dpl_59NkqFrcncBE84LPkYLfzsoUWXBn`. The CLI assigned its auxiliary project alias to the candidate; the canonical app was not promoted.
- Source provenance warning: Vercel auto-detected the parent original workspace's Git metadata (`300b9f0`), not the exported source. Do not use that inherited metadata as the candidate baseline. The uploaded `_release-manifest.json` source UID `f8e3ee4af1423dc9a5d758d8c0c4f9bc0ef8dac1` exactly matches the local manifest SHA1, whose recorded source commit is `7df308d`; custom release metadata was also supplied.
- Browser boundary: the exact candidate URL redirects to Vercel sign-in. The normal authenticated CLI request did not pass protection. Auto-review refused the connector's temporary bypass-link method because it needs separate authorization. No access-control settings were changed, no temporary link was created by that refused call, and no workaround was attempted. The candidate tab is left at sign-in for Patrick.
- Required next input: Patrick signs into Vercel and Level CRE in the candidate tab, or explicitly approves a narrowly scoped temporary Vercel access link (which still does not replace Level CRE authentication). Then enable the backend for the read-only authenticated canary, perform the main-map checks below, and only then promote the frontend. Do not treat this as completed end-to-end production verification.

The implementation is read-only; durable parcel linking, approval storage and agent proposal scopes remain later work. The rollout receipt and exporter are also saved in the original workspace's `work/gis-release-audit/`.

## Release gates and next safe step

### October 23 authorized rollout preparation

Patrick selected deployment after validation (option 1). Argon review is complete; do not request the same deployment approval again.

The current Railway deployment is `263c0fc6-4daf-485c-be35-821b4f51139b` and its source receipt identifies `4b117619a3ecc4fd4859188ffe8caa16fcb74792`. The four-file verified-email-receipt correction from that commit is preserved in this GIS release. Its frontend is identical to the `1bcf864` baseline. Live Vercel remains `dpl_59NkqFrcncBE84LPkYLfzsoUWXBn`.

The backend startup scripts, migration runner, and ensure-table block match the current live backend after line-ending normalization. GIS introduces no new startup SQL. Ship a clean Git-blob LF export: the Windows checkout's CRLF migration bytes must not be uploaded. Exclude environment backups, private work, and browser evidence. The existing verified `4b117619` LF package is the rollback source; the latest Railway deployment is the dashboard rollback target because that action also restores variables.

A feature-disabled backend rollout followed by an explicitly labelled, authenticated production-data canary is acceptable. This is not isolated staging. Keep the existing frontend alias unchanged until the new production-target build passes the real main-map checks. Backend enablement is global to authenticated brokers; the new UI remains hidden until the candidate frontend is promoted. No broker records will be edited by the GIS checks.

The earlier staging recommendation below is superseded by this verified feature-level rollout plan. The authenticated Google Maps checks remain mandatory. Known nonblocking limits: changing Property/Contact/Activity tabs clears the preview, and very tall mobile panels may leave too little visible map for a full boundary fit.

1. Resolve the protected-deployment/browser sign-in boundary without weakening access controls. Deployment is already authorized; only additional access-link authority, if chosen, is outstanding.
2. Recheck current deployment state before continuing. Vercel's existing `/api` rewrite targets production Railway even for the candidate. Do not call that isolated staging.
3. Enable the backend only for the controlled read-only main-app canary. Rehearse an approved existing standalone dossier and a linked canonical-property/occupant case. Confirm actual Google Maps padding, no point changes, correct tenant scope, source failures, rapid asset switching/closing, Property/Contact/Activity tabs, manual pan, and expired-session retry. The public mobile frame is not proof of the full production panel geometry.
4. Promote only after these checks pass. Preserve the recorded rollback targets and feature flags; record the exact promoted deployment and confirm the main alias afterward.
5. Do not bulk-import or represent the preview as durable enrichment.

## Local run

From the authoritative checkout, in separate terminals:

```powershell
node --import tsx scripts/preview-property-gis.ts
npx vite --config vite.gis-preview.config.ts
```

Use Check parcel once; choose explicitly if multiple candidates appear. No normal API start command or database credentials are needed.
