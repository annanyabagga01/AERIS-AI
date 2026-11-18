# AERIS AI — Breathe Smarter. Live Better.

GenAI-powered urban air quality and winter smog assistant for Indian families and communities.

## Architecture Overview
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Recharts, Motion (`motion/react`), Three.js (3D atmospheric Earth with aerosol particle field & software-WebGL pacing), Firebase Auth & Firestore.
- **Backend**: Node.js + Express (`server.ts`) serving API routes (`/api/*`), Vite middleware in development, and built `dist/` static assets in production on port `3000`.
- **Pure Shared Domain Modules (`src/lib/`)**:
  - `aqi.ts`: Official CPCB National AQI categories (`Good 0–50`, `Satisfactory 51–100`, `Moderate 101–200`, `Poor 201–300`, `Very Poor 301–400`, `Severe 401–500`, `Unavailable`), incomplete-pollutant guard, IST timestamp parsing, and 3-hour stale-data checks.
  - `emissions.ts`: Sourced India transport emission factors (India GHG Program / WRI India & CEA), CO2e avoidance math, active-mobility AQI safety gating, and streak aggregation.
  - `routines.ts`: Morning, afternoon, and evening schedule planner adapting to AQI tier and household profile.

## Server Environment Variables (`.env.example`)
All API keys are read strictly on the server and never sent to the browser:
- `GEMINI_API_KEY`: Required for server-side Gemini AI recommendations (`@google/genai`, `gemini-4-hydrogen`).
- `DATA_GOV_IN_API_KEY`: Official Open Government Data (OGD) Platform India key for the CPCB real-time AQI dataset.
- `DATA_GOV_IN_RESOURCE_ID`: Official resource ID for the CPCB real-time dataset on `api.data.gov.in`.
- `OPENAQ_API_KEY`: Optional OpenAQ v3 key (`X-API-Key` header) for supplementary sensor-level readings (explicitly distinguished from Official CPCB National AQI).
- `PORT`: Server port (default `3000`).

When `DATA_GOV_IN_API_KEY` or `DATA_GOV_IN_RESOURCE_ID` are unset or unavailable, AERIS AI automatically falls back to clearly labeled **Demo Reference Data** and never fabricates live telemetry or future forecasts.

## Firebase & Firestore Rules
- `firebase-blueprint.json`: Schema definitions for `community_contributions`, `community_challenges`, and `challenge_participants`.
- `firestore.rules`: Hardened security rules enforcing verified Google Auth, UID ownership, opt-in public flags (`optInPublic == true`), server timestamps (`request.time`), strict field allowlists, and zero PII storage.

## Scripts & Verification
```bash
npm run dev      # Start Express + Vite dev server on port 3000
npm run lint     # TypeScript type check (tsc --noEmit)
npm run build    # Build client bundle into dist/
npm start        # Run production Express server on port 3000
npx --yes tsx --test src/lib/aqi.test.ts src/lib/emissions.test.ts src/lib/routines.test.ts
```

## Test Checklist
1. **CPCB AQI & Incomplete Data**: Verify CPCB categories match official 0–500 ranges and incomplete pollutant readings return `Unavailable` (`N/A`).
2. **City Switch & Persistence**: Change city on Dashboard -> verify AQI, stations, and 3D Earth update -> reload page -> verify city persists in `localStorage`.
3. **Pollution Map**: Filter by CPCB category / search city -> click station marker -> inspect pollutants, timestamp, source, and freshness status.
4. **Gemini AI Advisor**: Submit question -> verify `/api/ai/recommendations` sends verified AQI context and returns structured non-medical advice (or clear error if `GEMINI_API_KEY` is missing).
5. **Indoor Air Optimizer**: Adjust room dimensions -> verify CADR updates; check hygiene checklist and houseplant science disclaimer.
6. **Daily Routine Planner**: Toggle children / older adults / sensitive household -> verify Morning/Afternoon/Evening blocks adapt.
7. **Eco Calculator & Impact Tracker**: Calculate Metro vs Solo Car CO2e avoided -> verify walking/cycling safety gate blocks unsafe AQI -> log action -> verify weekly chart and streak update.
8. **Community Hub**: Verify Demo Community mode labels when signed out; sign in with Google & opt in to post anonymous contributions to Firestore.
9. **Settings & Health Check**: Verify `/api/health` reports integration booleans without exposing keys; test nearest-city geolocation without storing coordinates.
