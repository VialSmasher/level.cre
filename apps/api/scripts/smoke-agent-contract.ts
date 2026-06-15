type SmokeCheck = {
  name: string;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
};

const baseUrl = (
  process.env.LEVELCRE_API_BASE_URL ||
  process.env.AGENT_API_BASE_URL ||
  "http://localhost:3001"
).replace(/\/+$/, "");

const apiKey = process.env.INTEL_AGENT_API_KEY;

if (!apiKey) {
  console.error("INTEL_AGENT_API_KEY is required.");
  process.exit(1);
}

const checks: SmokeCheck[] = [
  { name: "agent manifest", method: "GET", path: "/api/intel/agent-manifest" },
  { name: "dossiers", method: "GET", path: "/api/intel/dossiers" },
  { name: "surveys", method: "GET", path: "/api/intel/surveys" },
  {
    name: "SurveySync job dry run",
    method: "POST",
    path: "/api/intel/agent/surveysync-jobs",
    body: {
      dryRun: true,
      survey: {
        title: "Agent smoke test survey",
        clientName: "Agent smoke test",
      },
      dossiers: [
        {
          title: "Agent smoke test property",
          address: "10000 Agent Smoke Test NW",
          facts: [
            {
              factKey: "source_status",
              label: "Source status",
              valueText: "Smoke test only",
              confidence: 100,
              status: "proposed",
              source: "agent_smoke_test",
            },
          ],
        },
      ],
    },
  },
  { name: "agent events", method: "GET", path: "/api/intel/agent-events?limit=5" },
];

async function runCheck(check: SmokeCheck) {
  const response = await fetch(`${baseUrl}${check.path}`, {
    method: check.method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Request-Id": `agent-smoke-${Date.now()}`,
    },
    body: check.body ? JSON.stringify(check.body) : undefined,
  });

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text.slice(0, 500);
    }
  }

  if (!response.ok) {
    throw new Error(`${check.name} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }

  return {
    name: check.name,
    status: response.status,
    requestId: response.headers.get("x-request-id"),
    shape: Array.isArray(payload) ? `array(${payload.length})` : typeof payload,
  };
}

async function main() {
  const results = [];
  for (const check of checks) {
    results.push(await runCheck(check));
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        checks: results,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
