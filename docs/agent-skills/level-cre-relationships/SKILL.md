---
name: level-cre-relationships
description: Read and maintain Patrick's private Level CRE company contacts and broker account relationships during company research, business development, corporate-search review, and questions about who works with whom.
---

# Level CRE relationships

Patrick's November 19, 2026 direction is hands-off maintenance as Codex works with him. Read the existing company graph first and save attributable contacts, roles and broker connections as part of the authorized company/BD task without asking for routine entry approval. Respect a request for read-only research. This standing permission does not authorize sending, new prospects, opportunities, sharing, paid research, or changing another broker's data.

Use the maintained workflow at `C:/Users/patri/Documents/GitHub/level.cre/docs/relationship-maintenance.md` and the client `C:/Users/patri/Documents/GitHub/level.cre/scripts/codex/use-levelcre-relationships.ps1`. Read that workflow before a mutation. The client verifies the credential's owner on each invocation and decrypts it only within Patrick's Windows session. Never print/copy the key or fall back to a different credential. Another broker needs their own access, not Patrick's profile.

Start with `-Action Manifest`, then `-Action Search -Query '<company or broker>'`. Resolve the exact existing account by name, location and legal entity. Read `-Action Company -Id '<id>'` and follow the returned broker IDs with `-Action Broker -Id '<id>'`. The company brief provides contacts, saved source context, pending findings, relationship status/scope, role gaps and snapshot tokens.

Organize people under the existing company by real estate, operations, facilities, finance and director roles; one person can have multiple roles. Keep unknown titles unknown. Reuse a broker profile across supported account links. Parent entities, subsidiaries and locations are distinct scopes. A corporate-search director needs the exact legal entity, jurisdiction, source file and search date; directorship alone is not property decision authority.

Use `-Action Maintain -BodyFile '<private JSON>'` for clear, sourced updates. Send the original source/date, minimal facts, exact IDs and a stable external key. Read the live manifest/docs for the request contract. Preserve existing supported roles and context when adding a new role; do not erase earlier knowledge because the latest source is incomplete. A current employer/team page, the person's attributable business correspondence, a corporate search, or Patrick's explicit statement can support a saved observation. General recipient/CC co-occurrence or a guessed title cannot.

Keep broker links historical, ended or unverified unless evidence establishes current representation within the stated scope. Preserve the earlier source and note when a relationship changes. A biography naming a client is not a current local mandate. Save actual LinkedIn profile URLs only when verified; the map's LinkedIn search remains useful when the profile is unknown.

Stage uncertain contact/director evidence with `-Action Finding`. For ambiguous broker identity or conflicting account claims, keep the discrepancy in the private task summary and leave the established link unchanged. Source-backed observations do not need repeated approval; uncertainty needs resolution rather than an invented fact. Do not treat an API rejection as permission to use SQL, spoof a broker session, or bypass a scope gate.

Maintenance updates existing contact context/title and creates sourced additional people; it cannot replace person identity or dialing details. Existing email/phone improvement uses the established verified enrichment workflow. Never invent an interaction to save a contact. An update needs the fresh contact snapshot or broker/connection version. On timeout, retry the exact key and payload, then read back. On conflict, read fresh data and reconcile; do not blindly increment a version. Claim a save only after readback verifies the intended identity, source and scope.

The existing Evening Level CRE Sync handles bounded catch-up for companies actually touched by the run. Sync with Codex loads that same prompt. No additional recurring task is needed. During ordinary research or BD conversations, update immediately as evidence is learned. End with a brief useful result and material gaps; do not turn routine successful maintenance into an approval checklist.
