# Final Runtime Validation Report

## Date
2026-07-01

## Scope
This report captures the runtime validation of the Phase 2 backend using the real Bosch workbook:
- `PHASE_2/INPUT/TIO2_Sprint_Intelligence_v5_final.xlsx`
- API routes exercised via FastAPI `TestClient` with AI advisor disabled (fallback deterministic path)

## Environment
- Backend workspace: `PHASE_2/backend`
- FastAPI application: `app/main.py`
- AI advisor mode: disabled by `ai_settings.ai_advisor_enabled = False`
- Session created from the parsed workbook and stored in runtime session storage

## Key runtime findings

### Baseline forecast
- Baseline on-time probability: `0.21`
- Baseline expected delay: `8.08` days
- Baseline overall risk score: `40.42`

### Recommendations endpoint behavior
- Endpoint: `GET /api/recommendations?session_id=<session_id>&top_n=5`
- HTTP status: `200`
- `advisor_explanation.status`: `fallback`
- The route successfully returned structured recommendation summaries with simulation evidence.

### Simulation evidence for the top recommendation
- Recommendation ID: `a180f3a2d5`
- Action: `Resolve External Team Dependency blocker — BLK-004 (Owner: Meena Balasubramanian)`
- Baseline metrics:
  - on-time probability: `0.21`
  - expected delay days: `8.08`
  - overall risk score: `40.42`
- Simulated metrics:
  - on-time probability: `0.415`
  - expected delay days: `0.86`
  - overall risk score: `35.21`
- Delta metrics:
  - on-time probability gain: `0.205`
  - expected delay reduction: `7.22`
  - overall risk reduction: `5.2058`
- Forecast lever names:
  - `blocker_penalty_hours`
  - `projected_velocity`
  - `remaining_days_blocker_loss`

### Recommendation quality observations
The top 5 recommendations produced runtime evidence showing mixed value:

1. `a180f3a2d5` — Strong positive impact
   - `after_probability`: `0.415`
   - `after_delay_days`: `0.86`
   - clear evidence that blocker resolution materially changes the forecast

2. `b8010363ac` — Harmful recommendation
   - `after_probability`: `0.045`
   - `after_delay_days`: `17.10`
   - This recommendation worsened the forecast and should be rejected or reweighted.

3. `e9a07baa00` — Minor negative impact
   - `after_probability`: `0.201`
   - `after_delay_days`: `8.35`

4. `ae89811142` — No measurable benefit
   - `after_probability`: `0.210`
   - `after_delay_days`: `8.08`

5. `084c391055` — No measurable benefit
   - `after_probability`: `0.210`
   - `after_delay_days`: `8.08`

### Simulation endpoint behavior
- Endpoint: `POST /api/recommendations/simulate?session_id=<session_id>`
- HTTP status: `200`
- Returned structured simulation result for recommendation `a180f3a2d5`
- Verified baseline and after values matched the recommendation summary evidence

### Recovery plan evidence
- Endpoint: `GET /api/recovery-plans?session_id=<session_id>`
- HTTP status: `200`
- Generated plan labels: `SAFE` (Recommended), `AGGRESSIVE` (Alternative), `MINIMAL_DISRUPTION` (Alternative)
- Recommended SAFE plan score:
  - deadline probability: `0.415`
  - expected delay days: `0.86`
  - overall risk score: `35.2126`
  - actions required: `3`
  - composite score: `0.5087`
- The SAFE plan included the strong blocker-resolution recommendation plus two additional lower-impact actions.

### Recovery plan warning
A runtime warning was logged:
- `Aggressive recovery plan scored lower (0.475) than Safe plan (0.509); review plan archetype construction`

This indicates the plan scoring and archetype selection logic needs review, even though the endpoint returned successfully.

## API robustness
- The system recovered from missing AI advisor configuration by using deterministic fallback summaries.
- Endpoints remained responsive and returned valid structured responses.
- No route-level crash occurred during the exercised recommendation and recovery plan flows.

## Issues identified during validation
- Several recommendations produced zero or negative impact on the forecast despite being returned in the top list.
- The recovery plan engine generated an aggressive plan that scored lower than the safe plan, signaling a scoring or archetype mismatch.
- AI advisor was not available in this runtime due to missing `BOSCH_API_KEY`, so recommendation explanations were deterministic-only.
- The useful runtime evidence is currently concentrated in one strong blocker-resolution recommendation; remaining recommendations need better impact filtering.

## Verdict
- The runtime pipeline is functional and stable in fallback mode.
- The recommendation API can emit structured `simulation_evidence` and the simulation route works end-to-end on the real workbook.
- The system is not yet ready for production use because recommendation quality is inconsistent and recovery-plan scoring requires refinement.

## Recommended next steps
1. Reject or deprioritize recommendations with negative or zero forecast impact.
2. Review the recovery plan scoring model to ensure aggressive plans are ranked consistently with their intended archetype.
3. Re-enable AI advisor support once `BOSCH_API_KEY` is available to validate narrative explanations.
4. Add explicit filtering so only recommendations with positive evidence are surfaced by default.

## Files exercised
- `PHASE_2/backend/app/api/routes/recommendations.py`
- `PHASE_2/backend/app/api/routes/recovery_plans.py`
- `PHASE_2/backend/app/main.py`
- `PHASE_2/backend/app/engines/recommendation_engine/recommendation_engine_v2.py`
- `PHASE_2/backend/app/engines/simulation_engine.py`
- `PHASE_2/backend/app/engines/recovery_plan_engine/engine.py`