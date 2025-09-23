Workspace Sharing (Internal)

Overview
- Workspaces are stored in the `listings` table.
- Sharing is implemented via `listing_members` with roles: owner, editor, viewer.
- Prospects link to a workspace via `listing_prospects`.
- Contact interactions can optionally reference a workspace via `contact_interactions.listing_id`.

Schema
- File: shared/schema.ts
- New table: listing_members
  - listing_id → FK to listings.id (cascade delete)
  - user_id → FK to users.id
  - role → 'owner' | 'editor' | 'viewer' (default 'viewer')
  - created_at → default now()
  - Primary key (listing_id, user_id)

API Endpoints
- GET /api/listings/:id/members (owner or member)
- POST /api/listings/:id/members { email, role } (owner only)
- PATCH /api/listings/:id/members/:userId { role } (owner only)
- DELETE /api/listings/:id/members/:userId (owner only)

Authorization (server/routes.ts)
- Owner is inferred from `listings.user_id`.
- View listing, prospects (via listing_prospects) and interactions linked to listing when caller is owner or a member.
- Write to linked prospects and listing-scoped interactions only when owner/editor.
- Member management is owner‑only.

Frontend
- Page: client/src/pages/workspace.tsx
  - Adds a “Share” button in the header.
  - Computes `can.view`, `can.edit`, `can.share` from membership.
  - Disables write actions when `!can.edit`.
- Component: client/src/components/ShareWorkspaceDialog.tsx
  - Lists members with role controls and remove action.
  - Invite by email with role select.
  - React Query keys used: ['/api/listings', listingId, 'members']

RLS (reference)
- See db/rls_listing_sharing.sql for Supabase Row Level Security policy examples.

Testing
1) Prepare a database (recommended for full sharing behavior):
   - Set DATABASE_URL and run `npm run db:prepare` (drizzle-kit push).
   - Start server and app with your Supabase auth configured.
2) As the owner:
   - Create a workspace.
   - Click “Share” and invite a teammate by email as 'editor'.
3) As the invited user (open an incognito window, sign in as that user):
   - Open the shared URL `/app/workspaces/:id` (the owner can share the link).
   - Add a prospect and link it (the Add button is enabled for editors).
4) Back in the owner’s session:
   - Open the same workspace; the prospect added by the editor appears (no duplication).
5) Member removal:
   - Owner removes the editor via the Share dialog; reloading the page as the editor should block access.

Note about Demo Mode
- Demo endpoints support membership management and viewing.
- For full multi-user prospect visibility across members, use a real database session. Demo data is segmented per user for prospects and links.

