# Broker Operating Software Report Card

Version: 1.0

## Purpose

This report card evaluates software that is meant to help a commercial real estate broker prospect, preserve market memory, coordinate a team, and convert activity into production. It is deliberately stricter than a visual design review. A polished screen cannot compensate for missing capture, weak data trust, or a workflow that still depends on manual CRM upkeep.

The benchmark unit is a complete broker job, not an isolated page. A run should include desktop and mobile journeys, realistic data, failure states, source tracing, and at least one live integration where practical.

## Weighted Score

| Dimension | Weight | What the evaluator must prove |
| --- | ---: | --- |
| Core broker value and positioning | 10 | A broker can explain what the product is for, who it serves, and why it is better than a generic CRM. |
| Daily execution and workflow speed | 12 | The product turns current work into a short, usable action queue with low navigation and data-entry cost. |
| Hands-off capture and integration | 15 | Email, agent-assisted sends, meetings, calls, tours, proposals, and other evidence can arrive without duplicate entry. |
| Data trust and explainability | 12 | Confirmed facts, inferred matches, provenance, confidence, idempotency, and terminal-stage safeguards are visible and enforced. |
| Map and market intelligence | 12 | The map improves meeting preparation, property/company recall, nearby discovery, and spatial prospecting. |
| Prospecting and pursuit system | 10 | A broker can move from a lead or listing anchor through outreach, follow-up, requirement, tour, proposal, and opportunity motion. |
| Team collaboration | 8 | Ownership, role, handoff, shared pursuit context, and client-ready reporting work without ambiguity. |
| Performance and reliability | 8 | Core journeys load quickly, recover cleanly, avoid console/runtime errors, and behave consistently in production. |
| UX coherence and accessibility | 8 | Navigation, language, hierarchy, responsive behavior, keyboard use, and accessibility support one mental model. |
| Motivation and production feedback | 5 | Feedback rewards useful controllable behavior and connects activity to meetings, tours, proposals, pipeline, and revenue. |

Weights must total 100. Each dimension is scored from 0 to 100, then multiplied by its weight.

## Score Anchors

| Score | Meaning |
| ---: | --- |
| 90-100 | Category-leading and proven in real use |
| 80-89 | Strong, coherent, and dependable with minor gaps |
| 70-79 | Credible and useful, but important work remains |
| 60-69 | Useful in places, inconsistent as a system |
| 40-59 | Early product with material workflow or trust gaps |
| 0-39 | Concept or prototype; not dependable for the job |

## Evidence Confidence

Every category receives a confidence grade. The grade describes the evidence, not product quality.

| Grade | Evidence standard |
| --- | --- |
| A | Repeated real production use across accounts or teams, with observable outcomes |
| B | Live production or deterministic end-to-end proof for the main path |
| C | Code, unit tests, mocked integration, or design evidence without full live proof |
| D | Assumption, anecdote, or unverified claim |

No category should receive more than 89 with only C-grade evidence. Team collaboration cannot receive A or B confidence without a real two-account test.

## Readiness Gates

Scores do not override a failed gate.

1. **Core flow:** Today, Map, Activity, and Pursuits complete their primary jobs without a blocking error.
2. **Factual integrity:** Inferred evidence cannot silently become a confirmed fact, map pin, or won/lost outcome.
3. **Capture honesty:** Drafted or attempted activity is never recorded as sent.
4. **Public/demo reliability:** Any public demo or onboarding route is useful, realistic, and free of authentication noise.
5. **Production map:** Search, selection, map mode, and prospect editing work in the deployed product.
6. **Team proof:** Team-ready claims require a live two-account ownership, role, edit, and handoff test.
7. **Hands-off proof:** Hands-off claims require observed automated capture across the sources being advertised.

A failed factual-integrity or capture-honesty gate blocks release. Partial team or hands-off gates allow a founder beta but block broader claims.

## Audit Procedure

1. Freeze the product version, deployment URL, date, viewport set, and user roles.
2. Capture the landing, Today, Map, Pursuits, Activity, Scorecard, and supporting data-health screens.
3. Run realistic broker journeys: morning triage, meeting prep, map discovery, follow-up capture, listing pursuit, team handoff, and weekly review.
4. Record completion, time, clicks, errors, recovery, data provenance, and manual entry required.
5. Run responsive, accessibility, console, build, API-contract, and integration checks.
6. Score each dimension with cited evidence and a confidence grade. Apply readiness gates separately.
7. Choose no more than five tune-ups by weighted impact, implement them, and rerun the same evidence set.

## Release Interpretation

| Weighted score | Release interpretation |
| ---: | --- |
| 90+ | Category-leading candidate |
| 85-89 | Team-ready, subject to all gates passing |
| 75-84 | Controlled pilot; useful but not yet broadly hands-off |
| 65-74 | Founder-useful beta; important system gaps remain |
| Below 65 | Prototype or narrow utility |

The generated report is a decision aid, not a substitute for broker interviews or production telemetry. Each run must state its evidence limits.
