# Level CRE UX Benchmarking

Level CRE uses two complementary browser benchmarks:

1. Eight deterministic broker journeys run locally with synthetic CRM, Outlook, pipeline, activity, pursuit-sharing, and review-queue data.
2. A small real-map smoke test runs against a deployed URL with the real Google Maps and Places configuration.

The deterministic suite measures completion, elapsed time, user actions, browser errors, automated accessibility findings, trust checks, and team-readiness checks. It saves an HTML trace plus JSON and Markdown scorecards under `artifacts/ux-benchmark/`, with accepted screenshots under `artifacts/ux-benchmark/screenshots/`. The result is a mechanical score for the scripted journeys, not a claim that the whole product is perfect.

The personas cover Patrick's daily work, a broker working from a phone, a team lead monitoring a junior broker's pursuit, an assistant resolving uncertain email activity, and a junior broker starting a listing farm. Team simulations explicitly check that ownership and permissions are visible and that uncertain email evidence cannot create a confirmed CRM fact.

## Run the benchmark

```powershell
npm.cmd run test:ux
npm.cmd run test:ux:map
```

Use another deployed target for the real-map smoke test:

```powershell
$env:LEVELCRE_REAL_MAP_BASE_URL='https://preview.example.com'
npm.cmd run test:ux:map
```

The local suite starts Vite on `http://localhost:5175` in demo mode and intercepts API calls with deterministic scenario data. It does not read or change Patrick's production records.

## Local Google Maps

Create `.env.local` at the repository root from `.env.local.example`:

```env
VITE_GOOGLE_MAPS_API_KEY=<development-browser-key>
VITE_GOOGLE_MAPS_MAP_ID=<map-id>
VITE_DEMO_MODE=true
VITE_RUNTIME_OVERLAY=false
```

Use a separate development browser key in Google Cloud. Restrict it to Maps JavaScript API and Places API (New), including `places.googleapis.com`, and explicitly authorize the development origins used by the team, for example:

```text
http://localhost:5175/*
http://127.0.0.1:5175/*
```

Start a fixed-port local map session with:

```powershell
npm.cmd --workspace @apps/web run dev -- --port 5175 --strictPort
```

The full local map should only be used for focused map work. Routine journeys do not require a Google key and remain deterministic so Google availability, billing, network timing, and Places result changes do not make the whole UX benchmark unreliable. The deployed smoke test waits for map tiles to cover the viewport before accepting visual evidence.

## Score interpretation

- 90-100: direct, reliable, and comfortably within the task target.
- 75-89: usable, with measurable friction or accessibility debt.
- 60-74: the task works but requires redesign or clearer hierarchy.
- Below 60: failed, unreliable, or materially too expensive for routine use.

Simulation scores measure task mechanics. They do not replace Patrick's judgment about whether the information is useful, trustworthy, and worth acting on, and they do not replace a signed-in two-account pilot for invitations and permissions.
