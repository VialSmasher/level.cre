# Tool A Agent Review Endpoints

These endpoints expose a deterministic, read-only review layer for Tool A so bots can inspect follow-up risk and data quality without scraping the UI.

## Endpoints

### `GET /api/tool-a/review/followups`

Returns follow-up review items plus summary counts.

Optional query params:
- `listingId`: scope review to a single accessible workspace
- `days`: due-soon window in days, default `7`, max `30`
- `includeAll=1`: include non-actionable records too

Response shape:
- `generatedAt`
- `listingId`
- `daysWindow`
- `summary`
  - `totalReviewed`
  - `actionable`
  - `overdue`
  - `dueToday`
  - `dueSoon`
  - `missingSchedule`
  - `noEngagement`
- `items[]`
  - `prospectId`
  - `name`
  - `status`
  - `severity`
  - `flags`
  - `reasons`
  - `dueDate`
  - `dueStatus`
  - `followUpTimeframe`
  - `lastEngagementAt`
  - `lastInteractionAt`
  - `interactionCount`
  - `contact`
  - `workspaces`

Deterministic follow-up logic:
- uses stored `followUpDueDate` first
- falls back to the latest interaction `nextFollowUp`
- otherwise computes from `followUpTimeframe` anchored on latest engagement
- flags `overdue`, `due_today`, `due_soon`, `missing_schedule`, `no_engagement`

### `GET /api/tool-a/review/data-quality`

Returns data-quality issues plus summary counts.

Optional query params:
- `listingId`: scope review to a single accessible workspace
- `includeClean=1`: include records with no issues

Response shape:
- `generatedAt`
- `listingId`
- `summary`
  - `totalReviewed`
  - `flagged`
  - counts by issue code
- `items[]`
  - `prospectId`
  - `name`
  - `status`
  - `severity`
  - `issueCount`
  - `issues[]`
  - `suggestedActions[]`
  - `lastEngagementAt`
  - `contact`
  - `workspaces`

Current issue codes:
- `placeholder_name`
- `missing_notes`
- `missing_submarket`
- `missing_contact_method`
- `invalid_email`
- `invalid_phone`
- `invalid_website`
- `missing_follow_up_strategy`

## Why this exists

Tool A already has the structured fields agents need, but the review logic mostly lived in the web app.

This layer makes follow-up and cleanup review:
- deterministic
- API-accessible
- reusable by humans and bots
- safer than UI scraping

## Recommended next step

After this read-only slice, add a suggestion/apply flow:
- bots propose safe field cleanups
- humans approve higher-risk edits
- accepted changes write back to Tool A with audit metadata
