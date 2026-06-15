export const industrialIntelAgentManifest = {
  name: "Level CRE Industrial Intel",
  version: "2026-06-15",
  purpose:
    "Agent-facing contract for SurveySync and Industrial Intel inventory, dossiers, source assets, facts, requirements, and client survey maps.",
  auth: {
    required: true,
    modes: [
      {
        type: "supabase_jwt",
        header: "Authorization: Bearer <supabase-user-jwt>",
      },
      {
        type: "agent_api_key",
        header: "Authorization: Bearer <INTEL_AGENT_API_KEY>",
        alternateHeader: "X-LevelCRE-Agent-Key: <INTEL_AGENT_API_KEY>",
        requiredEnvironment: ["INTEL_AGENT_API_KEY", "INTEL_AGENT_USER_ID"],
      },
      {
        type: "local_demo",
        header: "X-Demo-Mode: true",
        environment: "development only",
      },
    ],
  },
  invariants: [
    "Original source material should be uploaded and preserved before facts are proposed.",
    "Extracted facts should default to proposed status; approved status is a broker quality gate.",
    "Client-facing survey views must not expose brokerNotes or duplicate-cleanup/internal notes.",
    "Prefer existing dossiers by normalized address before creating new dossiers.",
    "When extraction confidence is low or the property is an intersection/land parcel, keep address nullable and store location_description as a fact.",
  ],
  capabilities: {
    inventory: {
      endpoints: [
        { method: "GET", path: "/api/intel/listings", description: "List current inventory/listings." },
        { method: "POST", path: "/api/intel/manual-listings/upload", description: "Bulk ingest structured listing records from CSV/XLSX-style rows." },
      ],
    },
    dossiers: {
      endpoints: [
        { method: "GET", path: "/api/intel/dossiers", description: "List property dossiers owned by the authenticated actor." },
        { method: "POST", path: "/api/intel/dossiers", description: "Create a property dossier." },
        { method: "GET", path: "/api/intel/dossiers/:id", description: "Read dossier, facts, assets, and linked listing." },
        { method: "PATCH", path: "/api/intel/dossiers/:id", description: "Patch dossier metadata." },
        { method: "POST", path: "/api/intel/dossiers/:id/facts", description: "Create or upsert one proposed/approved/rejected fact." },
        { method: "PATCH", path: "/api/intel/dossiers/:id/facts/:factId", description: "Patch a dossier fact after review." },
      ],
    },
    sourceAssets: {
      maxFileSizeBytes: 26214400,
      supportedContentTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
      uploadFlow: [
        {
          method: "POST",
          path: "/api/intel/dossiers/:id/assets/upload-url",
          body: {
            fileName: "string",
            contentType: "application/pdf | image/jpeg | image/png | image/webp",
            fileSize: "number <= 26214400",
            assetType: "brochure | flyer | aerial | site_plan | photo | survey_page | other",
          },
        },
        {
          method: "PUT",
          path: "<signed Supabase upload URL returned by upload-url>",
          description: "Upload raw file bytes to Supabase Storage using the signed target returned by the API.",
        },
        {
          method: "POST",
          path: "/api/intel/assets/:assetId/complete",
          description: "Mark the uploaded asset active.",
        },
      ],
      extraction: [
        {
          method: "POST",
          path: "/api/intel/dossiers/:id/assets/:assetId/extract",
          description: "Extract proposed facts from an active PDF asset. PDF only in the current implementation.",
        },
      ],
    },
    requirements: {
      endpoints: [
        { method: "GET", path: "/api/intel/requirements", description: "List requirements." },
        { method: "POST", path: "/api/intel/requirements", description: "Create a structured requirement." },
        { method: "GET", path: "/api/intel/requirements/:id", description: "Read requirement detail." },
        { method: "PATCH", path: "/api/intel/requirements/:id", description: "Patch requirement fields." },
        { method: "PUT", path: "/api/intel/requirements/:id/preferences", description: "Replace structured requirement preferences." },
      ],
    },
    surveys: {
      endpoints: [
        { method: "GET", path: "/api/intel/surveys", description: "List internal/client survey drafts." },
        { method: "POST", path: "/api/intel/surveys", description: "Create a survey draft." },
        { method: "GET", path: "/api/intel/surveys/:id", description: "Read survey detail and items." },
        { method: "PATCH", path: "/api/intel/surveys/:id", description: "Patch survey title, client, status, or share token." },
        { method: "POST", path: "/api/intel/surveys/:id/items", description: "Add an inventory listing to a survey." },
        { method: "PATCH", path: "/api/intel/surveys/:id/items/:itemId", description: "Patch recommendation, client notes, hidden flag, or sort order." },
        { method: "POST", path: "/api/intel/surveys/:id/items/reorder", description: "Replace survey item order." },
        { method: "POST", path: "/api/intel/surveys/:id/items/:itemId/assets/upload-url", description: "Attach source material to a survey item." },
        { method: "POST", path: "/api/intel/surveys/:id/share", description: "Enable share token after readiness checks pass." },
        { method: "DELETE", path: "/api/intel/surveys/:id/share", description: "Disable shared survey access." },
        { method: "GET", path: "/api/intel/surveys/share/:token", description: "Read client-facing shared survey without auth." },
        { method: "GET", path: "/api/intel/surveys/share/:token/assets", description: "Read client-facing shared survey assets without auth." },
      ],
    },
  },
  recommendedSurveySyncFlow: [
    "GET /api/intel/agent-manifest to confirm contract.",
    "GET /api/intel/dossiers and match by normalized address/title/market before creating anything.",
    "POST /api/intel/dossiers for unmatched properties.",
    "POST /api/intel/dossiers/:id/assets/upload-url for each source brochure/flyer/photo.",
    "Upload bytes to the returned signed URL.",
    "POST /api/intel/assets/:assetId/complete.",
    "POST /api/intel/dossiers/:id/assets/:assetId/extract for active PDF assets.",
    "Review or add proposed facts with POST /api/intel/dossiers/:id/facts.",
    "Create or select a survey with /api/intel/surveys.",
    "Add inventory listings to the survey with /api/intel/surveys/:id/items.",
    "Attach original source assets to survey items when available.",
    "Only share the survey after readiness checks pass.",
  ],
  notYetImplemented: [
    "service-token permission scopes and per-agent audit tables",
    "bulk SurveySync job endpoint",
    "PPTX parsing",
    "PDF page image previews",
    "direct dossier-to-survey item creation without inventory listing linkage",
    "MCP/OpenAPI tool descriptor",
  ],
} as const;
