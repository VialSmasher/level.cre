# Level CRE Account Intelligence — Agent Contract

This is the minimal agent-first broker/account intelligence module. It is additive and does not replace prospects, property memory, activities, or opportunities.

## Intended Codex workflow

1. Search Level CRE before external research.
2. Research only missing, stale, or contradictory broker/account intelligence.
3. Submit one idempotent batch containing organizations, people, experience records, and concise source evidence.
4. Treat `created`, `matched`, and `evidence_added` as successful deposits.
5. Leave `review` records in Level CRE for Patrick instead of inventing identity, current control, Canadian coverage, or exclusivity.
6. Retrieve an account or person briefing before drafting outreach or recommending a route.

## Endpoints

- `GET /api/intel/account-intelligence/search`
- `GET /api/intel/account-intelligence/accounts/:id/brief`
- `GET /api/intel/account-intelligence/people/:id/brief`
- `POST /api/intel/agent/account-intelligence/batches`
- `GET /api/intel/account-intelligence/review`
- `PATCH /api/intel/account-intelligence/experiences/:id/review` — broker JWT only

Agent authentication uses `ACCOUNT_INTELLIGENCE_AGENT_API_KEY` and `ACCOUNT_INTELLIGENCE_AGENT_USER_ID`. The existing market-record agent credential is accepted as a compatibility fallback. Sales-activity credentials cannot access this module.

## Core rules

- A person/account connection is many-to-many.
- Store separate experiences beneath that connection; do not flatten several assignments into one note.
- Store `industrial` and `office` as separate asset classes. Do not store a lossy `both` value.
- Use `unknown` when the source does not state an asset class, geography, timing, exclusivity, or jurisdiction.
- Never infer an assignment's asset class from the broker's general specialty.
- Every experience requires at least one concise evidence record.
- Do not submit full email bodies. Store the Outlook message identity and a concise evidence summary.
- Evidence is append-only and idempotent by `(user, source, externalEvidenceId)`.
- Biography disclosures and completed transactions may be stored as observed findings.
- Current account-control and inferred claims enter `needs_review` and cannot be approved by agent credentials.
- An agent cannot set Canadian pursuit to `blocked_confirmed`; that conclusion is routed to Review.
- Rejected experiences retain their evidence and are excluded from normal briefings.

## Search examples

```text
GET /api/intel/account-intelligence/search?q=Cardinal%20Health
GET /api/intel/account-intelligence/search?q=Keith%20Puritz
GET /api/intel/account-intelligence/search?assetClass=industrial
GET /api/intel/account-intelligence/search?relationshipStatus=historical
GET /api/intel/account-intelligence/search?reviewStatus=needs_review
```

## Batch result meanings

- `created`: a new canonical person, organization, or distinct experience was stored.
- `matched`: the supplied identity already existed and was reused.
- `evidence_added`: new append-only evidence was attached to the experience.
- `review`: the finding was preserved, but identity or a consequential conclusion needs Patrick's decision.

Retries must reuse the same `externalBatchId`, experience `externalKey`, and evidence `externalEvidenceId`.
