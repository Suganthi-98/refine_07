"""
Reasoning Trace API Route (Phase 3 — Final.1)

GET /api/reasoning-trace?session_id=...

Returns the full PipelineResult for a session as a JSON-serialisable dict.
Every pipeline stage group (Observation → AI Advisor) is included so the
ReasoningTrace.jsx frontend component (Phase 5) can render all 8 panels
without a second round-trip.

Also used by the Phase 4 validation script (scripts/validate_emios_pipeline.py)
as the single gate-check endpoint.

Note: PipelineResult is a @dataclass, not a Pydantic model. Fields that
contain nested dataclasses or Pydantic models serialise cleanly via
dataclasses.asdict() + a custom encoder below.  The bare `object`-typed
recovery_state_machine field is handled by _safe_asdict().
"""

from __future__ import annotations

import dataclasses
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.api.models import ApiResponse, ErrorCodes
from app.storage import store

router = APIRouter(prefix="/api", tags=["Reasoning Trace"])


def _to_serialisable(obj: Any) -> Any:
    """Recursively convert an object to a JSON-serialisable structure.

    Handles:
    - dataclasses → dict (via dataclasses.asdict would recurse but can't
      handle non-dataclass leaves, so we do it manually)
    - Pydantic BaseModel → .model_dump()
    - Enums → .value
    - objects with __dict__ → their __dict__ (fallback for typed-as-object fields)
    - primitives / lists / dicts pass through unchanged
    """
    if obj is None:
        return None

    # Pydantic models
    if hasattr(obj, "model_dump"):
        return _to_serialisable(obj.model_dump())

    # Dataclasses (but not Pydantic which also passes dataclasses.is_dataclass)
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {
            f.name: _to_serialisable(getattr(obj, f.name))
            for f in dataclasses.fields(obj)
        }

    # Enums
    if hasattr(obj, "value") and hasattr(obj, "__class__") and hasattr(obj.__class__, "__mro__"):
        import enum
        if isinstance(obj, enum.Enum):
            return obj.value

    # Lists / tuples
    if isinstance(obj, (list, tuple)):
        return [_to_serialisable(i) for i in obj]

    # Dicts
    if isinstance(obj, dict):
        return {k: _to_serialisable(v) for k, v in obj.items()}

    # Plain scalars
    if isinstance(obj, (str, int, float, bool)):
        return obj

    # Fallback: try __dict__ for typed-as-object fields (e.g. recovery_state_machine)
    if hasattr(obj, "__dict__"):
        return _to_serialisable(obj.__dict__)

    # Last resort — str() so we never crash
    return str(obj)


@router.get("/reasoning-trace")
def get_reasoning_trace(
    session_id: str = Query(..., description="Session ID from POST /api/demo/load"),
) -> dict:
    """
    Return the full EMIOS PipelineResult for a session.

    Runs the EMIOS cognitive pipeline on first call for this session and
    caches the result on the Session object.  Subsequent calls for the
    same session_id return the cached result immediately.

    The response shape mirrors PipelineResult field-by-field:
      - signal_map             (Phase 3 — SignalMapper)
      - observation_cluster    (Stage 1)
      - validation_result      (Stage 2)
      - evidence_bundle        (Stage 3)
      - hypotheses             (Stage 4)
      - surviving_hypotheses   (Stage 5)
      - diagnosis              (Stage 6)
      - impact_matrix          (Stages 7–11)
      - risks                  (Stage 12)
      - tradeoff_matrix        (Stage 13)
      - decision               (Stage 14)
      - recovery_plans         (Stage 15)
      - recovery_state_machine (Stage 16)
      - learning_record        (Stage 17)
      - advisor_output         (Phase 7)
      - metrics / forecast / monte_carlo / risk_result (core engines)
    """
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail=ApiResponse(
                success=False,
                error_code=ErrorCodes.SESSION_NOT_FOUND,
                message=f"Session '{session_id}' not found. "
                        "Call POST /api/demo/load first.",
            ).model_dump(mode="json"),
        )

    # Retrieve or build the cached pipeline result
    pipeline_result = _get_or_build_pipeline_result(session, session_id)

    payload = _to_serialisable(pipeline_result)

    return ApiResponse(
        success=True,
        data=payload,
        message="Reasoning trace retrieved successfully",
    ).model_dump(mode="json")


def _get_or_build_pipeline_result(session, session_id: str):
    """Return a cached PipelineResult or run the pipeline to produce one.

    We cache the result on the Session object as `_pipeline_result` so
    repeated calls to this endpoint (e.g. from the validation script and
    the frontend simultaneously) don't re-run the full 18-stage pipeline.
    """
    cached = getattr(session, "_pipeline_result", None)
    if cached is not None:
        return cached

    project_state = session.project_state
    actual_outcome = store.get_latest_actual_outcome(session_id)

    try:
        from app.pipeline.emios_pipeline import run_emios_pipeline
        result = run_emios_pipeline(
            project_state,
            actual_outcome=actual_outcome,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=ApiResponse(
                success=False,
                error_code=ErrorCodes.PROCESSING_ERROR,
                message=f"Pipeline execution failed: {exc}",
            ).model_dump(mode="json"),
        )

    # Cache on the session so subsequent calls are instant
    session._pipeline_result = result
    return result
