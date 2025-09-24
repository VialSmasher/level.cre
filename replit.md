# Project Overview

## Overview

This is a full-stack prospect mapping application built with React, TypeScript, and Express. The application allows users to create, manage, and visualize prospects on a Google Maps interface with drawing capabilities for geographical areas. Users can mark locations as points or polygons, assign status levels to prospects, and track them through various stages of the sales pipeline.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, using Vite as the build tool
- **UI Library**: Shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: React hooks with localStorage persistence for client-side data
- **Routing**: Wouter for lightweight client-side routing between Map and Knowledge pages
- **Maps Integration**: Google Maps JavaScript API with React Google Maps API wrapper, drawing tools, and multiple map view types (roadmap, satellite, hybrid, terrain)

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API structure with centralized route registration
- **Data Storage**: Enhanced in-memory storage with support for prospects and submarkets
- **Session Management**: Express sessions with PostgreSQL session store configuration

### Data Schema Design
- **Enhanced Prospects Model**: Contains id, name, status, notes, geometry (GeoJSON), creation date, submarket assignment, and last contact date
- **Submarkets Model**: Submarket categorization system with id, name, color, and active status
- **Status System**: Comprehensive enum-based status tracking (prospect → contacted → followup → meeting → client → no_go)
- **Geographical Data**: GeoJSON geometry support for both Point and Polygon types with status-based color coding
- **Analytics**: Real-time calculation of contact rates, activity levels, and performance scoring
- **Validation**: Enhanced Zod schemas for runtime type validation including submarket relationships

### Development Tools
- **Database ORM**: Drizzle ORM configured for PostgreSQL with migration support
- **Code Quality**: TypeScript strict mode with comprehensive type checking
- **Build Process**: Vite for frontend bundling, esbuild for backend compilation
- **Development Experience**: Hot module replacement, runtime error overlays, and Replit integration

### Enhanced Features (December 2024 - January 2025)
- **Dual Page Navigation**: Map view for prospect management and Knowledge dashboard for analytics
- **Collapsible Control Panel**: Toggle-able control panel with multi-select status filters and submarket management
- **Multi-Select Status Filtering**: Select multiple status types simultaneously with colored filter chips matching legend colors
- **Clickable Legend**: Interactive legend where clicking status items toggles map filters with visual feedback
- **Submarket System**: Create, assign, and manage geographical submarkets for prospect organization
- **Contact Tracking**: Last contact date tracking for follow-up management
- **Performance Analytics**: Real-time dashboard showing contact rates, activity levels, and performance scores
- **Data Persistence**: Complete localStorage integration saving prospects, submarkets, UI state, and filter preferences
- **Advanced CSV Import/Export**: Comprehensive CSV import with WKT POLYGON support, Papa Parse integration, and flexible column mapping
- **Complex Geometry Support**: Full WKT format support for POLYGON and POINT data with proper GeoJSON conversion
- **Enhanced UI**: Collapsible panels with persistent state, hybrid satellite view, professional floating controls
- **Knowledge Dashboard**: Performance metrics, no-activity lists, stale prospect identification, and submarket filtering

