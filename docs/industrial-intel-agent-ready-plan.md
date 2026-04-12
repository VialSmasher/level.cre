# Industrial Intel, Agent-Ready Architecture Notes

## Why this exists

Industrial Intel should not stop at being a scraper dashboard.
It should become the market-intelligence layer that both humans and agents can use.

That means the system should support two users at once:
- a broker using the UI directly
- an agent or bot calling the same data/logic layer programmatically

## Design principle

Build Tool B as:
1. **data-first**
2. **API-first**
3. **rules-first for matching**
4. **AI-assisted only where it adds value**

Do **not** make the core workflow depend on an LLM guessing over messy text.

## Product goal

Given a requirement, Tool B should eventually be able to return:
- on-market options
- off-market or broker-known options
- ranked fit
- reasons for the match
- source/provenance
- shortlist-ready output

## Recommended layers

### Layer 1, source-of-truth data
Tool B database tables should hold normalized, queryable records for:
- listings
- properties/buildings
- sources
- runs/import batches
- listing changes
- brochures/files/links
- requirements
- match results
- broker notes / private intel
- availability confidence / freshness

### Layer 2, deterministic business logic
This layer should handle:
- filtering
- normalization
- deduping
- status handling
- match scoring
- grouping into strong / possible / stretch
- explanations for why a result matched

This should be deterministic and explainable wherever possible.

### Layer 3, agent/bot interface
Agents should sit on top of the structured system and be able to:
- search inventory for a requirement
- ask follow-up questions
- explain why a property matched
- generate shortlist drafts
- summarize market options
- prepare broker/client-ready output

The agent should not be the only source of truth.
It should query the system, not replace it.

## On-market vs off-market

### On-market
These are the cleanest early wins:
- scraped listings
- imported inventory
- broker-site listings
- status changes over time

### Off-market / gray-market
This should eventually include:
- broker-known availability
- withdrawn or stale listings that may still be available
- canvassing notes
- owner/building intelligence
- private availability flags
- manual entries from Pat/team

Off-market records should carry stronger provenance metadata, for example:
- source type
- confidence
- last verified date
- who entered it
- whether it is safe to show externally

## Requirement matching model

Requirements should be stored structurally, not just as freeform notes.
Examples:
- size min/max
- market/submarket
- lease vs sale
- clear height
- dock loading
- grade loading
- yard
- crane
- power
- office ratio
- budget / asking rate threshold
- timing
- rail / freeway access notes

Matching should first be rule-based and explainable.
Example output buckets:
- strong match
- possible match
- stretch match
- manual review

Each result should carry reasons, for example:
- within size band
- correct submarket
- has dock loading
- yard unknown
- pricing missing
- stale availability, verify manually

## Suggested data additions beyond current read-only slice

Likely next entities after the current seed/listing-change slice:
- `intel_requirements`
- `intel_requirement_preferences`
- `intel_matches`
- `intel_match_reasons`
- `intel_properties`
- `intel_brochures`
- `intel_private_notes`
- `intel_contacts` or relationship hooks later if needed

Keep these separate from Tool A tables unless there is a very strong reason to connect them later.

## UI direction

### Current safe product direction
- Tool A remains the stable default operating flow
- Tool B remains separate on `/tools/industrial-intel/*`
- add a thin launcher, not a giant toolbox shell yet

### Tool B UI phases
1. read-only inventory and changes
2. filters/search
3. requirement creation
4. match results
5. shortlist building
6. brochure/source attachment
7. share/send workflow

## API direction

Tool B should expose clean, agent-friendly endpoints, for example:
- `/api/intel/listings`
- `/api/intel/listings/:id`
- `/api/intel/summary`
- `/api/intel/changes`
- `/api/intel/requirements`
- `/api/intel/matches`
- `/api/intel/shortlists`

Agents and future automations should use these interfaces instead of scraping the UI.

## What AI should do vs not do

### Good uses for AI
- parse messy brochure text into candidate structured fields
- summarize long notes
- explain match reasoning in plain English
- draft broker/client summaries
- propose likely off-market follow-ups

### Bad uses for AI
- being the sole source of listing truth
- silently deciding inventory status without provenance
- replacing deterministic filters/scoring
- hiding why a result was recommended

## Near-term build order recommendation

1. Finish the thin launcher/access model
2. Keep Tool B read-only but real-data capable
3. Wire the earlier industrial tracker/prototype into Tool B ingestion tables
4. Add normalized requirement intake
5. Add deterministic matching + explanations
6. Add shortlist objects
7. Add brochure/file/source handling
8. Add agent-facing endpoints/workflows
9. Add scheduler/automation after the manual path is trusted

## Summary

The correct long-term framing is:

**Industrial Intel is not just a listings scraper.**
It is the structured market-intelligence system that both brokers and agents will use.

Humans should be able to work directly in it.
Agents should be able to query it safely.
Both should rely on the same underlying truth.
