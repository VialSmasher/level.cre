# Level CRE Product Focus Notes

Last updated: June 26, 2026

## Overwhelming Product Principle

The app exists to make the user want to cold call, prospect, and business develop.

Every major product decision should support four goals:

- Make prospecting feel easier to start and harder to ignore.
- Record the useful activity and context with as little manual effort as possible.
- Turn business development into a competitive fitness loop that feels closer to Fitbit or Strava than a traditional CRM.
- Make the experience rewarding and habit-forming enough that the user wants to come back.

When deciding whether to build, keep, park, or delete a feature, ask whether it increases the user's willingness to prospect, improves hands-off capture, strengthens the score/challenge loop, or makes the product more addictive to use. If it does not, it is probably secondary.

## Current Product Direction

Level CRE v1 should be a map-first prospecting and business-development system for industrial CRE, not an end-to-end CRM or active-deal management product.

The product should feel like a practical sales fitness tracker:

- Work a prospecting map.
- Keep follow-ups current.
- Capture calls, emails, meetings, and notes.
- Build market memory through requirements and comps.
- Let agents review, prioritize, summarize, and suggest next actions.
- Reward consistent, high-quality prospecting activity.

## Parking Decisions

### Park Track Record

Track Record is useful as a private broker ledger or client-facing brag sheet, but it is adjacent to closed-deal history and can blur the product's focus. Keep the code for now, but remove it from the primary app experience unless explicitly feature-enabled.

### Park Industrial Intel

Industrial Intel remains a separate future module behind its feature flag. Do not make it part of the v1 user-facing flow while Level CRE's core prospecting loop is being tightened.

### Keep Email Activity Capture

Email should remain part of the activity and scorecard model because email follow-up is a core prospecting action.

Keep:

- BCC/forward-in capture.
- Email-to-prospect matching.
- Email review/cleanup.
- Email follow-up credit in Scorecard.
- Email history for stale-follow-up and agent summaries.

Avoid for v1:

- Full inbox replacement.
- Heavy mailbox triage.
- Compose/send as a primary product surface.
- Mail-client style navigation.

The user-facing concept should be "Activity Capture" or "Email Sync", not "Inbox" as a standalone product.

## Workspace And Challenge Direction

Workspaces are useful infrastructure for shared listings, saved prospect sets, and collaboration context. They should not dominate the primary nav while the product is being simplified.

The more compelling visible loop is Challenges:

- Prospect this listing with me.
- Beat the assistant on a shared listing.
- Find targets in a submarket.
- Clean stale records.
- Book follow-ups.
- Add verified contacts.

Workspaces can remain underneath as the container. Challenges should become the more fun, motivational surface.

## Recommended V1 Navigation

Primary:

- Map
- Follow-ups
- Knowledge
- Challenges
- Scorecard

Secondary / tucked away:

- Activity Capture
- Requirements
- Market Comps
- Workspaces
- Review Console
- Profile / Settings

Parked:

- Track Record
- Industrial Intel
- Team leaderboard until there is real team usage
- Pricing / paid-plan emphasis until commercialization is immediate

## Current Priority Stack

1. Trim the product surface so v1 feels focused.
2. Improve the shared UI shell and reduce route-by-route inconsistency.
3. Address production dependency vulnerabilities.
4. Fix root typecheck so build health is honest.
5. Improve demo data and empty states so the app demonstrates the core loop.
6. Make agent-facing review and next-action contracts explicit.