### Recent Technical Achievements (January 2025)
- **WKT POLYGON Import**: Successfully implemented complex POLYGON coordinate parsing from WKT format with full validation
- **Papa Parse Integration**: Robust CSV parsing handling quoted data and complex coordinate strings
- **Flexible Coordinate Handling**: Support for multiple coordinate formats (WKT, lat/lng pairs, separate columns)
- **GeoJSON Compatibility**: Proper polygon coordinate structure with ring array support
- **Error-Resilient Rendering**: Handles both legacy and modern polygon coordinate formats seamlessly
- **Simplified Requirements Form**: Streamlined data entry with dropdown menus for updated brokerage sources (Cushman, Avison, JLL, Cresa, Omada, Remax), removed timeline field, simplified contact labels
- **UI Enhancement**: Relocated user authentication to bottom-right floating widget for cleaner navigation
- **Polygon Editing**: Interactive polygon editing with draggable vertices, visual feedback, and auto-save functionality
- **Rebuilt Search Component**: Completely rebuilt search functionality as standalone component positioned at bottom-center of map with "search" placeholder
- **Complete Edit Panel System**: Full prospect editing capabilities with sliding panel interface for name, status, notes, and delete operations
- **CSV Import Validation Fixed**: Resolved coordinate validation conflicts between POLYGON WKT format and simple coordinate parsing (August 2025)
- **UI Consolidation & Polish (August 2025)**: Major interface improvements including settings consolidation into gear icon dropdown (import/export/profile/logout), separated controls layout with gear button positioned near Google Maps controls, map toggle relocated to bottom-left with filter icon, fullscreen compatibility with fixed positioning, and clean icon-based filter button replacing text labels
- **Database Integration Complete (August 2025)**: Full PostgreSQL integration with user-specific data association, all prospects automatically saved to user profiles with proper foreign key relationships and data isolation
- **Advanced Polygon Editing (August 2025)**: Interactive vertex editing with draggable points, real-time visual feedback, auto-save to database, and enhanced editing mode styling
- **Gamified Engagement System (August 2025)**: Comprehensive contact interaction tracking with separate phone and email counters, visual feedback animations, quick action buttons, undo functionality for accidental engagements, and reinforcement loops designed to make prospect follow-up activities enjoyable and habit-forming

## External Dependencies

### Core Infrastructure
- **Database**: Neon Database (PostgreSQL) for data persistence
- **Maps Service**: Google Maps JavaScript API for mapping functionality and drawing tools

### UI Components
- **Component Library**: Radix UI primitives for accessible, unstyled components
- **Styling**: Tailwind CSS for utility-first styling approach
- **Icons**: Lucide React for consistent iconography

### Development Services
- **Build Tools**: Vite for frontend development server and building
- **Runtime**: Node.js for backend execution
- **Package Management**: npm for dependency management

### Third-party Libraries
- **Form Handling**: React Hook Form with Zod resolvers for form validation
- **Date Utilities**: date-fns for date manipulation and formatting
- **Utility Libraries**: clsx and tailwind-merge for conditional styling

## Auth Modes

- Demo Mode: Instant access with seeded demo data. Triggered by the “Start Demo Mode” button or `localStorage.setItem('demo-mode','true')`.
- Magic Link (Email): Passwordless sign-in via Supabase email OTP. Always available.
- Google OAuth (Optional): Toggled via env flag and requires Supabase configuration.

### Toggle Google OAuth

- Set the env flag in your environment or `.env` file at repo root:
  - `VITE_ENABLE_GOOGLE_AUTH=0` disables Google OAuth (default)
  - `VITE_ENABLE_GOOGLE_AUTH=1` enables Google OAuth
- When enabled, the landing page shows a “Continue with Google” button and the server exposes `/api/auth/google`.
- Restart dev servers or rebuild so both client (Vite) and server pick up the change.
  - Dev: `npm run dev`
  - Build: `npm run build && npm start`

### Requirements when enabling Google OAuth

- Supabase project configured with Google provider and redirect URLs.
- These env vars must be present (already supported by the app):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## Deploying

- Provision a managed Postgres (Supabase/Neon/RDS). Ensure SSL is enabled.
- Set these env vars in your host (do not commit `.env`):
  - `DATABASE_URL` (must allow SSL; required)
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (for OAuth; optional if demo only)
  - `JWT_SECRET` (cookie signing; any strong random string)
- Prepare the database schema on the live DB:
  - `npm run db:prepare` (ensures `pgcrypto` then runs Drizzle push)
- Build and start:
  - `npm run build && npm start`
- Health checks:
  - `GET /health` (verifies DB connection)

Notes
- The schema uses `gen_random_uuid()`, which requires the `pgcrypto` extension. The `db:prepare` script runs `CREATE EXTENSION IF NOT EXISTS pgcrypto` safely.
- In demo mode (`VITE_DEMO_MODE=1`), most routes work without a JWT; for production, provide a valid Supabase JWT in the `Authorization: Bearer <token>` header.

*PL EDIT SANITY CHECK*
