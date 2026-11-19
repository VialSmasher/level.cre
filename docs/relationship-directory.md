# Daily Desk contacts and relationships

The Daily Desk opens the private directory at `/app/desk/relationships`. Company entries use existing owned prospect records and the established contact service. Broker profiles and account connections are saved in PostgreSQL with migration `0023_relationship_directory.sql`, included in the API startup migration runner.

Broker profiles support name, brokerage, market, email, phone, LinkedIn profile, source URL and notes. Company contacts have LinkedIn search buttons. Each connection records status, scope, notes, source URL and date learned. An explicit broker edit establishes a current relationship. New links default to verification needed.

All directory endpoints require broker authentication and derive ownership from the session. Browser database roles have no direct table access. Edits use versions to reject stale overwrites. Duplicate account connections are rejected. Archived records remain stored. Existing links remain discoverable through merged company records and merge undo.

## Release verification

Run `npm --workspace @apps/api run test:directory`, `npm run build:web`, and `npm run build:api`.

The directory integration test uses disposable PostgreSQL through PGlite and covers owner isolation, invalid URLs, contact persistence, duplicate links, concurrent edits, archive visibility and merged records. Browser review covers entry from the Daily Desk, broker editing, relationship editing, contact saving across reloads, and the mobile layout.

The November 19 review reproduced four calling assertions failing in the existing contact suite on both this branch and base release 0754e43. The broad TypeScript check also reports existing project errors. The new directory files have no reported type errors under the ES2022 check.

The local review server and its database contain the five approved mockup companies and four researched brokers. These private review fixtures are outside the committed release. Production rollout needs the additive database migration and API/web deployments. Importing the reviewed starting relationships must match Patrick's owned company IDs and retain the historical statuses and source notes.

LinkedIn buttons open saved profiles or a name-and-company search. They use ordinary browser navigation.
